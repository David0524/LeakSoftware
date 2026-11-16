// Renders the 6 x 9 mailer (run from apps/video): node card/mailer.mjs [scale]
// Writes out/mailer-front-bleed.png and out/mailer-back-bleed.png, 9.25 x 6.25 in with the
// bleed (5550 x 3750 at the default scale 2, 600 per inch). One screenshot each: at scale 2 the
// page stays under Chromium's largest texture (8192). Make the water first:
//   python3 card/background.py card/mailer-bg.png 5550 3750 2
// then python3 card/mailer_finish.py for the trimmed PNGs, share JPEGs and the print PDF.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scale = Number(process.argv[2] ?? 2);
const out = resolve(here, "../out");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
// The mailer with its bleed is 2775 x 1875 design units.
const page = await browser.newPage({
  viewport: { width: 2775, height: 1875 },
  deviceScaleFactor: scale,
});
for (const side of ["front", "back"]) {
  await page.goto(`file://${here}/mailer-${side}.html`);
  await page.waitForLoadState("networkidle");
  for (const frame of page.frames()) await frame.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/mailer-${side}-bleed.png` });
  console.log(`out/mailer-${side}-bleed.png (scale ${scale})`);
}
await browser.close();
