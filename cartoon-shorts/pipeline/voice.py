"""Narration + timing for one episode.

python3 pipeline/voice.py episodes/<slug>
  reads  episode.json
  writes voice/voice.wav (48 kHz mono), voice/lines/*.wav, timed.json (episode + scene a/b frames + word times)

Each scene lasts as long as its narration line (natural speed, no squeezing), plus a short breath; the picture is
timed to the voice, never the other way round. Word times are spread over each line by syllable weight (good enough
for reaction timing; the cut points are exact).
"""
import json, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.environ.get("TTS_MODELS", os.path.join(ROOT, "models"))
FPS = 30
SR = 48000
LEAD_IN = 0.25        # silence before the first word
GAP = 0.30            # breath between scenes
TAIL = 1.2            # hold after the last word
MIN_SCENE = 1.6


def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    return max(1, len(re.findall(r"[aeiouy]+", w)) - (1 if w.endswith("e") and len(w) > 3 else 0))


def trim(a, sr, thr=0.008):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx):
        return a
    return a[max(0, idx[0] - int(0.01 * sr)): idx[-1] + int(0.02 * sr)]


def main(ep_dir):
    from kokoro_onnx import Kokoro
    from scipy.signal import resample_poly
    import soundfile as sf
    ep = json.load(open(os.path.join(ep_dir, "episode.json")))
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    voice, speed = ep.get("voice", "am_michael"), float(ep.get("speed", 1.05))
    os.makedirs(os.path.join(ep_dir, "voice", "lines"), exist_ok=True)
    clips = []
    for i, s in enumerate(ep["scenes"]):
        a, sr = k.create(s["line"], voice=voice, speed=speed, lang="en-us")
        a = trim(np.asarray(a, np.float32), sr)
        a = resample_poly(a, SR, sr).astype(np.float32)
        sf.write(os.path.join(ep_dir, "voice", "lines", f"{i:02d}.wav"), a, SR)
        clips.append(a)
    # timeline: scene i starts at a frame boundary; its line starts LEAD (first) or a few frames into the scene
    t = 0.0
    words_all = []
    starts = []
    for i, (s, a) in enumerate(zip(ep["scenes"], clips)):
        d = len(a) / SR
        lead = LEAD_IN if i == 0 else 0.08
        end = t + max(MIN_SCENE, lead + d + (TAIL if i == len(clips) - 1 else GAP))
        fa, fb = round(t * FPS), round(end * FPS)
        s["a"], s["b"] = fa, fb
        ls = fa / FPS + lead
        starts.append(ls)
        ws = s["line"].split()
        tot = sum(syl(w) + 0.35 for w in ws)
        tw = ls
        s["words"] = []
        for w in ws:
            dw = d * (syl(w) + 0.35) / tot
            s["words"].append({"w": w, "s": round(tw, 3), "e": round(tw + dw, 3)})
            tw += dw
        words_all += s["words"]
        t = fb / FPS
    ep["total"] = ep["scenes"][-1]["b"]
    out = np.zeros(int(np.ceil(ep["total"] / FPS * SR)) + SR, np.float32)
    for ls, a in zip(starts, clips):
        i0 = int(round(ls * SR))
        out[i0:i0 + len(a)] += a[: len(out) - i0]
    out = out[: int(round(ep["total"] / FPS * SR))]
    sf.write(os.path.join(ep_dir, "voice", "voice.wav"), out, SR, subtype="PCM_16")
    json.dump(words_all, open(os.path.join(ep_dir, "voice", "words.json"), "w"))
    json.dump(ep, open(os.path.join(ep_dir, "timed.json"), "w"), indent=1)
    print(f"{len(clips)} scenes, {ep['total']} frames = {ep['total'] / FPS:.1f} s")
    for i, s in enumerate(ep["scenes"]):
        print(f"  {i:2d} {s['a']:5d}-{s['b']:5d} {s['set']:7s} {s.get('cam', 'medium'):7s} {s['line'][:60]}")


if __name__ == "__main__":
    main(sys.argv[1])
