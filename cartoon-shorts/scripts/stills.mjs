// node scripts/stills.mjs <episode.json> <outPrefix> <f,f,...> [scale]  -> jpg stills (software WebGL)
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const [epPath, prefix, frames, scale = "0.5"] = process.argv.slice(2);
const episode = JSON.parse(fs.readFileSync(epPath, "utf8"));
const browserExecutable = process.env.CHROME || "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const chromiumOptions = { gl: "swangle" };
const inputProps = { episode, dpr: Number(scale) };
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "Short", inputProps, browserExecutable, chromiumOptions, timeoutInMilliseconds: 300000 });
const onBrowserLog = (l) => { if (l.type === "error") console.log("[err]", l.text.slice(0, 400)); };
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, frame: f, output: `${prefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale), inputProps,
    browserExecutable, chromiumOptions, timeoutInMilliseconds: 600000, onBrowserLog });
  console.log("still", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
