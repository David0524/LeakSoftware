# Schedule tiles: one block per tech, the drive on the tile

Owner, 2026-10-21: "can we remove the little '5 min drive' tags between each job on the schedule
page … The tiles should be thin and touching like in the weekly view. Remember that typically job
order number is more important than expected arrival time." Of the three options drawn
(`2026-10-21-schedule-tile-options.png`), the owner picked **C, the drive as a chip**: "I like
the chip. Do that for both schedule pages." And: "The drag/drop on the week schedule page should
be similar to the daily one."

Replaces the card layout in `2026-10-21-schedule-card.md` for Day's stops and Week's rows on
every platform (iPhone, Android, phone website, desktop website). Needs a Time cards and the
dragging rules in that file are unchanged except where this one says otherwise.

## The block

One rounded block per tech per day (`.card`, no outline), with the tech's color stripe (4 pt) on
the block's leading edge, not on each tile. The tiles inside touch, separated by a hairline
(`separator`) that starts after the stop number, as an inset grouped list. The tech's row above
the block (dot, name, "4 stops · 1 hr 44 min") stays.

The last line of the block, in footnote text, muted: a house symbol and "27 min back to the
shop" (or "back home" when the tech starts at home). Hidden when there's no drive home.

No drive lines between tiles any more ("19 min drive", "12 min from the shop").

## The tile: two lines

```
 ①  Greg Dixon ›  🔒                          ≡
    [🚗 23] 8:00 AM · 2054 W Maryland Ave
```

- **The stop number leads** (owner: the order matters more than the arrival time): the round
  badge, larger than before (32 pt, Barlow ExtraBold), in its status colors: done is green with
  a check, the stop in progress is blue, others gray.
- **Line 1:** the customer's name as the link (link color, "›", 44 pt tall hit area), one line,
  cut short; then the exception icons (lock, not on the map, a cleaning due) or the status label
  when the stop isn't plain Scheduled (In Progress, Done) at the line's trailing end. Only the
  name opens the job, as now.
- **Line 2, secondary, one line, cut short:**
  - **The drive chip first:** a small gray pill (`fill` background, muted text, semibold 12 pt,
    tabular digits) with a car symbol and the minutes to drive to this stop: "🚗 23". For the
    first stop it's the drive from the shop (or home). No chip when the drive isn't known (not
    on the map, still working it out). VoiceOver: "23 minute drive".
  - then the time ("8:00 AM", or "No time"), then the street only.
  - The kind of visit (Repair, Maintenance) is no longer on the tile: it's the first line of the
    touch-and-hold menu's title, and VoiceOver reads it. "With Dana" for a two-tech stop stays,
    after the time.
- **The grip (≡)** at the trailing edge, 44 × 44 pt, the only place a drag starts.
- Tap elsewhere on the tile does nothing; touch and hold opens the menu (unchanged).
- Height about 58 pt at the default text size; grows with larger text, never clips.

## Week

Week's rows are the same tiles in the same blocks, one block per tech per day. Dragging is the
same as Day (owner, "similar to the daily one"): the tile lifts from the grip at once with a
light haptic, follows the finger, and the other tiles in that block slide up or down so the gap
is always where it will land; let go and it settles and saves. Dragged over another day's block
(or its header), it moves to that day, landing where it's let go in that block's order, as Day's
drag onto another day does. Drop on Needs a Time takes it off the schedule. The page never stays
frozen after a drag.

## Today

Today's stop tiles keep their design (owner: "do not change the Today tiles — just add the car
chip and make the tiles touch"; then, of the two sketches: "Let's do on the right side. You're
just going to have to rearrange some of the other pills that land in that spot"):

```
 ①  8:00 AM  Grace Holloway ›                 [🚗 12] ⌄
    Now  🔑 Gate code 4417. Dog in the side yard.
```

- **The tiles touch:** one block (`.card`) for the day's stops, hairlines between tiles starting
  after the number, the drive home as the block's last line ("35 min back to the shop"). No
  drive lines between stops ("19 min drive", "12 min from the shop").
- **Line 1 is unchanged except its right end:** the number (or the green check), the time, the
  name link; then **only the drive chip and the chevron** at the trailing end. The chip is the
  same as the Schedule's (car and minutes, gray pill); none when the drive isn't known.
- **The pills that sat on the right move to the start of line 2:** Now (the stop you're on), the
  status label (In Progress and the like, when not the Now stop), the lock tag. Then the access
  note, as now (one line closed, all of it open). A tile with neither pills nor a note stays one
  line.
- **The stop you're on:** its number stays blue and its tile gets a light link-colored tint
  (`link` at about 8%) instead of the blue ring, since touching tiles can't each have a ring.
- Everything else stays: tapping the tile opens and closes it, the open tile's address,
  cleanings and buttons, Do Later and Undo, the name opens the job, no swipes or menu.

## Desktop website

The same tile and block in the Day and Week columns. The chip and the drive home replace the
drive lines there too.
