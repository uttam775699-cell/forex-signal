# cartoon-shorts

Daily original cartoon shorts for a US YouTube channel: true, surprising history / science stories, ~60 s vertical,
2D characters in a 3D toon world (three.js inside Remotion), Kokoro TTS narration, synthesized music + SFX.

- `src/engine/` — the renderer (do not change it for a single episode; fix bugs only).
- `episodes/<slug>/episode.json` — one episode. Read `EPISODE_GUIDE.md` before writing one.
- `pipeline/make.sh episodes/<slug>` — voice → audio → stills sheet → full render (`STILLS_ONLY=1` to stop after stills).
- `LOG.md` — every published / drafted episode (never repeat a topic). `AUDITS.md` — weekly channel audits.
- First thing in a fresh container: `bash setup.sh`.

## Channel
**Money Crash Files** (@MoneyCrashFiles, channel id UCCoQmCYQrGOeDVqoNYYbhVg): true stories of the biggest money scandals,
frauds, heists and crashes in U.S. history, told as ~50 s cartoon Shorts for a USA audience. Read `GROWTH.md` (the plan)
before picking a topic. Never change channel settings, never upload or publish without the owner's explicit approval.

## The 90+ rule (owner's master process: every stage must score 90/100 or the work stops there)
RESEARCH -> 10 IDEAS scored (USA 15, viral 20, 3-second hook 15, curiosity 10, retention 15, share 10, originality 10,
competition 5) -> only an idea >= 90 goes on -> SCRIPT scored (hook 20, story 15, retention 20, curiosity 15, USA 10,
emotion 10, originality 10), rewrite until >= 90 -> VIDEO -> FINAL VIDEO scored (hook 20, retention 20, visuals 15,
story 15, editing 10, audio 10, USA 5, originality/policy 5) after actually looking at the frames -> >= 90 -> owner's
approval -> publish. Never inflate a score; say plainly when data (analytics, credits) was unavailable.
Competition is measured with YouTube search through the TubeAlfred API (api.tubealfred.com/v1/youtube/search?query=...,
/v1/youtube/channel/<id>/shorts, /v1/youtube/video/<id>); vidIQ when it has credits.

## Voice
ElevenLabs (key is injected by the environment proxy for api.elevenlabs.io): `"tts": "elevenlabs"`, default voice
Brian `nPczCjzI2devNBz1zQrb`. Creator plan: mp3 output only; ~1,000 characters per episode. Lines are cached, a
re-run never pays twice for the same line. Captions are burned in from the exact word timings.

## Daily episode routine (one Short, Money Crash Files)
1. `bash setup.sh`. Read `GROWTH.md`, `EPISODE_GUIDE.md`, `LOG.md`, the latest `AUDITS.md` entry.
2. PHASE 2 research: 10 ideas inside the pillars, not in LOG.md. Measure competition with the TubeAlfred search API
   (titles + view counts). Score all 10 with the idea rubric and show the table. Only an idea >= 90 continues; if none,
   10 fresh ideas, at most 3 rounds, then stop and report (no video that day beats a weak video).
3. PHASE 3: verify every fact with >= 2 reliable sources (web search). Write the script (130-160 words), score it with the
   script rubric, rewrite weak lines and rescore until >= 90 (show each round's score honestly).
4. PHASE 4: write `episodes/<slug>/episode.json` (`"tts": "elevenlabs"`, Brian), then
   `STILLS_ONLY=1 pipeline/make.sh episodes/<slug>` and LOOK at `render/stills.jpg`; fix framing (people cut off, props
   in front of faces, wrong set) until every scene reads. Then `pipeline/render.sh episodes/<slug>` (~65 min, background).
5. PHASE 5: extract frames from the final mp4 (`ffmpeg -vf fps=1,scale=270:-1,tile=8x7`), LOOK at them, listen-check the
   mix numbers (LUFS/peak in the log), and score with the final-video rubric. < 90: fix the named weaknesses, re-render
   the affected chunks, rescore. Be honest that the score is from frames + audio levels, not human viewing.
6. PHASE 6: `episodes/<slug>/upload.md`: title (<= 50 chars), description with sources, tags, hashtags, pinned comment,
   copyright / reused-content / monetization risk notes, suggested upload time 12:00 PM ET.
7. Add the line to `LOG.md`, commit json/md files (never mp4/wav) to branch `claude/focused-mccarthy-1wicul` of
   forex-signal (folder `cartoon-shorts/`) and push.
8. PHASE 7: send the owner the mp4 + upload.md with the final report (topic score, script score, video score, duration,
   format, audience, title, description, keywords, risk check, PASS/FAIL). Never upload without their OK.

## Wednesday audit
Pull the channel's public numbers (TubeAlfred: /v1/youtube/channel/UCCoQmCYQrGOeDVqoNYYbhVg/shorts and /video/<id>),
plus any Studio exports the owner has shared. Compare each Short's views/likes/comments, find what the winners share
(pillar, hook, title, length), update `GROWTH.md` (pillars, backlog scores, title rules) and add an entry to `AUDITS.md`.
Send the owner a short summary in Hinglish.
