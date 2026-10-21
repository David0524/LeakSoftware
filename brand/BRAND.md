# Sundeck Pro brand guide

Status: name, palette, type, and logo final.

## Name

**Sundeck Pro**: two words, capital S and P. Not "SunDeck Pro", "Sun Deck Pro", or "Sundeck
PRO". All caps (SUNDECK PRO) only in small uppercase labels. "Sundeck" alone is fine in
running text once the full name has appeared. Renamed from Tidemark on 2026-10-18 (owner),
and from LeakBook before that (2026-10-13). The drop-pin mark with its water line stays.

## Positioning

- **Audience:** owners and techs at 1–5 truck pool leak detection shops.
- **Promise:** the inspection is documented, defensible, and turns into paid repair work.
- **Tone:** plain, sturdy, trade-literate. Like a good gauge or a work truck decal. No mascots, gradients, or startup gloss.
- **Copy voice:** short sentences, trade terms techs actually use (held, dropped, excluded, isolate, plug). Buttons say exactly what happens ("Send Report", "Add Finding").
- **Capitalization (iOS convention):** Title Case for buttons, segment labels, alert buttons, and screen titles; sentence case for everything else.

## White-label rule

Reports, quotes, invoices, and the customer payment page carry the **shop's** logo and colors. Sundeck Pro appears there only as a small "Powered by Sundeck Pro" line in the footer. Sundeck Pro's own palette applies to the tech app, the office web app, sign-in, and marketing.

## Color ("Work Truck")

| Token | Hex | Use |
|---|---|---|
| Navy | `#12263A` | Headers, primary text, app icon background |
| Water | `#1F6FAE` | Info, logo pin. Links and focus rings use a slightly deeper `#1A63A0` so small text passes 4.5:1 on the page background (M11 review) |
| Safety | `#EE6A1F` | Logo dot and brand accents: a display highlight, the marketing site's Start Free Trial. Use sparingly. |
| Concrete | `#E9ECEF` | App background |
| Paper | `#FFFFFF` | Cards, surfaces, documents |

**Buttons (owner, 2026-10-15):** primary buttons in the app and on customer pages are filled blue with white text (`#1A63A0`, 6.3:1; dark mode `#2B78B8`, 4.7:1), the same blue as links and tinted buttons, as on iOS: one accent color, filled for the main action and tinted for the rest. Orange stays the brand accent: the logo dot, a display highlight, and on the marketing site the Start Free Trial button, at most one per screenful.

**Contrast rule:** never put white text on Safety orange (3.1:1, too faint in sun). Orange buttons carry **navy** text (4.9:1).

### Status colors (fixed, never rebranded)

| Status | Hex | Meaning |
|---|---|---|
| Pass | `#1B7D45` | Line held, item inspected OK |
| Fail | `#C62F2B` | Leak found, line dropped |
| Excluded | `#5B6B7A` | Not inspected, reason recorded. Neutral, not a warning. |
| Warning | `#8A5A0E` | Needs attention: unsynced data, missing signature (deepened from `#9A6210` in the M11 review for 4.5:1 on the page background) |
| Info | `#1F6FAE` | Neutral notices |

Status is always shown with a text label too (HELD, FAIL, EXCLUDED), never by color alone.

### Themes

- **Field app:** light theme by default. Dark screens wash out in direct sun.
- **Office web app:** light and dark. Dark values are in `tokens.json` under `role.dark`.

`tokens.json` is the source of truth. `packages/tokens` generates the TypeScript object and the web CSS/Tailwind theme from it (`pnpm tokens`).

## Type

- **Barlow Semi Condensed** (600/700/800): page titles and headings, documents, and the wordmark.
- **Public Sans** (400–700): everything else. Use tabular numbers (`font-variant-numeric: tabular-nums`) for PSI, inches, minutes, and money.
- **Website on Apple devices** (owner, 2026-10-14: "feel like Apple"): body text, buttons, and controls use the system font (San Francisco); Public Sans is the fallback everywhere else. Titles stay in Barlow.
- Both are free (OFL) and bundled in the app so they work offline.

## Logo ("Drop pin")

A map pin drawn as an upside-down water drop with two parallel wave lines across it (the
tide mark, where the water level sits) and a round dot above them. It shows what the tech
does: pins the leak on the pool diagram.

- **On light backgrounds:** water-blue pin; the dot and the wave lines are cut out.
- **On navy:** white pin, safety-orange dot, and the wave lines filled water blue.
- **One color:** solid pin with the dot and lines cut out.

The mark was concepted as images (`logo/concept/tidemark-*.webp`, 2026-10-13; the earlier
`chatgpt-*` files are the first LeakBook concept) and rebuilt as exact vector geometry by
`scripts/build_logo.py`. Edit the script, not the SVGs, then run:

```
python3 brand/scripts/build_logo.py   # SVGs (needs: pip install fonttools)
node brand/scripts/export_png.mjs      # PNGs for the app, favicon, email
node brand/scripts/export_logo_code.mjs # the horizontal logo as vector paths for the native apps
```

The native apps draw the horizontal logo from those paths (`apps/ios/.../SundeckLogoArt.swift`,
`apps/mobile/src/ui/sundeckLogoArt.ts`): at the top left of each tab's own page (Today, Jobs,
Schedule, Messages, More; owner, 2026-10-21), 24 pt tall, the reverse lockup in dark mode. The
website's phone bar uses the SVG files the same way.

Copy the results into the apps: `apps/web/public/sundeck-{logo,logo-reverse,mark}.svg`,
`apps/web/src/app/icon.svg` (favicon) and `apple-icon.png`, and `apps/mobile/assets/`
(`icon.png` ← `icon-1024.png`, `android-icon-foreground.png` ← `adaptive-foreground-1024.png`,
`android-icon-monochrome.png` ← `adaptive-monochrome-1024.png`, `favicon.png` ←
`favicon-48.png`, `splash-icon.png` ← `splash-mark-400.png`).

### Files (`logo/`)

| File | Use |
|---|---|
| `sundeck-logo.svg` | Horizontal logo on light backgrounds. Default. |
| `sundeck-logo-reverse.svg` | Horizontal logo on navy or dark photos |
| `sundeck-logo-black.svg` | One color: fax, stamps, engraving, single-color print |
| `sundeck-mark.svg` | Mark only on light backgrounds: water blue, dot and lines cut out |
| `sundeck-mark-reverse.svg` | Mark only on navy: white pin, orange dot, water-blue lines |
| `sundeck-mark-black.svg` / `-white.svg` | One color: embroidery, vinyl decals. Dot and wave lines are cut out. |
| `sundeck-app-icon.svg` | iOS / store icon (navy square, no rounded corners) |
| `sundeck-adaptive-foreground.svg` | Android adaptive icon foreground. Background color: Navy. |
| `sundeck-adaptive-monochrome.svg` | Android themed (monochrome) icon |
| `sundeck-favicon.svg` | Browser tab. Uses the small-size cut. |
| `png/` | Ready-made PNG exports of the above, including splash and email sizes |

### Rules

- **Clear space:** keep empty space around the logo at least the width of the dot.
- **Minimum size:** horizontal logo 120 px wide (1 in printed); mark 16 px tall. Below 48 px use the favicon's small-size cut (thicker, wider-spaced wave lines, bigger dot).
- **Wordmark:** Barlow Semi Condensed ExtraBold, outlined. "Tide" navy, "mark" water blue on light; all white on dark; all black for one color.
- **Do not:** recolor the pin outside the brand colors, add shadows or gradients, outline the mark, stretch it, set the wordmark in another font, or put the full-color mark on a busy photo.
- **Powered by:** customer documents use `sundeck-mark.svg` at 16–20 px next to "Powered by Sundeck Pro" in Public Sans, in the footer only.

## Field usability

- Minimum tap target 48 px (gloves, wet hands).
- Body text at least 16 px in the field app.
