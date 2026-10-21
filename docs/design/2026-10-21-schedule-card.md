# Schedule cards: calmer, and they make room as you drag

Owner, 2026-10-21: "The scheduling drag and drop is still weird. I am still slotting the moved
card on top of the old one. The cards should slide into new positions as I dangle the tile.
Redesign those tiles too. They look super busy."

Applies to every schedule card on every platform: Day's stops, Week's rows and Needs a Time on
the iPhone, Android, the phone website and the desktop website.

## The card: two lines

```
▍ ①  9:00 AM  Rebecca Soto                    🔒 ≡
▍    Leak detection · 5024 W Las Palmaritas Dr
```

- **Leading edge:** the tech's color stripe (4 pt), then the stop number badge (its status
  color as now).
- **Line 1:** the time (bold, tabular) and the customer's name in the normal text color.
  "No time" when there isn't one. The name is not a link: the whole card opens the job.
- **Line 2, secondary text, one line, truncated:** the kind of visit (or the second tech's note,
  "With Dana"), then the street only ("5024 W Las Palmaritas Dr", no city or ZIP).
- **Trailing, small icons only for exceptions,** before the grip:
  - a lock when the day or time is locked;
  - the not-on-map warning symbol;
  - a filter symbol when a cleaning is due on the visit;
  - a status label only when the stop isn't plain Scheduled (In Progress, Done), in the line 1
    trailing spot instead of the icons.
- **The grip (≡)** at the trailing edge, as now.

**Off the card:** the job number, the access notes, the Move… button, the tappable address and
the cleanings row. Move…, Lock Day, Lock Time, Take Off Schedule and Directions are in the card's
touch-and-hold menu (and VoiceOver/TalkBack actions); the job page has everything else. Each icon
has an accessibility label ("Time locked", "Not on the map", "Filter cleaning due").

Height about 64 pt at the default text size; it grows with larger text, never clips.

## Dragging: the cards make room

- Drag from the grip, or touch and hold anywhere on the card, then drag.
- The picked-up card lifts (slight scale and shadow) and follows the finger.
- The other cards in that day **slide up or down into their new places as the card passes
  them**, with a spring, so the gap is always where the card will land. There is never a card
  under the one being dragged.
- Let go: the card settles into the gap and the new order saves; times follow the Schedule's
  move rule as now. A failed save slides everything back and shows the error.
- Dragging over another day in the date strip or the week, another tech's column, or Needs a
  Time still moves the stop there, as now.
- Reduce Motion: no spring; cards jump to their places.
