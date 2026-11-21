import React from "react";
import { Composition, registerRoot } from "remotion";
import { Short } from "./engine/Short";
import type { Episode } from "./engine/episode";

const EMPTY: Episode = { slug: "empty", title: "empty", cast: {}, scenes: [{ line: "", set: "town", a: 0, b: 60 }], total: 60 };
const Root: React.FC = () => React.createElement(Composition, {
  id: "Short", component: Short as unknown as React.FC<Record<string, unknown>>, fps: 30, width: 1080, height: 1920, durationInFrames: 60,
  defaultProps: { episode: EMPTY },
  calculateMetadata: ({ props }: { props: Record<string, unknown> }) => {
    const ep = props.episode as Episode;
    return { durationInFrames: Math.max(1, ep.total ?? ep.scenes[ep.scenes.length - 1].b ?? 60) };
  },
});
registerRoot(Root);
