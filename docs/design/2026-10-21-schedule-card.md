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
- **Line 1:** the time (bold, tabular) and the customer's name as a link (brand link color, a
  trailing "›", a 44 pt tall hit area around the line). "No time" when there isn't one.
  **Only the name opens the job** (owner, 2026-10-21: "I find myself accidentally opening jobs
  all the time"); a tap anywhere else on the card does nothing, and no tap fires right after a
  drag or a scroll. VoiceOver's activate action on the card still opens it.
- **Line 2, secondary text, one line, truncated:** the kind of visit (or the second tech's note,
  "With Dana"), then the street only ("5024 W Las Palmaritas Dr", no city or ZIP).
- **Trailing, small icons only for exceptions,** before the grip:
  - a lock when the day or time is locked;
  - the not-on-map warning symbol;
  - a filter symbol when a cleaning is due on the visit;
  - a status label only when the stop isn't plain Scheduled (In Progress, Done), in the line 1
    trailing spot instead of the icons.
- **The grip (≡)** at the trailing edge, 44 × 44 pt: the only place a drag starts.
- **Needs a Time cards** show no status label (everything there is unscheduled), keep "⋯"
  (Suggest Times, Move…) and the grip, and give the name the room it needs, one line, cut short
  only past what those leave. Each card is as wide as the box less a 12 pt peek of the next, so
  the sideways row shows one full card and the edge of the next, never a half-cut card.

**Off the card:** the job number, the access notes, the Move… button, the tappable address and
the cleanings row. Move…, Lock Day, Lock Time, Take Off Schedule and Directions are in the card's
touch-and-hold menu (and VoiceOver/TalkBack actions); the job page has everything else. Each icon
has an accessibility label ("Time locked", "Not on the map", "Filter cleaning due").

Height about 64 pt at the default text size; it grows with larger text, never clips.

## Dragging: the cards make room

- **Drag from the grip only** (owner, 2026-10-21: "I'm still struggling to scroll when I have a
  page full of job tiles"). The card lifts the moment the grip is touched, with a light haptic;
  a finger anywhere else on the card scrolls the page, and touch and hold there opens the card's
  menu. Week rows and Needs a Time cards also start their drag (to another day or tech) from the
  grip only. VoiceOver/TalkBack keep Move Up and Move Down.
- The picked-up card lifts (slight scale and shadow) and follows the finger. The page doesn't
  scroll or turn while it's lifted, and always scrolls again however the drag ends (let go,
  cancelled by the system, a second finger, the screen changing).
- The other cards in that day **slide up or down into their new places as the card passes
  them**, with a spring, so the gap is always where the card will land. There is never a card
  under the one being dragged.
- Let go: the card settles into the gap and the new order saves; times follow the Schedule's
  move rule as now. A failed save slides everything back and shows the error.
- **Drop on Needs a Time takes the stop off its day** (owner, 2026-10-21: "I can't drag jobs
  back into the 'Needs a Time' box"), the same as Take Off Schedule: while the card is over the
  box, the box shows a link-colored ring and the day's other cards close no gap; let go and the
  card fades away there. Only when the box is on screen, and only for a stop that hasn't started.
- Dragging over another day in the date strip or the week, or another tech's column, still
  moves the stop there, as now.
- Reduce Motion: no spring; cards jump to their places.
