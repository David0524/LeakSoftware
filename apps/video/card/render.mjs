// Renders the laminate card (run from apps/video): node card/render.mjs [front|back] [scale]
// At the default scale 4: out/card-<side>-ultra.png (7200 x 9600, the trimmed card, sharp
// blown up to poster size) and out/card-<side>-bleed.png; then python3 card/finish.py <side>
// makes the share JPEG and the print PDF. card/bg.png must be made at the same scale
// (python3 card/background.py card/bg.png 7500 10000 for scale 4).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const side = process.argv[2] ?? "front";
const scale = Number(process.argv[3] ?? 4);
const out = resolve(here, "../out");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({
  viewport: { width: 1875, height: 2500 },
  deviceScaleFactor: scale,
});
await page.goto(`file://${here}/${side}.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${out}/card-${side}-bleed.png` });
await page.screenshot({
  path: `${out}/card-${side}-ultra.png`,
  clip: { x: 37.5, y: 37.5, width: 1800, height: 2400 },
});
await browser.close();
console.log(`out/card-${side}-ultra.png`);
