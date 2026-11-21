// Camera grammar from the reference study: every hold creeps (push-in), moves are smootherstep glides, cuts between
// scenes, impacts are 7-frame sign-flipping kicks, small 2-4 deg rolls on low / close angles. Pure function of (scene, f).
import { Episode, Scene, V2, CamPreset, localT, smoother, FPS } from "./episode";

export type Cam = { pos: [number, number, number]; look: [number, number, number]; fov: number; roll: number };

type Rig = { dist: number; h: number; lookH: number; fov: number; roll: number; dof: number };
const RIG: Record<CamPreset, Rig> = {
  wide: { dist: 15, h: 3.2, lookH: 1.6, fov: 42, roll: 0, dof: 0 },
  medium: { dist: 6.2, h: 1.9, lookH: 1.45, fov: 36, roll: 0.02, dof: 10 },
  close: { dist: 2.7, h: 1.75, lookH: 1.62, fov: 30, roll: 0.035, dof: 13 },
  low: { dist: 4.2, h: 0.45, lookH: 1.7, fov: 40, roll: 0.06, dof: 8 },
  high: { dist: 9, h: 8.5, lookH: 0.6, fov: 40, roll: 0, dof: 0 },
  aerial: { dist: 34, h: 26, lookH: 0, fov: 42, roll: 0, dof: 0 },
  ots: { dist: 3.4, h: 2.0, lookH: 1.55, fov: 34, roll: 0.02, dof: 12 },
};
export const rigOf = (s: Scene) => RIG[s.cam ?? "medium"];

/** the point the scene frames (set-local x / z) at progress u */
const posOf = (a: { at: V2; to?: V2 }, u: number): V2 => {
  if (!a.to) return a.at;
  const k = walkU(u);
  return [a.at[0] + (a.to[0] - a.at[0]) * k, a.at[1] + (a.to[1] - a.at[1]) * k];
};
/** frame everybody when no focus is given: centroid of the actors, and how wide the group is (metres) */
export const groupOf = (s: Scene, u: number): { c: V2; spread: number } | null => {
  const ps = (s.actors ?? []).map((a) => posOf(a, u));
  if (ps.length < 2) return null;
  const c: V2 = [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  const xs = ps.map((p) => p[0]), zs = ps.map((p) => p[1]);
  return { c, spread: Math.max(Math.max(...xs) - Math.min(...xs), 0.4 * (Math.max(...zs) - Math.min(...zs))) };
};
export const focusAt = (s: Scene, u: number): V2 => {
  const f = s.focus;
  if (Array.isArray(f)) return f;
  if (f === undefined) { const g = groupOf(s, u); if (g) return g.c; }
  const id = typeof f === "string" ? f : s.actors?.[0]?.id;
  const a = s.actors?.find((x) => x.id === id);
  if (a) {
    if (!a.to) return a.at;
    const k = walkU(u);
    return [a.at[0] + (a.to[0] - a.at[0]) * k, a.at[1] + (a.to[1] - a.at[1]) * k];
  }
  const c = s.crowd?.[0];
  if (c) {
    if (!c.to) return c.at;
    const k = walkU(u);
    return [c.at[0] + (c.to[0] - c.at[0]) * k, c.at[1] + (c.to[1] - c.at[1]) * k];
  }
  return [0, 0];
};
/** walking progress: ease in over the first 8 %, constant speed, ease out over the last 8 % */
export const walkU = (u: number) => {
  const e = 0.08;
  if (u < e) return (u * u) / (2 * e) / (1 - e);
  if (u > 1 - e) return 1 - ((1 - u) * (1 - u)) / (2 * e) / (1 - e);
  return (u - e / 2) / (1 - e);
};

export const camAt = (ep: Episode, i: number, f: number): Cam => {
  const s = ep.scenes[i], R = rigOf(s), { u, t } = localT(ep, i, f);
  const mv = s.move ?? (s.cam === "wide" || s.cam === "aerial" ? "right" : "push");
  const k = 0.78 * smoother(u) + 0.22 * u; // never comes to a full stop (a still tail reads as a freeze on Shorts)
  let dist = R.dist, h = R.h, az = ((s.az ?? (s.cam === "ots" ? 160 : 0)) * Math.PI) / 180;
  // every shot moves a little: a continuous creep plus the named move
  const creep = 1 - 0.1 * u;
  if (mv === "push") dist *= 1.12 - 0.22 * k;
  else if (mv === "pull") dist *= 0.88 + 0.25 * k;
  else if (mv === "left") az -= 0.22 * (k - 0.5) * 2;
  else if (mv === "right") az += 0.22 * (k - 0.5) * 2;
  else if (mv === "orbit") az += 0.55 * (k - 0.5) * 2;
  else if (mv === "rise") h += (R.h < 2 ? 1.6 : 3.5) * k;
  dist *= creep;
  // fit the whole group in the narrow 9:16 width (horizontal half-angle from the vertical fov)
  const g = s.focus === undefined ? groupOf(s, 0.5) : null;
  if (g) { const hh = Math.atan(Math.tan((R.fov * Math.PI) / 360) * (9 / 16)); dist = Math.max(dist, (g.spread / 2 + 0.75) / Math.tan(hh)); }
  // children: frame lower (their eyes are ~0.5 m lower)
  const fid = typeof s.focus === "string" ? s.focus : s.focus === undefined && !g ? s.actors?.[0]?.id : undefined;
  const kid = fid ? ["kid", "girl"].includes(ep.cast[fid]?.outfit ?? "") || ep.cast[fid]?.build === "kid" : false;
  const lookH = kid && R.lookH > 1 ? R.lookH - 0.5 : R.lookH;
  if (kid && h > 1 && h < 3) h -= 0.45;
  const [fx, fz] = focusAt(s, u);
  const look: [number, number, number] = [fx, lookH, fz];
  let pos: [number, number, number] = [fx + Math.sin(az) * dist, h, fz + Math.cos(az) * dist];
  // impact kick: 7 frames, sign flips every frame, decaying
  let roll = R.roll * (az % 2 ? 1 : 1) * (i % 2 ? -1 : 1);
  if (s.kick !== undefined) {
    const fk = Math.round((s.a ?? 0) + s.kick * ((s.b ?? 0) - (s.a ?? 0))), d = f - fk;
    if (d >= 0 && d < 7) {
      const amp = 0.12 * (1 - d / 7) * (d % 2 ? -1 : 1);
      pos = [pos[0] + amp, pos[1] + amp * 0.6, pos[2]];
      roll += amp * 0.25;
    }
  }
  void t; void FPS;
  return { pos, look, fov: R.fov, roll };
};

export const dofAt = (ep: Episode, i: number) => rigOf(ep.scenes[i]).dof;
