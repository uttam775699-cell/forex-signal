// Reusable locations ("sets") built from the bridge short's look kit: painted HD textures, two-tone materials,
// storybook houses with relief, cartoon vegetation. Every set is built around its own origin (set-local x / z,
// ground at y = 0); the stage area where the cast stands is roughly x -8..8, z -6..6, cameras look from +z by default.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, prop, setSight, Ray } from "./build";
import { grassHD, cobbleHD, stoneHD, planksHD, beamHD, rep, ctex, rng } from "./paint";
import { twoTone } from "./shade";

export type Water = { x0: number; x1: number; z0: number; z1: number; y: number };
export type BuiltSet = { water: Water[] };

const M = {
  grass: () => lam("grassHD", () => ({ map: grassHD() })),
  cobble: () => lam("cobbleHD", () => ({ map: cobbleHD() })),
  wall: () => lam("wallHD", () => ({ map: stoneHD("wallHD", ["#c9bcaa", "#bfb19f", "#d1c5b4", "#b8aa97"], "#958776") })),
  cope: () => lam("copeHD", () => ({ map: stoneHD("copeHD", ["#e6dccd", "#ddd3c3", "#ece4d6", "#d6cbba"], "#aea293") })),
  planks: () => { const m = lam("planksHD", () => ({ map: planksHD() })); if (m.map) { m.map.anisotropy = 16; } return m; },
  beam: () => lam("beamHD", () => ({ map: beamHD() })),
  dirt: () => lam("dirt", () => ({ map: rep(dirtTex(), 1, 1) })),
  sand: () => lam("sand", () => ({ color: "#e2c992" })),
  wood: () => lam("woodDark", () => ({ color: "#8a5a3a" })),
  woodL: () => lam("woodLight", () => ({ color: "#c08a56" })),
  red: () => lam("barnRed", () => ({ color: "#b4483c" })),
  white: () => lam("trimWhite", () => ({ color: "#f1ead8" })),
  iron: () => twoTone(new THREE.MeshPhongMaterial({ color: "#3d414c", specular: "#8a8a8a", shininess: 60 }), 0.15),
  hay: () => lam("hay", () => ({ color: "#e7c25a" })),
  rock: () => lam("rock", () => ({ color: "#a39a91" })),
  hillG: () => lam("hillGreen", () => ({ color: "#6fae4a" })),
  canvas: () => lam("tentCanvas", () => ({ color: "#efe4c8" })),
  plaster: () => lam("roomPlaster", () => ({ color: "#ead8b6" })),
  wallpaper: () => lam("roomPaper", () => ({ map: paperTex() })),
};
const dirtTex = () => ctex("dirt", 512, 512, (g, r) => {
  g.fillStyle = "#c9a26b"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(120,85,50,0.18)" : "rgba(240,215,170,0.22)"; const s = 2 + r() * 7; g.fillRect(r() * 512, r() * 512, s, s * 0.7); }
});
const paperTex = () => ctex("paper", 512, 512, (g) => {
  g.fillStyle = "#e9d6ae"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#dcc395"; for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 22, 512);
  g.fillStyle = "#a7744a"; g.fillRect(0, 440, 512, 72);
  g.fillStyle = "rgba(60,30,20,.35)"; g.fillRect(0, 436, 512, 6);
});

/** horizontal ground quad at height y over x0..x1, z0..z1, texture repeating every `tile` metres */
export const ground = (x0: number, x1: number, z0: number, z1: number, tile: number, y = 0) => {
  const g = new THREE.BufferGeometry(), u = (x1 - x0) / tile, v = (z1 - z0) / tile;
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(6).fill([0, 1, 0]).flat(), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
};
const T = (x: number, y: number, z: number, yaw = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s, s));
const cyl = (r0: number, r1: number, h: number, n = 14) => new THREE.CylinderGeometry(r0, r1, h, n).translate(0, h / 2, 0);

// ---------------- props ----------------
/** set dressing by name; (x, z) set-local on the ground, yaw radians, s = scale. Unknown names are ignored. */
export const addProp = (b: Batch, kind: string, x: number, z: number, yaw = 0, s = 1, y = 0) => {
  const m = (px: number, py: number, pz: number, ry = 0) => T(x, y, z, yaw, s).multiply(T(px, py, pz, ry));
  const seed = Math.abs(Math.round(x * 13.1 + z * 7.7));
  switch (kind) {
    case "tree": prop(b, {}, ["tree_oak", "tree_fat", "tree_default"][seed % 3], x, y, z, 6.5 * s, yaw); break;
    case "tallTree": prop(b, {}, "tree-high-round", x, y, z, 8 * s, yaw); break;
    case "pine": prop(b, {}, "tree_cone", x, y, z, 7 * s, yaw); break;
    case "bush": prop(b, {}, "plant_bush", x, y, z, 1.1 * s, yaw); break;
    case "hedge": prop(b, {}, "hedge", x, y, z, 1.2 * s, yaw); break;
    case "rock": b.add(new THREE.DodecahedronGeometry(0.7, 1).scale(1.3, 0.75, 1), M.rock(), m(0, 0.35, 0)); break;
    case "barrel":
      b.add(cyl(0.38, 0.32, 1.0, 16), M.woodL(), m(0, 0, 0));
      for (const hy of [0.18, 0.8]) b.add(new THREE.TorusGeometry(0.37, 0.025, 6, 20).rotateX(Math.PI / 2), M.iron(), m(0, hy, 0));
      break;
    case "crate": b.add(boxGeo(V(-0.45, 0, -0.45), V(0.45, 0.9, 0.45), 1), M.beam(), m(0, 0, 0)); break;
    case "crates":
      for (const [px, pz, py] of [[0, 0, 0], [0.95, 0.1, 0], [0.45, 0.05, 0.9]]) b.add(boxGeo(V(-0.45, 0, -0.45), V(0.45, 0.9, 0.45), 1), M.beam(), m(px, py, pz, px));
      break;
    case "fence": // 4 m segment along local x
      for (let k = 0; k <= 2; k++) b.add(boxGeo(V(-2 + k * 2 - 0.07, 0, -0.07), V(-2 + k * 2 + 0.07, 1.15, 0.07)), M.woodL(), m(0, 0, 0));
      for (const hy of [0.45, 0.9]) b.add(boxGeo(V(-2.05, hy, -0.04), V(2.05, hy + 0.12, 0.04)), M.woodL(), m(0, 0, 0));
      break;
    case "lamp":
      b.add(cyl(0.07, 0.09, 3.6, 10), M.iron(), m(0, 0, 0));
      b.add(new THREE.CylinderGeometry(0.22, 0.12, 0.45, 6).translate(0, 3.85, 0), lam("lampGlass", () => ({ color: "#f6e7a8" })), m(0, 0, 0));
      b.add(new THREE.ConeGeometry(0.3, 0.3, 6).translate(0, 4.2, 0), M.iron(), m(0, 0, 0));
      break;
    case "bench":
      b.add(boxGeo(V(-0.9, 0.42, -0.22), V(0.9, 0.5, 0.22)), M.woodL(), m(0, 0, 0));
      b.add(boxGeo(V(-0.9, 0.55, -0.26), V(0.9, 0.85, -0.2)), M.woodL(), m(0, 0, 0));
      for (const sx of [-0.75, 0.75]) b.add(boxGeo(V(sx - 0.05, 0, -0.2), V(sx + 0.05, 0.42, 0.2)), M.iron(), m(0, 0, 0));
      break;
    case "table":
      b.add(boxGeo(V(-0.9, 0.74, -0.5), V(0.9, 0.82, 0.5)), M.woodL(), m(0, 0, 0));
      for (const [sx, sz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) b.add(boxGeo(V(sx - 0.05, 0, sz - 0.05), V(sx + 0.05, 0.74, sz + 0.05)), M.wood(), m(0, 0, 0));
      break;
    case "chair":
      b.add(boxGeo(V(-0.25, 0.44, -0.25), V(0.25, 0.5, 0.25)), M.wood(), m(0, 0, 0));
      b.add(boxGeo(V(-0.25, 0.5, -0.27), V(0.25, 1.0, -0.21)), M.wood(), m(0, 0, 0));
      for (const [sx, sz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) b.add(boxGeo(V(sx - 0.03, 0, sz - 0.03), V(sx + 0.03, 0.44, sz + 0.03)), M.wood(), m(0, 0, 0));
      break;
    case "cart":
      b.add(boxGeo(V(-1.1, 0.55, -0.7), V(1.1, 1.05, 0.7), 1), M.beam(), m(0, 0, 0));
      for (const sz of [-0.78, 0.78]) b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16).rotateX(Math.PI / 2), M.wood(), m(0, 0.5, sz));
      b.add(boxGeo(V(1.1, 0.7, -0.05), V(2.6, 0.78, 0.05)), M.wood(), m(0, 0, -0.45));
      b.add(boxGeo(V(1.1, 0.7, -0.05), V(2.6, 0.78, 0.05)), M.wood(), m(0, 0, 0.45));
      break;
    case "well":
      b.add(cyl(1.0, 1.0, 0.85, 20), M.cope(), m(0, 0, 0));
      for (const sx of [-0.85, 0.85]) b.add(boxGeo(V(sx - 0.07, 0.85, -0.07), V(sx + 0.07, 2.4, 0.07)), M.wood(), m(0, 0, 0));
      b.add(new THREE.ConeGeometry(1.35, 0.9, 4).rotateY(Math.PI / 4).translate(0, 2.75, 0), M.red(), m(0, 0, 0));
      break;
    case "fountain":
      b.add(cyl(2.6, 2.6, 0.6, 28), M.cope(), m(0, 0, 0));
      b.add(cyl(0.35, 0.45, 1.7, 14), M.cope(), m(0, 0, 0));
      b.add(cyl(1.0, 0.6, 0.3, 20).translate(0, 1.6, 0), M.cope(), m(0, 0, 0));
      b.add(new THREE.CircleGeometry(2.35, 28).rotateX(-Math.PI / 2).translate(0, 0.5, 0), lam("fountainWater", () => ({ color: "#3fa8c4" })), m(0, 0, 0));
      break;
    case "boat":
      b.add(new THREE.CylinderGeometry(1.1, 0.7, 4.6, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI).scale(1, 0.8, 1).translate(0, 0.5, 0), M.woodL(), m(0, 0, 0));
      break;
    case "ship":
      b.add(boxGeo(V(-6, 0, -1.6), V(6, 2.2, 1.6), 2), M.beam(), m(0, 0, 0));
      b.add(new THREE.ConeGeometry(1.6, 3, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.75, 1).translate(7.4, 1.4, 0), M.beam(), m(0, 0, 0));
      b.add(cyl(0.12, 0.16, 12, 8), M.wood(), m(0, 2.2, 0));
      b.add(boxGeo(V(-2.6, 4, -0.04), V(2.6, 11, 0.04)), lam("sail", () => ({ color: "#f3ead4", side: THREE.DoubleSide })), m(0, 0, 0.3, Math.PI / 2));
      break;
    case "haystack": b.add(new THREE.SphereGeometry(1.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.2, 1), M.hay(), m(0, 0, 0)); break;
    case "tent":
      b.add(new THREE.ConeGeometry(2.4, 3.2, 4).rotateY(Math.PI / 4).translate(0, 1.6, 0), M.canvas(), m(0, 0, 0));
      break;
    case "flagpole":
      b.add(cyl(0.06, 0.08, 7, 8), M.white(), m(0, 0, 0));
      b.add(boxGeo(V(0.08, 5.6, -0.02), V(1.9, 6.8, 0.02)), lam("flagRed", () => ({ color: "#c8323a", side: THREE.DoubleSide })), m(0, 0, 0));
      break;
    case "cannon":
      b.add(new THREE.CylinderGeometry(0.17, 0.26, 2.0, 14).rotateZ(Math.PI / 2 - 0.25).translate(0.2, 0.95, 0), M.iron(), m(0, 0, 0));
      for (const sz of [-0.45, 0.45]) b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16).rotateX(Math.PI / 2), M.wood(), m(-0.2, 0.55, sz));
      break;
    case "bollard": b.add(cyl(0.18, 0.22, 0.7, 12), M.iron(), m(0, 0, 0)); break;
    case "statue":
      b.add(boxGeo(V(-0.8, 0, -0.8), V(0.8, 1.6, 0.8), 1), M.cope(), m(0, 0, 0));
      b.add(cyl(0.3, 0.42, 1.6, 12).translate(0, 1.6, 0), lam("bronze", () => ({ color: "#5f8a74" })), m(0, 0, 0));
      b.add(new THREE.SphereGeometry(0.3, 14, 10).translate(0, 3.5, 0), lam("bronze", () => ({ color: "#5f8a74" })), m(0, 0, 0));
      break;
    case "shelf":
      b.add(boxGeo(V(-1.2, 0, -0.25), V(1.2, 2.2, 0.25)), M.wood(), m(0, 0, 0));
      for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) {
        const c = ["#b4483c", "#3f6fb5", "#d9a441", "#2f6a43", "#7b5ac9"][(k * 3 + j) % 5];
        b.add(boxGeo(V(-1.05 + j * 0.36, 0.12 + k * 0.52, 0.0), V(-0.8 + j * 0.36, 0.5 + k * 0.52, 0.27)), lam("book" + c, () => ({ color: c })), m(0, 0, 0));
      }
      break;
    case "desk": addProp(b, "table", x, z, yaw, s, y); b.add(boxGeo(V(-0.3, 0.82, -0.2), V(0.3, 0.86, 0.2)), M.white(), m(0, 0, 0)); break;
    case "clock":
      b.add(boxGeo(V(-0.35, 0, -0.25), V(0.35, 2.2, 0.25)), M.wood(), m(0, 0, 0));
      b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 20).rotateX(Math.PI / 2).translate(0, 1.8, 0.26), M.white(), m(0, 0, 0));
      break;
    case "anvil": b.add(boxGeo(V(-0.5, 0, -0.2), V(0.5, 0.75, 0.2)), M.iron(), m(0, 0, 0)); break;
    case "sack": b.add(new THREE.SphereGeometry(0.4, 12, 10).scale(1, 1.3, 0.9).translate(0, 0.5, 0), M.canvas(), m(0, 0, 0)); break;
    case "pumpkin": b.add(new THREE.SphereGeometry(0.4, 14, 10).scale(1, 0.75, 1).translate(0, 0.3, 0), lam("pumpkin", () => ({ color: "#e8842c" })), m(0, 0, 0)); break;
    case "stall":
      b.add(boxGeo(V(-1.5, 0, -0.6), V(1.5, 1.0, 0.6), 1), M.beam(), m(0, 0, 0));
      for (const sx of [-1.4, 1.4]) b.add(boxGeo(V(sx - 0.05, 1.0, -0.55), V(sx + 0.05, 2.5, -0.45)), M.wood(), m(0, 0, 0));
      b.add(boxGeo(V(-1.7, 2.4, -1.0), V(1.7, 2.5, 0.9)), lam("awning", () => ({ color: "#d85b4f" })), m(0, 0, 0));
      break;
  }
};

// ---------------- helpers ----------------
const row = (b: Batch, r: () => number, side: 1 | -1, x: number, z0: number, z1: number) => {
  // a row of houses with fronts toward the street (facing -side along x)
  let z = z0;
  while (z < z1) {
    const w = [7, 8, 9][Math.floor(r() * 3)], h = [7, 8.4, 9.8][Math.floor(r() * 3)];
    house(b, x + side * 4, z + w / 2, side > 0 ? -Math.PI / 2 : Math.PI / 2, w, 8, h, Math.floor(r() * 8));
    z += w + (r() < 0.2 ? 2 : 0.2);
  }
};
const ringHouses = (b: Batch, r: () => number, rad: number, a0: number, a1: number) => {
  for (let a = a0; a < a1; ) {
    const w = [7, 8, 9][Math.floor(r() * 3)], h = [7, 8.4, 9.8][Math.floor(r() * 3)];
    const x = Math.sin(a) * (rad + 4), z = Math.cos(a) * (rad + 4);
    house(b, x, z, a + Math.PI, w, 8, h, Math.floor(r() * 8));
    a += (w + 0.3) / rad;
  }
};
const hills = (b: Batch, r: () => number, d: number, n: number) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3, R = d + r() * 60, s = 40 + r() * 50;
    b.add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(s * 1.8, s * 0.32, s), M.hillG(), T(Math.sin(a) * R, -2, Math.cos(a) * R));
  }
};
const scatter = (b: Batch, r: () => number, kind: string, n: number, keep: (x: number, z: number) => boolean, R0: number, R1: number) => {
  for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
    const a = r() * Math.PI * 2, d = R0 + r() * (R1 - R0), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (!keep(x, z)) continue;
    addProp(b, kind, x, z, r() * 6, 0.8 + r() * 0.5); i++;
  }
};

// ---------------- sets ----------------
export const SETS: Record<string, (b: Batch, r: () => number) => Water[]> = {
  /** a cobbled high street running along z, house rows on both sides, lamps */
  town: (b, r) => {
    b.add(ground(-900, 900, -900, 900, 2, -0.04), M.grass());
    b.add(ground(-7.5, 7.5, -200, 80, 2, 0.01), M.cobble());
    row(b, r, 1, 7.5, -200, 70); row(b, r, -1, -7.5, -200, 70);
    for (let z = -60; z < 40; z += 13) { addProp(b, "lamp", 6.6, z); addProp(b, "lamp", -6.6, z + 6); }
    addProp(b, "barrel", 5.9, -3.5); addProp(b, "crates", -6.2, -9); addProp(b, "cart", 5.2, -16, 0.4);
    hills(b, r, 320, 10);
    return [];
  },
  /** an open plaza ringed by houses, fountain behind the stage */
  square: (b, r) => {
    b.add(ground(-900, 900, -900, 900, 2, -0.04), M.grass());
    const disc = new THREE.CircleGeometry(30, 48); const uv = disc.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 30, uv.getY(k) * 30);
    b.add(disc.rotateX(-Math.PI / 2).translate(0, 0.01, 0), M.cobble());
    ringHouses(b, r, 30, 0.35, Math.PI * 2 - 0.35);
    addProp(b, "fountain", 0, -13); addProp(b, "lamp", -9, -4); addProp(b, "lamp", 9, -4);
    addProp(b, "stall", -14, -6, 0.6); addProp(b, "stall", 14, -7, -0.6); addProp(b, "bench", -7, 8, Math.PI); addProp(b, "tree", 18, 10); addProp(b, "tree", -18, 12);
    hills(b, r, 320, 10);
    return [];
  },
  /** a grassy near bank; the river runs along x behind the stage (z -36..-9); town on the far bank */
  river: (b, r) => {
    b.add(ground(-900, 900, -9, 900, 2), M.grass());
    b.add(ground(-900, 900, -900, -36, 2), M.grass());
    b.add(ground(-900, 900, -36, -9, 6, -2.4), lam("bed", () => ({ color: "#5e6f5a" })));
    for (const [z, dir] of [[-9, 1], [-36, -1]] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([-900, -2.4, z, 900, -2.4, z, 900, 0, z, -900, -2.4, z, 900, 0, z, -900, 0, z], 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(6).fill([0, 0, dir]).flat(), 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 450, 0, 450, 0.6, 0, 0, 450, 0.6, 0, 0.6], 2));
      if (dir < 0) { const p = g.attributes.position.array as Float32Array; for (let i = 0; i < 6; i++) p[i * 3] *= -1; }
      b.add(g, M.wall());
      b.add(boxGeo(V(-900, 0, z - 0.3), V(900, 0.12, z + 0.3), 2), M.cope());
    }
    let x = -140;
    while (x < 140) { const w = [7, 9][Math.floor(r() * 2)]; house(b, x + w / 2, -46, 0, w, 8, [7, 8.4, 9.8][Math.floor(r() * 3)], Math.floor(r() * 8)); x += w + 0.4; }
    for (const px of [-12, -4, 10, 17]) addProp(b, "tree", px, 7 + r() * 4);
    addProp(b, "bench", -6, -4); addProp(b, "lamp", 7, -6);
    hills(b, r, 330, 9);
    return [{ x0: -900, x1: 900, z0: -36, z1: -9, y: -0.9 }];
  },
  /** farmland: dirt track along z, fences, a red barn, haystacks, rolling hills */
  farm: (b, r) => {
    b.add(ground(-900, 900, -900, 900, 2, -0.04), M.grass());
    b.add(ground(-2.5, 2.5, -300, 60, 3, 0.01), M.dirt());
    for (let z = -40; z < 30; z += 4) { addProp(b, "fence", -4.5, z, Math.PI / 2); addProp(b, "fence", 4.5, z, Math.PI / 2); }
    // barn
    const barn = T(-16, 0, -20);
    b.add(boxGeo(V(-6, 0, -5), V(6, 6, 5), 2), M.red(), barn);
    b.add(new THREE.CylinderGeometry(0.01, 6.4, 3.4, 4, 1).rotateY(Math.PI / 4).scale(1.33, 1, 1.05).translate(0, 7.7, 0), lam("barnRoof", () => ({ color: "#6c5a5a" })), barn);
    b.add(boxGeo(V(-2, 0, 5), V(2, 4.2, 5.1)), M.white(), barn);
    for (const [hx, hz] of [[12, -14], [16, -8], [9, -26]]) addProp(b, "haystack", hx, hz);
    for (const [tx, tz] of [[-30, 4], [26, -34], [34, 8], [-8, -60], [20, -70]]) addProp(b, "tree", tx, tz);
    addProp(b, "well", 9, 3); addProp(b, "cart", -8, 6, 0.8);
    hills(b, r, 160, 12);
    return [];
  },
  /** a stone quay with the sea behind the stage (z < -10), ships, warehouses behind the camera side */
  harbor: (b, r) => {
    b.add(ground(-900, 900, -10, 900, 2, 0), M.cope());
    b.add(ground(-900, 900, -900, -10, 6, -3.0), lam("seabed", () => ({ color: "#2f5d6e" })));
    b.add(boxGeo(V(-900, -3, -10.5), V(900, 0.02, -10)), M.wall());
    for (let x = -30; x <= 30; x += 6) addProp(b, "bollard", x, -9.4);
    addProp(b, "ship", -12, -24, 0.05); addProp(b, "ship", 22, -40, -0.2, 0.9); addProp(b, "boat", 6, -14.5, 0.3);
    addProp(b, "barrel", -6, -6); addProp(b, "barrel", -5.2, -6.6); addProp(b, "crates", 7, -6.5); addProp(b, "sack", 5.6, -5.2);
    let x = -120;
    while (x < 120) { const w = [8, 9][Math.floor(r() * 2)]; house(b, x + w / 2, 26, Math.PI, w, 10, [8.4, 9.8][Math.floor(r() * 2)], Math.floor(r() * 8)); x += w + 0.4; }
    return [{ x0: -900, x1: 900, z0: -900, z1: -10, y: -0.8 }];
  },
  /** an interior: plank floor, papered back + side walls (camera on the open +z side), furniture */
  room: (b) => {
    b.add(ground(-900, 900, -900, 900, 2, -0.05), M.grass());
    b.add(ground(-8, 8, -6, 12, 2.2, 0), M.planks());
    b.add(boxGeo(V(-8, 0, -6.4), V(8, 4.4, -6), 1), M.wallpaper());
    for (const sx of [-1, 1]) b.add(boxGeo(V(sx * 8 - 0.2, 0, -6.4), V(sx * 8 + 0.2, 4.4, 12)), M.wallpaper());
    // windows on the back wall: bright panes
    for (const wx of [-4.5, 4.5]) {
      b.add(boxGeo(V(wx - 1.0, 1.4, -6.05), V(wx + 1.0, 3.3, -5.98)), lam("pane", () => ({ color: "#cfe6ff" })));
      b.add(boxGeo(V(wx - 1.1, 1.3, -5.99), V(wx + 1.1, 1.42, -5.85)), M.white());
      b.add(boxGeo(V(wx - 0.04, 1.4, -5.99), V(wx + 0.04, 3.3, -5.93)), M.white());
    }
    addProp(b, "shelf", 0, -5.7); addProp(b, "table", -2.5, -1.5); addProp(b, "chair", -3.6, -1.4, Math.PI / 2); addProp(b, "clock", 6.8, -5.6);
    return [];
  },
  /** a lone grassy hilltop with a big tree; a village far below in the valley */
  hill: (b, r) => {
    b.add(ground(-900, 900, -900, 900, 2, -0.04), M.grass());
    addProp(b, "tree", -5, -6, 0, 1.4); addProp(b, "rock", 4, -3); addProp(b, "bush", 6, -7);
    for (let i = 0; i < 26; i++) { const a = -0.9 + r() * 1.8, d = 110 + r() * 60; house(b, Math.sin(a) * d, -Math.cos(a) * d, r() * 6, 8, 8, 8, i); }
    hills(b, r, 260, 12);
    scatter(b, r, "tree", 40, (x, z) => Math.hypot(x, z) > 30 && z < -12, 30, 140);
    return [];
  },
};

/** build one set at origin (ox, 0, 0); sight lines (world coords) remove houses that would block a camera */
export const buildSet = (name: string, root: THREE.Object3D, ox: number, rays: Ray[]): BuiltSet => {
  const b = new Batch(), r = rng(name.length * 977 + 3), make = SETS[name] ?? SETS.town;
  // sight lines arrive in world coords: shift them into set-local coords for the culler
  setSight(rays.map((q) => ({ ...q, o: q.o.clone().add(V(-ox, 0, 0)) })));
  const water = make(b, r);
  setSight([]);
  const g = new THREE.Group(); g.position.x = ox;
  b.build(g);
  root.add(g);
  return { water: water.map((w) => ({ ...w, x0: w.x0 + ox, x1: w.x1 + ox })) };
};
export const addPropTo = (b: Batch, kind: string, x: number, z: number, yaw = 0, s = 1) => addProp(b, kind, x, z, yaw, s);
