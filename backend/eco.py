"""EcoTrace backend: the ECO assistant's prompts, AI providers and request handling.

Exposes `app`, a WSGI app that serves the website and the API. Vercel loads it through app.py
in the project folder; locally it runs with backend/server.py.
Answers come from Google Gemini (GEMINI_API_KEY).
The key comes from environment variables (Vercel project settings) or a local .env file.
It stays on the server; the browser never sees it.
"""

import json
import mimetypes
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # project folder, where .env lives

MAX_MESSAGES = 20        # conversation turns kept per request
MAX_CHARS = 2000         # per message
MAX_CONTEXT_CHARS = 3000 # calculator results sent by the page

SYSTEM_PROMPT = """You are ECO, the assistant on EcoTrace, a student EVS (Environmental Studies) \
project website about environmental sustainability. Visitors are mostly students and teachers in India.

Help with: carbon footprints, virtual water footprints, climate change, pollution, waste management \
and recycling, water and energy conservation, renewable energy, biodiversity, and practical eco-friendly habits.

How to answer:
- Be friendly, clear and practical. Keep answers short (under about 150 words) unless asked for detail.
- Use simple language a school or college student understands.
- Give concrete actions, and prefer ones that work in India (public transport, BEE star ratings, \
waste segregation into wet/dry, rainwater harvesting, local and seasonal food).
- When the visitor's calculator results are provided, refer to their actual numbers and focus on their biggest source.
- Figures you give are estimates; say so, and do not invent precise statistics or sources.
- If asked something unrelated to the environment or sustainability, politely steer back to those topics.
- Use plain text with short bullet lists ("- item") where helpful. Do not use tables or headings."""

ANALYSIS_PROMPT = """You are ECO on EcoTrace, a student EVS project website. You write a short, personal \
analysis of a visitor's footprint calculator result. The visitor is most likely a student in India.

Use the inputs and emission factors provided to work out savings; show realistic, rounded estimates.
Reply in exactly this plain-text format, with no markdown symbols other than the "- " bullets:

<one sentence verdict: how this result compares with the averages given, and the biggest source>

Top actions:
- <specific action aimed at their biggest source> (saves about <number with unit>)
- <second action> (saves about <number with unit>)
- <third action> (saves about <number with unit>)

Goal: <a realistic target for the next 3 months, as a number, and what it would mean>

Rules: under 120 words in total. Actions must fit their actual inputs (do not suggest cutting car travel \
if they entered none). Prefer actions practical in India. Be encouraging but honest. Do not invent sources."""

ANALYSIS_TASKS = {
    "carbon": "Analyse my carbon footprint. Savings should be in kg CO2 per year.",
    "water": "Analyse my virtual water footprint. Savings should be in litres per week.",
}

NO_KEY_MESSAGE = "[Error] No API key found. Set GEMINI_API_KEY in .env (local) or in the Vercel project's Environment Variables (see README)."


def load_env_file():
    """Read KEY=value lines from .env without overriding real environment variables."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()


# ---------- Providers ----------
# Each provider yields the answer text in chunks and raises ProviderError with a friendly message.

class ProviderError(Exception):
    pass


KEY_NAMES = ("GEMINIAPIKEY", "GEMINIAPI", "GEMINIKEY", "GOOGLEAPIKEY")


def find_key():
    """The Gemini key, accepting names like GEMINI_API_KEY, GeminiAPI or gemini-key, with or without quotes around the value."""
    for name, value in os.environ.items():
        if "".join(c for c in name.upper() if c.isalnum()) in KEY_NAMES:
            value = value.strip().strip('"').strip("'").strip()
            if value:
                return value
    return None


def gemini_provider(key):
    from google import genai
    from google.genai import errors, types

    client = genai.Client(api_key=key)
    # Tried in order: if a model is busy or unavailable before answering, the next one is used
    models = [os.environ["GEMINI_MODEL"]] if os.environ.get("GEMINI_MODEL") else []
    # Flash Lite first: fastest, with the biggest free daily quota
    models += [m for m in ("gemini-flash-lite-latest", "gemini-3.8-flash") if m not in models]

    def stream(system, messages):
        contents = [
            types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
            for m in messages
        ]
        settings = dict(
            system_instruction=system,
            max_output_tokens=8192,  # newer models count internal thinking toward this limit
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        # Low thinking: answers are short, and less thinking means the reply starts sooner
        fast = types.GenerateContentConfig(**settings, thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW))
        default = types.GenerateContentConfig(**settings)

        def chunks(model):
            """Stream one model; models that reject thinking_level are retried with their default thinking."""
            try:
                yield from client.models.generate_content_stream(model=model, contents=contents, config=fast)
            except errors.ClientError as e:
                if e.code != 400 or "thinking" not in str(e).lower():
                    raise
                yield from client.models.generate_content_stream(model=model, contents=contents, config=default)

        for i, model in enumerate(models):
            last = i == len(models) - 1
            started = False
            try:
                for chunk in chunks(model):
                    if chunk.text:
                        started = True
                        yield chunk.text
                if started:
                    return
                if last:
                    raise ProviderError("ECO couldn't come up with an answer this time. Please try again or rephrase your question.")
                print(f"{model} gave an empty answer, trying the next model")
            except errors.ClientError as e:
                if e.code in (401, 403) or (e.code == 400 and "key" in str(e).lower()):
                    raise ProviderError("The Gemini API key is invalid. Check GEMINI_API_KEY and try again.")
                if started or last or e.code not in (404, 429):
                    if e.code == 429:
                        raise ProviderError("Too many requests for the free tier right now. Wait a minute and try again.")
                    raise ProviderError(f"Gemini returned an error ({e.code}). Please try again.")
                print(f"{model} unavailable ({e.code}), trying the next model")
            except errors.ServerError as e:
                if started or last:
                    raise ProviderError("Gemini is busy right now. Please try again in a moment.")
                print(f"{model} busy ({e.code}), trying the next model")

    return f"Gemini ({', then '.join(models)})", stream


def pick_provider():
    key = find_key()
    if key:
        return gemini_provider(key)
    return None, None


PROVIDER_NAME, stream_answer = pick_provider()


# ---------- HTTP ----------

def clean_messages(raw):
    """Validate the conversation sent by the browser."""
    if not isinstance(raw, list) or not raw:
        raise ValueError("messages must be a non-empty list")
    msgs = []
    for m in raw[-MAX_MESSAGES:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            raise ValueError("bad message")
        text = m.get("content")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("bad message content")
        msgs.append({"role": m["role"], "content": text[:MAX_CHARS]})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    if not msgs or msgs[-1]["role"] != "user":
        raise ValueError("last message must be from the user")
    return msgs


def build_prompt(route, body):
    """Turn a request body into (system prompt, messages). Raises ValueError on bad input."""
    context = body.get("context")
    if route == "analyze":
        kind = body.get("kind")
        if kind not in ANALYSIS_TASKS or not isinstance(context, str) or not context.strip():
            raise ValueError("kind must be carbon or water, with context")
        return ANALYSIS_PROMPT, [{"role": "user", "content": ANALYSIS_TASKS[kind] + "\n\n" + context[:MAX_CONTEXT_CHARS]}]
    messages = clean_messages(body.get("messages"))
    system = SYSTEM_PROMPT
    if isinstance(context, str) and context.strip():
        system += "\n\nThe visitor's latest calculator results:\n" + context[:MAX_CONTEXT_CHARS]
    return system, messages


def answer_chunks(system, messages):
    """Yield the answer as UTF-8 bytes; problems are reported as an "[Error] ..." message."""
    if stream_answer is None:
        yield NO_KEY_MESSAGE.encode("utf-8")
        return
    try:
        for text in stream_answer(system, messages):
            yield text.encode("utf-8")
    except ProviderError as e:
        yield f"[Error] {e}".encode("utf-8")
    except Exception as e:  # keep the server alive and tell the visitor
        print(f"Chat error: {e!r}")
        yield b"[Error] Something went wrong while answering. Please try again."


# ---------- Web app (WSGI) ----------
# One app serves the website and the API, both on Vercel and locally (backend/server.py).

FRONTEND = ROOT / "frontend"
ROUTES = {"/api/chat": "chat", "/api/analyze": "analyze"}


def plain(start_response, status, text):
    start_response(status, [("Content-Type", "text/plain; charset=utf-8")])
    return [text.encode("utf-8")]


def serve_file(environ, start_response, path):
    if path.endswith("/"):
        path += "index.html"
    parts = [p for p in path.split("/") if p]
    if any(p.startswith(".") for p in parts):  # never serve hidden files
        return plain(start_response, "404 Not Found", "Not found")
    file = FRONTEND.joinpath(*parts).resolve()
    if not file.is_relative_to(FRONTEND) or not file.is_file():
        return plain(start_response, "404 Not Found", "Not found")
    data = file.read_bytes()
    kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    if kind.startswith("text/") or kind in ("application/javascript", "image/svg+xml"):
        kind += "; charset=utf-8"
    start_response("200 OK", [("Content-Type", kind), ("Content-Length", str(len(data))), ("Cache-Control", "no-cache")])
    return [] if environ["REQUEST_METHOD"] == "HEAD" else [data]


def status(start_response):
    """Setup check: says whether the key was found, never shows it."""
    info = {
        "key_found": stream_answer is not None,
        "ai": PROVIDER_NAME,
        "vercel_env": os.environ.get("VERCEL_ENV"),
        "key_like_variables": sorted(n for n in os.environ if "GEMINI" in n.upper() or "API_KEY" in n.upper()),
    }
    start_response("200 OK", [("Content-Type", "application/json"), ("Cache-Control", "no-store")])
    return [json.dumps(info, indent=2).encode("utf-8")]


def app(environ, start_response):
    method, path = environ["REQUEST_METHOD"], environ.get("PATH_INFO") or "/"
    if path == "/api/status":
        return status(start_response)
    route = ROUTES.get(path)
    if route:
        if method != "POST":
            return plain(start_response, "405 Method Not Allowed", "Use POST")
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
            if length > 100_000:
                raise ValueError("request too large")
            body = json.loads(environ["wsgi.input"].read(length))
            if not isinstance(body, dict):
                raise ValueError("body must be a JSON object")
            system, messages = build_prompt(route, body)
        except (ValueError, json.JSONDecodeError) as e:
            return plain(start_response, "400 Bad Request", str(e))
        start_response("200 OK", [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")])
        return answer_chunks(system, messages)
    if method in ("GET", "HEAD"):
        return serve_file(environ, start_response, path)
    return plain(start_response, "405 Method Not Allowed", "Method not allowed")
