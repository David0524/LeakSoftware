// Renders the laminate card (run from apps/video): node card/render.mjs [front|back] [scale]
// Writes out/card-<side>-half1.png and -half2.png (the top and bottom of the card with its
// bleed, 6.25 x 8.25 in); python3 card/finish.py <side> joins them into the ultra PNG (7200 x
// 9600 at the default scale 4, sharp blown up to poster size), the bleed PNG, the share JPEG
// and the print PDF. Two halves because Chromium leaves the bottom of one screenshot taller
// than its largest texture (8192) unpainted. card/background.py makes the water at 4x.
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
// The card with its bleed is 1875 x 2475; each half is 1237.5 tall.
const page = await browser.newPage({
  viewport: { width: 1875, height: 1238 },
  deviceScaleFactor: scale,
});
await page.goto(`file://${here}/${side}.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState("networkidle");
for (const [i, y] of [0, 1237.5].entries()) {
  await page.evaluate((y) => {
    document.documentElement.style.transform = `translateY(${-y}px)`;
  }, y);
  await page.screenshot({ path: `${out}/card-${side}-half${i + 1}.png` });
}
await browser.close();
console.log(`out/card-${side}-half1.png, out/card-${side}-half2.png (scale ${scale})`);
