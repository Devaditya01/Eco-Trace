"""EcoTrace local dev server. Runs the same app as Vercel (backend/eco.py).

Put your key in a .env file in the project folder, then from the project folder run:
    py backend/server.py
and open http://localhost:8000
"""

import sys
from pathlib import Path
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

try:
    # Trust the Windows certificate store, so HTTPS works behind antivirus web scanning
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.eco import PROVIDER_NAME, app  # noqa: E402

HOST, PORT = "127.0.0.1", 8000


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


if __name__ == "__main__":
    server = make_server(HOST, PORT, app, server_class=ThreadingWSGIServer, handler_class=WSGIRequestHandler)
    print(f"EcoTrace running at http://localhost:{PORT}  (Ctrl+C to stop)")
    if PROVIDER_NAME:
        print(f"ECO AI: {PROVIDER_NAME}")
    else:
        print("Warning: no API key found, so the ECO chat will not work. Add GEMINI_API_KEY to .env.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
