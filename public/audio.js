/* Capture: microphone recording (MediaRecorder), audio-energy pause detection (Web Audio), and live transcript
   (browser SpeechRecognition where available). Everything stays in the browser except that Chrome/Edge/Safari send
   speech to their vendor's recognition service. */
const Capture = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const PAUSE_MS = 2000;           // a "long pause" is 2 s or more of near-silence
  const POLL_MS = 50;

  function pickMime() {
    if (!window.MediaRecorder) return "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
    }
    return "";
  }

  async function start(opts) {
    opts = opts || {};
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const why = e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "Microphone blocked. Allow it in the address bar, then reload." :
        (e && e.name === "NotFoundError") ? "No microphone found." : "Could not open the microphone" + (e && e.message ? ": " + e.message : ".");
      throw Object.assign(new Error(why), { code: "mic" });
    }
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    /* ---- recorder ---- */
    const mime = pickMime();
    const chunks = [];
    let recorder = null;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(1000);
    } catch (e) { recorder = null; }

    /* ---- energy / pauses ---- */
    let ctx = null, analyser = null, buf = null, poll = null;
    const levels = [];           // {t, rms}
    const pauses = [];           // {at, len} in seconds
    let speechStart = null, silentSince = null, spoke = false, threshold = 0.012, lastLevel = 0;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      poll = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length), t = now();
        levels.push({ t, rms }); lastLevel = rms;
        if (levels.length % 20 === 0 && levels.length >= 40) {       // adapt threshold to the room every second
          const sorted = levels.slice(-200).map(l => l.rms).sort((a, b) => a - b);
          const floor = sorted[Math.floor(sorted.length * 0.2)];
          threshold = Math.max(0.006, Math.min(0.05, floor * 3 + 0.004));
        }
        const speaking = rms > threshold;
        if (speaking) {
          if (speechStart === null) speechStart = t;
          if (silentSince !== null && spoke && t - silentSince >= PAUSE_MS / 1000) pauses.push({ at: +silentSince.toFixed(1), len: +(t - silentSince).toFixed(1) });
          silentSince = null; spoke = true;
        } else if (silentSince === null) silentSince = t;
        if (opts.onLevel) opts.onLevel(Math.min(1, rms / 0.15), speaking);
      }, POLL_MS);
    } catch (e) { /* no analyser: pauses unavailable */ }

    /* ---- live transcript ---- */
    const tr = { final: "", interim: "", words: [], segments: [], supported: !!SR, error: null };
    let rec = null, active = true, restarts = 0;
    function emit() { if (opts.onTranscript) opts.onTranscript(tr); }
    function startSR() {
      if (!SR || !active) return;
      try {
        rec = new SR();
        rec.continuous = true; rec.interimResults = true; rec.lang = opts.lang || "en-US"; rec.maxAlternatives = 1;
        let sessionFinal = "";
        rec.onresult = ev => {
          let fin = "", inter = "";
          for (let i = 0; i < ev.results.length; i++) {
            const r = ev.results[i]; const txt = (r[0] && r[0].transcript) || "";
            if (r.isFinal) fin += txt + " "; else inter += txt + " ";
          }
          const t = now();
          // new final segments
          if (fin.length > sessionFinal.length) {
            const added = fin.slice(sessionFinal.length).trim();
            if (added) tr.segments.push({ text: added, t: +t.toFixed(2) });
            sessionFinal = fin;
          }
          tr.final = (tr._base || "") + fin;
          tr.interim = inter.trim();
          // per-word arrival times, approximate: a word gets the time its chunk first appeared
          const allWords = (tr.final + " " + tr.interim).trim().split(/\s+/).filter(Boolean);
          while (tr.words.length < allWords.length) tr.words.push({ w: allWords[tr.words.length], t: +t.toFixed(2) });
          if (tr.words.length > allWords.length) tr.words.length = allWords.length;   // recognizer revised a chunk shorter
          tr.words.forEach((x, i) => { x.w = allWords[i]; });
          emit();
        };
        rec.onerror = ev => {
          const code = ev && ev.error;
          if (code === "no-speech" || code === "aborted") return;        // harmless; onend will restart
          tr.error = code === "not-allowed" || code === "service-not-allowed" ? "Speech recognition is blocked in this browser. Recording still works; type the transcript." :
            code === "network" ? "Speech recognition needs a network connection (Chrome/Edge send audio to their service). Recording still works." :
            code === "language-not-supported" ? "Speech recognition does not support this language." :
            "Speech recognition stopped (" + code + "). Recording still works.";
          if (code === "not-allowed" || code === "service-not-allowed" || code === "network" || code === "audio-capture" || code === "language-not-supported") active = false;
          emit();
        };
        rec.onend = () => {
          tr._base = tr.final; tr.interim = "";
          if (active && restarts++ < 60) setTimeout(startSR, 120);   // Chrome ends after a silence; keep going
          else if (opts.onSpeechEnd) opts.onSpeechEnd();
        };
        rec.start();
      } catch (e) { tr.error = "Speech recognition could not start. Recording still works."; emit(); }
    }
    if (SR) startSR(); else { tr.error = "This browser has no live speech recognition. Use Chrome or Edge for a live transcript, or type it below. Recording still works."; emit(); }

    let stopped = false;
    async function stop() {
      if (stopped) return stopped;
      const endT = now();
      active = false;
      if (poll) clearInterval(poll);
      const srDone = new Promise(res => {
        if (!rec) return res();
        const timer = setTimeout(res, 700);
        rec.onend = () => { clearTimeout(timer); tr.interim = ""; res(); };
        try { rec.stop(); } catch (e) { clearTimeout(timer); res(); }
      });
      const recDone = new Promise(res => {
        if (!recorder || recorder.state === "inactive") return res();
        const timer = setTimeout(res, 1500);
        recorder.onstop = () => { clearTimeout(timer); res(); };
        try { recorder.stop(); } catch (e) { clearTimeout(timer); res(); }
      });
      await Promise.all([srDone, recDone]);
      stream.getTracks().forEach(t => t.stop());
      if (ctx) try { await ctx.close(); } catch (e) {}
      if (tr.interim) { tr.final = (tr.final + " " + tr.interim).trim(); tr.interim = ""; }
      const type = (recorder && recorder.mimeType) || mime || "audio/webm";
      const blob = chunks.length ? new Blob(chunks, { type }) : null;
      stopped = Promise.resolve({ blob, mime: type, seconds: endT, pauses: pauses.slice(), speechStart, levels, transcript: tr });
      return stopped;
    }
    return { stop, transcript: tr, get seconds() { return now(); }, get level() { return lastLevel; } };
  }

  return { start, speechSupported: !!SR, recordSupported: !!(navigator.mediaDevices && window.MediaRecorder) };
})();
