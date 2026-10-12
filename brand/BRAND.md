# LeakBook brand guide

Status: name, palette, type, and logo direction decided. Final logo mark pending (see `logo/PROMPTS.md`).

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

Requirements for the final mark:
- One or two flat colors. No gradients, shadows, or thin lines.
- Legible at 16 px (favicon) and as an app icon.
- Works as one solid color (embroidery, vinyl decal, stamp).

Lockups:
- **Horizontal:** mark + "LeakBook" wordmark (Barlow Semi Condensed ExtraBold; "Leak" navy, "Book" water blue on light; all white on dark).
- **Mark only:** app icon, favicon, "Powered by" footer.

Files (drafts until final): `logo/leakbook-mark-draft.svg`, `logo/leakbook-app-icon-draft.svg`.

## Field usability

- Minimum tap target 48 px (gloves, wet hands).
- Body text at least 16 px in the field app.
