// The hype cut's page: loads the look and its manifest (build/hype/manifest.json, written by
// src/render-hype.ts), builds every shot, and exposes window.__seek(frame) like the long film's
// page (main.ts). Unlike the long film, film grain lives inside the photo shots only, never over
// the app's screens.

import { allImages, setManifest, type Manifest } from "./assets.ts";
import { pending } from "./devices.ts";
import { Stage, div, preload } from "./engine.ts";
import { STYLES, loadLook } from "./look.ts";
import { buildHype, type HypeManifest } from "./hype.ts";

async function start() {
  const manifest = (await (await fetch("/build/hype/manifest.json")).json()) as HypeManifest;
  // The shared asset helpers read the same fields; only the timeline's shape differs.
  setManifest(manifest as unknown as Manifest);
  await loadLook();
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);
  const root = div("", document.body);
  root.id = "stage";
  const stage = new Stage(root);
  const tl = manifest.timeline;
  buildHype(stage, manifest);

  await preload(allImages());
  window.__fps = tl.fps;
  window.__total = Math.ceil(tl.total * tl.fps);
  window.__seek = async (frame: number) => {
    pending.length = 0;
    stage.draw(frame / tl.fps);
    await Promise.all(pending);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  window.__ready = true;
}

start().catch((e: Error) => {
  window.__error = `${e.message}\n${e.stack ?? ""}`;
});
