// Google Play store graphics (docs/play-store/README.md), drawn from the generated logo SVGs and
// brand/tokens.json with headless Chromium (Playwright), like export_png.mjs:
//   docs/play-store/graphics/icon-512.png          the store icon (512 x 512, full square;
//                                                  Play rounds the corners itself)
//   docs/play-store/graphics/feature-graphic.png   the feature graphic (1024 x 500)
// Run: node brand/scripts/build_play_graphics.mjs
// Uses require so a globally installed Playwright works via NODE_PATH.
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");

const brand = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(brand, "..", "docs", "play-store", "graphics");
const tokens = JSON.parse(await readFile(join(brand, "tokens.json"), "utf8"));
const { navy, water, paper } = tokens.color.brand;

const font = async (file) => (await readFile(join(brand, "fonts", file))).toString("base64");
const fontFaces = `
  @font-face { font-family: "Barlow Semi Condensed"; font-weight: 700;
    src: url(data:font/ttf;base64,${await font("BarlowSemiCondensed-Bold.ttf")}) format("truetype"); }
  @font-face { font-family: "Public Sans"; font-weight: 500;
    src: url(data:font/ttf;base64,${await font("PublicSans-Medium.ttf")}) format("truetype"); }`;

/** An SVG from brand/logo, resized to the given width. */
async function logoSvg(file, width) {
  const svg = await readFile(join(brand, "logo", file), "utf8");
  const [, , vw, vh] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(" ")
    .map(Number);
  const height = Math.round((width * vh) / vw);
  return svg.replace(/width="[^"]+" height="[^"]+"/, `width="${width}" height="${height}"`);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Store icon: the app icon (navy square, the reverse mark) at 512.
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(
  `<html><body style="margin:0">${await logoSvg("sundeck-app-icon.svg", 512)}</body></html>`,
);
await page.locator("svg").screenshot({ path: join(out, "icon-512.png") });
console.log("wrote icon-512.png 512x512");

// Feature graphic: navy, the reverse logo, one plain line under it. Flat color only (no
// gradients or shadows, BRAND.md); the logo keeps clear space well beyond its dot's width.
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<html><head><style>${fontFaces}
  html, body { margin: 0; width: 1024px; height: 500px; background: ${navy}; }
  main { box-sizing: border-box; width: 1024px; height: 500px; padding: 0 96px;
    display: flex; flex-direction: column; justify-content: center; gap: 36px; }
  .line { font: 500 34px/1.3 "Public Sans"; color: ${paper}; margin: 0; max-width: 760px; }
  .rule { width: 72px; height: 6px; background: ${water}; border-radius: 3px; }
</style></head><body><main>
  ${await logoSvg("sundeck-logo-reverse.svg", 520)}
  <div class="rule"></div>
  <p class="line">Routes, checklists, reports, and invoices for pool service and leak detection crews.</p>
</main></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: join(out, "feature-graphic.png"),
  clip: { x: 0, y: 0, width: 1024, height: 500 },
});
console.log("wrote feature-graphic.png 1024x500");

await browser.close();
