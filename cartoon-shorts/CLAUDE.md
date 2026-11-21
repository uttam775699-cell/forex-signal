# cartoon-shorts

Daily original cartoon shorts for a US YouTube channel: true, surprising history / science stories, ~60 s vertical,
2D characters in a 3D toon world (three.js inside Remotion), Kokoro TTS narration, synthesized music + SFX.

- `src/engine/` — the renderer (do not change it for a single episode; fix bugs only).
- `episodes/<slug>/episode.json` — one episode. Read `EPISODE_GUIDE.md` before writing one.
- `pipeline/make.sh episodes/<slug>` — voice → audio → stills sheet → full render (`STILLS_ONLY=1` to stop after stills).
- `LOG.md` — every published / drafted episode (never repeat a topic). `AUDITS.md` — weekly channel audits.
- First thing in a fresh container: `bash setup.sh`.

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
