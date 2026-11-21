// The cast as lit flat sprites in the 3D world (from the bridge short): every frame each character asks for a drawing
// (key + draw call); the pool keeps one canvas per distinct drawing. Cards are yaw-only billboards shaded by
// cardShade(); standing ones get a soft contact blob. Effects are unlit cards. All live on the NOINK layer.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, fxNote, fxBurst, fxSplash, fxStars, fxPuff, fxRing, fxShadow, fxContact, Outfit, Expr, FrontOpts, SideOpts, SKINS, INK } from "./toon";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import { FPS } from "./episode";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}


// ================================================================ generic cast for episodes
import type { Episode, Scene, CastSpec, Mode } from "./episode";
import { exprAt, localT } from "./episode";
import { walkU } from "./camera";

/** wardrobe: outfit presets the episode cast picks from (`outfit` + optional overrides) */
export const OUTFITS: Record<string, Outfit> = {
  soldier: { jacket: "#357650", pants: "#3d4440", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#d9dde0", rifle: true },
  redcoat: { jacket: "#c0353a", pants: "#f1efe6", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#e8c45a", rifle: true },
  bluecoat: { jacket: "#34508f", pants: "#d9d4c4", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#e8c45a", rifle: true },
  officer: { jacket: "#357650", pants: "#3d4440", boots: INK, hat: "shako_tall", buttons: "#e8c45a", sash: "#c0353a", sword: true, moustache: "#4a3020", build: "stout" },
  general: { jacket: "#34508f", pants: "#f1efe6", boots: INK, hat: "tophat", buttons: "#e8c45a", sash: "#d9a441", sword: true, moustache: "#6a6a6a", build: "stout" },
  gentleman: { jacket: "#2f3446", pants: "#4a4a55", boots: INK, hat: "tophat", moustache: "#4a3020" },
  townsman: { jacket: "#3f6fb5", pants: "#3b3f52", boots: "#4a3426", hat: "tophat" },
  lady: { jacket: "#8c3b4a", pants: "#3b3f52", boots: "#4a3426", hat: "bonnet", dress: "#c25a7a" },
  woman: { jacket: "#5a8fc2", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#5a3b2a", dress: "#d9a441" },
  worker: { jacket: "#3f6fb5", pants: "#4a4a55", boots: "#4a3426", hat: "cap", cap: "#5a4a3a" },
  farmer: { jacket: "#b5653f", pants: "#3b5b9a", boots: "#5a3b2a", hat: "cap", cap: "#d9a441" },
  sailor: { jacket: "#26355e", pants: "#f1efe6", boots: INK, hat: "cap", cap: "#f1efe6" },
  scientist: { jacket: "#f4f2ec", pants: "#3b3f52", boots: INK, hat: "hair", hair: "#8a8a8a", moustache: "#8a8a8a" },
  inventor: { jacket: "#7a5a3a", pants: "#3b3f52", boots: INK, hat: "hair", hair: "#3a2a1a" },
  kid: { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#e2453c", build: "kid" },
  girl: { jacket: "#e2453c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "hair", hair: "#7a4a2a", dress: "#f08a2c", build: "kid" },
  parent: { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#5a3b2a" },
  man: { jacket: "#5d7a3a", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#3a2a1a" },
  baker: { jacket: "#f4f2ec", pants: "#4a4a55", boots: INK, hat: "cap", cap: "#f4f2ec", build: "stout" },
  police: { jacket: "#26355e", pants: "#26355e", boots: INK, hat: "shako_tall", buttons: "#e8c45a" },
  king: { jacket: "#7b2a4a", pants: "#d9a441", boots: INK, hat: "tophat", sash: "#d9a441", moustache: "#c9c9c9", build: "stout" },
  cowboy: { jacket: "#b5653f", pants: "#3b5b9a", boots: "#5a3b2a", hat: "tophat", moustache: "#4a3020" },
};
const COATS = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9"];
export const outfitOf = (c: CastSpec | undefined, v = 0): Outfit => {
  const base = OUTFITS[c?.outfit ?? "townsman"] ?? OUTFITS.townsman;
  const o: Outfit = { ...base, skin: SKINS[(c?.skin ?? v) % 4] };
  if (c?.outfit === "townsman" || c?.outfit === "crowd") o.jacket = COATS[v % 6];
  if (c?.build) o.build = c.build;
  for (const k of ["hair", "jacket", "pants", "dress", "moustache"] as const) if (c && k in c) (o as Record<string, unknown>)[k] = c[k] || undefined;
  if (c && "hat" in c) o.hat = c.hat ?? null;
  if (o.hat === "hair" && !o.hair) o.hair = "#3a2a1a";
  if (o.hat === "cap" && !o.cap) o.cap = "#5a4a3a";
  return o;
};

// ---------------- placements ----------------
export type Place = { key: string; draw: (p: Pen) => void; x: number; y: number; z: number; scale?: number; mirror?: boolean; size?: [number, number, number] };
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type Stage = { places: Place[]; fx: FxPlace[] };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun: THREE.Vector3; golden: boolean };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = cam.sun.dot(cam.right) * (mirror ? -1 : 1), sy = -cam.sun.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: Math.abs(c) < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0 };
};
const LID = [0.5, 1, 1, 0.5];
const lidAt = (f: number, i: number) => {
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 600; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;

const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp(v, 0, 1); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (cam: CamInfo, out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const S = cam.sun, hl = Math.hypot(S.x, S.z) || 1, ox = -S.x / hl, oz = -S.z / hl, rot = Math.atan2(-ox, -oz);
  if (!cam.golden) {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, S.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h;
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c, w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[cam.golden ? "golden" : "day"], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc, w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

/** one person at (x, z) doing `mode`, walking along (dx, dz) when moving */
const person = (cam: CamInfo, out: Stage, i: number, o: Outfit, okey: string, x: number, z: number, dx: number, dz: number,
  mode: Mode, expr: string, f: number, t: number, face = 0, scale = 1, moving = false) => {
  const d = cam.pos.distanceTo(new THREE.Vector3(x, 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const walking = moving && (mode === "walk" || mode === "march");
  const view = walking ? viewOf(cam, x, z, dx, dz) : { side: false, mirror: false };
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(i), blink = lidAt(f, i);
  const phase = ((t * (mode === "march" ? 1 : 0.9) + hh(i, 3) * (mode === "march" ? 0 : 1)) % 1 + 1) % 1;
  let place: Place;
  if (view.side) {
    const so: SideOpts = { phase, expr: expr as Expr, mode: "march", blink, stride: mode === "march" ? 1 : 0.8, light, seed };
    place = { key: `S|${okey}|${fkey(so)}`, x, y: 0, z, scale, mirror, size: [w, h, k], draw: (p) => bodySide(p, o, so) };
  } else {
    const fmode = mode === "sit" ? "sit" : mode === "fall" ? "fall" : walking ? (mode === "march" ? "march" : "stroll") : "stand";
    const wave = mode === "wave" ? 0.5 + 0.5 * Math.sin(t * 9 + i) : mode === "cheer" ? 1 : undefined;
    const fo: FrontOpts = { phase: walking ? phase : 0, expr: expr as Expr, mode: fmode, blink, light, seed, facing: face as -1 | 0 | 1, wave,
      look: face * 0.6, lift: mode === "cheer" ? 70 + 20 * Math.sin(t * 8 + i) : 60 };
    place = { key: `F|${okey}|${fkey(fo)}`, x, y: 0, z, scale, mirror: false, size: [w, h, k], draw: (p) => bodyFront(p, o, fo) };
  }
  out.places.push(place);
  if (mode !== "fall") blob(cam, out, x, 0, z, scale);
};

const MIXED = ["grin", "smile", "neutral", "laugh", "smile_closed"];
/** everyone and every effect of scene i at frame f, in set-local coords (caller adds the set offset) */
export const stageScene = (ep: Episode, i: number, f: number, cam: CamInfo): Stage => {
  const s: Scene = ep.scenes[i], out: Stage = { places: [], fx: [] }, { u, t } = localT(ep, i, f), kw = walkU(u);
  (s.actors ?? []).forEach((a, j) => {
    const c = ep.cast[a.id], o = outfitOf(c, j), okey = `${a.id}`;
    const tx = a.to ? a.to[0] - a.at[0] : 0, tz = a.to ? a.to[1] - a.at[1] : 0;
    const x = a.at[0] + tx * kw, z = a.at[1] + tz * kw;
    const moving = !!a.to && u > 0.01 && u < 0.99;
    const mode = a.mode ?? (a.to ? "walk" : "stand");
    const idx = Object.keys(ep.cast).indexOf(a.id);
    person(cam, out, idx * 11 + 1, o, okey, x, z, tx, tz, mode, exprAt(a.expr, a.beats, u + 2 / (FPS * Math.max(1, ((s.b ?? 60) - (s.a ?? 0)) / FPS))), f, t, a.face ?? 0, a.scale ?? 1, moving);
  });
  (s.crowd ?? []).forEach((c, ci) => {
    const cols = c.cols ?? Math.min(6, Math.max(1, Math.round(Math.sqrt(c.n * 1.6)))), gap = c.gap ?? 1.15;
    const rows = Math.ceil(c.n / cols);
    const tx = c.to ? c.to[0] - c.at[0] : 0, tz = c.to ? c.to[1] - c.at[1] : 0;
    const moving = !!c.to && u > 0.01 && u < 0.99, mode = c.mode ?? (c.to ? "walk" : "stand");
    const len = Math.hypot(tx, tz), fx = len ? tx / len : 0, fz = len ? tz / len : 1; // front row leads (default: faces +z, the camera side)
    for (let k = 0; k < c.n; k++) {
      const col = k % cols, rw = Math.floor(k / cols);
      const lat = (col - (cols - 1) / 2) * gap + (mode === "march" ? 0 : (hh(k, ci) - 0.5) * 0.5);
      const back = rw * (mode === "march" ? 1.3 : gap) + (mode === "march" ? 0 : (hh(k, ci + 4) - 0.5) * 0.5);
      const x = c.at[0] + tx * kw + fz * lat - fx * back, z = c.at[1] + tz * kw - fx * lat - fz * back;
      const v = (k * 7 + (k >> 2)) % 6;
      const o = outfitOf({ outfit: c.outfit, skin: v }, v);
      const e = exprAt(c.mixExpr ? MIXED[k % MIXED.length] : c.expr, c.beats, u);
      person(cam, out, 500 + ci * 97 + k, o, `crowd${ci}_${v}`, x, z, tx, tz, mode, e, f, t + (mode === "march" ? 0 : hh(k, 5)), 0, 1, moving);
      void rows;
    }
  });
  // effects
  for (const e of s.fx ?? []) {
    const dur = e.dur ?? 0.5, uu = (u - e.at) / Math.max(0.02, dur);
    if (uu < 0 || uu >= 1) continue;
    let px = 0, pz = 0, py = 2.3;
    const a = e.on ? s.actors?.find((x) => x.id === e.on) : undefined;
    if (a) { const kx = a.to ? kw : 0; px = a.at[0] + (a.to ? a.to[0] - a.at[0] : 0) * kx; pz = a.at[1] + (a.to ? a.to[1] - a.at[1] : 0) * kx; }
    else if (e.atPos) { px = e.atPos[0]; pz = e.atPos[1]; py = 1.2; }
    const sz = e.size ?? 1, qq = q(uu, 30);
    switch (e.kind) {
      case "burst": out.fx.push({ key: `burst${qq}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, qq), x: px, y: py - 0.4, z: pz + 0.1, w: 1.6 * sz, h: 1.6 * sz }); break;
      case "stars": out.fx.push({ key: `stars${q(t % 1, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q(t % 1, 30)), x: px, y: py - 0.1, z: pz + 0.05, w: 1.0 * sz, h: 0.5 * sz }); break;
      case "splash": out.fx.push({ key: `splash${qq}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, qq), x: px, y: 1.4 * sz, z: pz, w: 4 * sz, h: 4 * sz }); break;
      case "puff": out.fx.push({ key: `puff${qq}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, qq), x: px, y: 0.5 * sz, z: pz + 0.2, w: 1.6 * sz, h: 1.6 * sz, soft: true }); break;
      case "ring": out.fx.push({ key: `ring${qq}`, cw: 600, ch: 600, draw: (p) => fxRing(p, qq), x: px, y: 0.03, z: pz, w: 2.5 * sz, h: 2.5 * sz, flat: true }); break;
      case "notes": {
        for (let n = 0; n < 3; n++) {
          const nu = (uu * 2 + n / 3) % 1;
          out.fx.push({ key: `note${n % 2}`, cw: 220, ch: 240, draw: (p) => fxNote(p, n % 2), x: px + 0.35 + nu * 0.5 * (n % 2 ? 1 : -1), y: py - 0.2 + nu * 0.9, z: pz + 0.1, w: 0.4 * sz, h: 0.44 * sz, rot: Math.sin(nu * 6) * 0.2 });
        }
        break;
      }
    }
  }
  return out;
};
