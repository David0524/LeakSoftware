# Tidemark brand guide

Status: name, palette, type, and logo final.

## Name

**Tidemark**: one word, capital T only. Not "TideMark", "Tide Mark", or "Tide-Mark". All caps
(TIDEMARK) only in small uppercase labels. A tidemark is the line water leaves where its level
drops: what a leak shop finds. Renamed from LeakBook on 2026-10-13 (owner).

## Positioning

- **Audience:** owners and techs at 1–5 truck pool leak detection shops.
- **Promise:** the inspection is documented, defensible, and turns into paid repair work.
- **Tone:** plain, sturdy, trade-literate. Like a good gauge or a work truck decal. No mascots, gradients, or startup gloss.
- **Copy voice:** short sentences, trade terms techs actually use (held, dropped, excluded, isolate, plug). Buttons say exactly what happens ("Send Report", "Add Finding").
- **Capitalization (iOS convention):** Title Case for buttons, segment labels, alert buttons, and screen titles; sentence case for everything else.

## White-label rule

Reports, quotes, invoices, and the customer payment page carry the **shop's** logo and colors. Tidemark appears there only as a small "Powered by Tidemark" line in the footer. Tidemark's own palette applies to the tech app, the office web app, sign-in, and marketing.

## Color ("Work Truck")

| Token | Hex | Use |
|---|---|---|
| Navy | `#12263A` | Headers, primary text, app icon background |
| Water | `#1F6FAE` | Info, logo pin. Links and focus rings use a slightly deeper `#1A63A0` so small text passes 4.5:1 on the page background (M11 review) |
| Safety | `#EE6A1F` | Primary action button, logo dot. Use sparingly. |
| Concrete | `#E9ECEF` | App background |
| Paper | `#FFFFFF` | Cards, surfaces, documents |

**Contrast rule:** never put white text on Safety orange (3.1:1, too faint in sun). Primary buttons are orange with **navy** text (4.9:1), which also reads like hi-vis signage.

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
```

Copy the results into the apps: `apps/web/public/tidemark-{logo,logo-reverse,mark}.svg`,
`apps/web/src/app/icon.svg` (favicon) and `apple-icon.png`, and `apps/mobile/assets/`
(`icon.png` ← `icon-1024.png`, `android-icon-foreground.png` ← `adaptive-foreground-1024.png`,
`android-icon-monochrome.png` ← `adaptive-monochrome-1024.png`, `favicon.png` ←
`favicon-48.png`, `splash-icon.png` ← `splash-mark-400.png`).

### Files (`logo/`)

| File | Use |
|---|---|
| `tidemark-logo.svg` | Horizontal logo on light backgrounds. Default. |
| `tidemark-logo-reverse.svg` | Horizontal logo on navy or dark photos |
| `tidemark-logo-black.svg` | One color: fax, stamps, engraving, single-color print |
| `tidemark-mark.svg` | Mark only on light backgrounds: water blue, dot and lines cut out |
| `tidemark-mark-reverse.svg` | Mark only on navy: white pin, orange dot, water-blue lines |
| `tidemark-mark-black.svg` / `-white.svg` | One color: embroidery, vinyl decals. Dot and wave lines are cut out. |
| `tidemark-app-icon.svg` | iOS / store icon (navy square, no rounded corners) |
| `tidemark-adaptive-foreground.svg` | Android adaptive icon foreground. Background color: Navy. |
| `tidemark-adaptive-monochrome.svg` | Android themed (monochrome) icon |
| `tidemark-favicon.svg` | Browser tab. Uses the small-size cut. |
| `png/` | Ready-made PNG exports of the above, including splash and email sizes |

### Rules

- **Clear space:** keep empty space around the logo at least the width of the dot.
- **Minimum size:** horizontal logo 120 px wide (1 in printed); mark 16 px tall. Below 48 px use the favicon's small-size cut (thicker, wider-spaced wave lines, bigger dot).
- **Wordmark:** Barlow Semi Condensed ExtraBold, outlined. "Tide" navy, "mark" water blue on light; all white on dark; all black for one color.
- **Do not:** recolor the pin outside the brand colors, add shadows or gradients, outline the mark, stretch it, set the wordmark in another font, or put the full-color mark on a busy photo.
- **Powered by:** customer documents use `tidemark-mark.svg` at 16–20 px next to "Powered by Tidemark" in Public Sans, in the footer only.

## Field usability

- Minimum tap target 48 px (gloves, wet hands).
- Body text at least 16 px in the field app.
