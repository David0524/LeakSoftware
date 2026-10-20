# Today's card, as Apple would design it

Owner, 2026-10-20: "For the new today hero, consider iOS and Swift principles. As if designed by
Apple." Earlier the same day: remove "Next Stop in Apple Maps" (the card has Directions), move
Call and Directions so the card is shorter, and add Message.

Reviewed with the apple-design skill (`accessibility.md`, `layout.md`, `typography.md`,
`color.md`, `designing-for-ios.md`, `buttons.md`, `live-activities.md`). One spec for the
website, the iPhone app and the Android app.

## What the card is for

One glance answers: where am I, what's next, what do I tap. The customer's name is the card.
Everything else supports it, and there is one main action.

## Findings from the first version (TestFlight 1009)

| Finding | Why | Fix |
| --- | --- | --- |
| Secondary text is white at 85% on water blue `#1F6FAE`: about 4.3:1 | Text up to 17 pt needs 4.5:1 (`accessibility.md`) | White at 92%: about 4.8:1 |
| "0 of 8" is as large as the name | One thing leads (`layout.md`: hierarchy) | Figure 22 pt semibold, label 13 pt under it |
| "At Derek Jeter" over "Derek Jeter" | Says it twice | Headline names the moment: Up next, On the way, At the pool |
| The address is underlined like a web link | iOS doesn't underline tappable text | Plain text with a map pin; tapping it still opens directions |
| Open Checklist and Mark Complete are different widths | "Use style — not size — to visually distinguish the preferred choice" (`buttons.md › Style`) | Equal widths; the white one is the main action |
| Call and Directions sat on their own row | Height without information | Message, Call, Directions on the Next line |
| "Next Stop in Apple Maps" under the title | Duplicates the card's Directions | Removed |
| The Now row in the list also says In progress, cutting the name to "Derek…" | The card already says it | The Now row shows only "Now" |
| The card changes without motion | "Use animations to reinforce the information" (`live-activities.md`) | Numbers roll, text cross-fades; none with Reduce Motion |

## Layout

```
┌──────────────────────────────────────────────┐  radius 22, padding 20 (16 on phones < 375 pt)
│ At the pool · Stop 2 of 3            0 of 8  │  15 pt semibold 92% · 22 pt semibold
│ Derek Jeter                        Checklist │  28 pt Barlow ExtraBold · 13 pt 92%
│ Maintenance                                  │  15 pt 92%
│                                              │  12
│ 📍 1000 W Charleston Blvd, Las Vegas ⚠       │  17 pt white, map pin 15 pt; ⚠ when not on map
│ 🔑 Side gate code 4821                        │  15 pt
│ 🧽 Overdue · 🧂 2 weeks                       │  15 pt medium; overdue a white pill
│ 📝 Dog is friendly. Pays by check.           │  15 pt, two lines at most
│                                              │  12
│ Next: Wayne Gretzky          (💬)(📞)(➤)    │  15 pt 92%; round buttons 44 pt
│                                              │  16
│ [  Open Checklist  ] [  Mark Complete  ]     │  equal widths, 50 pt tall, capsules
│                                              │  16
│ ━━━━━━━━━━  ━━━━━━━━━━  ──────────           │  segments 4 pt tall, 4 pt apart
└──────────────────────────────────────────────┘
```

- **Top line:** the moment, with the stop count only when the figure doesn't show it (core
  `heroTopLine`, gestures.md section 10): "Up next" beside a "2 of 3 · Stop" figure, "At the
  pool · Stop 2 of 3" on site. No clock times anywhere on the card. The job type moves
  under the name on its own line ("Maintenance"), with the drive before leaving: "Leak
  detection · 14 min drive".
- **Name:** 28 pt Barlow ExtraBold, up to two lines, then truncates. It opens the job.
- **Figure:** top-right, 22 pt semibold with tabular numbers, label under it: before arriving
  the stop's place in the day ("2 of 5", "Stop"), on site the checklist ("4 of 9"), then ✓. With the largest
  text sizes the figure moves under the name (the card's top becomes one column).
- **Details:** address, access notes, cleanings due, customer notes. Each line starts with a
  15 pt symbol in a 20 pt column so the text lines up: `mappin.and.ellipse`, `key.fill`, the
  first cleaning's symbol, `note.text`.
- **Cleanings due** (owner, 2026-10-20: "The filter/salt cell cleaning alert needs to be on the
  new Today tile and the live activity"): the visit's filter and salt cell cleanings as an icon
  and a short label each ("Filter Overdue · Salt cell 2 weeks" reads as 🧽 Overdue · 🧂 2 weeks),
  soonest first, 15 pt medium white. The first icon sits in the symbol column; the others sit
  before their labels. Overdue is a white pill with water-blue semibold text, so it stands out
  without a new color. VoiceOver reads each one in full ("Clean filter due in 3 days"). Shown
  until the stop is done, never on a done card or the day-done card. The Live Activity shows
  the same badges, and its spoken sentence ends with them.
- **Not on the map** is only a warning symbol (`exclamationmark.triangle.fill`, 17 pt) right
  after the address, read aloud as "Not found on the map" (owner, 2026-10-20: "just put a little
  error symbol next to the address. Don't waste space with text"). The same symbol, alone, after
  the address on Today's rows and Schedule's cards; the job page keeps its full explanation.
- **Customer notes** (owner, 2026-10-20: "you have to have customer notes there"): the
  customer's notes, then the pool's, joined with " · ", two lines at most.
- **Next line:** "Next: Wayne Gretzky" (no time), then Message, Call, Directions as 44 pt
  circles (white at 18%, white 20 pt symbols: `message.fill`, `phone.fill`,
  `location.fill`), 8 apart. Without a next stop, the circles sit alone at the right.
- **Buttons:** one row, equal widths, 50 pt tall capsules, 10 apart. The main action is white
  with water-blue text (17 pt semibold); the other is white at 18% with white text. A single
  button fills the row. Pressed: 0.96 scale and 85% opacity, with a light tap on success.
- **Progress:** one segment per stop: done white, this stop white at 70%, still to come white at
  28%. VoiceOver reads "1 of 3 stops done".

## Behavior

- **One element for VoiceOver** that reads the Live Activity's sentence, then the buttons in
  order: main action, second action, Message, Call, Directions, Open Job.
- **When the moment changes** (On My Way, Start Job, Mark Complete): the figure rolls to its new
  value and the text cross-fades in 0.3 s; with Reduce Motion, it changes without motion.
- **Owners looking at a tech's day:** no On My Way or Start Job; Message, Call and Directions stay.
- **Day done:** "All 3 stops done", ✓ as the figure, "Day done" under it, no buttons and no
  clock times.
- **Dark mode:** the card keeps water blue (it's the app's signature, like the Live Activity).
- The card stays a solid color in the content layer, never glass (`liquid-glass.md`).

## Tokens

- Card: `color.brand.water` `#1F6FAE`; text white; secondary white at 92%.
- Main button: white with `color.brand.water` text; second button and circles: white at 18%.
- No other colors on the card. The amber key, which needed a hardcoded color, stays white.
