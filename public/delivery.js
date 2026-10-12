/* Delivery metrics from the audio and the transcript. Blunt, one line per metric, one thing to fix. */
const Delivery = (() => {
  const FILLERS = ["um", "uh", "like", "you know", "so"];
  const PREAMBLE_PHRASES = ["that's a great question", "that is a great question", "that's a good question", "great question", "good question",
    "let me think about that", "let me think", "thanks for asking", "thank you", "that's a good one", "all right"];
  const PREAMBLE_WORDS = new Set(["um", "uh", "umm", "uhh", "hmm", "er", "ah", "oh", "so", "yeah", "yes", "yep", "okay", "ok", "well", "sure", "right", "absolutely", "definitely", "honestly",
    "basically", "actually", "like", "alright", "i", "think", "mean", "you", "know", "the", "a", "and"]);
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = s => norm(s).split(" ").filter(Boolean);

  function fillers(text, segments) {
    const t = tokens(text);
    const by = { um: 0, uh: 0, like: 0, "you know": 0, so: 0 };
    const segStarts = new Set();
    // "so" counts as a filler only when it opens the answer or opens a recognizer segment (a segment boundary is a pause)
    if (segments && segments.length) { let idx = 0; segments.forEach(s => { segStarts.add(idx); idx += tokens(s.text).length; }); }
    else segStarts.add(0);
    for (let i = 0; i < t.length; i++) {
      const w = t[i], prev = t[i - 1] || "", next = t[i + 1] || "";
      if (w === "um" || w === "umm" || w === "hmm") by.um++;
      else if (w === "uh" || w === "uhh" || w === "er") by.uh++;
      else if (w === "you" && next === "know") { by["you know"]++; i++; }
      else if (w === "like") {
        const verbLike = ["would", "i'd", "we'd", "looks", "look", "looked", "feel", "feels", "felt", "seem", "seems", "seemed", "something", "anything", "things", "much", "just"].includes(prev) || next === "to" || next === "that";
        if (!verbLike) by.like++;
      }
      else if (w === "so" && (segStarts.has(i) || prev === "so" || prev === "um" || prev === "uh" || next === "um" || next === "uh" || next === "yeah")) by.so++;
    }
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    const top = Object.entries(by).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])[0];
    return { total, by, top: top ? top[0] : null };
  }

  /* seconds to the first word that is not filler or throat-clearing. words = [{w,t}] from live recognition. */
  function firstPoint(words) {
    if (!words || !words.length) return null;
    const ws = words.map(x => ({ w: norm(x.w), t: x.t })).filter(x => x.w);
    let i = 0;
    outer: while (i < ws.length) {
      for (const ph of PREAMBLE_PHRASES) {
        const n = ph.split(" ").length;
        if (ws.slice(i, i + n).map(x => x.w).join(" ") === ph) { i += n; continue outer; }
      }
      if (PREAMBLE_WORDS.has(ws[i].w)) { i++; continue; }
      // need two content words in a row to call it a point
      if (ws[i + 1] && !PREAMBLE_WORDS.has(ws[i + 1].w)) return ws[i].t;
      i++;
    }
    return null;
  }

  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  function analyze(input) {
    const text = input.transcript || "";
    const words = tokens(text).length;
    const secs = Math.max(0.1, input.seconds || 0);
    const target = input.target || 90;
    const wpm = words ? Math.round(words / secs * 60) : 0;
    const fl = fillers(text, input.segments);
    const pauses = (input.pauses || []).filter(p => p.len >= 2);
    const longest = pauses.reduce((m, p) => p.len > m.len ? p : m, { len: 0, at: 0 });
    const fp = firstPoint(input.words);
    const over = secs - target;
    const r = { words, secs, target, wpm, fillers: fl, pauses: { count: pauses.length, longest: longest.len, at: longest.at, list: pauses }, firstPoint: fp, firstSound: input.speechStart, over, lines: [], fix: "", stats: [] };

    // time
    let timeState = Math.abs(over) <= 5 ? "ok" : (over > 5 ? (over > 20 ? "bad" : "warn") : (over < -target * 0.4 ? "warn" : "ok"));
    r.stats.push({ k: "Time", v: fmt(secs), s: timeState, note: over > 5 ? fmt(over) + " over" : (over < -5 ? fmt(-over) + " under" : "on target") });
    if (over > 5) r.lines.push(fmt(over) + " over the " + target + "-second target. Cut the setup, not the point.");
    else if (over < -target * 0.4 && words) r.lines.push("Well under time. Fine if the point landed. Do not pad it.");
    else r.lines.push("On time.");
    // pace
    let paceState = !words ? "" : (wpm < 110 ? "warn" : (wpm > 175 ? "bad" : (wpm > 160 ? "warn" : "ok")));
    r.stats.push({ k: "Pace", v: words ? wpm + "" : "-", s: paceState, note: words ? "words / min" : "no transcript" });
    if (words) {
      if (wpm > 175) r.lines.push(wpm + " words a minute. Too fast for an executive. Aim for 130 to 160.");
      else if (wpm > 160) r.lines.push(wpm + " words a minute. A touch fast.");
      else if (wpm < 110) r.lines.push(wpm + " words a minute. Slow. Shorter pauses, same words.");
      else r.lines.push(wpm + " words a minute. Good pace.");
    }
    // fillers
    const perMin = fl.total / (secs / 60);
    let fState = !words ? "" : (fl.total === 0 ? "ok" : (perMin > 4 ? "bad" : (perMin > 2 ? "warn" : "ok")));
    r.stats.push({ k: "Fillers", v: words ? fl.total + "" : "-", s: fState, note: fl.top ? "mostly “" + fl.top + "”" : (words ? "none caught" : "") });
    if (words) {
      if (fl.total === 0) r.lines.push("No fillers caught. Note: Chrome's recognizer drops some ums, so trust the playback.");
      else r.lines.push(fl.total + " filler" + (fl.total > 1 ? "s" : "") + ": " + Object.entries(fl.by).filter(e => e[1]).map(e => "“" + e[0] + "” ×" + e[1]).join(", ") + "." + (fl.top ? " Kill “" + fl.top + "” first." : ""));
    }
    // pauses
    let pState = input.pauses == null ? "" : (pauses.length === 0 ? "ok" : (longest.len >= 4 || pauses.length >= 3 ? "bad" : "warn"));
    r.stats.push({ k: "Long pauses", v: input.pauses == null ? "-" : pauses.length + "", s: pState, note: pauses.length ? "longest " + longest.len.toFixed(1) + " s at " + fmt(longest.at) : (input.pauses == null ? "no audio" : "2 s or more") });
    if (input.pauses != null) {
      if (pauses.length) r.lines.push(pauses.length + " pause" + (pauses.length > 1 ? "s" : "") + " over 2 seconds. Longest " + longest.len.toFixed(1) + " s at " + fmt(longest.at) + ". A pause is fine; a pause then a restart is not.");
      else r.lines.push("No long pauses.");
    }
    // first point
    const fpState = fp == null ? "" : (fp <= 8 ? "ok" : (fp <= 15 ? "warn" : "bad"));
    r.stats.push({ k: "First point", v: fp == null ? "-" : fp.toFixed(0) + " s", s: fpState, note: fp == null ? (input.words && input.words.length ? "not found" : "needs live transcript") : (fp <= 8 ? "quick" : "slow start") });
    if (fp != null) r.lines.push(fp <= 8 ? "First real point at " + fp.toFixed(0) + " seconds. Good." : "First real point at " + fp.toFixed(0) + " seconds. Open with the finding, not the setup.");

    // the one thing to fix, in priority order
    if (over > 20) r.fix = "Length. You went " + fmt(over) + " over. Decide the one point, say it, stop.";
    else if (words && wpm > 175) r.fix = "Pace. " + wpm + " words a minute. Breathe at the end of each sentence.";
    else if (fp != null && fp > 15) r.fix = "Start. " + fp.toFixed(0) + " seconds before the first real point. Lead with the finding.";
    else if (words && perMin > 4) r.fix = "Fillers. " + fl.total + " in " + fmt(secs) + ". Replace “" + fl.top + "” with a silent beat.";
    else if (pauses.length >= 3 || longest.len >= 4) r.fix = "Pauses. Longest " + longest.len.toFixed(1) + " seconds. Know the next anchor before you finish the current one.";
    else if (over > 5) r.fix = "Length. " + fmt(over) + " over. Trim the setup.";
    else if (words && perMin > 2) r.fix = "Fillers. Mostly “" + fl.top + "”. Pause instead.";
    else if (fp != null && fp > 8) r.fix = "Start. Open with the finding.";
    else r.fix = words ? "Delivery was clean. Now check the content." : "No transcript captured, so only the time was measured.";
    return r;
  }

  return { analyze, fillers, firstPoint, tokens, fmt, FILLERS };
})();
