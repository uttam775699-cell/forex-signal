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
GAP = 0.18            # breath between scenes
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


def eleven(text, voice_id, prev, nxt, settings):
    """ElevenLabs TTS with character timestamps -> (float32 audio at 44.1 kHz, [(word, start, end)])"""
    import base64, urllib.request
    body = {"text": text, "model_id": settings.get("model", "eleven_multilingual_v2"),
            "voice_settings": {"stability": settings.get("stability", 0.45), "similarity_boost": 0.8,
                               "style": settings.get("style", 0.25), "use_speaker_boost": True, "speed": settings.get("speed", 1.0)},
            "previous_text": prev or None, "next_text": nxt or None}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_192",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "xi-api-key": "proxy-injected"})
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120)); break
        except Exception as e:  # noqa
            if attempt == 3: raise
            import time; time.sleep(3 * (attempt + 1))
    import subprocess
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "44100", "pipe:1"],
                         input=base64.b64decode(d["audio_base64"]), capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    al = d.get("normalized_alignment") or d["alignment"]
    ch, st_, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur, ws = [], "", None
    for c, s0, e0 in zip(ch, st_, en):
        if c.isspace():
            if cur: words.append((cur, ws, pe)); cur = ""
            continue
        if not cur: ws = s0
        cur += c; pe = e0
    if cur: words.append((cur, ws, pe))
    return a, words


def main(ep_dir):
    from scipy.signal import resample_poly
    import soundfile as sf
    ep = json.load(open(os.path.join(ep_dir, "episode.json")))
    engine = ep.get("tts", "kokoro")
    voice, speed = ep.get("voice", "am_michael"), float(ep.get("speed", 1.05))
    os.makedirs(os.path.join(ep_dir, "voice", "lines"), exist_ok=True)
    clips, aligned = [], []
    lines = [s["line"] for s in ep["scenes"]]
    if engine == "kokoro":
        from kokoro_onnx import Kokoro
        k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
    for i, s in enumerate(ep["scenes"]):
        cache = os.path.join(ep_dir, "voice", "lines", f"{i:02d}.json")
        if engine == "elevenlabs":
            key = {"text": s["line"], "voice": voice, "settings": ep.get("voice_settings", {})}
            if os.path.exists(cache) and json.load(open(cache)).get("key") == key:   # never pay twice for the same line
                c = json.load(open(cache)); a, _ = sf.read(cache[:-5] + ".wav", dtype="float32"); aligned.append(c["words"]); clips.append(a); continue
            a, w = eleven(s["line"], voice, " ".join(lines[max(0, i - 2):i]), " ".join(lines[i + 1:i + 2]), ep.get("voice_settings", {}))
            sr = 44100
            lead = int(max(0, (w[0][1] if w else 0) - 0.02) * sr)
            a = a[lead:]
            w = [(x, s0 - lead / sr, e0 - lead / sr) for x, s0, e0 in w]
            end = int(min(len(a), ((w[-1][2] if w else len(a) / sr) + 0.12) * sr))
            a = a[:end]
            a = resample_poly(a, SR, sr).astype(np.float32)
            sf.write(cache[:-5] + ".wav", a, SR)
            json.dump({"key": key, "words": w}, open(cache, "w"))
            aligned.append(w)
        else:
            a, sr = k.create(s["line"], voice=voice, speed=speed, lang="en-us")
            a = trim(np.asarray(a, np.float32), sr)
            a = resample_poly(a, SR, sr).astype(np.float32)
            sf.write(cache[:-5] + ".wav", a, SR)
            aligned.append(None)
        clips.append(a)
    # timeline: scene i starts at a frame boundary; its line starts LEAD (first) or a few frames into the scene
    t = 0.0
    words_all = []
    starts = []
    for i, (s, a) in enumerate(zip(ep["scenes"], clips)):
        d = len(a) / SR
        lead = LEAD_IN if i == 0 else 0.05
        end = t + max(MIN_SCENE, lead + d + (TAIL if i == len(clips) - 1 else GAP))
        fa, fb = round(t * FPS), round(end * FPS)
        s["a"], s["b"] = fa, fb
        ls = fa / FPS + lead
        starts.append(ls)
        s["words"] = []
        if aligned[i]:
            for w, s0, e0 in aligned[i]:
                s["words"].append({"w": w, "s": round(ls + s0, 3), "e": round(ls + e0, 3)})
        else:
            ws = s["line"].split()
            tot = sum(syl(w) + 0.35 for w in ws)
            tw = ls
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
