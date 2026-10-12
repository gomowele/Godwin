/* Interview Reps server. Zero-dependency static server + JSON history file + Claude rating proxy.
   Run: npm start   (then open http://localhost:3344)
   Env: ANTHROPIC_API_KEY (optional; enables rating), PORT, INTERVIEW_REPS_MODEL, INTERVIEW_REPS_DATA */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = process.env.INTERVIEW_REPS_DATA || path.join(ROOT, "data");
const AUDIO = path.join(DATA, "audio");
const STATE_FILE = path.join(DATA, "history.json");
const PORT = Number(process.env.PORT) || 3344;
const MODEL = process.env.INTERVIEW_REPS_MODEL || "claude-opus-5-5";
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

fs.mkdirSync(AUDIO, { recursive: true });

/* ---------- state file ---------- */
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { return null; }
}
function writeState(obj) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, STATE_FILE);
}

/* ---------- Claude ---------- */
let Anthropic = null, client = null;
function getClient() {
  if (client) return client;
  try { Anthropic = require("@anthropic-ai/sdk"); } catch (e) {
    throw Object.assign(new Error("The Anthropic SDK is not installed. Run: npm install"), { status: 503 });
  }
  client = new Anthropic();
  return client;
}

const LOCKED = [
  "Sunrun scale: 500+ call-center reps, 250+ retail reps, 1,000+ field reps. Any other scale numbers are an overclaim.",
  "At Sunrun the candidate directly managed 4 workforce analysts.",
  "Chat experience: planning and forecasting across voice, chat and email. The candidate did NOT run a chat floor. Saying so is an overclaim.",
  "Two stories end at the recommendation with no confirmed outcome: AAC evening/weekend coverage (card u-intervals) and AAC cost versus operational risk (card u-temps). Never suggest, invent or ask for an outcome for them. If the transcript states an outcome for them, flag it as an overclaim."
].join("\n");

const RATER_SYSTEM = [
  "You are a blunt, fair interview coach. The candidate is practicing out loud for a Vice President, Capacity Planning and Analytics interview at a large bank (contact-center workforce planning: forecasting, staffing, capacity models, executive recommendations).",
  "You receive the question, the anchor points they meant to hit (numbered from 0), a claim they must avoid, and a speech-to-text transcript. Ignore transcription typos and missing punctuation.",
  "",
  "Hard rules:",
  "1. Judge only what the transcript says and what is in the anchors. Never invent experience, numbers or outcomes for the candidate. Never suggest what they 'could add' if it is not in the anchors.",
  "2. An anchor written in parentheses is an open slot the candidate has not filled. Count it as hit only if the transcript gives a specific, concrete detail for it. Never fill a slot in for them, in any field.",
  "3. 'tighter' is the same answer in at most 60 words, using only facts the candidate actually said. No new facts, no new numbers, no outcomes they did not state.",
  "4. Feedback is plain language, short, blunt. One thing to fix. No praise padding.",
  "5. If a 30-second executive version was requested, penalise workforce-management jargon (shrinkage, occupancy, Erlang, adherence, WFM, MAPE) in 'fix' unless it was explained in plain words.",
  "",
  "Locked facts (use these to spot inconsistencies):",
  LOCKED
].join("\n");

const RATING_SCHEMA = {
  type: "object",
  properties: {
    hit: { type: "array", items: { type: "integer" }, description: "Anchor numbers clearly covered in the transcript." },
    verdict: { type: "string", description: "One sentence overall." },
    worked: { type: "string", description: "One thing that worked." },
    fix: { type: "string", description: "The single most useful change. One thing." },
    rambling: { type: "string", description: "Where it wandered or repeated, or empty string." },
    overclaim: { type: "string", description: "Any claim past the anchors, past the locked facts, or breaking the avoid rule, or empty string." },
    tighter: { type: "string", description: "The same answer in at most 60 words using only facts they said." },
    followup: { type: "string", description: "One line on the follow-up answer, or empty string if there was none." }
  },
  required: ["hit", "verdict", "worked", "fix", "rambling", "overclaim", "tighter", "followup"],
  additionalProperties: false
};

const DEBRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two or three blunt sentences on the interview as a whole." },
    weakest: { type: "array", items: { type: "object", properties: { area: { type: "string" }, why: { type: "string" } }, required: ["area", "why"], additionalProperties: false }, description: "Up to three weakest areas, worst first." },
    redo: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, why: { type: "string" } }, required: ["index", "why"], additionalProperties: false }, description: "Exactly three answers to redo, by answer index (from 0), worst first." },
    pattern: { type: "string", description: "The one delivery habit that showed up across answers." }
  },
  required: ["summary", "weakest", "redo", "pattern"],
  additionalProperties: false
};

async function callClaude(system, user, schema) {
  const c = getClient();
  const base = {
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } }
  };
  let res;
  try {
    // Server-side refusal fallback (beta): if a safety classifier declines, the API re-runs on a fallback model.
    res = await c.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } catch (e) {
    if (Anthropic && e instanceof Anthropic.BadRequestError) {
      // Fallback parameter not accepted here (older proxy, other platform). Plain request.
      res = await c.messages.create(base);
    } else throw e;
  }
  if (res.stop_reason === "refusal") throw Object.assign(new Error("The model declined to rate this answer."), { status: 502 });
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  try { return JSON.parse(text); } catch (e) {
    throw Object.assign(new Error("The rating came back in an unexpected shape. Try again."), { status: 502 });
  }
}

function ratePrompt(b) {
  const A = Array.isArray(b.anchors) ? b.anchors : [];
  const lines = [
    "Target length: " + (b.mode || 90) + " seconds." + (b.seconds > 3 ? " They spoke for about " + Math.round(b.seconds) + " seconds." : ""),
    b.mode === 30 ? "This was the executive version: explain it to an Executive Director with no workforce-management jargon." : "",
    b.cardId ? "Card id: " + b.cardId : "",
    "", "QUESTION: " + (b.question || ""),
    "", "ANCHORS:", A.map((a, i) => i + ". " + a).join("\n"),
    "", "AVOID: " + (b.avoid || "Overclaiming or inventing results."),
    b.storyName ? "STORY: " + b.storyName : "",
    "", "TRANSCRIPT:", String(b.transcript || "").slice(0, 8000)
  ];
  if (b.followupQuestion) {
    lines.push("", "FOLLOW-UP QUESTION the interviewer asked: " + b.followupQuestion);
    lines.push("FOLLOW-UP TRANSCRIPT (about " + Math.round(b.followupSeconds || 0) + " seconds):", String(b.followupTranscript || "(no answer captured)").slice(0, 3000));
  }
  return lines.filter(l => l !== null).join("\n");
}

function debriefPrompt(b) {
  const out = ["A 30-minute mock interview just ended. Below is each answer with the anchors (numbered), which anchors were judged hit, delivery numbers, the follow-up, and the per-answer rating if there was one.",
    "Write the debrief: weakest areas (by category), exactly three answers to redo (by index), and the one delivery habit. Judge only what is here. Never invent experience or outcomes. Blunt, plain, short.", ""];
  (b.answers || []).forEach((a, i) => {
    out.push("ANSWER " + i + " [" + (a.category || "") + "] " + (a.question || ""));
    out.push("  anchors: " + (a.anchors || []).map((x, j) => j + ". " + x).join(" | "));
    out.push("  hit: " + JSON.stringify(a.hit || []) + " of " + (a.anchors || []).length);
    out.push("  delivery: " + Math.round(a.seconds || 0) + "s (target 90), " + (a.wpm || 0) + " wpm, fillers " + (a.fillers || 0) + ", long pauses " + (a.pauses || 0) + (a.firstPoint != null ? ", first real point at " + a.firstPoint + "s" : ""));
    if (a.followupQuestion) out.push("  follow-up: " + a.followupQuestion + " -> " + String(a.followupTranscript || "(none)").slice(0, 400));
    if (a.rating) out.push("  rating: " + JSON.stringify({ verdict: a.rating.verdict, fix: a.rating.fix, overclaim: a.rating.overclaim }));
    out.push("  transcript: " + String(a.transcript || "").slice(0, 1200));
    out.push("");
  });
  return out.join("\n");
}

/* ---------- http ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webm": "audio/webm", ".mp4": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav" };
const AUDIO_EXT = { "audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/wav": ".wav", "video/webm": ".webm" };

function send(res, status, body, type) {
  const buf = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type || "application/json", "Content-Length": Buffer.byteLength(buf), "Cache-Control": "no-store" });
  res.end(buf);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const safeId = id => /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  if (p === "/api/config") return send(res, 200, { rating: HAS_KEY, model: MODEL, dataDir: DATA });
  if (p === "/api/state") {
    if (req.method === "GET") return send(res, 200, readState() || {});
    if (req.method === "PUT" || req.method === "POST") {
      const body = await readBody(req, 50 * 1024 * 1024);
      let obj; try { obj = JSON.parse(body.toString("utf8")); } catch (e) { return send(res, 400, { error: "bad json" }); }
      if (!obj || typeof obj !== "object") return send(res, 400, { error: "bad state" });
      writeState(obj); return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
    }
  }
  if (p.startsWith("/api/audio/")) {
    const id = safeId(p.slice("/api/audio/".length).replace(/\.[a-z0-9]+$/i, ""));
    if (!id) return send(res, 400, { error: "bad id" });
    if (req.method === "POST") {
      const ext = AUDIO_EXT[(req.headers["content-type"] || "").split(";")[0]] || ".webm";
      const body = await readBody(req, 60 * 1024 * 1024);
      fs.writeFileSync(path.join(AUDIO, id + ext), body);
      return send(res, 200, { ok: true, file: id + ext });
    }
    if (req.method === "GET") {
      const f = fs.readdirSync(AUDIO).find(n => n.startsWith(id + "."));
      if (!f) return send(res, 404, { error: "no audio" });
      const buf = fs.readFileSync(path.join(AUDIO, f));
      return send(res, 200, buf, MIME[path.extname(f)] || "application/octet-stream");
    }
    if (req.method === "DELETE") {
      fs.readdirSync(AUDIO).filter(n => n.startsWith(id + ".")).forEach(n => fs.unlinkSync(path.join(AUDIO, n)));
      return send(res, 200, { ok: true });
    }
  }
  if (p === "/api/rate" && req.method === "POST") {
    if (!HAS_KEY) return send(res, 503, { error: "No ANTHROPIC_API_KEY set. Use 'Copy transcript and rubric' instead." });
    const b = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
    if (!b.transcript || String(b.transcript).trim().split(/\s+/).length < 8) return send(res, 400, { error: "Transcript too short to rate." });
    try {
      const data = await callClaude(RATER_SYSTEM, ratePrompt(b), RATING_SCHEMA);
      const n = (b.anchors || []).length;
      data.hit = (Array.isArray(data.hit) ? data.hit : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n);
      return send(res, 200, { data, model: MODEL });
    } catch (e) { return apiError(res, e); }
  }
  if (p === "/api/debrief" && req.method === "POST") {
    if (!HAS_KEY) return send(res, 503, { error: "No ANTHROPIC_API_KEY set." });
    const b = JSON.parse((await readBody(req, 4 * 1024 * 1024)).toString("utf8"));
    try {
      const data = await callClaude(RATER_SYSTEM, debriefPrompt(b), DEBRIEF_SCHEMA);
      const n = (b.answers || []).length;
      data.redo = (Array.isArray(data.redo) ? data.redo : []).filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < n).slice(0, 3);
      return send(res, 200, { data, model: MODEL });
    } catch (e) { return apiError(res, e); }
  }
  if (p.startsWith("/api/")) return send(res, 404, { error: "not found" });

  // static
  let file = p === "/" ? "/index.html" : decodeURIComponent(p);
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, "Not found", "text/plain");
  res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(full).pipe(res);
}

function apiError(res, e) {
  const status = e && e.status;
  let msg = (e && e.message) || "Request failed.";
  if (Anthropic) {
    if (e instanceof Anthropic.AuthenticationError) msg = "The API key was rejected. Check ANTHROPIC_API_KEY.";
    else if (e instanceof Anthropic.RateLimitError) msg = "Rate limited. Wait a moment and try again.";
    else if (e instanceof Anthropic.APIConnectionError) msg = "Could not reach the Claude API. Check your connection.";
    else if (e instanceof Anthropic.APIError) msg = "Claude API error " + e.status + ": " + ((e.error && e.error.error && e.error.error.message) || e.message);
  }
  console.error("[rate]", msg);
  send(res, status && status >= 400 && status < 600 ? status : 502, { error: msg });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error(e); if (!res.headersSent) send(res, e.status || 500, { error: e.message || "server error" }); });
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("\nInterview Reps  ->  http://localhost:" + PORT);
  console.log("History file     ->  " + STATE_FILE);
  console.log("Rating           ->  " + (HAS_KEY ? "on (" + MODEL + ")" : "off. Set ANTHROPIC_API_KEY to turn it on; the copy-to-chat button works without it.") + "\n");
});
