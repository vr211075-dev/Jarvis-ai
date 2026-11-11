/* ===== JARVIS ===== */
const $ = (id) => document.getElementById(id);
const logEl = $("log"), inputEl = $("input"), orb = $("orb"), statusEl = $("status");

let voiceOn = true;
let busy = false;
const history = []; // last few messages sent to the AI

/* ---------- Clock ---------- */
function tick() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour12: false });
  $("date").textContent = now.toLocaleDateString([], {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
tick();
setInterval(tick, 1000);

/* ---------- Chat helpers ---------- */
function addMsg(text, who) {
  const el = document.createElement("div");
  el.className = "msg " + who;
  el.textContent = text;
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
  return el;
}
function setStatus(text, cls) {
  statusEl.textContent = text;
  orb.classList.remove("listening", "speaking");
  if (cls) orb.classList.add(cls);
}

/* ---------- Text to speech ---------- */
function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const clean = text.replace(/[*_`#>]/g, "").replace(/https?:\/\/\S+/g, "link");
  const u = new SpeechSynthesisUtterance(clean);
  const voices = speechSynthesis.getVoices();
  const pick = voices.find(v => /en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
  if (pick) u.voice = pick;
  u.rate = 1; u.pitch = 0.9;
  u.onstart = () => setStatus("Speaking", "speaking");
  u.onend = u.onerror = () => setStatus("Standing by");
  speechSynthesis.speak(u);
}
speechSynthesis && (speechSynthesis.onvoiceschanged = () => {});

$("muteBtn").onclick = (e) => {
  voiceOn = !voiceOn;
  e.target.textContent = voiceOn ? "Voice on" : "Voice off";
  e.target.setAttribute("aria-pressed", String(!voiceOn));
  if (!voiceOn) speechSynthesis.cancel();
};

/* ---------- Voice input ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;

if (SR) {
  rec = new SR();
  rec.lang = "en-US";   // change to "en-IN" or "hi-IN" if you prefer
  rec.interimResults = true;
  rec.continuous = false;
  rec.onstart = () => { listening = true; setStatus("Listening…", "listening"); };
  rec.onresult = (e) => {
    const t = Array.from(e.results).map(r => r[0].transcript).join("");
    inputEl.value = t;
    if (e.results[e.results.length - 1].isFinal) { inputEl.value = ""; handle(t); }
  };
  rec.onerror = (e) => {
    const msg = e.error === "not-allowed"
      ? "Microphone blocked. Allow mic access for this site in Chrome settings."
      : e.error === "no-speech" ? "I didn't hear anything." : "Voice error: " + e.error;
    addMsg(msg, "sys");
  };
  rec.onend = () => { listening = false; if (!speechSynthesis.speaking) setStatus("Standing by"); };
}

orb.onclick = () => {
  if (!rec) { addMsg("Voice input isn't supported in this browser. Open the page in Chrome.", "sys"); return; }
  speechSynthesis.cancel();
  if (listening) rec.stop(); else { try { rec.start(); } catch (_) {} }
};

/* ---------- Brain ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// Instant answers that don't need the internet
function localReply(q) {
  const s = q.toLowerCase();
  if (/\b(what('?s| is) the time|current time|time now|what time)\b/.test(s))
    return "It is " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
  if (/\b(what('?s| is) (the )?date|today'?s date|what day)\b/.test(s))
    return "Today is " + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ".";
  if (/^(hi|hello|hey|jarvis)\b/.test(s)) return greeting() + ". How can I help?";
  if (/\bwho are you\b/.test(s)) return "I am JARVIS, your personal assistant. Just Another Rather Very Intelligent System.";
  return null;
}

async function askAI(q) {
  history.push({ role: "user", content: q });
  if (history.length > 10) history.splice(0, history.length - 10);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "openai",
        messages: [
          { role: "system", content:
            "You are JARVIS, a calm, witty, loyal AI butler in the style of Tony Stark's assistant. " +
            "Address the user as 'sir' occasionally. Keep answers short (1-3 sentences) because they are spoken aloud. " +
            "Plain text only, no markdown. Current date and time: " + new Date().toString() },
          ...history,
        ],
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty reply");
    history.push({ role: "assistant", content: reply });
    return reply;
  } finally { clearTimeout(timer); }
}

async function handle(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  addMsg(text, "me");
  const local = localReply(text);
  if (local) { addMsg(local, "ai"); speak(local); busy = false; return; }

  const thinking = addMsg("Processing…", "sys");
  setStatus("Thinking");
  try {
    const reply = await askAI(text);
    thinking.remove();
    addMsg(reply, "ai");
    speak(reply);
  } catch (err) {
    thinking.remove();
    const msg = "I can't reach my network right now. Check your internet connection and try again.";
    addMsg(msg, "ai");
    speak(msg);
    setStatus("Offline");
  } finally { busy = false; }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = inputEl.value;
  inputEl.value = "";
  handle(t);
});

/* ---------- Boot (a tap is required before the browser allows sound) ---------- */
$("bootBtn").onclick = () => {
  $("boot").classList.add("hide");
  const hi = greeting() + ", sir. All systems online. Tap the reactor to speak.";
  addMsg(hi, "ai");
  speak(hi);
};
