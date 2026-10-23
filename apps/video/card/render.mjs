// Renders the laminate card (run from apps/video): node card/render.mjs [front|back] [scale]
// Writes out/card-<side>.png (trimmed, for sharing) and out/card-<side>-bleed.png; card/pdf.py
// turns the bleed PNG into the print PDF (6.25 x 8.25 in, 0.125 in bleed).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const side = process.argv[2] ?? "front";
const scale = Number(process.argv[3] ?? 2);
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
  path: `${out}/card-${side}.png`,
  clip: { x: 37.5, y: 37.5, width: 1800, height: 2400 },
});
await browser.close();
console.log(`out/card-${side}.png`);
