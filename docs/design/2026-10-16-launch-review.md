# Design review: screens added or changed 2026-10-15 to 2026-10-16

Pre-launch pass (CLAUDE.md: one full review before the pilot) over this week's work, with the
apple-design skill (`accessibility.md`, `layout.md`, `typography.md`, `color.md`,
`designing-for-ios.md`, `designing-for-macos.md`, `sheets.md`, `menus.md`, `writing.md`,
`text-fields.md`).

**Screens:** website at 390 pt (iPhone user agent) and 1400 px, light and dark: Messages (list,
conversation, desktop split view, hover button, right-click menu), the job's Messages group, the
chemical calculator (docked bar, sheet, desktop side panel), Settings › Phone and Texting with
On My Way, sign-up with the package choice, the Dashboard landing, Today, More. Phone app: the
changed screens by code (Messages swipe, the calculator's bar and page sheet), not on a device.

**Artifacts:** screenshots from a local production build against the dev project; contrast
computed from `brand/tokens.json`, not estimated from images.

## Summary

**Good.** No Critical findings. One accessibility failure (High) and one interaction gap
(Medium) were fixed. The thesis holds: a field tool that reads like an iPhone app, with brand
color spent on the primary actions and the logo. The signature moment this week is the
calculator's docked What to Add bar, which reads like a jobsite instruction ("½ jug muriatic
acid · 1 more") rather than a chart.

## Fixed

- **High: the calculator's green "OK" pills were 3.96:1** (`#1B7D45` on a 12% tint over the
  sheet's `#F2F2F7`), under the 4.5:1 that 15 pt text needs.
  `accessibility.md › Vision`: "Up to 17 pts · All · 4.5:1"; `color.md › Inclusive color`:
  "insufficient contrast can cause icons and text to blend with the background". Lighter tints
  only reached 4.29:1, so the pills now sit on white with a 40% outline in their color (light: green
  5.2:1, amber 5.9:1; dark: 6.3:1 and 7.3:1).
- **Medium: the conversation list's right-click menu didn't work from the keyboard.** The menu
  key opened it at the window's top-left corner, and the arrow keys didn't move between items.
  Judgment (and WCAG 2.1.1): a menu that opens from the keyboard must be usable from it. It now opens beside the row
  and Up/Down move through the items. Escape and clicking outside already closed it.
- **Medium: the calculator's jug fractions jumped.** 47 fl oz read "¼ jug" while 48 fl oz read
  "½ jug". `writing.md › Best practices`: "Consistency builds familiarity". Under one jug, thirds are now
  offered too, so both read "⅓ jug".
- **Low: Save buttons didn't match** on Phone and Texting: On My Way's was full width, the
  others were pills. All are pills now.

## Kept on purpose

- **Placeholder contrast is 1.7:1 (light) and 2.5:1 (dark).** This is iOS's own
  `placeholderText` (30% label), and the owner asked for it on 2026-10-16 so examples never read
  as typed values. Every field keeps a visible label, so no information depends on the
  placeholder (`text-fields.md › Best practices`: "it can also be useful to include a separate label
  describing the field").
- **On desktop, Messages opens the newest conversation and marks it read**, as Messages on the
  Mac does. Marking it unread again sticks until a new message arrives.

## What works

- Tab bar on phones: five tabs, Messages with a badge, filled symbol when selected. Customers is a segment inside Messages, so the bar never needs More for daily
  work.
- Every new way to change unread has an equivalent for each input: swipe (touch), a hover button
  and a context menu (mouse), a focusable button (keyboard), and Mark as Unread in the
  conversation (VoiceOver), so the swipe is never the only way (house rule).
- The calculator's sheet has a grabber, swipes down to close, has a Close button, and holds one
  short task (`sheets.md`). The phone app uses the native page sheet with Done on the trailing
  edge.
- Contrast elsewhere: muted text 5.1:1 (light) and 7.1:1 (dark); links 6.3:1 and 7.1:1; amber
  status 4.5:1 and up.

## Not checked

- The phone app on a real device (VoiceOver order in the new sheet, the swipe's haptics). Add
  them to the TestFlight pass.
