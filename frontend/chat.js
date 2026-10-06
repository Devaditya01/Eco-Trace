// ECO: AI chat assistant. Talks to the backend at /api/chat and /api/analyze (Vercel functions, or server.py locally).
// Uses carbonResult and waterResult from script.js so answers can refer to the visitor's numbers.

const chat = {
  history: [],
  busy: false,
  panel: $("chat-panel"),
  log: $("chat-log"),
  input: $("chat-input"),
  openBtn: $("chat-open")
};

const isChatOpen = () => chat.panel.hasAttribute("data-open");

function openChat() {
  chat.panel.inert = false;
  chat.panel.setAttribute("data-open", "");
  chat.openBtn.setAttribute("aria-expanded", "true");
  chat.openBtn.querySelector(".fab-label").textContent = "Close";
  chat.input.focus({ preventScroll: true });
}
function closeChat() {
  chat.panel.removeAttribute("data-open");
  chat.panel.inert = true;
  chat.openBtn.setAttribute("aria-expanded", "false");
  chat.openBtn.querySelector(".fab-label").textContent = "Ask ECO";
  chat.openBtn.focus();
}
chat.openBtn.addEventListener("click", () => (isChatOpen() ? closeChat() : openChat()));
$("chat-close").addEventListener("click", closeChat);
chat.panel.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });

// ---------- Calculator results as plain text for the AI ----------
function carbonDetails() {
  if (!carbonResult) return "";
  const c = DATA.carbon;
  const km = (mode) => document.querySelector(`[data-mode="${mode}"]`).value || 0;
  const parts = Object.entries(carbonResult.parts)
    .map(([k, v]) => `${k} ${Math.round(v)} kg`).join(", ");
  return [
    `Carbon footprint: ${carbonResult.total.toFixed(2)} t CO2 per year (${parts}).`,
    `Averages: India ${c.averages.India} t, world ${c.averages.World} t per person per year.`,
    `Inputs: car ${km("car")} km/week, two-wheeler ${km("bike")} km/week, bus ${km("bus")} km/week, ` +
      `train/metro ${km("train")} km/week, flights ${$("flight-km").value || 0} km/year; ` +
      `electricity ${$("kwh").value || 0} units/month shared by ${$("members").value || 1} people; ` +
      `diet ${dietValue()}; waste ${$("waste").value || 0} kg/week with ${$("recycle").value || 0}% recycled or composted.`,
    `Factors used (kg CO2): car ${c.transport.car}/km, two-wheeler ${c.transport.bike}/km, bus ${c.transport.bus}/km, ` +
      `train ${c.transport.train}/km, flight ${c.transport.flight}/km, electricity ${c.gridKgPerKwh}/kWh, ` +
      `waste ${c.wasteKgPerKg}/kg (recycling avoids ${c.recycleSaving * 100}%), diets in t/yr: ` +
      Object.entries(c.dietTonnes).map(([k, v]) => `${k} ${v}`).join(", ") + "."
  ].join("\n");
}

function waterDetails() {
  if (!waterResult || !waterResult.items.length) return "";
  const items = waterResult.items.map((i) => {
    const qty = document.querySelector(`[data-water="${i.item.id}"]`).value;
    return `${i.item.name}: ${qty} ${i.item.unit} per week x ${i.item.litres} L = ${fmt(i.litres)} L`;
  });
  return [
    `Virtual water footprint: ${fmt(waterResult.total)} litres per week ` +
      `(about ${fmt(waterResult.total / DATA.drinkingLitresPerDay)} days of drinking water at ${DATA.drinkingLitresPerDay} L/day).`,
    ...items,
    `Reference values (L per unit): ` + DATA.water.map((w) => `${w.name} ${w.litres}/${w.unit}`).join(", ") + "."
  ].join("\n");
}

function resultsContext() {
  return [carbonDetails(), waterDetails()].filter(Boolean).join("\n\n");
}

// ---------- AI analysis in the result cards ----------
const analysisRuns = {};

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderAnalysis(text) {
  if (text.startsWith("[Error]")) return `<p class="error">${escapeHtml(text.replace("[Error] ", ""))}</p>`;
  let html = "", inList = false, first = true;
  for (const raw of text.replace(/\*\*/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^[-•*]\s+/.test(line);
    if (inList && !isItem) { html += "</ul>"; inList = false; }
    if (isItem) {
      if (!inList) { html += "<ul>"; inList = true; }
      const body = escapeHtml(line.replace(/^[-•*]\s+/, ""))
        .replace(/\((saves? about[^)]*)\)/i, '<span class="save">$1</span>');
      html += `<li>${body}</li>`;
    } else if (/^top actions:?$/i.test(line)) {
      html += "<h4>Top actions</h4>";
    } else if (/^goal:/i.test(line)) {
      html += `<p class="goal"><b>Goal:</b> ${escapeHtml(line.replace(/^goal:\s*/i, ""))}</p>`;
    } else {
      html += `<p${first ? ' class="verdict"' : ""}>${escapeHtml(line)}</p>`;
    }
    first = false;
  }
  return html + (inList ? "</ul>" : "");
}

async function runAnalysis(kind) {
  const box = $(`${kind}-ai`);
  const body = box.querySelector(".ai-body");
  const tips = $(`${kind}-tips`);
  const context = kind === "carbon" ? carbonDetails() : waterDetails();
  if (analysisRuns[kind]) analysisRuns[kind].abort();
  if (!context) { box.hidden = true; tips.hidden = false; return; }

  const run = (analysisRuns[kind] = new AbortController());
  box.hidden = false;
  box.classList.add("loading");
  tips.hidden = true;
  body.innerHTML = '<div class="skel" aria-label="Analysing your result"><i></i><i></i><i></i><i></i></div>';

  let text = "";
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, context }),
      signal: run.signal
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      body.innerHTML = renderAnalysis(text);
    }
  } catch (err) {
    if (err.name === "AbortError") return; // a newer calculation replaced this one
    text = location.protocol === "file:"
      ? "[Error] AI analysis needs the local server. Run \"py server.py\" and open http://localhost:8000."
      : "[Error] AI analysis is unavailable right now. Showing quick tips instead.";
  }
  if (analysisRuns[kind] !== run) return;
  box.classList.remove("loading");
  if (!text.trim()) text = "[Error] No analysis came back. Showing quick tips instead.";
  body.innerHTML = renderAnalysis(text);
  if (text.startsWith("[Error]")) tips.hidden = false; // fall back to the built-in tips
}

// Minimal safe formatting: escape HTML, then **bold** and line breaks
function formatReply(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "bot"}`;
  div.innerHTML = formatReply(text);
  chat.log.appendChild(div);
  chat.log.scrollTop = chat.log.scrollHeight;
  return div;
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || chat.busy) return;
  chat.busy = true;
  $("chat-suggest").hidden = true;
  addMessage("user", text);
  chat.history.push({ role: "user", content: text });

  const bubble = addMessage("bot", "");
  bubble.classList.add("typing");
  bubble.innerHTML = "<span></span>";
  bubble.setAttribute("aria-label", "ECO is typing");
  let reply = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.history, context: resultsContext() })
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      bubble.classList.remove("typing");
      bubble.innerHTML = formatReply(reply);
      chat.log.scrollTop = chat.log.scrollHeight;
    }
  } catch (err) {
    reply = location.protocol === "file:"
      ? "ECO needs the local server. Run \"py server.py\" in the project folder and open http://localhost:8000."
      : "Sorry, I couldn't reach ECO right now. Please try again in a moment.";
  }

  bubble.classList.remove("typing");
  bubble.removeAttribute("aria-label");
  bubble.innerHTML = formatReply(reply || "Sorry, I didn't get an answer. Please try again.");
  if (reply && !reply.startsWith("[Error]") && !reply.startsWith("ECO needs") && !reply.startsWith("Sorry, I couldn't")) {
    chat.history.push({ role: "assistant", content: reply });
  } else {
    chat.history.pop(); // drop the unanswered question so the next try starts clean
  }
  chat.busy = false;
  if (isChatOpen()) chat.input.focus({ preventScroll: true });
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chat.input.value;
  chat.input.value = "";
  sendMessage(text);
});
$("chat-suggest").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") sendMessage(e.target.textContent);
});

// "Ask ECO" buttons under the calculator results
const ASK = {
  carbon: "Based on my carbon footprint results, give me a simple 4-week plan to reduce it, starting with my biggest source.",
  water: "Based on my virtual water footprint, what are the best swaps to reduce my hidden water use?"
};
document.querySelectorAll("[data-ask]").forEach((btn) => {
  btn.addEventListener("click", () => {
    openChat();
    sendMessage(ASK[btn.dataset.ask]);
  });
});
$("carbon-form").addEventListener("submit", () => {
  document.querySelector('[data-ask="carbon"]').hidden = !carbonResult;
  runAnalysis("carbon");
});
$("water-form").addEventListener("submit", () => {
  document.querySelector('[data-ask="water"]').hidden = !(waterResult && waterResult.items.length);
  runAnalysis("water");
});
