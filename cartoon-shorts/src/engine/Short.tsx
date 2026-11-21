// The episode renderer: one three.js world (world.ts) posed per frame from the episode timeline, with the bridge
// short's post chain: InkPass -> lens blur pre + main -> bloom -> NEUTRAL tone map -> grade (MSAA 4).
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Episode, sceneAt } from "./episode";
import { dofAt } from "./camera";

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};
const fwd = new THREE.Vector3();

const Inner: React.FC<{ ep: Episode; i: number }> = ({ ep, i }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(ep), [ep]);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
  }), [camera, scene]);
  useEffect(() => () => { (fx.ink as unknown as { dispose?: () => void }).dispose?.(); }, [fx]);
  const post = useMemo(() => (
    <EffectComposer multisampling={4}>
      <primitive object={fx.ink} dispose={null} />
      <primitive object={fx.lens.pre} dispose={null} />
      <primitive object={fx.lens.main} dispose={null} />
      <primitive object={fx.bloom} dispose={null} />
      <primitive object={fx.tone} dispose={null} />
      <primitive object={fx.grade} dispose={null} />
    </EffectComposer>
  ), [fx]);
  const cam = camera as THREE.PerspectiveCamera;
  const target = world.update(i, f, cam, scene);
  noInkFallback(world.root);
  cam.getWorldDirection(fwd);
  fx.lens.focus = Math.max(0.3, target.clone().sub(cam.position).dot(fwd));
  fx.lens.cInf = dofAt(ep, i);
  gradeFor(fx.grade, ep.scenes[i].light ?? "day");
  return (<><primitive object={world.root} dispose={null} />{post}</>);
};

const dprOverride = () => (getInputProps() as { dpr?: number }).dpr;
export const Short: React.FC<{ episode: Episode }> = ({ episode }) => {
  const f = useCurrentFrame();
  const i = sceneAt(episode, f);
  const s = episode.scenes[i];
  const fa = f - (s.a ?? 0);
  const flash = s.flash && fa >= 0 && fa < 4 ? [1, 0.75, 0.45, 0.2][fa] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      <AbsoluteFill>
        <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows
          gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }} camera={{ fov: 40, near: 0.2, far: 1500 }}>
          <Inner ep={episode} i={i} />
        </ThreeCanvas>
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
