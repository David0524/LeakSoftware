// Home Screen launch images (apple-touch-startup-image) for the website, so opening Tidemark
// from an iPhone's or iPad's Home Screen shows the page color and the mark instead of a white
// flash. Light and dark, portrait, one per screen size. Colors come from brand/tokens.json
// (the page background, role.light.bg and role.dark.bg); the mark from brand/logo.
//
// Run: node brand/scripts/build_splash.mjs
// Writes apps/web/public/splash/*.png and apps/web/src/app/splash.json (the list layout.tsx
// turns into <link rel="apple-touch-startup-image"> tags). Uses the website's Playwright;
// set PW_CHROMIUM_PATH to use a preinstalled Chromium (cloud sessions: /opt/pw-browsers/chromium).
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = join(repo, "apps", "web");
const { chromium } = createRequire(join(web, "package.json"))("@playwright/test");

const tokens = JSON.parse(await readFile(join(repo, "brand", "tokens.json"), "utf8"));
const themes = [
  { name: "light", bg: tokens.color.role.light.bg, mark: "tidemark-mark.svg" },
  { name: "dark", bg: tokens.color.role.dark.bg, mark: "tidemark-mark-reverse.svg" },
];

// Portrait screens in CSS points, with their pixel ratio. A launch image only shows when its
// media query matches the device exactly, so each size the site supports needs its own.
const screens = [
  // iPhone
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [420, 912, 3], // Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12 Pro Max, 13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 12 Pro, 13, 13 Pro, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd and 3rd generation), 8
  // iPad
  [1032, 1376, 2], // Pro 13-inch (M4)
  [1024, 1366, 2], // Pro 12.9-inch, Air 13-inch
  [834, 1210, 2], // Pro 11-inch (M4)
  [834, 1194, 2], // Pro 11-inch
  [820, 1180, 2], // Air 10.9-inch, iPad 10th generation
  [810, 1080, 2], // iPad 10.2-inch
  [744, 1133, 2], // mini (6th generation and later)
];

// The mark's width in points, the same on every screen (it is 100 x 146.3 in its SVG).
const MARK_WIDTH = 88;

const out = join(web, "public", "splash");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const images = [];
for (const theme of themes) {
  const svg = (await readFile(join(repo, "brand", "logo", theme.mark), "utf8")).replace(
    /width="[^"]+" height="[^"]+"/,
    `width="${MARK_WIDTH}" height="${Math.round((MARK_WIDTH * 146.3) / 100)}"`,
  );
  for (const [w, h, ratio] of screens) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: ratio,
    });
    await page.setContent(
      `<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${theme.bg}">${svg}</body></html>`,
    );
    const file = `${theme.name}-${w * ratio}x${h * ratio}.png`;
    await page.screenshot({ path: join(out, file) });
    await page.close();
    images.push({
      url: `/splash/${file}`,
      media:
        `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio})` +
        ` and (orientation: portrait) and (prefers-color-scheme: ${theme.name})`,
    });
  }
}
await browser.close();

await writeFile(join(web, "src", "app", "splash.json"), `${JSON.stringify(images, null, 2)}\n`);
let total = 0;
for (const f of await readdir(out)) total += (await readFile(join(out, f))).length;
console.log(`wrote ${images.length} launch images, ${(total / 1024).toFixed(0)} KB`);
