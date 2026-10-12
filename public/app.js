/* Interview Reps app. Deck comes from deck.js (CARDS, STORY, FOLLOW). Capture from audio.js. Metrics from delivery.js. */
"use strict";
CARDS.forEach(c => { if (STORY[c.id]) Object.assign(c, STORY[c.id]); });
const TYPES = [["all", "All"], ["story", "Stories"], ["framework", "Frameworks"], ["tech", "Technical"], ["scenario", "Scenarios"], ["gap", "Gaps"], ["opening", "Opening"]];
const SRC = { notes: ["From your project notes", ""], yours: ["From your ChatGPT prep", ""], general: ["Framework", ""] };
const NO_OUTCOME = new Set(["u-intervals", "u-temps"]);
const LOCKED_FACTS = [
  "Sunrun scale: 500+ call-center reps, 250+ retail reps, 1,000+ field reps.",
  "Directly managed 4 workforce analysts at Sunrun.",
  "Chat: forecasting and capacity planning across voice, chat and email. Did not run a chat floor.",
  "The AAC evening/weekend story and the AAC cost-versus-risk story end at the recommendation. No outcome is confirmed; never suggest one."
];

/* ---------- state, saved to data/history.json through the server ---------- */
const KEY = "interview-reps-v2";
const DEF = () => ({ v: 2, turn: 0, cards: {}, custom: {}, mode: 90, filter: "all", attempts: [], mocks: [] });
let S = DEF(), CFG = { rating: false, model: "" }, saveState = "idle", saveTimer = null;
async function loadState() {
  try { CFG = await (await fetch("/api/config")).json(); } catch (e) { CFG = { rating: false, model: "" }; }
  try {
    const r = await (await fetch("/api/state")).json();
    if (r && typeof r === "object" && Object.keys(r).length) S = Object.assign(DEF(), r);
    saveState = "saved";
  } catch (e) {
    try { const l = JSON.parse(localStorage.getItem(KEY)); if (l) S = Object.assign(DEF(), l); } catch (e2) {}
    saveState = "failed";
  }
  if (S.mode !== 30) S.mode = 90; if (!TYPES.some(t => t[0] === S.filter)) S.filter = "all";
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} clearTimeout(saveTimer); saveState = "saving"; renderStatus(); saveTimer = setTimeout(flush, 300); }
async function flush() {
  try { const r = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S) }); if (!r.ok) throw 0; saveState = "saved"; }
  catch (e) { saveState = "failed"; }
  renderStatus();
}
window.addEventListener("pagehide", () => { if (saveTimer) { clearTimeout(saveTimer); try { navigator.sendBeacon("/api/state", new Blob([JSON.stringify(S)], { type: "application/json" })); } catch (e) {} } });
async function uploadAudio(id, blob) {
  if (!blob) return false;
  try { const r = await fetch("/api/audio/" + id, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob }); return r.ok; } catch (e) { return false; }
}

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
function el(tag, props, kids) { const n = document.createElement(tag); if (props) for (const k in props) { if (props[k] === null || props[k] === undefined) continue; if (k === "class") n.className = props[k]; else if (k === "text") n.textContent = props[k]; else if (k === "html") n.innerHTML = props[k]; else if (k.startsWith("on")) n.addEventListener(k.slice(2), props[k]); else n.setAttribute(k, props[k]); }
  (kids || []).forEach(c => c && n.appendChild(c)); return n; }
const anchorsOf = c => S.custom[c.id] || c.a;
const rec = c => S.cards[c.id] || (S.cards[c.id] = { seen: 0, hit: 0, total: 0, missed: [], due: 0 });
const pool = () => CARDS.filter(c => S.filter === "all" || c.t === S.filter);
const fmt = Delivery.fmt;
const uid = p => (p || "a") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
const wc = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = a => a[Math.floor(Math.random() * a.length)];
const byId = id => CARDS.find(c => c.id === id);
let micState = "unknown";   // unknown | ok | blocked

function renderStatus() {
  const s = $("status"); s.textContent = "";
  const mic = micState === "ok" ? "Mic on" : (micState === "blocked" ? "Mic blocked" : (Capture.recordSupported ? "Mic ready" : "No mic support"));
  const tr = Capture.speechSupported ? "Live transcript: yes" : "Live transcript: no in this browser (use Chrome or Edge, or type)";
  const rt = CFG.rating ? "Rating: Claude (" + CFG.model + ")" : "Rating: off, no API key. Copy-to-chat works.";
  const sv = saveState === "saved" ? "Saved to data/history.json" : (saveState === "saving" ? "Saving…" : (saveState === "failed" ? "NOT SAVED. Is the server running?" : "History: loading"));
  [mic, tr, rt, sv].forEach((t, i) => { const b = el("span", { text: t }); if (i === 3 && saveState === "failed") b.style.color = "var(--over)"; s.appendChild(b); });
}

/* ---------- clock ---------- */
let timer = null, t0 = 0, dur = 90, elapsed = 0;
function stopClock() { if (timer) { clearInterval(timer); timer = null; } }
function startClock(sec) { stopClock(); dur = sec; t0 = Date.now(); elapsed = 0; timer = setInterval(tick, 200); }
function tick() {
  elapsed = (Date.now() - t0) / 1000; const left = dur - elapsed, c = $("clock"); if (!c) return;
  c.className = "clock" + (left < 0 ? " over" : (left <= 15 ? " warn" : ""));
  $("digits").textContent = left >= 0 ? fmt(Math.ceil(left)) : "+" + fmt(-left);
  $("fill").style.width = Math.min(100, elapsed / dur * 100) + "%";
  $("clocknote").textContent = left >= 0 ? "Target " + fmt(dur) + ". Land the point, then stop." : "Over target. Wrap it up.";
}
function clockEl() { return el("div", { class: "clock", id: "clock" }, [el("div", { class: "digits", id: "digits", text: fmt(dur) }), el("div", { class: "track" }, [el("div", { class: "fill", id: "fill" })]), el("small", { id: "clocknote", text: "" })]); }

/* ---------- capture (shared by practice and mock) ---------- */
let cap = null, capErr = null, liveTr = null;
async function beginCapture(showLive) {
  capErr = null; liveTr = null;
  if (!Capture.recordSupported) { capErr = "This browser cannot record audio. The clock still runs; type your answer."; micState = "blocked"; renderStatus(); return; }
  try {
    cap = await Capture.start({
      onTranscript: tr => { liveTr = tr; if (showLive) paintLive(tr); },
      onLevel: (v, speaking) => { const m = $("lvl"); if (m) m.style.width = Math.round(v * 100) + "%"; }
    });
    micState = "ok";
  } catch (e) { cap = null; capErr = e.message || "Microphone unavailable."; micState = "blocked"; const n = $("capnote"); if (n) { n.textContent = capErr; n.className = "note err"; } }
  renderStatus();
}
function paintLive(tr) {
  const box = $("live"); if (!box) return;
  box.textContent = ""; box.appendChild(document.createTextNode(tr.final));
  if (tr.interim) box.appendChild(el("span", { class: "interim", text: " " + tr.interim }));
  box.scrollTop = box.scrollHeight;
  const n = $("capnote"); if (n && tr.error) { n.textContent = tr.error; n.className = "note err"; }
}
async function endCapture() {
  if (!cap) return null;
  const c = cap; cap = null;
  try { return await c.stop(); } catch (e) { return null; }
}
function liveBox(hint) {
  return el("div", null, [
    el("div", { class: "level" }, [el("i", { id: "lvl" })]),
    el("div", { class: "live", id: "live", "data-empty": hint || "Your words land here as you speak." }),
    el("p", { class: "note", id: "capnote", text: Capture.speechSupported ? "Recording. Speak normally." : "Recording. No live transcript in this browser; you can type it after." })
  ]);
}
function analyzeCapture(res, transcriptText, target) {
  return Delivery.analyze({
    transcript: transcriptText, seconds: res ? res.seconds : elapsed, target,
    words: res && res.transcript && res.transcript.words.length ? res.transcript.words : null,
    segments: res && res.transcript ? res.transcript.segments : null,
    pauses: res ? res.pauses : null, speechStart: res ? res.speechStart : null
  });
}

/* ---------- content rating ---------- */
function ratingBody(card, q, mode, text, secs, fu) {
  return { cardId: card.id, question: q, anchors: anchorsOf(card), avoid: card.avoid || "", storyName: card.n || "", transcript: text, mode, seconds: secs,
    followupQuestion: fu ? fu.q : "", followupTranscript: fu ? fu.text : "", followupSeconds: fu ? fu.secs : 0 };
}
async function requestRating(body, signal) {
  const r = await fetch("/api/rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "The rating did not come back.");
  return j.data;
}
function rubricText(card, q, mode, text, secs, d, fu) {
  const A = anchorsOf(card);
  return ["I am practicing out loud for a Vice President, Capacity Planning & Analytics interview (contact-center workforce planning). Rate this answer. Be blunt and short, plain language, one thing to fix.",
    "", "RULES: Judge only what the transcript says and what is in the anchors. Never invent experience, numbers or outcomes for me. Anchors in parentheses are open slots I have not filled: count them hit only if I gave a specific detail, and never fill them in. The tighter version must use only facts I said.",
    "LOCKED FACTS: " + LOCKED_FACTS.join(" "),
    "", "QUESTION: " + q, "TARGET: " + mode + " seconds" + (mode === 30 ? " (executive version: no workforce-management jargon)" : "") + ". I spoke for " + Math.round(secs) + " seconds.",
    "", "ANCHORS:", ...A.map((a, i) => i + ". " + a), "", "AVOID: " + (card.avoid || "Overclaiming or inventing results."),
    "", "DELIVERY: " + d.wpm + " wpm, " + d.fillers.total + " fillers, " + d.pauses.count + " pauses over 2 s" + (d.firstPoint != null ? ", first real point at " + Math.round(d.firstPoint) + " s" : "") + ".",
    "", "TRANSCRIPT:", text,
    ...(fu && fu.q ? ["", "FOLLOW-UP ASKED: " + fu.q, "FOLLOW-UP ANSWER (" + Math.round(fu.secs || 0) + " s): " + (fu.text || "(none captured)")] : []),
    "", "REPLY WITH: anchors hit (numbers), one-sentence verdict, what worked, the one thing to fix first, where I wandered, any overclaim, and a tighter version in 60 words or fewer using only facts I said."].join("\n");
}
async function copyText(t, btn) {
  try { await navigator.clipboard.writeText(t); } catch (e) { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) {} ta.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = o; }, 1500); }
}
function ratingView(d) {
  const ul = el("ul", { class: "fb" });
  [["Worked", d.worked], ["Fix first", d.fix], ["Wandered", d.rambling], ["Overclaim", d.overclaim], ["Follow-up", d.followup], ["Tighter (" + wc(d.tighter) + " words)", d.tighter]].forEach(([k, v]) => { if (v) ul.appendChild(el("li", null, [el("b", { text: k + ": " }), document.createTextNode(String(v))])); });
  return el("div", { class: "block rating" }, [el("p", { text: String(d.verdict || ""), style: "margin:0;font-weight:600" }), ul]);
}
function deliveryView(d, blob, audioUrl) {
  const strip = el("div", { class: "strip" });
  d.stats.forEach(s => strip.appendChild(el("div", { class: "stat " + (s.s || "") }, [el("small", { text: s.k }), el("b", { text: s.v }), el("span", { text: s.note || "" })])));
  const kids = [el("span", { class: "tag", text: "Delivery" }), strip, el("p", { text: d.fix, style: "margin:0;font-weight:600" })];
  const det = el("details", null, [el("summary", { text: "All delivery notes" }), el("ul", { class: "fb", style: "margin-top:8px" }, d.lines.map(l => el("li", { text: l })))]);
  kids.push(det);
  if (blob || audioUrl) { const a = el("audio", { controls: "", preload: "metadata" }); a.src = audioUrl || URL.createObjectURL(blob); kids.push(a); }
  return el("div", { class: "block" }, kids);
}

/* ====================================================================== PRACTICE */
let cur = null, curQ = "", phase = "ready", checked = [], follow = "", fb = null, ctl = null;
let A = null;   // attempt draft

function pick() {
  let p = pool(); if (p.length > 1 && cur) p = p.filter(c => c.id !== cur.id);
  const due = c => (S.cards[c.id] ? S.cards[c.id].due : 0);
  let cand = p.filter(c => due(c) <= S.turn);
  if (!cand.length) { const m = Math.min(...p.map(due)); cand = p.filter(c => due(c) === m); }
  const back = cand.filter(c => S.cards[c.id] && S.cards[c.id].missed.length);
  const fresh = cand.filter(c => !S.cards[c.id] || !S.cards[c.id].seen);
  const from = back.length ? back : (fresh.length ? fresh : cand);
  return from[Math.floor(Math.random() * from.length)];
}
function next(card) {
  stopClock(); endCapture();
  cur = card || pick(); if (cur) curQ = rnd([cur.q].concat(cur.alt || []));
  phase = "ready"; checked = []; follow = ""; fb = null; A = null; if (ctl) ctl.abort();
  render();
}
async function startAnswer() {
  A = { id: uid("a"), ts: Date.now(), kind: "practice", cardId: cur.id, q: curQ, mode: S.mode, typed: "" };
  phase = "run"; startClock(S.mode); render();
  await beginCapture(true);
}
async function finishAnswer() {
  stopClock(); const secs = elapsed;
  const res = await endCapture();
  const live = res && res.transcript ? res.transcript.final.trim() : "";
  A.secs = res ? res.seconds : secs; A.transcript = live || A.typed || ""; A.cap = res; A.blob = res ? res.blob : null;
  A.delivery = analyzeCapture(res, A.transcript, S.mode);
  A.audio = false; if (A.blob) uploadAudio(A.id, A.blob).then(ok => { A.audio = ok; });
  checked = anchorsOf(cur).map(() => false);
  follow = rnd(cur.f || FOLLOW);
  phase = "review"; render();
}
async function startFollow() { phase = "follow"; startClock(30); render(); await beginCapture(true); }
async function finishFollow() {
  stopClock(); const secs = elapsed;
  const res = await endCapture();
  const live = res && res.transcript ? res.transcript.final.trim() : "";
  A.followQ = follow; A.followSecs = res ? res.seconds : secs; A.followTranscript = live || A.followTyped || "";
  if (res && res.blob) uploadAudio(A.id + "_f", res.blob).then(ok => { A.followAudio = ok; });
  A.followBlob = res ? res.blob : null;
  phase = "review"; render();
}
async function rate() {
  const text = (A.transcript || "").trim();
  if (wc(text) < 8) { fb = { err: "Nothing to rate yet. Record the answer or type it in the transcript box first." }; render(); return; }
  fb = { loading: true }; render(); ctl = new AbortController();
  const card = cur;
  try {
    const d = await requestRating(ratingBody(cur, curQ, S.mode, text, A.secs, A.followQ ? { q: A.followQ, text: A.followTranscript, secs: A.followSecs } : null), ctl.signal);
    if (card !== cur || phase !== "review") return;
    fb = { data: d }; A.rating = d;
    const n = anchorsOf(cur).length; (d.hit || []).forEach(i => { if (i >= 0 && i < n) checked[i] = true; });
  } catch (e) { if (e.name === "AbortError" || card !== cur) return; fb = { err: e.message }; }
  if (phase === "review") render();
}
function score() {
  const An = anchorsOf(cur), r = rec(cur), missed = []; An.forEach((_, i) => { if (!checked[i]) missed.push(i); });
  r.seen++; r.hit += An.length - missed.length; r.total += An.length; r.missed = missed;
  r.due = S.turn + (missed.length ? 3 : Math.max(8, pool().length - 1)); S.turn++;
  if (A && A.delivery) S.attempts.push(packAttempt(A, An.length, An.map((_, i) => !!checked[i]), null));
  save(); next();
}
function packAttempt(a, total, hitArr, mockId) {
  const d = a.delivery;
  return { id: a.id, ts: a.ts, kind: a.kind, mockId: mockId || null, cardId: a.cardId, q: a.q, mode: a.mode, secs: +(+a.secs).toFixed(1), transcript: a.transcript || "",
    delivery: { words: d.words, wpm: d.wpm, fillers: d.fillers.total, fillerTop: d.fillers.top, pauses: d.pauses.count, longest: d.pauses.longest, firstPoint: d.firstPoint, over: +d.over.toFixed(1), fix: d.fix },
    hit: hitArr.map((h, i) => h ? i : -1).filter(i => i >= 0), total, followQ: a.followQ || "", followTranscript: a.followTranscript || "", followSecs: a.followSecs || 0,
    rating: a.rating || null, audio: !!a.audio, followAudio: !!a.followAudio };
}

function render() {
  const box = $("card"); box.textContent = ""; if (!cur) { box.appendChild(el("p", { text: "No cards in this set." })); return; }
  const r = S.cards[cur.id], An = anchorsOf(cur), src = SRC[cur.src];
  box.appendChild(el("div", { class: "meta" }, [el("span", { class: "tag", text: cur.b }), el("span", { class: "tag", text: src[0] }),
    (r && r.missed.length && phase === "ready") ? el("span", { class: "tag flag", text: "Back again: " + r.missed.length + " missed last time" }) : null,
    (phase === "run" || phase === "follow") ? el("span", { class: "tag rec", text: "Recording" }) : null]));
  box.appendChild(el("p", { class: "q", text: curQ || cur.q }));
  if (S.mode === 30 && phase !== "follow") box.appendChild(el("p", { class: "exec", text: "30 seconds. Explain it to an Executive Director who does not care about WFM terms." }));

  if (phase === "ready") {
    dur = S.mode; box.appendChild(clockEl());
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-start", text: "Start the clock and record", onclick: startAnswer }), el("button", { class: "quiet", id: "btn-skip", text: "Skip", onclick: () => next() })]));
    box.appendChild(el("p", { class: "note", text: "Say the answer out loud. The anchors stay hidden until you finish. Space bar starts and stops." }));
  } else if (phase === "run") {
    box.appendChild(clockEl());
    box.appendChild(liveBox());
    if (!Capture.speechSupported) { const ta = el("textarea", { placeholder: "No live transcript here. Type or dictate your answer if you want it rated.", style: "min-height:80px" }); ta.addEventListener("input", () => { A.typed = ta.value; }); box.appendChild(ta); }
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-done", text: "Done. Show the anchors", onclick: finishAnswer })]));
  } else if (phase === "follow") {
    box.appendChild(el("div", { class: "follow", style: "border:0;padding:0" }, [el("span", { class: "tag", text: "Follow-up" }), el("p", { text: follow })]));
    box.appendChild(clockEl());
    box.appendChild(liveBox());
    if (!Capture.speechSupported) { const ta = el("textarea", { placeholder: "Type the follow-up answer if you want it rated.", style: "min-height:60px" }); ta.addEventListener("input", () => { A.followTyped = ta.value; }); box.appendChild(ta); }
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-fdone", text: "Done", onclick: finishFollow })]));
  } else if (phase === "review") {
    const over = A.secs - S.mode;
    box.appendChild(el("p", { class: "note", text: "You spoke for " + fmt(A.secs) + (over > 5 ? ". That is " + fmt(over) + " over." : ".") + " Tick the anchors you said." }));
    box.appendChild(deliveryView(A.delivery, A.blob));
    if (capErr) box.appendChild(el("p", { class: "note err", text: capErr }));
    if (cur.n) box.appendChild(el("p", { class: "exec", text: "Your story: " + cur.n }));
    const ul = el("ul", { class: "anchors" });
    An.forEach((txt, i) => { const cb = el("input", { type: "checkbox", id: "a-" + i }); cb.checked = !!checked[i]; cb.addEventListener("change", () => { checked[i] = cb.checked; });
      ul.appendChild(el("li", null, [el("label", { for: "a-" + i }, [cb, el("span", null, [document.createTextNode(txt), (r && r.missed.includes(i)) ? el("span", { class: "again", text: "missed last time" }) : null])])])); });
    box.appendChild(ul);
    if (cur.avoid) box.appendChild(el("p", { class: "note", text: "Avoid: " + cur.avoid }));
    if (NO_OUTCOME.has(cur.id)) box.appendChild(el("p", { class: "note", text: "This story ends at the recommendation. No outcome is confirmed, so do not state one." }));
    // follow-up
    const fuWrap = el("div", { class: "follow" }, [el("span", { class: "tag", text: "She interrupts" }), el("p", { text: A.followQ || follow })]);
    if (A.followQ) { fuWrap.appendChild(el("p", { class: "note", text: "You took " + fmt(A.followSecs) + " on the follow-up." + (A.followTranscript ? "" : " No transcript captured.") }));
      if (A.followTranscript) fuWrap.appendChild(el("details", null, [el("summary", { text: "Follow-up transcript" }), el("p", { text: A.followTranscript })]));
      if (A.followBlob) { const au = el("audio", { controls: "", preload: "metadata" }); au.src = URL.createObjectURL(A.followBlob); fuWrap.appendChild(au); } }
    else fuWrap.appendChild(el("div", { class: "row" }, [el("button", { id: "btn-follow", text: "Answer it. 30 sec", onclick: startFollow })]));
    box.appendChild(fuWrap);
    // transcript + rating
    const cw = el("div", { class: "follow" }, [el("span", { class: "tag", text: "Content" })]);
    const ta = el("textarea", { id: "transcript", "aria-label": "Transcript", placeholder: Capture.speechSupported ? "No words were captured. Type or paste what you said to get it rated." : "Type or paste what you said to get it rated.", style: "min-height:110px" });
    ta.value = A.transcript || "";
    ta.addEventListener("input", () => { A.transcript = ta.value; });
    ta.addEventListener("blur", () => { if (A.transcript !== A.delivery._text) { A.delivery = analyzeCapture(A.cap, A.transcript, S.mode); A.delivery._text = A.transcript; render(); } });
    A.delivery._text = A.transcript;
    cw.appendChild(ta);
    cw.appendChild(el("p", { class: "hint", text: wc(A.transcript) + " words. Fix recognizer typos here; the rating reads this box." }));
    const rowb = el("div", { class: "row" });
    if (fb && fb.loading) rowb.appendChild(el("span", { class: "note", text: "Rating… this can take up to a minute." })), rowb.appendChild(el("button", { text: "Stop", onclick: () => { if (ctl) ctl.abort(); fb = null; render(); } }));
    else {
      if (CFG.rating) rowb.appendChild(el("button", { id: "btn-rate", class: "primary", text: fb && fb.data ? "Rate again" : "Rate my answer", onclick: rate }));
      rowb.appendChild(el("button", { id: "btn-copy", text: "Copy transcript and rubric", onclick: e => copyText(rubricText(cur, curQ, S.mode, A.transcript, A.secs, A.delivery, A.followQ ? { q: A.followQ, text: A.followTranscript, secs: A.followSecs } : null), e.target) }));
      if (!CFG.rating) rowb.appendChild(el("span", { class: "note", text: "No API key set, so paste that into a chat for the content rating." }));
    }
    cw.appendChild(rowb);
    if (fb && fb.err) cw.appendChild(el("p", { class: "note err", text: fb.err }));
    if (fb && fb.data) { cw.appendChild(ratingView(fb.data)); cw.appendChild(el("p", { class: "note", text: "The anchors it heard are ticked above. Check them yourself." })); }
    box.appendChild(cw);
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-next", text: "Score and next", onclick: score }), el("button", { class: "quiet", id: "btn-redo", text: "Redo this one", onclick: () => { const c = cur; next(c); } }), el("button", { class: "quiet", id: "btn-edit", text: "Edit anchors", onclick: () => { phase = "edit"; render(); } })]));
  } else if (phase === "edit") {
    const ta = el("textarea", { id: "edit-anchors", "aria-label": "Anchors, one per line" }); ta.value = An.join("\n");
    box.appendChild(el("p", { class: "note", text: "One anchor per line. Keep them to a few words you would actually say. Saved to your history file." }));
    box.appendChild(ta);
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-save", text: "Save anchors", onclick: () => { const lines = ta.value.split("\n").map(s => s.trim()).filter(Boolean); if (lines.length) { S.custom[cur.id] = lines; rec(cur).missed = []; save(); } checked = anchorsOf(cur).map(() => false); phase = "review"; render(); } }),
      el("button", { class: "quiet", id: "btn-cancel", text: "Cancel", onclick: () => { phase = "review"; render(); } }),
      S.custom[cur.id] ? el("button", { class: "quiet", id: "btn-restore", text: "Restore original", onclick: () => { delete S.custom[cur.id]; rec(cur).missed = []; save(); checked = anchorsOf(cur).map(() => false); phase = "review"; render(); } }) : null]));
  }
}

/* ====================================================================== MOCK INTERVIEW */
const M = { active: false, id: null, qs: [], i: 0, phase: "intro", answers: [], t0: 0, debrief: null, local: null, rating: null };
function pickMock() {
  const n = 6 + Math.floor(Math.random() * 2);
  const opening = byId("o-self") || rnd(CARDS.filter(c => c.t === "opening"));
  const cats = shuffle([...new Set(CARDS.map(c => c.b))].filter(b => b !== "Opening & fit"));
  let chosen = [];
  for (const b of cats) { if (chosen.length >= n - 1) break; const opts = CARDS.filter(c => c.b === b && c.t !== "opening"); if (opts.length) chosen.push(rnd(opts)); }
  // at least two real stories in a 30-minute interview
  let stories = chosen.filter(c => c.t === "story").length, guard = 0;
  while (stories < 2 && guard++ < 20) { const i = chosen.findIndex(c => c.t !== "story"); const alt = CARDS.filter(c => c.t === "story" && !chosen.some(x => x.b === c.b || x.id === c.id)); if (i < 0 || !alt.length) break; chosen[i] = rnd(alt); stories++; }
  chosen = shuffle(chosen);
  const sc = chosen.findIndex(c => c.t === "scenario"); if (sc >= 0) chosen.push(chosen.splice(sc, 1)[0]);   // scenario last, like a real panel
  return [opening].concat(chosen).map(c => ({ card: c, q: rnd([c.q].concat(c.alt || [])), follow: rnd(c.f || FOLLOW) }));
}
let mockTimer = null;
function mockClockTick() { const mb = $("mockclock"); if (!mb || !M.t0) return; const e = (Date.now() - M.t0) / 1000; mb.textContent = fmt(Math.max(0, 1800 - e)); mb.parentElement.classList.toggle("over", e > 1800); }
function mockStart() { Object.assign(M, { active: true, id: uid("m"), qs: pickMock(), i: 0, phase: "ask", answers: [], t0: Date.now(), debrief: null, local: null, rating: null, lastSaved: false }); clearInterval(mockTimer); mockTimer = setInterval(mockClockTick, 500); renderMock(); }
function mockAbort() { stopClock(); endCapture(); clearInterval(mockTimer); Object.assign(M, { active: false, phase: "intro", qs: [], answers: [], t0: 0 }); renderMock(); }
async function mockAnswerStart() {
  const q = M.qs[M.i];
  M.cur = { id: uid("a"), ts: Date.now(), kind: "mock", cardId: q.card.id, q: q.q, mode: 90, typed: "" };
  M.phase = "answer"; startClock(90); renderMock(); await beginCapture(false);
}
async function mockAnswerDone() {
  stopClock(); const secs = elapsed; const res = await endCapture();
  const a = M.cur, live = res && res.transcript ? res.transcript.final.trim() : "";
  a.secs = res ? res.seconds : secs; a.transcript = live || a.typed || ""; a.cap = res; a.blob = res ? res.blob : null;
  a.delivery = analyzeCapture(res, a.transcript, 90);
  if (a.blob) uploadAudio(a.id, a.blob).then(ok => { a.audio = ok; });
  M.phase = "followAsk"; renderMock();
}
async function mockFollowStart() { M.phase = "followAnswer"; startClock(30); renderMock(); await beginCapture(false); }
async function mockFollowDone() {
  stopClock(); const secs = elapsed; const res = await endCapture();
  const a = M.cur, live = res && res.transcript ? res.transcript.final.trim() : "";
  a.followQ = M.qs[M.i].follow; a.followSecs = res ? res.seconds : secs; a.followTranscript = live || a.followTyped || ""; a.followBlob = res ? res.blob : null;
  if (res && res.blob) uploadAudio(a.id + "_f", res.blob).then(ok => { a.followAudio = ok; });
  a.checked = anchorsOf(M.qs[M.i].card).map(() => false);
  M.answers.push(a); M.cur = null;
  if (M.i + 1 < M.qs.length) { M.i++; M.phase = "ask"; renderMock(); }
  else { M.phase = "debrief"; clearInterval(mockTimer); renderMock(); mockDebrief(); }
}
function localDebrief() {
  const byCat = {};
  M.answers.forEach((a, i) => { const card = M.qs[i].card, c = byCat[card.b] || (byCat[card.b] = { hit: 0, total: 0, n: 0, over: 0, fill: 0 });
    c.hit += a.checked.filter(Boolean).length; c.total += a.checked.length; c.n++; c.over += a.delivery.over > 5 ? 1 : 0; c.fill += a.delivery.fillers.total; });
  const weakest = Object.entries(byCat).map(([area, c]) => ({ area, pct: c.total ? c.hit / c.total : 0, why: c.hit + " of " + c.total + " anchors" + (c.over ? ", over time" : "") })).sort((x, y) => x.pct - y.pct).slice(0, 3);
  const redo = M.answers.map((a, i) => ({ index: i, pct: a.checked.length ? a.checked.filter(Boolean).length / a.checked.length : 0, over: a.delivery.over, a }))
    .sort((x, y) => x.pct - y.pct || y.over - x.over).slice(0, 3)
    .map(x => ({ index: x.index, why: x.a.checked.filter(Boolean).length + " of " + x.a.checked.length + " anchors" + (x.over > 5 ? ", " + fmt(x.over) + " over" : "") + (x.a.rating && x.a.rating.fix ? ". " + x.a.rating.fix : "") }));
  const habits = { "ran over time": 0, "spoke too fast": 0, "slow to the first point": 0, "fillers": 0 };
  M.answers.forEach(a => { const d = a.delivery; if (d.over > 5) habits["ran over time"]++; if (d.wpm > 170) habits["spoke too fast"]++; if (d.firstPoint != null && d.firstPoint > 12) habits["slow to the first point"]++; if (d.fillers.total / Math.max(1, d.secs / 60) > 2) habits.fillers++; });
  const top = Object.entries(habits).sort((x, y) => y[1] - x[1])[0];
  const pattern = top && top[1] >= 2 ? "You " + top[0] + " on " + top[1] + " of " + M.answers.length + " answers." : "No single delivery habit repeated across answers.";
  const total = M.answers.reduce((s, a) => s + a.checked.filter(Boolean).length, 0), poss = M.answers.reduce((s, a) => s + a.checked.length, 0);
  const minutes = M.answers.length ? Math.round(M.answers.reduce((s, a) => s + a.secs + (a.followSecs || 0), 0) / 60) : 0;
  return { summary: total + " of " + poss + " anchors across " + M.answers.length + " answers. About " + minutes + " minutes of talking.", weakest, redo, pattern };
}
async function mockDebrief() {
  M.local = null; M.debrief = null;
  if (CFG.rating) {
    M.rating = { i: 0, n: M.answers.length, err: null }; renderMock();
    for (let i = 0; i < M.answers.length; i++) {
      const a = M.answers[i], card = M.qs[i].card; M.rating.i = i; renderMock();
      if (wc(a.transcript) < 8) continue;
      try { a.rating = await requestRating(ratingBody(card, a.q, 90, a.transcript, a.secs, a.followQ ? { q: a.followQ, text: a.followTranscript, secs: a.followSecs } : null));
        (a.rating.hit || []).forEach(k => { if (k < a.checked.length) a.checked[k] = true; });
      } catch (e) { M.rating.err = e.message; }
    }
    M.rating.done = true;
    try {
      const body = { answers: M.answers.map((a, i) => ({ question: a.q, category: M.qs[i].card.b, anchors: anchorsOf(M.qs[i].card), hit: a.checked.map((h, k) => h ? k : -1).filter(k => k >= 0), seconds: a.secs, wpm: a.delivery.wpm, fillers: a.delivery.fillers.total, pauses: a.delivery.pauses.count, firstPoint: a.delivery.firstPoint, followupQuestion: a.followQ, followupTranscript: a.followTranscript, rating: a.rating, transcript: a.transcript })) };
      const r = await fetch("/api/debrief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "debrief failed"); M.debrief = j.data;
    } catch (e) { M.rating.err = (M.rating.err ? M.rating.err + " " : "") + "Debrief: " + e.message; }
  }
  M.local = localDebrief(); renderMock();
}
function mockFinish() {
  M.answers.forEach((a, i) => { const card = M.qs[i].card, An = anchorsOf(card), r = rec(card), missed = []; An.forEach((_, k) => { if (!a.checked[k]) missed.push(k); });
    r.seen++; r.hit += An.length - missed.length; r.total += An.length; r.missed = missed; r.due = S.turn + (missed.length ? 3 : Math.max(8, CARDS.length - 1));
    S.attempts.push(packAttempt(a, An.length, a.checked.slice(), M.id)); });
  S.turn++;
  const d = M.debrief || M.local;
  S.mocks.push({ id: M.id, ts: M.t0, n: M.answers.length, attemptIds: M.answers.map(a => a.id), summary: d ? d.summary : "", weakest: d ? d.weakest : [], redo: (d ? d.redo : []).map(x => ({ cardId: M.qs[x.index] ? M.qs[x.index].card.id : null, q: M.answers[x.index] ? M.answers[x.index].q : "", why: x.why })), pattern: d ? d.pattern : "" });
  save(); clearInterval(mockTimer); Object.assign(M, { active: false, phase: "intro", qs: [], answers: [], t0: 0, debrief: null, local: null, rating: null, lastSaved: true }); renderMock();
}
function practiceCard(card) { S.filter = "all"; save(); chips(); tab("practice"); next(card); }

function renderMock() {
  const box = $("mock"); box.textContent = "";
  if (!M.active) {
    box.appendChild(el("h2", { text: "Mock interview. 30 minutes, 6 to 7 questions." }));
    const ul = el("ul", { class: "fb" });
    ["One question at a time, drawn across categories. No anchors, no transcript on screen, no coaching until the end.",
      "90 seconds per answer. Then she interrupts with one follow-up and you get 30 seconds.",
      "At the end: every answer with its anchors to tick, delivery numbers, playback, and one debrief with your weakest areas and the three answers to redo." + (CFG.rating ? " Claude rates each answer first." : " Without an API key you tick the anchors yourself."),
      "Treat it like the real thing. No pausing the clock."].forEach(t => ul.appendChild(el("li", { text: t })));
    box.appendChild(ul);
    if (M.lastSaved) box.appendChild(el("p", { class: "note", text: "Last mock saved. The three redo answers are now due sooner in Practice, and the interview is on the Progress tab." }));
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-start", text: "Start the interview", onclick: mockStart })]));
    return;
  }
  const q = M.qs[M.i];
  box.appendChild(el("div", { class: "mockbar" }, [el("span", null, [document.createTextNode("Question " + (M.i + 1) + " of " + M.qs.length + (M.phase === "debrief" ? ". Debrief." : ""))]), el("span", null, [document.createTextNode("Interview clock "), el("span", { class: "big", id: "mockclock", text: fmt(Math.max(0, 1800 - (Date.now() - M.t0) / 1000)) })])]));
  if (M.phase === "ask" || M.phase === "answer") {
    box.appendChild(el("div", { class: "meta" }, [el("span", { class: "tag", text: q.card.b }), M.phase === "answer" ? el("span", { class: "tag rec", text: "Recording" }) : null]));
    box.appendChild(el("p", { class: "q", text: q.q }));
    dur = 90; box.appendChild(clockEl());
    if (M.phase === "ask") box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-answer", text: "Start answering", onclick: mockAnswerStart }), el("button", { class: "quiet", text: "Abandon interview", onclick: mockAbort })]));
    else {
      box.appendChild(el("div", { class: "level" }, [el("i", { id: "lvl" })]));
      box.appendChild(el("p", { class: "note", id: "capnote", text: "Recording. The transcript is hidden until the debrief." }));
      if (!Capture.speechSupported) { const ta = el("textarea", { placeholder: "No live transcript in this browser. Type what you say if you want it rated.", style: "min-height:70px" }); ta.addEventListener("input", () => { M.cur.typed = ta.value; }); box.appendChild(ta); }
      box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-done", text: "Done", onclick: mockAnswerDone })]));
    }
  } else if (M.phase === "followAsk" || M.phase === "followAnswer") {
    box.appendChild(el("div", { class: "meta" }, [el("span", { class: "tag", text: "She interrupts" }), M.phase === "followAnswer" ? el("span", { class: "tag rec", text: "Recording" }) : null]));
    box.appendChild(el("p", { class: "q", text: q.follow }));
    dur = 30; box.appendChild(clockEl());
    if (M.phase === "followAsk") box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-fstart", text: "Answer it. 30 sec", onclick: mockFollowStart })]));
    else {
      box.appendChild(el("div", { class: "level" }, [el("i", { id: "lvl" })]));
      box.appendChild(el("p", { class: "note", id: "capnote", text: "Recording." }));
      if (!Capture.speechSupported) { const ta = el("textarea", { placeholder: "Type the follow-up if you want it rated.", style: "min-height:50px" }); ta.addEventListener("input", () => { M.cur.followTyped = ta.value; }); box.appendChild(ta); }
      box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-fdone", text: "Done", onclick: mockFollowDone })]));
    }
  } else if (M.phase === "debrief") {
    stopClock();
    box.appendChild(el("h2", { text: "Debrief" }));
    if (M.rating && !M.rating.done) box.appendChild(el("p", { class: "note", text: "Rating answer " + (M.rating.i + 1) + " of " + M.rating.n + "…" }));
    if (M.rating && M.rating.err) box.appendChild(el("p", { class: "note err", text: M.rating.err }));
    const d = M.debrief || M.local;
    if (d) {
      const blk = el("div", { class: "block" }, [el("p", { text: d.summary, style: "margin:0;font-weight:600" }), el("p", { class: "note", text: "Habit: " + d.pattern })]);
      blk.appendChild(el("h3", { text: "Weakest areas" }));
      const wl = el("ul", { class: "fb" }); (d.weakest || []).forEach(w => wl.appendChild(el("li", null, [el("b", { text: w.area + ": " }), document.createTextNode(w.why)]))); blk.appendChild(wl);
      blk.appendChild(el("h3", { text: "Three answers to redo" }));
      (d.redo || []).forEach(x => { const a = M.answers[x.index]; if (!a) return; blk.appendChild(el("div", { class: "redo" }, [el("b", { text: a.q }), el("span", { class: "note", text: x.why }), el("div", { class: "row" }, [el("button", { class: "small", text: "Practice this now", onclick: () => { mockFinish(); practiceCard(byId(a.cardId)); } })])])); });
      box.appendChild(blk);
    } else if (!CFG.rating) box.appendChild(el("p", { class: "note", text: "Tick the anchors you hit on each answer. The debrief updates as you tick." }));
    M.answers.forEach((a, i) => {
      const card = M.qs[i].card, An = anchorsOf(card);
      const sec = el("div", { class: "follow" }, [el("div", { class: "meta" }, [el("span", { class: "tag", text: (i + 1) + ". " + card.b }), el("span", { class: "pill", text: a.checked.filter(Boolean).length + "/" + An.length })]), el("p", { text: a.q })]);
      sec.appendChild(deliveryView(a.delivery, a.blob));
      if (card.n) sec.appendChild(el("p", { class: "exec", text: "Your story: " + card.n }));
      const ul = el("ul", { class: "anchors" });
      An.forEach((txt, k) => { const cb = el("input", { type: "checkbox" }); cb.checked = !!a.checked[k]; cb.addEventListener("change", () => { a.checked[k] = cb.checked; M.local = localDebrief(); renderMock(); }); ul.appendChild(el("li", null, [el("label", null, [cb, el("span", { text: txt })])])); });
      sec.appendChild(ul);
      if (card.avoid) sec.appendChild(el("p", { class: "note", text: "Avoid: " + card.avoid }));
      if (a.rating) sec.appendChild(ratingView(a.rating));
      sec.appendChild(el("details", null, [el("summary", { text: "Transcript" + (a.transcript ? "" : " (none captured)") }), el("p", { text: a.transcript || "" })]));
      if (a.followQ) sec.appendChild(el("details", null, [el("summary", { text: "Follow-up: " + a.followQ + " (" + fmt(a.followSecs) + ")" }), el("p", { text: a.followTranscript || "(no transcript)" })]));
      if (!CFG.rating) sec.appendChild(el("div", { class: "row" }, [el("button", { class: "small", text: "Copy transcript and rubric", onclick: e => copyText(rubricText(card, a.q, 90, a.transcript, a.secs, a.delivery, a.followQ ? { q: a.followQ, text: a.followTranscript, secs: a.followSecs } : null), e.target) })]));
      box.appendChild(sec);
    });
    box.appendChild(el("div", { class: "row" }, [el("button", { class: "primary", id: "btn-mock-finish", text: "Save and finish", onclick: mockFinish, disabled: (M.rating && !M.rating.done) ? "" : null }), el("button", { class: "quiet", text: "Discard", onclick: mockAbort })]));
  }
}

/* ====================================================================== CHEAT SHEET */
function sheet() {
  const v = $("view-sheet"); v.textContent = "";
  const lock = el("div", { class: "lock" });
  lock.appendChild(el("h2", { text: "Lock this before Friday" }));
  const ul = el("ul"); ["One real example of developing an analyst: coaching, delegating, or improving someone's work. It can be ordinary. It has to have happened."].forEach(t => ul.appendChild(el("li", { text: t })));
  lock.appendChild(ul); v.appendChild(lock);
  const facts = el("div", { class: "block" }, [el("h2", { text: "Locked facts. Say them the same way every time" })]);
  const fl = el("ul"); ["Sunrun scale: 500+ call-center reps, 250+ retail reps, 1,000+ field reps.",
    "Directly managed 4 workforce analysts at Sunrun.",
    "Channels: forecasting and capacity work covered voice, chat and email. You planned for chat. You did not run a chat floor.",
    "Resume results, only as they read on your resume and only for the work they came from: forecast accuracy 91% to 96%, manual prep down 4+ hours a day, overtime down 12%.",
    "The AAC evening/weekend story and the AAC cost-versus-risk story both end at the recommendation. No outcome is confirmed."].forEach(t => fl.appendChild(el("li", { text: t })));
  facts.appendChild(fl); v.appendChild(facts);
  const fw = el("div", { class: "block" }, [el("h2", { text: "Three shapes to know cold" })]);
  [["Capacity planning", "Demand → Workload → Capacity → Gap → Hiring → Scenarios → Recommendation"],
   ["Any problem", "Define → Validate data → Segment → Drivers → Options → Impact → Recommend"],
   ["Any executive answer", "What I found → Why it matters → What I recommend → STOP"]].forEach(f => { fw.appendChild(el("h3", { text: f[0] })); fw.appendChild(el("p", { class: "flow", text: f[1] })); });
  v.appendChild(fw);
  const st = el("div", { class: "block" }, [el("h2", { text: "Your stories" }), el("p", { class: "note", text: "Round the numbers when you speak, and leave out internal names." })]);
  CARDS.filter(c => c.t === "story").forEach(c => { const s = SRC[c.src];
    st.appendChild(el("div", { class: "meta", style: "margin-top:10px" }, [el("h3", { text: c.n || c.q }), c.src === "yours" ? el("span", { class: "tag flag", text: s[0] }) : null, S.custom[c.id] ? el("span", { class: "tag", text: "edited" }) : null]));
    const ol = el("ol"); anchorsOf(c).forEach(a => ol.appendChild(el("li", { text: a }))); st.appendChild(ol);
    if (c.avoid) st.appendChild(el("p", { class: "note", text: "Avoid: " + c.avoid })); });
  v.appendChild(st);
  const gp = el("div", { class: "block" }, [el("h2", { text: "Honest answers for the gaps" })]);
  CARDS.filter(c => c.t === "gap").forEach(c => { gp.appendChild(el("h3", { text: c.q, style: "margin-top:10px" })); const ol = el("ol"); anchorsOf(c).forEach(a => ol.appendChild(el("li", { text: a }))); gp.appendChild(ol); });
  v.appendChild(gp);
  const qs = el("div", { class: "block" }, [el("h2", { text: "Questions for Melissa" })]);
  const ql = el("ul"); ["What does success look like in this role at six months and at a year?",
    "Where is forecast accuracy today, and which line of business is hardest to forecast?",
    "How are capacity decisions made now between Operations and Finance?",
    "How large is the analyst team, and what does it need most from a leader?",
    "What is driving the search now: growth, a new platform, or a gap?"].forEach(t => ql.appendChild(el("li", { text: t })));
  qs.appendChild(ql); qs.appendChild(el("p", { class: "note", text: "Ask her role early if she does not say. It tells you how technical to go." })); v.appendChild(qs);
}

/* ====================================================================== PROGRESS */
let armed = false, win = 7;
function spark(vals) {
  const w = 84, h = 22, n = vals.length; const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 " + w + " " + h); svg.setAttribute("class", "spark"); svg.setAttribute("aria-hidden", "true");
  if (n === 1) { const c = document.createElementNS(svg.namespaceURI, "circle"); c.setAttribute("cx", w / 2); c.setAttribute("cy", h - 2 - vals[0] * (h - 4)); c.setAttribute("r", 2.5); c.setAttribute("fill", "var(--accent)"); svg.appendChild(c); return svg; }
  const pts = vals.map((v, i) => (i / (n - 1) * (w - 4) + 2).toFixed(1) + "," + (h - 2 - v * (h - 4)).toFixed(1)).join(" ");
  const pl = document.createElementNS(svg.namespaceURI, "polyline"); pl.setAttribute("points", pts); pl.setAttribute("fill", "none"); pl.setAttribute("stroke", "var(--accent)"); pl.setAttribute("stroke-width", "2"); pl.setAttribute("stroke-linejoin", "round"); svg.appendChild(pl); return svg;
}
function progress() {
  const v = $("view-progress"); v.textContent = "";
  const since = win ? Date.now() - win * 86400e3 : 0;
  const all = S.attempts.slice().sort((a, b) => a.ts - b.ts), at = all.filter(a => a.ts >= since);
  v.appendChild(el("div", { class: "row between" }, [el("h2", { text: "Progress" }), el("div", { class: "chips" }, [el("button", { "aria-pressed": String(win === 7), text: "Last 7 days", onclick: () => { win = 7; progress(); } }), el("button", { "aria-pressed": String(win === 0), text: "All time", onclick: () => { win = 0; progress(); } })])]));
  // summary strip
  const hitSum = at.reduce((s, a) => s + a.hit.length, 0), totSum = at.reduce((s, a) => s + a.total, 0);
  const strip = el("div", { class: "strip" });
  [["Attempts", at.length + "", ""], ["Anchors hit", totSum ? Math.round(hitSum / totSum * 100) + "%" : "-", ""],
   ["Avg vs target", at.length ? (o => Math.abs(o).toFixed(0) + " s " + (o > 0 ? "over" : "under"))(at.reduce((s, a) => s + a.delivery.over, 0) / at.length) : "-", ""],
   ["Fillers / answer", at.length ? (at.reduce((s, a) => s + a.delivery.fillers, 0) / at.length).toFixed(1) : "-", ""],
   ["Avg pace", at.filter(a => a.delivery.wpm).length ? Math.round(at.filter(a => a.delivery.wpm).reduce((s, a) => s + a.delivery.wpm, 0) / at.filter(a => a.delivery.wpm).length) + " wpm" : "-", ""]].forEach(([k, val]) => strip.appendChild(el("div", { class: "stat" }, [el("small", { text: k }), el("b", { text: val })])));
  v.appendChild(strip);
  // by area
  const by = {}; CARDS.forEach(c => { by[c.b] = by[c.b] || { hit: 0, total: 0, n: 0, seen: 0 }; by[c.b].n++; });
  at.forEach(a => { const c = byId(a.cardId); if (!c) return; by[c.b].hit += a.hit.length; by[c.b].total += a.total; by[c.b].seen++; });
  const seenCards = new Set(at.map(a => a.cardId)).size;
  const b = el("div", { class: "block" }, [el("h2", { text: "Anchors hit, by area" }), el("p", { class: "note", text: at.length ? seenCards + " of " + CARDS.length + " questions practiced" + (win ? " this week" : "") + ". Lowest areas first." : "Nothing practiced" + (win ? " in the last 7 days" : " yet") + ". Scores appear here after your first rep." })]);
  Object.keys(by).sort((x, y) => { const a = by[x], c = by[y]; return (a.total ? a.hit / a.total : 2) - (c.total ? c.hit / c.total : 2); }).forEach(k => { const d = by[k], p = d.total ? Math.round(d.hit / d.total * 100) : null;
    const fill = el("div", { class: "fill" }); fill.style.width = (p || 0) + "%"; fill.style.background = p === null ? "var(--line)" : (p < 60 ? "var(--over)" : (p < 80 ? "var(--warn)" : "var(--good)"));
    b.appendChild(el("div", { class: "meter" }, [el("span", { text: k }), el("div", { class: "track" }, [fill]), el("b", { text: p === null ? "none" : p + "%" })])); });
  v.appendChild(b);
  // per question trend
  const perQ = {}; at.forEach(a => (perQ[a.cardId] = perQ[a.cardId] || []).push(a));
  const tq = el("div", { class: "block" }, [el("h2", { text: "Per question. Are you improving?" }), el("p", { class: "note", text: "Anchors hit on the first attempt versus the latest, and the trend across every attempt" + (win ? " this week" : "") + "." })]);
  const rows = Object.entries(perQ).map(([id, list]) => { const c = byId(id); const pct = list.map(a => a.total ? a.hit.length / a.total : 0); return { c, list, first: pct[0], last: pct[pct.length - 1], pct, worst: Math.min(...pct) }; }).filter(r => r.c).sort((x, y) => x.last - y.last || y.list.length - x.list.length);
  if (!rows.length) tq.appendChild(el("p", { class: "note", text: "No attempts yet." }));
  else {
    const t = el("table", { class: "t" }); t.appendChild(el("thead", null, [el("tr", null, ["Question", "Reps", "First", "Latest", "Trend", "Last time", ""].map(h => el("th", { text: h })))]));
    const tb = el("tbody");
    rows.forEach(r => { const last = r.list[r.list.length - 1], delta = r.last - r.first; const cls = r.list.length < 2 ? "flat" : (delta > 0.01 ? "up" : (delta < -0.01 ? "down" : "flat")); const arrow = r.list.length < 2 ? "" : (delta > 0.01 ? "↑" : (delta < -0.01 ? "↓" : "→"));
      tb.appendChild(el("tr", null, [el("td", { text: r.c.q }), el("td", { class: "n", text: r.list.length + "" }), el("td", { class: "n", text: Math.round(r.first * 100) + "%" }), el("td", { class: "n " + cls, text: Math.round(r.last * 100) + "% " + arrow }), el("td", null, [spark(r.pct)]), el("td", { class: "n", text: fmt(last.secs) + (last.delivery.over > 5 ? " over" : "") }), el("td", null, [el("button", { class: "small", text: "Practice", onclick: () => practiceCard(r.c) })])])); });
    t.appendChild(tb); tq.appendChild(t);
  }
  v.appendChild(tq);
  // missing anchors
  const weak = CARDS.filter(c => S.cards[c.id] && S.cards[c.id].missed.length);
  const w = el("div", { class: "block" }, [el("h2", { text: "Anchors you missed last time" })]);
  if (!weak.length) w.appendChild(el("p", { class: "note", text: "None right now." }));
  weak.forEach(c => { w.appendChild(el("h3", { text: c.q, style: "margin-top:8px" })); const ul = el("ul"); const An = anchorsOf(c); S.cards[c.id].missed.forEach(i => { if (An[i]) ul.appendChild(el("li", { text: An[i] })); }); w.appendChild(ul); });
  v.appendChild(w);
  // mocks
  const mocks = S.mocks.filter(m => m.ts >= since).slice().reverse();
  if (mocks.length) { const mk = el("div", { class: "block" }, [el("h2", { text: "Mock interviews" })]);
    mocks.forEach(m => { const d = el("details", null, [el("summary", { text: new Date(m.ts).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ". " + m.n + " questions. " + (m.summary || "") })]);
      if (m.pattern) d.appendChild(el("p", { class: "note", text: "Habit: " + m.pattern }));
      const ul = el("ul", { class: "fb", style: "margin-top:8px" }); (m.weakest || []).forEach(x => ul.appendChild(el("li", null, [el("b", { text: x.area + ": " }), document.createTextNode(x.why)]))); d.appendChild(ul);
      (m.redo || []).forEach(x => d.appendChild(el("div", { class: "redo", style: "margin-top:8px" }, [el("b", { text: x.q }), el("span", { class: "note", text: x.why }), x.cardId ? el("div", { class: "row" }, [el("button", { class: "small", text: "Practice", onclick: () => practiceCard(byId(x.cardId)) })]) : null])));
      mk.appendChild(d); });
    v.appendChild(mk); }
  // recent attempts
  const ra = el("div", { class: "block" }, [el("h2", { text: "Recent answers" })]);
  const recent = at.slice().reverse().slice(0, 25);
  if (!recent.length) ra.appendChild(el("p", { class: "note", text: "None yet." }));
  recent.forEach(a => { const c = byId(a.cardId); const d = el("details", null, [el("summary", { text: new Date(a.ts).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) + ". " + (c ? c.q : a.q) + " · " + a.hit.length + "/" + a.total + " · " + fmt(a.secs) + (a.kind === "mock" ? " · mock" : "") + (a.mode === 30 ? " · exec" : "") })]);
    d.appendChild(el("p", { class: "note", text: a.delivery.wpm + " wpm, " + a.delivery.fillers + " fillers, " + a.delivery.pauses + " long pauses" + (a.delivery.firstPoint != null ? ", first point " + Math.round(a.delivery.firstPoint) + " s" : "") + ". " + a.delivery.fix }));
    if (a.rating && a.rating.fix) d.appendChild(el("p", { class: "note", text: "Content fix: " + a.rating.fix }));
    if (a.audio) { const btn = el("button", { class: "small", text: "Play recording", onclick: () => { const au = el("audio", { controls: "", autoplay: "" }); au.src = "/api/audio/" + a.id; btn.replaceWith(au); } }); d.appendChild(el("div", { class: "row", style: "margin-top:8px" }, [btn])); }
    if (a.transcript) d.appendChild(el("p", { text: a.transcript }));
    if (a.followQ) d.appendChild(el("p", { class: "note", text: "Follow-up: " + a.followQ + " → " + (a.followTranscript || "(no transcript)") }));
    ra.appendChild(d); });
  v.appendChild(ra);
  v.appendChild(el("div", { class: "row" }, [el("a", { href: "/api/state", download: "interview-reps-history.json" }, [el("button", { text: "Export history" })]), el("button", { id: "btn-reset", text: armed ? "Click again to clear all scores and history" : "Reset everything", onclick: () => { if (!armed) { armed = true; progress(); return; } armed = false; S.cards = {}; S.turn = 0; S.attempts = []; S.mocks = []; save(); progress(); } })]));
}

/* ====================================================================== CHROME */
function tab(name) {
  ["practice", "mock", "sheet", "progress"].forEach(n => { $("view-" + n).hidden = n !== name; $("tab-" + n).setAttribute("aria-selected", String(n === name)); });
  if (name === "sheet") sheet(); if (name === "progress") { armed = false; progress(); } if (name === "mock") renderMock();
  if (name !== "practice" && (phase === "run" || phase === "follow")) { stopClock(); endCapture(); phase = "ready"; render(); }
  if (name !== "mock" && M.active && (M.phase === "answer" || M.phase === "followAnswer")) { stopClock(); endCapture(); M.phase = M.phase === "answer" ? "ask" : "followAsk"; }
}
["practice", "mock", "sheet", "progress"].forEach(n => $("tab-" + n).addEventListener("click", () => tab(n)));
function chips() {
  const f = $("filters"); f.textContent = "";
  TYPES.forEach(([k, label]) => { const n = k === "all" ? CARDS.length : CARDS.filter(c => c.t === k).length;
    f.appendChild(el("button", { id: "filter-" + k, "aria-pressed": String(S.filter === k), text: label + " " + n, onclick: () => { S.filter = k; save(); chips(); cur = null; next(); } })); });
  $("mode-90").setAttribute("aria-pressed", String(S.mode === 90)); $("mode-30").setAttribute("aria-pressed", String(S.mode === 30));
}
$("mode-90").addEventListener("click", () => { S.mode = 90; save(); chips(); if (phase === "ready") render(); });
$("mode-30").addEventListener("click", () => { S.mode = 30; save(); chips(); if (phase === "ready") render(); });
document.addEventListener("keydown", e => {
  if (e.code !== "Space" || /^(INPUT|TEXTAREA|BUTTON|SELECT|SUMMARY|A)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if ($("view-practice").hidden) return;
  e.preventDefault();
  if (phase === "ready") startAnswer(); else if (phase === "run") finishAnswer(); else if (phase === "follow") finishFollow();
});

(async () => { await loadState(); renderStatus(); chips(); next(); })();
