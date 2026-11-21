# cartoon-shorts

Daily original cartoon shorts for a US YouTube channel: true, surprising history / science stories, ~60 s vertical,
2D characters in a 3D toon world (three.js inside Remotion), Kokoro TTS narration, synthesized music + SFX.

- `src/engine/` — the renderer (do not change it for a single episode; fix bugs only).
- `episodes/<slug>/episode.json` — one episode. Read `EPISODE_GUIDE.md` before writing one.
- `pipeline/make.sh episodes/<slug>` — voice → audio → stills sheet → full render (`STILLS_ONLY=1` to stop after stills).
- `LOG.md` — every published / drafted episode (never repeat a topic). `AUDITS.md` — weekly channel audits.
- First thing in a fresh container: `bash setup.sh`.

## Channel
Mind Blown Business (@realmindblown-q5f, channel id UCCtK8L8fbQyfo7FzzfTfEuQ): true stories behind America's biggest
brands (money, mistakes, scams, inventions). USA audience, English, Shorts 45-60 s. Never change channel settings,
never upload or publish without the owner's explicit approval.

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

## Daily episode routine
1. `bash setup.sh`. Read `EPISODE_GUIDE.md`, `LOG.md` and the latest entry of `AUDITS.md` (it may change what to make).
2. Pick a new topic that fits the guide. Verify every fact with at least two reliable sources (web search).
3. Write `episodes/<slug>/episode.json` (slug = short kebab-case, e.g. `great-molasses-flood`).
4. `STILLS_ONLY=1 pipeline/make.sh episodes/<slug>` and LOOK at `episodes/<slug>/render/stills.jpg`. Fix the JSON
   until every scene reads (nobody cut off, faces visible, set fits the line). At most 3 rounds.
5. Full render in the background: `pipeline/render.sh episodes/<slug>` (~75 min). Wait for it, read the QA lines.
6. Write `episodes/<slug>/upload.md`: YouTube title (≤ 60 chars, curiosity, no clickbait lies), description
   (2–3 lines + sources), 8–12 tags, and `#Shorts`.
7. Add a line to `LOG.md`: date, slug, title, status `draft (sent for review)`.
8. Commit the episode folder's json/md files and LOG.md (never mp4/wav) and push.
9. Send the user the mp4 and upload.md, and ask them to review. Never upload to YouTube without their OK.
