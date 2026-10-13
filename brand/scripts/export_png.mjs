// Render Tidemark logo SVGs to PNG with headless Chromium (Playwright).
// Run: node brand/scripts/export_png.mjs
// Uses require so a globally installed Playwright works via NODE_PATH.
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logo = join(root, "logo");
const out = join(logo, "png");

// [source svg, output png, width in px]
const jobs = [
  ["tidemark-app-icon.svg", "icon-1024.png", 1024],
  ["tidemark-adaptive-foreground.svg", "adaptive-foreground-1024.png", 1024],
  ["tidemark-adaptive-monochrome.svg", "adaptive-monochrome-1024.png", 1024],
  ["tidemark-favicon.svg", "favicon-16.png", 16],
  ["tidemark-favicon.svg", "favicon-32.png", 32],
  ["tidemark-favicon.svg", "favicon-48.png", 48],
  ["tidemark-app-icon.svg", "apple-touch-icon-180.png", 180],
  ["tidemark-mark.svg", "mark-512.png", 512],
  ["tidemark-mark-reverse.svg", "mark-reverse-512.png", 512],
  ["tidemark-mark-reverse.svg", "splash-mark-400.png", 400],
  ["tidemark-mark-black.svg", "mark-black-512.png", 512],
  ["tidemark-logo.svg", "logo-1200.png", 1200],
  ["tidemark-logo-reverse.svg", "logo-reverse-1200.png", 1200],
  ["tidemark-logo.svg", "logo-email-480.png", 480],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [src, dest, width] of jobs) {
  const svg = await readFile(join(logo, src), "utf8");
  const [, , vw, vh] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(" ")
    .map(Number);
  const height = Math.round((width * vh) / vw);
  await page.setViewportSize({ width, height });
  const sized = svg.replace(/width="[^"]+" height="[^"]+"/, `width="${width}" height="${height}"`);
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: join(out, dest), omitBackground: true });
  console.log("wrote", dest, `${width}x${height}`);
}

await browser.close();
