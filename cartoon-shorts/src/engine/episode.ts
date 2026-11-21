// Episode spec: one JSON file per short (episodes/<slug>/episode.json). The daily writer only edits JSON, never code.
// pipeline/voice.py adds the timing (scene.a / scene.b in frames) from the generated narration.
export const FPS = 30;

export type V2 = [number, number];
export type Light = "day" | "golden";
export type SetName = "town" | "square" | "river" | "farm" | "harbor" | "room" | "hill";
export type CamPreset = "wide" | "medium" | "close" | "low" | "high" | "aerial" | "ots";
export type CamMove = "push" | "pull" | "left" | "right" | "orbit" | "rise" | "still";
export type Mode = "stand" | "walk" | "march" | "sit" | "fall" | "wave" | "cheer";
export type FxKind = "burst" | "stars" | "splash" | "puff" | "ring" | "notes";

export type Beat = { at: number; expr: string };                 // at = fraction 0..1 of the scene
export type ActorSpec = {
  id: string;                    // key into episode.cast
  at: V2;                        // position on the set (metres, set-local x / z; stage area roughly x -8..8, z -6..6)
  to?: V2;                       // walk / march target (reached at the end of the scene)
  mode?: Mode;
  expr?: string;                 // neutral stern grin laugh whistle nervous shock relief dazed pained smile smile_closed
  beats?: Beat[];                // expression changes during the scene
  face?: -1 | 0 | 1;             // head turn: -1 left, 1 right
  scale?: number;
};
export type CrowdSpec = {
  outfit: string; n: number; at: V2; to?: V2; cols?: number; gap?: number;
  mode?: Mode; expr?: string; beats?: Beat[]; mixExpr?: boolean;
};
export type PropSpec = { kind: string; at: V2; yaw?: number; s?: number };
export type FxSpec = { kind: FxKind; on?: string; atPos?: V2; at: number; dur?: number; size?: number };

export type Scene = {
  line: string;                  // narration for this scene (one or two sentences)
  set: SetName; light?: Light;
  cam?: CamPreset; move?: CamMove; az?: number;   // az: camera bearing in degrees around the focus (0 = from +z)
  focus?: string | V2;           // actor id or set position the camera frames
  actors?: ActorSpec[];
  crowd?: CrowdSpec[];
  props?: PropSpec[];
  fx?: FxSpec[];
  sfx?: string[];                // pipeline/audio.py cues: whoosh thud splash crash pop cheer gasp laugh applause bell birds crowd steps creak
  kick?: number;                 // fraction of the scene where an impact camera shake lands
  flash?: boolean;               // white flash at the cut INTO this scene
  // filled by pipeline/voice.py:
  a?: number; b?: number;        // first frame / end frame (exclusive)
  words?: { w: string; s: number; e: number }[];
};

export type CastSpec = { outfit: string; skin?: number; build?: "adult" | "stout" | "kid"; hair?: string; jacket?: string; pants?: string; hat?: string | null; dress?: string; moustache?: string };

export type Episode = {
  slug: string; title: string; voice?: string;
  facts?: string[]; sources?: string[];
  cast: Record<string, CastSpec>;
  scenes: Scene[];
  total?: number;                // frames, filled by voice.py
  captions?: boolean;            // burned-in word captions (default on)
  tts?: "kokoro" | "elevenlabs"; voice_settings?: Record<string, number | string>;
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const smoother = (x: number) => { const u = clamp01(x); return u * u * u * (u * (u * 6 - 15) + 10); };

export const sceneAt = (ep: Episode, f: number) => {
  for (let i = 0; i < ep.scenes.length; i++) if (f < (ep.scenes[i].b ?? 0)) return i;
  return ep.scenes.length - 1;
};
/** scene progress 0..1 and seconds since the scene started */
export const localT = (ep: Episode, i: number, f: number) => {
  const s = ep.scenes[i], a = s.a ?? 0, b = s.b ?? a + 60;
  return { u: clamp01((f - a) / Math.max(1, b - a - 1)), t: (f - a) / FPS, dur: (b - a) / FPS };
};
export const exprAt = (base: string | undefined, beats: Beat[] | undefined, u: number) => {
  let e = base ?? "neutral";
  for (const b of beats ?? []) if (u >= b.at) e = b.expr;
  return e;
};
