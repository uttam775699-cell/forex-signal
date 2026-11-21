// Burned-in captions for the US Shorts audience: 1-3 words at a time from the narration's word timings, big cartoon
// letters with a thick dark outline, the word being spoken pops in yellow. Sits in the lower-middle third (clear of the
// YouTube Shorts UI at the bottom and right edge).
import React from "react";
import "@fontsource/luckiest-guy/400.css";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Episode, FPS } from "./episode";

type W = { w: string; s: number; e: number };
const groupsOf = (ep: Episode) => {
  const out: W[][] = [];
  for (const sc of ep.scenes) {
    let g: W[] = [];
    for (const w of sc.words ?? []) {
      g.push(w);
      const end = /[.,!?;:…]$/.test(w.w) || g.length >= 3 || (g.length >= 2 && g.map((x) => x.w).join(" ").length > 14);
      if (end) { out.push(g); g = []; }
    }
    if (g.length) out.push(g);
  }
  return out;
};
const cache = new WeakMap<Episode, W[][]>();

export const Captions: React.FC<{ ep: Episode }> = ({ ep }) => {
  const f = useCurrentFrame(), t = f / FPS;
  let gs = cache.get(ep);
  if (!gs) { gs = groupsOf(ep); cache.set(ep, gs); }
  const g = gs.find((x, i) => t >= x[0].s - 0.04 && t < (gs![i + 1]?.[0].s ?? x[x.length - 1].e + 0.5) - 0.04 && t < x[x.length - 1].e + 0.6);
  if (!g) return null;
  const age = t - g[0].s, pop = Math.min(1, Math.max(0, age / 0.09));
  const scale = 0.86 + 0.14 * pop + 0.04 * Math.sin(Math.min(1, age / 0.2) * Math.PI);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", top: "61%", pointerEvents: "none" }}>
      <div style={{ fontFamily: "'Luckiest Guy', sans-serif", fontSize: 92, lineHeight: 1.05, textAlign: "center", maxWidth: 900,
        transform: `scale(${scale})`, letterSpacing: 1, textTransform: "uppercase" }}>
        {g.map((w, i) => {
          const on = t >= w.s - 0.03 && t < (g[i + 1]?.s ?? w.e + 0.4);
          return (
            <span key={i} style={{ color: on ? "#ffe14d" : "#ffffff", WebkitTextStroke: "14px #1a1020", paintOrder: "stroke fill",
              textShadow: "0 8px 0 rgba(20,10,30,0.55)", marginRight: i < g.length - 1 ? 22 : 0, display: "inline-block" }}>
              {w.w.replace(/[",“”]/g, "")}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
