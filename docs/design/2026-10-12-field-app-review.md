# Design review: LeakBook field app (M4)

Reviewed with the Apple Design skill (Apple Human Interface Guidelines, pinned to upstream commit
`904b0ee`). Platform: iPhone first, React Native (Expo). Artifact: the source in `apps/mobile`;
contrast is computed from the hex values in `brand/tokens.json`.

## Summary

A field tool for pool leak techs: the screen's job is to record what was checked, what was found,
and where, one-handed, in sun, often offline. The thesis holds: plain navy-and-concrete chrome,
orange reserved for the one primary action, and the pool diagram with severity-colored pins as the
signature element. Rating before fixes: **Needs work** (one High contrast issue, type one step
under the platform default, view switching built from generic pills). All High and Medium
findings below are fixed in this change; the dark-mode trade-off is kept deliberately.

## Improvements

- **High: field and choice outlines too faint.** Input and pill borders were `#D3D9DF` on white,
  1.42:1, close to invisible outdoors. Fix: borders use `neutral-500 #5A6875`, 5.72:1
  (`color.controlBorder`). `accessibility.md › Vision`: "it's important that there's enough
  contrast between foreground text and icons and background colors."
- **Medium: body text one step below the iOS default.** Body was 16 pt, secondary 14 pt. Fix:
  body and strong 17/22, small and muted 15/20, matching Body and Subhead in
  `typography.md › Specifications` (Large default: Body 17, Subhead 15). Text still scales with
  the system setting (React Native scales custom fonts by default).
- **Medium: view switching used wrapping pills.** Checklist/Tests/Findings/Report, checklist
  status, test outcome, finding severity and status, and New Job "When" now use a segmented
  control: one row, equal widths. `segmented-controls.md › Best practices`: "Consider a
  segmented control to switch between closely related subviews" and "no more than about five
  segments on iPhone." Longer lists (methods, reasons, pool shapes, pool type) stay as
  wrapping choices.
- **Medium: "+ Add skimmer" tap area about 42 pt.** Fix: 44 pt minimum height plus hit slop.
  `accessibility.md › Mobility`: iOS default control size 44x44 pt.
- **Medium: one state, two names.** The checklist choice said "Not inspected" while the chip
  said "EXCLUDED". Fix: "Excluded" everywhere. Judgment, following the skill's writing lens: an
  action keeps its name through the flow.
- **Low: capitalization.** Buttons, segment labels, alert buttons, and screen titles now use
  title-style capitalization ("Add Finding", "Save Test"); running text and messages stay in
  sentence case. `buttons.md › Content` and `segmented-controls.md › Content` call for
  title-style capitalization; `writing.md › Best practices`: "Adopt capitalization rules that
  align with your app's style, then apply them consistently."

## Craft notes

- **Signature:** the top-down pool diagram with numbered pins colored by severity. It belongs to
  this product and will carry onto the reports (M7). Keep it the only illustrative element.
- **Restraint:** orange appears only on the primary button;
  `branding.md › Best practices`: "Apply your app's accent color judiciously." Keep it that way.
- **Typography:** Barlow Semi Condensed carries the brand in headings and buttons; Public Sans
  does the reading. Good split. Watch Barlow at small sizes; nothing below 12 pt uses it.

## What works

- Contrast: body text 12.98:1, primary button navy on orange 4.92:1, every status and outcome
  chip at or above 5.09:1 with a text label (never color alone).
- One primary action per screen, pinned within thumb reach (New Job at the bottom).
- Destructive actions use the danger style, never the primary one, and confirm with a Cancel
  (`buttons.md`: don't give a destructive action the primary role).
- Empty states say what to do next; errors say how to fix them.
- Offline state is always visible in the sync bar, in words, not just a color.

## Platform notes

- **Light only, on purpose.** The field app does not follow Dark Mode. `dark-mode.md` asks apps
  to look good in both appearances; dark screens wash out in direct sun, and techs use this
  outdoors. Trade-off accepted for the field app (BRAND.md); the office website supports both.
  Revisit if techs ask for it at night jobs.
- **No tab bar.** One main list with Settings in the header is enough at this size; revisit
  when Schedule (M8) adds a second top-level section, which should become a tab bar
  (`tab-bars.md`).
- **Android:** the segmented control and buttons are shared designs, not Material components.
  Acceptable for a small field tool; check on an Android device before launch (M11).
