// The promo code handout card (owner, 2026-11-23: the pool meetup's CANNONBALL90), a standard
// 3.5 x 2 in business card, front and back, with 1/8 in bleed (3.75 x 2.25 in pages). The QR
// opens the sign-up link that carries the code (https://sundeckpro.com/sign-up?code=<CODE>),
// so the sign-up form shows the offer and the trial page applies it. Run from apps/video:
//
//   node card/promo-card.mjs CANNONBALL90 "3 Months Free" [out dir]
//
// The code and the headline are parameters, so another code gets its card the same way; the
// headline is the offer in Title Case, as Admin › Codes shows it ("3 months free"). Writes
// promo-<CODE>.pdf (two pages, vector, with bleed; no crop marks) and promo-<CODE>-front.png,
// -back.png previews (trimmed, 600 dpi) to out/ unless given a directory. Colors come from
// brand/tokens.json, fonts from brand/fonts, the logo from brand/logo. Orange appears once: the
// logo's dot on the front. Not the laminate card or the mailer (card/render.mjs, mailer.mjs):
// those are 6.25 x 8.25 and 6 x 9 in pieces; this one goes in a hand at a meetup.
import { chromium } from "playwright-core";
import QRCode from "qrcode";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = resolve(here, "../../../brand");
const [rawCode, headline = "3 Months Free", outArg] = process.argv.slice(2);
// As the website reads it (core normalizeCode): any case, spaces and punctuation dropped.
const code = (rawCode ?? "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
if (!/^[A-Z0-9]{3,24}$/.test(code)) {
  console.error('Usage: node card/promo-card.mjs <CODE> ["3 Months Free"] [out dir]');
  process.exit(1);
}
const url = `https://sundeckpro.com/sign-up?code=${code}`;
const out = resolve(outArg ?? resolve(here, "../out"));
mkdirSync(out, { recursive: true });

const tokens = JSON.parse(readFileSync(`${brand}/tokens.json`, "utf8"));
const { navy, water, paper } = tokens.color.brand;
const muted = tokens.color.role.light.textMuted;
// The website's own words (apps/web/src/app/(public)/page.tsx, the home page's share preview).
const TAGLINE = "Find it. Fix it. Get paid.";
const ABOUT =
  "One app for the whole pool shop: routes, checklists, reports, quotes and payments, on iPhone, Android and the web.";

// Error correction M; the module color is the brand navy on white. The card's white margin
// around it is the quiet zone (more than 4 modules).
const qr = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 0,
  color: { dark: navy, light: "#FFFFFF" },
});

const font = (family, file, weight) =>
  `@font-face { font-family: "${family}"; src: url("file://${brand}/fonts/${file}"); font-weight: ${weight}; }`;
const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Sundeck Pro ${code} card</title><style>
${font("Barlow", "BarlowSemiCondensed-ExtraBold.ttf", 800)}
${font("Barlow", "BarlowSemiCondensed-Bold.ttf", 700)}
${font("Public Sans", "PublicSans-Regular.ttf", 400)}
${font("Public Sans", "PublicSans-SemiBold.ttf", 600)}
@page { size: 3.75in 2.25in; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 3.75in; }
body { font-family: "Public Sans"; color: ${navy}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* One page per side: the bleed is the outer 1/8 in, the safe area 1/8 in inside the trim. */
.side { position: relative; width: 3.75in; height: 2.25in; overflow: hidden; break-after: page; }
.safe { position: absolute; inset: 0.25in; }
.front { background: ${navy}; color: ${paper}; }
.front .safe { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.front img { width: 2.3in; display: block; }
.front .tagline { margin-top: 0.13in; font-family: Barlow; font-weight: 700; font-size: 13pt; letter-spacing: 0.01em; }
.front .about { margin-top: 0.05in; font-size: 6.6pt; line-height: 1.35; opacity: 0.85; max-width: 2.7in; }
.back { background: ${paper}; }
.back .safe { display: flex; align-items: center; gap: 0.18in; }
.back .words { flex: 1; min-width: 0; }
.back h1 { font-family: Barlow; font-weight: 800; font-size: 21pt; line-height: 1; color: ${water}; white-space: nowrap; }
.back .label { margin-top: 0.12in; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${muted}; }
.back .code { font-family: Barlow; font-weight: 800; font-size: 22pt; line-height: 1.05; white-space: nowrap; letter-spacing: 0.01em; }
.back .site { margin-top: 0.1in; font-size: 7.5pt; line-height: 1.35; }
.back .site b { font-weight: 600; }
.back .qr { width: 1.05in; flex: none; }
.back .qr svg { width: 1.05in; height: 1.05in; display: block; }
.back .scan { margin-top: 0.05in; font-size: 6pt; text-align: center; color: ${muted}; }
</style></head><body>
<section class="side front"><div class="safe">
  <img src="file://${brand}/logo/sundeck-logo-reverse.svg" alt="Sundeck Pro" />
  <p class="tagline">${TAGLINE}</p>
  <p class="about">${ABOUT}</p>
</div></section>
<section class="side back"><div class="safe">
  <div class="words">
    <h1>${headline}</h1>
    <p class="label">Use code</p>
    <p class="code">${code}</p>
    <p class="site">Start your free trial at <b>sundeckpro.com</b></p>
  </div>
  <div class="qr">${qr}<p class="scan">Scan to sign up</p></div>
</div></section>
</body></html>`;

const page = `${out}/promo-${code}.html`;
writeFileSync(page, html);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const tab = await browser.newPage({
  viewport: { width: 360, height: 432 },
  deviceScaleFactor: 6.25,
});
await tab.goto(`file://${page}`);
await tab.evaluate(() => document.fonts.ready);
// A long code or headline shrinks to fit its column rather than running under the QR.
const overflow = await tab.evaluate(() => {
  const fit = (el) => {
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.parentElement.clientWidth && size > 8) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    return el.scrollWidth > el.parentElement.clientWidth;
  };
  return [...document.querySelectorAll(".back h1, .back .code")].some(fit);
});
if (overflow) console.warn("Warning: the code or headline is still too wide for the card.");
await tab.pdf({
  path: `${out}/promo-${code}.pdf`,
  width: "3.75in",
  height: "2.25in",
  printBackground: true,
});
// Previews at the trim (3.5 x 2 in), 600 dpi: what the cut card looks like.
for (const [i, side] of ["front", "back"].entries()) {
  await tab.screenshot({
    path: `${out}/promo-${code}-${side}.png`,
    clip: { x: 12, y: i * 216 + 12, width: 336, height: 192 },
  });
}
await browser.close();
console.log(
  `${url}\n${out}/promo-${code}.pdf\n${out}/promo-${code}-front.png\n${out}/promo-${code}-back.png`,
);
