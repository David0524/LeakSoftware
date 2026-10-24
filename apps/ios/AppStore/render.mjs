// Renders the App Store screenshots from frame.html: node apps/ios/AppStore/render.mjs <manifest>
// The manifest (written by compose.py) lists each shot's title, subtitle, prepared screen and
// output path. Brand colors come from brand/tokens.json. Playwright is borrowed from apps/web
// (no new dependency): set PW_CHROMIUM_PATH if Chromium isn't at /opt/pw-browsers/chromium.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tokens = JSON.parse(readFileSync(resolve(root, "brand/tokens.json"), "utf8")).color;
const colors = {
  "--bg": tokens.brand.navy,
  "--title": tokens.brand.paper,
  "--subtitle": tokens.neutral[200],
  "--bezel": tokens.role.dark.header,
  "--rim": tokens.neutral[600],
  "--screen": tokens.role.light.bg,
};

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({
  viewport: { width: 1320, height: 2868 },
  deviceScaleFactor: 1,
});
await page.goto(pathToFileURL(resolve(here, "frame.html")).href);
await page.evaluate((vars) => {
  for (const [name, value] of Object.entries(vars))
    document.documentElement.style.setProperty(name, value);
}, colors);
for (const shot of manifest) {
  await page.evaluate((s) => window.show(s), {
    title: shot.title,
    subtitle: shot.subtitle,
    screen: pathToFileURL(shot.screen).href,
    logo: shot.logo ? pathToFileURL(resolve(root, shot.logo)).href : null,
  });
  await page.screenshot({ path: shot.out, clip: { x: 0, y: 0, width: 1320, height: 2868 } });
  console.log(shot.out);
}
await browser.close();
