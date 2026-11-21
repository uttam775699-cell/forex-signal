"""Music + sound effects + final mix for one episode (numpy/scipy synthesis, no samples, everything original).

python3 pipeline/audio.py episodes/<slug>
  reads  timed.json, voice/voice.wav
  writes audio/mix.wav (48 kHz stereo, -15 LUFS, true peak <= -1.2 dBTP), audio/stem_*.wav

Music: a light storybook score (pizzicato bass, music-box / glockenspiel melody on a pentatonic walk, soft pad, brushes)
in a key and tempo picked from the episode slug, ducked under every spoken word, softer in golden scenes, a stop-and-hit
on scene `kick`s and `flash` cuts. SFX: a soft whoosh on every cut, footsteps for walking / marching cast and crowds,
plus the cues each scene lists in `sfx`.
"""
import json, os, sys, zlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dsp import SR, ns, dbg, rng, lp, hp, pan, place, integrated, true_peak, write_wav, read_wav, st  # noqa: E402
import instruments as I  # noqa: E402
import sfx_gen as G  # noqa: E402

FPS = 30
VOICE_LUFS = -16.0
MUSIC_UNDER = -12.0     # music LU under the voice (the user's standard mix: music +3 dB vs the old -15)
SFX_UNDER = -14.0
DUCK = -6.0


def music(ep, dur, r):
    seed = zlib.crc32(ep["slug"].encode())
    key = [0, 2, 5, 7, 9, -2, -3][seed % 7]            # root offset from C4 (60)
    bpm = [96, 104, 112, 120][(seed >> 3) % 4]
    beat = 60.0 / bpm
    prog = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]   # I V vi IV
    if (seed >> 5) % 2:
        prog = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]]   # I IV V I
    penta = [0, 2, 4, 7, 9, 12, 14, 16]
    n = ns(dur)
    bass, mel, padb, perc = (np.zeros((2, n)) for _ in range(4))
    bars = int(dur / (4 * beat)) + 2
    stops = []
    for s in ep["scenes"]:
        if s.get("kick") is not None:
            stops.append((s["a"] + s["kick"] * (s["b"] - s["a"])) / FPS)
        if s.get("flash"):
            stops.append(s["a"] / FPS)
    golden = [(s["a"] / FPS, s["b"] / FPS) for s in ep["scenes"] if s.get("light") == "golden"]
    m_idx = 3
    for bar in range(bars):
        ch = prog[bar % 4]
        t0 = bar * 4 * beat
        if t0 > dur:
            break
        root = 60 + key + ch[0]
        # pad
        place(padb, I.pad([I.m2f(60 + key + c - 12) for c in ch], 4 * beat + 0.4, vel=0.45, r=r), t0)
        # pizzicato bass on 1 and 3
        for b, d in ((0, 0), (2, 7)):
            place(bass, pan(I.pluck(I.m2f(root - 24 + d), vel=0.75, r=r, dur=0.8), -0.1), t0 + b * beat)
        # melody: eighth-note-ish pentatonic walk, rests on some beats
        for e in range(8):
            if r.random() < 0.35:
                continue
            m_idx = int(np.clip(m_idx + r.integers(-2, 3), 0, len(penta) - 1))
            f = I.m2f(72 + key + penta[m_idx])
            inst = I.glock(f, vel=0.45, r=r, dur=1.0) if (bar // 4) % 2 else I.musicbox(f, vel=0.5, r=r, dur=1.0)
            place(mel, pan(inst, 0.25), t0 + e * beat / 2)
        # brushes
        for b in range(4):
            place(perc, pan(I.brush(vel=0.35 if b % 2 else 0.22, r=r), 0.2), t0 + b * beat)
    out = bass * 1.0 + mel * 0.55 + padb * 0.5 + perc * 0.45
    # stops: silence 0.25 s before an impact, a timpani + cymbal hit on it
    g = np.ones(n)
    for ts in stops:
        a, b = ns(max(0, ts - 0.25)), ns(ts + 0.9)
        g[a:b] = np.minimum(g[a:b], np.concatenate([np.linspace(1, 0.05, max(1, ns(0.06))), np.full(max(0, b - a - ns(0.06)), 0.05)])[: b - a])
        rec = min(n, b + ns(0.6))
        g[b:rec] = np.minimum(g[b:rec], np.linspace(0.05, 1, rec - b))
    out *= g[None, :]
    for ts in stops:
        place(out, I.timpani(I.m2f(36 + key), vel=0.9, r=r), ts, 0.8)
        place(out, I.cymbal(vel=0.5, r=r), ts, 0.5)
    for a, b in golden:   # golden scenes: softer, warmer
        i0, i1 = ns(a), min(n, ns(b))
        out[:, i0:i1] = lp(out[:, i0:i1], 2500) * 0.7
    return out


def sfx(ep, dur, r):
    n = ns(dur)
    out = np.zeros((2, n))
    for k, s in enumerate(ep["scenes"]):
        a, b = s["a"] / FPS, s["b"] / FPS
        span = b - a
        if k > 0:
            place(out, G.whoosh(0.45, r, peak=0.6), a - 0.3, 0.35)
        walkers = [x for x in s.get("actors", []) if x.get("to")]
        for x in walkers:
            step = 0.5 if x.get("mode") == "march" else 0.55
            t = a + 0.1
            while t < b - 0.1:
                place(out, pan(G.stroll_step(r), r.uniform(-0.3, 0.3)), t, 0.5)
                t += step
        for c in s.get("crowd", []):
            if c.get("to"):
                t = a
                while t < b:
                    for _ in range(min(6, c.get("n", 6))):
                        place(out, pan(G.boot(r, 0.8) if c.get("mode") == "march" else G.stroll_step(r), r.uniform(-0.6, 0.6)), t + r.uniform(-0.012, 0.012), 0.25)
                    t += 0.5
        hit = a + (s["kick"] * span if s.get("kick") is not None else 0.15)
        for cue in s.get("sfx", []):
            if cue == "whoosh":
                place(out, G.whoosh(0.6, r, peak=0.5), hit - 0.2, 0.6)
            elif cue == "thud":
                place(out, G.push_thump(r), hit, 1.0)
            elif cue == "crash":
                place(out, G.wood_crack(r), hit, 0.9); place(out, G.timber_tear(r), hit + 0.05, 0.5)
            elif cue == "splash":
                place(out, G.splash_big(r), hit, 0.8)
            elif cue == "pop" or cue == "bell":
                place(out, G.clink(r, 2600), hit, 0.8); place(out, I.triangle(vel=0.5, r=r), hit, 0.5)
            elif cue == "creak":
                place(out, G.creak(min(1.2, span), r), a + 0.2, 0.6)
            elif cue in ("cheer", "crowd"):
                for _ in range(10):
                    place(out, pan(G.hurrah(r, r.uniform(100, 170), r.uniform(0.9, 1.1)), r.uniform(-0.7, 0.7)), hit + r.uniform(0, 0.6), 0.35)
            elif cue == "applause":
                place(out, G.applause(min(3.0, span), r), hit, 0.5)
            elif cue == "gasp":
                for _ in range(5):
                    place(out, pan(G.whoa(r), r.uniform(-0.6, 0.6)), hit + r.uniform(0, 0.15), 0.4)
            elif cue == "laugh":
                for _ in range(6):
                    place(out, pan(G.hurrah(r, r.uniform(110, 180), 1.0), r.uniform(-0.6, 0.6)), hit + r.uniform(0, 0.4), 0.25)
            elif cue == "birds":
                place(out, G.bird_chirps(span, r), a, 0.5)
            elif cue == "water":
                place(out, G.water_bed(span, r, close=0.5), a, 0.4)
            elif cue == "wind":
                place(out, G.breeze(span, r), a, 0.6)
            elif cue == "night":
                place(out, G.crickets(span, r), a, 0.5)
            elif cue == "hammer":
                place(out, G.hammer_hit(r), hit, 0.8)
            elif cue == "oof":
                place(out, G.oof(r), hit, 0.8)
    return out


def main(ep_dir):
    ep = json.load(open(os.path.join(ep_dir, "timed.json")))
    dur = ep["total"] / FPS
    n = ns(dur)
    r = rng(zlib.crc32(ep["slug"].encode()))
    v, sr = read_wav(os.path.join(ep_dir, "voice", "voice.wav"))
    assert sr == SR, sr
    v = st(v)[:, :n]
    v = np.pad(v, ((0, 0), (0, n - v.shape[1])))
    gv = dbg(VOICE_LUFS - integrated(v))
    v = v * gv
    m = music(ep, dur, r)[:, :n]
    # duck the music under every word (60 ms attack, 250 ms release)
    words = json.load(open(os.path.join(ep_dir, "voice", "words.json")))
    key = np.zeros(n)
    for w in words:
        key[ns(w["s"]):ns(w["e"] + 0.15)] = 1
    from scipy.ndimage import uniform_filter1d
    key = np.clip(uniform_filter1d(key, ns(0.25)) * 1.5, 0, 1)
    m = m * dbg(DUCK * key)[None, :]
    m = m * dbg(VOICE_LUFS + MUSIC_UNDER - integrated(m))
    s = sfx(ep, dur, r)[:, :n]
    if np.abs(s).max() > 0:
        s = s * dbg(VOICE_LUFS + SFX_UNDER - integrated(s))
    mix = v + m + s
    mix *= dbg(-15.0 - integrated(mix))
    tp = true_peak(mix)
    if tp > -1.2:                                   # simple soft limiter on the peaks
        lim = dbg(-1.4)
        mix = np.tanh(mix / lim) * lim
    fade = ns(0.6)
    mix[:, -fade:] *= np.linspace(1, 0, fade)[None, :]
    os.makedirs(os.path.join(ep_dir, "audio"), exist_ok=True)
    write_wav(os.path.join(ep_dir, "audio", "mix.wav"), mix)
    for name, x in (("voice", v), ("music", m), ("sfx", s)):
        write_wav(os.path.join(ep_dir, "audio", f"stem_{name}.wav"), x)
    print(f"mix {integrated(mix):.1f} LUFS, TP {true_peak(mix):.1f} dBTP, {dur:.1f} s")


if __name__ == "__main__":
    main(sys.argv[1])
