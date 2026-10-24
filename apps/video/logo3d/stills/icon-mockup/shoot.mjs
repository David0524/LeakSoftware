// Screenshots the iOS 26 icon mockup (mockup.html) with Playwright: a Home Screen at real size
// (393 x 852 pt at 3x, so the icon is 192 px as on an iPhone) and the icon alone at 1024 px,
// for each look. The glass layers come from stills.py (the logo-stills workflow's icon/ folder).
//
//   node apps/video/logo3d/stills/icon-mockup/shoot.mjs LAYERS_DIR OUT_DIR [DROP]
//
// DROP is frost or pearl for the white drop variants (files named -<drop>); omitted, the
// clear glass drop.
//
// Uses the repo's Playwright (PW_CHROMIUM_PATH picks a Chromium binary if set).
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../../web/package.json"));
const { chromium } = require("@playwright/test");

const [layersArg, outArg, drop] = process.argv.slice(2);
const sfx = drop ? `-${drop}` : "";
const layers = resolve(layersArg);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
// The page loads layers/ next to itself, so the layers are copied beside a copy of it.
const work = join(out, ".page");
mkdirSync(join(work, "layers"), { recursive: true });
copyFileSync(join(here, "mockup.html"), join(work, "mockup.html"));
for (const f of readdirSync(layers)) copyFileSync(join(layers, f), join(work, "layers", f));

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const look of ["default", "dark", "clear"]) {
  for (const [mode, w, h, scale] of [
    ["home", 393, 852, 3],
    ["large", 1024, 1024, 1],
  ]) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: scale,
    });
    const url =
      pathToFileURL(join(work, "mockup.html")).href +
      `?look=${look}&mode=${mode}${drop ? `&drop=${drop}` : ""}`;
    await page.goto(url);
    await page.waitForFunction(() =>
      [...document.images].every((i) => i.complete && i.naturalWidth),
    );
    const name = mode === "home" ? `home-${look}${sfx}.png` : `icon-${look}${sfx}-1024.png`;
    await page.screenshot({ path: join(out, name), omitBackground: true });
    await page.close();
    console.log(name);
  }
}
await browser.close();
