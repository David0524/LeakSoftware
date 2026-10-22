# Checklist on phones: one line per item, answers as icons

Owner, 2026-10-22: "In the mobile checklist, it's too easy to accidentally click on the item and
expand the screen. I think we consider going back to the dropdown (saves vertical space too)
unless you have a better idea." Of two sketches (`2026-10-22-checklist-options.png`) the owner first
chose A (dropdown), then: "Wait hold on. I actually like your icons. Let's go with that. Consider
that we'll need different icons for leaks vs maintenance vs pool inspections." So this is **B · One
tap, icons**, with A's pill kept as the fallback for answers that have no clear icons.

## What changed (phone website below `sm`, iPhone, Android)

- Each item is one line: its name (with its sub-line under it), then its answers as icon pills, one
  tap each, then a small "›" (44 pt) that opens the item's own screen (method, notes, photos).
- **The name opens nothing.** Tapping it was the accident. Touch and hold the row still opens its
  menu (every answer and Not Done), and the swipes stay (right for the first answer, left to
  Remove on iPhone).
- The chosen icon is filled in its status color; the others are gray. Tapping the chosen one again
  clears it (back to to do), as the segments did.
- The sub-line starts with the chosen answer's word ("Leaking · 1 photo · Visual"), so the icons
  are learnable without a legend. Each icon button is labeled with its full answer for VoiceOver
  and TalkBack ("Not Leaking", selected), with a hover title on the website.
- Where under a Leaking or Attention item, why an item was left out, Mark N Remaining (and Undo),
  Add an item and Edit are unchanged.
- **Desktop website: unchanged** (full labeled segmented answers).

Targets: each icon is 40 x 36 inside a 44 x 44 target; targets touch but don't overlap. Four
answers take 176 pt, so a 390 pt phone leaves the name about 100 pt and longer names wrap to two
lines (as in the sketch).

## Icons, from the answer's meaning (one rule: `packages/core/src/answer-icons.ts`)

Ported to Swift (`SundeckCore/AnswerIcons.swift`) and checked against fixtures
(`apps/ios/Tests/Fixtures/answer-icons.json`), so all platforms draw the same icon for the same
answer. Glyphs are SF Symbols on iPhone and the same shapes in SVG on the website and Android.

| Answer set | Answers (config labels) | Icons (SF Symbol) | Chosen color |
| --- | --- | --- | --- |
| Leak items | Not Leaking / Leaking / Attention / N/A | checkmark / drop.fill / exclamationmark / minus | green / red / amber / gray |
| Maintenance (`done`) | Done / Needs Attention / Skipped | checkmark / exclamationmark / forward.end.fill | green / amber / gray |
| Yes/no items | No / Yes / N/A | xmark / checkmark / minus | green / amber / gray (No is the good answer) |
| Pool inspection, choice | Yes / No / Not applicable (or N/A) | checkmark / xmark / minus | from the option's flag; blue when it has none |
| Pool inspection, other flagged options | flag ok / leaking / attention / na | checkmark / drop.fill / exclamationmark / minus | green / red / amber / gray |

Why Skipped is ⏭ and not the N/A dash: skipping a cleaning this visit is a choice the tech made,
not "doesn't apply"; ⏭ is the familiar skip sign and keeps the dash meaning "not applicable".

Why yes/no reads its words: a check for "No" would contradict the label; the color carries the
meaning (on "Any visible leaking?", No is green).

**Fallback (A's pill):** a choice question whose options don't map cleanly (more than four, an
option with neither a yes/no/N/A word nor a flag, or two options with the same icon) shows its
answer as one tinted pill ("Choose ⌄" in link blue until answered) that opens a menu of the
options, with Not Done once answered. Today that's "What type of filtration system is present?"
and "What type of timeclock is present?". Multi-answer questions keep their chips under the name,
and text questions their text box. Pool inspection questions keep Describe and the camera on
their line; they have no item screen, so no "›".

## Website note

The website has no item screen (method, notes and photos are edited on the phone apps), so the
phone website's line has no "›". The "⋯" row button stays on desktop only; on a phone, touch and
hold opens the same menu.

## Screenshots checked

Phone (390) and desktop (1440), from a local build against the dev project: a leak job, a
maintenance visit, and a pool inspection (with the fallback menu open). Answers changed for the
shots were put back; the temporary inspection job was deleted.
