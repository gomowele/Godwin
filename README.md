# Interview Reps

Out-loud practice for a 30-minute VP, Capacity Planning & Analytics interview. You see the question, the clock
starts, you talk. The anchors stay hidden until you stop. The app records you, shows a live transcript, measures
delivery (time, pace, fillers, long pauses, time to the first real point), and rates the content against your
anchors without ever inventing facts for you.

## Run it

Needs Node 18 or newer. Then, in this folder:

```
npm start
```

Open http://localhost:3344 in **Chrome or Edge** (they have live speech recognition; Safari is spotty, Firefox has
none). Allow the microphone when asked. The first run installs the one dependency, the Anthropic SDK.

Optional, for the content rating:

```
ANTHROPIC_API_KEY=sk-ant-... npm start        # Mac/Linux
set ANTHROPIC_API_KEY=sk-ant-... && npm start  # Windows cmd
```

Without a key everything still works, and each answer has a **Copy transcript and rubric** button so you can
paste the whole thing into a chat for the rating.

Other settings: `PORT` (default 3344), `INTERVIEW_REPS_MODEL` (default `claude-opus-5-5`), `INTERVIEW_REPS_DATA`
(folder for history, default `./data`).

## On your phone

The app still runs on your computer. Your phone just opens it.

```
npm run phone
```

Scan the QR code it prints with your phone camera. That's it. It works on Wi-Fi or cellular, since the link goes
through a free Cloudflare tunnel with HTTPS (phones only allow the mic on HTTPS). The link carries a private access
key; anyone without it gets a locked page. Your history still saves on the computer.

- Keep the computer awake and the terminal open while you practice.
- The link changes each time you run it. Scan again.
- First phone run downloads the tunnel helper, about 30 MB.
- If it never connects, a work network, VPN or firewall is usually blocking it. Try home Wi-Fi.
- iPhone: use Safari. Android: use Chrome. Headphones help the transcript.

## What is where

- `public/deck.js`: your 44 questions, anchors, alternate phrasings and avoid lines, carried over unchanged.
  Edit anchors in the app (Review, then **Edit anchors**), not here.
- `data/history.json`: every attempt, score, missed anchor, timing, rating and your edited anchors. Copy this
  folder to back up. `data/audio/` holds the recordings.
- `server.js`: static server, history file, and the Claude proxy. The API key never reaches the browser.
- `public/app.js`, `audio.js`, `delivery.js`: the app, mic capture, and delivery metrics.

## Modes

- **Practice**: 90 seconds, or 30 seconds "explain it to an Executive Director" mode. Missed anchors bring the
  card back sooner.
- **Mock interview**: 6 to 7 questions across categories, a follow-up after each, no anchors or transcript until
  the end, then one debrief with weakest areas and three answers to redo.
- **Cheat sheet** and **Progress** (per category, per question over the week, recent answers with playback).

## Honest limits

- Chrome's recognizer drops some "um"s, so filler counts run low. Trust the playback.
- Chrome and Edge send your audio to Google or Microsoft for recognition. Recording and pause detection stay local.
- Two stories (AAC evening/weekend coverage, AAC cost versus operational risk) end at the recommendation. The
  rater is told never to suggest an outcome for them, and to flag one if you state it.
