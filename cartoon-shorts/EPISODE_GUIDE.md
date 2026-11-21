# Writing an episode

A daily short is one file: `episodes/<slug>/episode.json`. The writer never edits engine code. The
pipeline turns the JSON into a ~55–65 s vertical cartoon (2D characters in a 3D toon world, ink lines,
lens blur, narration, original music and sound effects).

```
pipeline/make.sh episodes/<slug>          # voice -> audio -> stills sheet (check it!) -> full render
```

## Channel rules
- **Audience:** USA. English narration, one steady tone.
- **Stories:** a surprising **true** story from history or science with a physical, visual cause and effect.
  Every fact needs a source (Britannica, History.com, Smithsonian, Wikipedia + its cited sources). Put the facts
  and their URLs in `facts` / `sources`. If sources disagree, say "about", "as many as", or leave the detail out.
- Jokes must be real facts, never invented. No made-up quotes.
- Never reuse a topic: check `episodes/` and `LOG.md` first.
- No captions or text labels in the picture.
- Avoid gore and graphic death. Disasters are fine, told with a light touch, and "nobody was hurt" only if true.

## Script formula (130–160 words, 12–16 scenes, one or two sentences per scene)
1. **Hook:** the absurd fact in one line.
2. **Setting:** year, place, who.
3. **Action:** 3–4 beats, each a little bigger.
4. **Snap:** the moment it goes wrong (use `kick` + an `sfx`).
5. **Deadpan double line:** "Luckily, … / Unluckily, …" (same sentence twice is allowed when the twist is the meaning).
6. **Explanation:** one science or history idea, through an everyday analogy.
7. **Consequence:** the rule or change it created.
8. **Callback twist:** the last line points back to the hook.

Never narrate what the viewer already sees.

## Scene fields
| field | values |
|---|---|
| `line` | the narration for this scene |
| `set` | `town` (cobbled street, house rows) · `square` (plaza ringed by houses, fountain) · `river` (grassy bank, river behind, town across) · `farm` (dirt track, fences, red barn, haystacks) · `harbor` (stone quay, sea, ships) · `room` (interior, plank floor, papered walls, shelf) · `hill` (hilltop, big tree, village far below) |
| `light` | `day` (default) or `golden` (sunset; use for reflective / explanation / ending beats) |
| `cam` | `wide` · `medium` (default) · `close` · `low` (hero angle) · `high` · `aerial` · `ots` |
| `move` | `push` (default) · `pull` · `left` · `right` · `orbit` · `rise` · `still` |
| `az` | camera bearing in degrees around the subject (0 = from +z, 90 = from +x) |
| `focus` | actor id, or `[x, z]`; omit it to frame all actors |
| `actors` | `[{ id, at:[x,z], to?:[x,z], mode, expr, beats?:[{at, expr}], face?:-1/0/1, scale? }]` |
| `crowd` | `[{ outfit, n, at:[x,z], to?, cols?, gap?, mode, expr, mixExpr? }]` (front row at `at`, rows behind it) |
| `props` | `[{ kind, at:[x,z], yaw?(deg), s? }]` |
| `fx` | `[{ kind, on?:actorId, atPos?:[x,z], at:0..1, dur?, size? }]` kinds: `burst` `stars` `splash` `puff` `ring` `notes` |
| `sfx` | `whoosh` `thud` `crash` `splash` `pop` `bell` `creak` `cheer` `crowd` `applause` `gasp` `laugh` `birds` `water` `wind` `night` `hammer` `oof` |
| `kick` | 0..1: an impact camera shake and a music stop-and-hit at that point of the scene |
| `flash` | `true`: white flash on the cut into this scene (use once, right after the hook) |

**Stage area:** actors stand around x −8..8, z −6..6 (camera on the +z side looking toward −z).
In `river` the water starts at z −9, in `harbor` at z −10: keep people at z > −8.
In `room` the back wall is at z −6.

**Modes:** `stand` `walk` (needs `to`) `march` (needs `to`) `sit` `fall` `wave` (one arm, dancing / greeting) `cheer` (both arms, bouncing).

**Expressions:** `neutral` `stern` `grin` `laugh` `whistle` `nervous` `shock` `relief` `relief_open` `dazed` `pained` `smile` `smile_closed`.
Change them on the beat with `beats: [{ "at": 0.5, "expr": "shock" }]` (`at` = fraction of the scene).

**Outfits (cast):** `soldier` `redcoat` `bluecoat` `officer` `general` `gentleman` `townsman` `lady` `woman` `worker`
`farmer` `sailor` `scientist` `inventor` `kid` `girl` `parent` `man` `baker` `police` `king` `cowboy`.
Overrides: `skin` (0–3), `build` (`adult` `stout` `kid`), `hair`, `jacket`, `pants`, `dress`, `moustache`, `hat` (`shako` `shako_tall` `tophat` `bonnet` `cap` `hair` or null).

**Props:** `tree` `tallTree` `pine` `bush` `hedge` `rock` `barrel` `crate` `crates` `fence` `lamp` `bench` `table` `chair`
`desk` `cart` `well` `fountain` `boat` `ship` `haystack` `tent` `flagpole` `cannon` `bollard` `statue` `shelf` `clock`
`anvil` `sack` `pumpkin` `stall`.

## Shot grammar that works
- Open on a `wide` or `high` with a crowd or the key object, `push`.
- Alternate distances: wide → medium → close → wide. Never two `close` shots in a row of the same person.
- Use `low` for a proud / heroic beat, `aerial` for scale ("hundreds", "the whole city"), `golden` for the explanation and the end.
- 2–3 actors per medium shot, spaced ~1.2–1.6 m apart in x. Put a prop or two in the background of medium shots.
- One `kick` on the snap, one `flash` after the hook.

## Checks before the full render
`make.sh` renders one still per scene into `episodes/<slug>/render/stills.jpg`. Look at it:
- nobody cut by the frame edge or hidden behind a prop or house
- faces readable in `close` shots
- the set matches the line
Fix the JSON and re-run. Then the full render runs (~75 min for 60 s at 810x1440 on 4 CPU cores).
