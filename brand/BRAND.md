# LeakBook brand guide

Status: name, palette, type, and logo final.

## Name

**LeakBook**: one word, capital L and capital B.
Not "Leak Book", "Leakbook", or "Leak-Book". All caps (LEAKBOOK) only in small uppercase labels.

## Positioning

- **Audience:** owners and techs at 1–5 truck pool leak detection shops.
- **Promise:** the inspection is documented, defensible, and turns into paid repair work.
- **Tone:** plain, sturdy, trade-literate. Like a good gauge or a work truck decal. No mascots, gradients, or startup gloss.
- **Copy voice:** short sentences, trade terms techs actually use (held, dropped, excluded, isolate, plug). Buttons say exactly what happens ("Send report", "Add finding").

## White-label rule

Reports, quotes, invoices, and the customer payment page carry the **shop's** logo and colors. LeakBook appears there only as a small "Powered by LeakBook" line in the footer. LeakBook's own palette applies to the tech app, the office web app, sign-in, and marketing.

## Color ("Work Truck")

| Token | Hex | Use |
|---|---|---|
| Navy | `#12263A` | Headers, primary text, app icon background |
| Water | `#1F6FAE` | Links, focus rings, info, logo pin |
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
| Warning | `#9A6210` | Needs attention: unsynced data, missing signature |
| Info | `#1F6FAE` | Neutral notices |

Status is always shown with a text label too (HELD, FAIL, EXCLUDED), never by color alone.

### Themes

- **Field app:** light theme by default. Dark screens wash out in direct sun.
- **Office web app:** light and dark. Dark values are in `tokens.json` under `role.dark`.

## Type

- **Barlow Semi Condensed** (600/700/800): headings, labels, buttons, status chips, wordmark.
- **Public Sans** (400–700): everything else. Use tabular numbers (`font-variant-numeric: tabular-nums`) for PSI, inches, minutes, and money.
- Both are free (OFL) and bundled in the app so they work offline.

## Logo ("Drop pin")

A map pin drawn as an upside-down water drop, with a waterline across it and a safety-orange dot. It shows what the tech does: pins the leak on the pool diagram.

The mark was concepted in ChatGPT (`logo/concept/`) and rebuilt as exact vector geometry by `scripts/build_logo.py`. Edit the script, not the SVGs, then run:

```sh
python3 brand/scripts/build_logo.py   # SVGs (needs: pip install fonttools)
node brand/scripts/export_png.mjs     # PNGs (needs Playwright + Chromium)
```

### Files (`logo/`)

| File | Use |
|---|---|
| `leakbook-logo.svg` | Horizontal logo on light backgrounds. Default. |
| `leakbook-logo-reverse.svg` | Horizontal logo on navy or dark photos |
| `leakbook-logo-black.svg` | One color: fax, stamps, engraving, single-color print |
| `leakbook-mark.svg` | Mark only, full color, on light backgrounds |
| `leakbook-mark-reverse.svg` | Mark only on navy or dark backgrounds |
| `leakbook-mark-black.svg` / `-white.svg` | One color: embroidery, vinyl decals. Dot and wave are cut out. |
| `leakbook-app-icon.svg` | iOS / store icon (navy square, no rounded corners) |
| `leakbook-adaptive-foreground.svg` | Android adaptive icon foreground. Background color: Navy. |
| `leakbook-favicon.svg` | Browser tab. Uses the small-size cut. |
| `png/` | Ready-made PNG exports of the above, including splash and email sizes |

### Rules

- **Clear space:** keep empty space around the logo at least the width of the orange dot.
- **Minimum size:** horizontal logo 120 px wide (1 in printed); mark 16 px tall. Below 48 px use the favicon's small-size cut (thicker wave, bigger dot).
- **Wordmark:** Barlow Semi Condensed ExtraBold, outlined. "Leak" navy, "Book" water blue on light; all white on dark; all black for one color.
- **Do not:** recolor the pin outside the brand colors, add shadows or gradients, outline the mark, stretch it, set the wordmark in another font, or put the full-color mark on a busy photo.
- **Powered by:** customer documents use `leakbook-mark.svg` at 16–20 px next to "Powered by LeakBook" in Public Sans, in the footer only.

## Field usability

- Minimum tap target 48 px (gloves, wet hands).
- Body text at least 16 px in the field app.
