# Schedule: hold to drag, 5 Days | 7 Days, Optimize at once with Undo

Owner, 2026-10-22, from a UX review. Applies to the desktop website, the phone website, the
iPhone app and the Android app unless a section says otherwise. Updates the dragging rules in
`2026-10-21-schedule-card.md` and `2026-10-21-schedule-tile.md`.

## 1. Press and hold, then drag, anywhere on a stop's tile

"Press-and-hold-then-drag on any tile, keeping the grip as a backup" (Jakob's Law: Reminders and
Things let you hold a row, then drag it).

- **Phones (iPhone, Android, phone website):** touch and hold a stop's tile for **0.4 s** and it
  lifts, with the same light haptic as the grip; then it drags exactly like a grip drag (the
  others slide, another day's block or Needs a Time takes it, nothing stays lifted).
  - A quick tap does what it did (only the name opens the job).
  - A swipe up or down scrolls the page: moving more than 8 pt before the 0.4 s lets the page
    have the touch.
  - The grip lifts the tile after a brief rest, not a hold (section 1a).
- **Desktop website:** press the mouse anywhere on the tile except the name link and the
  buttons, and move it 6 px: the drag starts. A plain click does nothing; the name still opens
  the job; a press on the name never drags. The grip stays.
- **Which tiles:** the stops on a day, in Day and Week (Week's "No tech yet" rows too). Needs a
  Time's cards are unchanged: their grip drags, touch and hold opens their menu, "⋯" stays.
  Stops that can't move (started, done) keep touch and hold for their menu.

### The menu: on "⋯" (decision)

iOS can't give the same hold both a context menu and a custom drag cleanly: a SwiftUI context
menu and a long-press drag compete for the touch, and the system drag (`onDrag`) can't slide the
other tiles aside or tell the tile when a drag ends outside a drop target (the "stuck" drags the
owner reported on 2026-10-21). So, as the owner allowed: **hold = drag, and the tile's menu is on
its "⋯" button** on every platform, so they all work the same way.

- "⋯" sits before the grip on every stop tile: iPhone (a pull-down menu with the kind of visit and
  the customer as its title), Android (the same sheet the hold opened), and the website (it was
  already there; desktop Week's narrow cells show it on touch screens only, where right click
  isn't there).
- Held and let go without moving, the tile settles back where it was.
- Desktop: right click, the menu key and Shift+F10 still open the menu.
- VoiceOver and TalkBack keep the menu's actions, Move Up and Move Down.

Hold length: 0.4 s on every platform, from core `SCHEDULE_DRAG.holdMs` (website `HOLD_MS`,
Android `STOP_HOLD_MS`, iPhone `ScheduleReorder.holdSeconds`).

## 1a. The grip waits for a resting finger, never a flick

Owner, 2026-10-22: "It's slightly too easy to slide jobs around in the schedule when flicking to
scroll. I like the hamburger drag but make it slightly less sensitive. I'm not even looking for a
tap and hold, but it just needs to avoid flicks and anything else unintentional."

A finger on the grip (≡) no longer lifts the job the moment it lands. Touch only, on the phone
website, the iPhone app and the Android app (and a touch screen on a computer); a mouse or
trackpad still drags from the grip at once.

- **Rest, then drag:** the job lifts once the finger has rested on the grip for **0.13 s**,
  moving less than **8 pt** (short enough not to feel like a hold); from then on it drags as
  before, with the same haptic.
- **A flick or a scroll is the page's:** a finger that moves more than 8 pt before the 0.13 s is
  a scroll. The page (or Needs a Time's row) scrolls and the job stays put, so a fast flick that
  starts on the grip never moves a job.
- **The tile's hold uses the same slop:** moving more than 8 pt before the 0.4 s is a scroll, so
  a slow scroll never turns into a drag.
- **Never while the page glides:** a finger that lands while the page is still scrolling (a
  flick's momentum) only stops it; it doesn't lift a job, however long it rests there.

One set of numbers in core, `SCHEDULE_DRAG` (`packages/core/src/schedule-drag.ts`: `gripDwellMs`
130, `holdMs` 400, `slopPt` 8, `scrollSettleMs` 100), checked on the iPhone through the
`schedule` fixtures (`ScheduleDrag` in SundeckCore):

- **Website:** one finger sensor (`FingerSensor` in `route-board.tsx`) waits 0.13 s on the grip,
  0.4 s on a stop's tile and 0.25 s on a Customers to Add tile, each within 8 px, and refuses a
  touch that lands within 0.1 s of a scroll. The grip no longer has `touch-action: none`, so the
  browser scrolls a flick from it. Mice and pens keep the grip's at-once drag (`GripSensor`).
- **iPhone:** the grip's drag is the same UIKit long press as the tile's (`HoldDrag`), 0.13 s on
  the grip, 0.4 s on the tile, 8 pt of drift; it doesn't begin when the finger lands on a scroll
  view that is still decelerating.
- **Android:** the grip's and the tile's pans activate after a long press (0.13 s and 0.4 s) and
  fail past 8 dp; a touch within 0.1 s of the page scrolling fails at once.

Today's Reorder handle is separate code and unchanged: Reorder is a mode of its own, where the
handle is the only way to move a stop.

## 2. Desktop Week: 5 Days | 7 Days

The narrow "Sat Sun ›" column is gone. A segmented control, **"5 Days | 7 Days"** (our segment
style, Title Case), sits in the week's section title row at its right, beside Optimize Week, so
it adds no row of its own.

- 5 Days: the shop's work days, plus today and any day with stops on it (as before). The label
  counts what it shows ("6 Days" when a Saturday has stops).
- 7 Days: every day of the week.
- Hidden when both would show the same days.
- Remembered in this browser (`schedule.weekend`, the key the old column used).
- Phones' Week already lists every day: unchanged.

## 3. Optimize shows the new order at once, with Undo

"Make Optimize show the new order at once, with Undo." Optimize (a day's route) and Optimize
Week, every platform:

- The stops slide to their new order the moment it's pressed, with the same slide as a drag.
- The banner at the top says what was saved: **"Optimized · 42 min less driving"**, or
  **"Already the best order"** when the order stays (no Undo then), with **Undo**, which slides
  the old order back and saves it ("Put back as it was.").
- If the save fails, the old order comes back and the banner says so, with "The order is as it
  was." (Optimize Week: "The week is as it was.") under the reason.

How each platform does it:

- **Website:** the browser works the new order out from the jobs on the page with the built-in
  drive estimate (`lib/schedule-preview.ts`, the same rules as the server) and shows it while the
  server plans and saves with the shop's real drive times; the server's answer then confirms or
  corrects it. Optimize now returns the saved values for Undo (`planRoute` › `undoPlanRoute`).
- **iPhone and Android:** Optimize was already worked out and saved on the phone through the sync
  layer (row and outbox in one transaction), so the order shows at once; they gain Undo (the
  saved values, written back through the sync layer), "Already the best order", and the failure
  line. Optimize Week already saved locally with Undo.
