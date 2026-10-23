// The film's page: loads the look and the manifest, builds every shot, and exposes
// window.__seek(frame), which draws one frame and resolves once its images are decoded.

import { allImages, setManifest, type Manifest } from "./assets.ts";
import { pending } from "./devices.ts";
import { Stage, div, preload } from "./engine.ts";
import { STYLES, loadLook } from "./look.ts";
import { buildFilm } from "./shots.ts";

declare global {
  interface Window {
    __seek: (frame: number) => Promise<void>;
    __ready: boolean;
    __error?: string;
    __total: number;
    __fps: number;
  }
}

async function start() {
  const manifest = (await (await fetch("/build/manifest.json")).json()) as Manifest;
  setManifest(manifest);
  await loadLook();
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);
  const root = div("", document.body);
  root.id = "stage";
  const stage = new Stage(root);
  const tl = manifest.timeline;
  buildFilm(stage, tl);

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
