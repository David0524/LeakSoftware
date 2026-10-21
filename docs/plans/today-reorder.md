# Today: change the order of stops

Owner, 2026-10-20: techs can't change the order of stops from Today ("the gate's locked, I'll come
back" happens daily) — "Fix this".

Every platform: the website (desktop and phones), the iPhone app and the Android app, same words
and behavior.

## The two ways

1. **Do Later** on a stop: moves it to the end of the day's route, after every stop still to do.
   - On each stop row that can move (see below): in the row's actions when it's open, and as a
     trailing swipe action on phones (the button is the visible alternative to the swipe).
   - On the Today card for the stop you're on, in the Up next and On the way moments, as a
     secondary button beside Call and Directions.
   - Afterwards, where the button was, for 5 seconds: "Moved" and an **Undo** pill (the
     same inline undo as Mark Remaining; not a toast).
2. **Reorder** for the whole day: a **Reorder** button at the end of the day's summary line
   ("6 stops · 1 hr 15 min driving · back by 3:14 PM · Reorder").
   - The list switches to edit mode, as iOS Reminders does: each movable stop gets a drag handle
     (≡) and **Move Up** / **Move Down** buttons (the buttons are the visible, accessible
     alternative to dragging); stops that can't move show a lock and the reason.
   - **Done** ends it. Each move saves at once (no Save step), and the drive times and arrival
     times under each stop update as you go.

## The rule

- Both use the Schedule's existing move (`moveJobChange` in packages/core/src/schedule-moves.ts,
  ported in apps/ios/Sources/SundeckCore/ScheduleMoves.swift): same tech, same day, a new place in
  the route. Do Later is the place after the last stop; Move Up and Move Down are one place up or
  down. Its rules apply unchanged: time-locked stops (Time or Both) never move, started jobs stay on the schedule,
  stops after a moved one move later only when they must, and techs move only their own jobs.
  Its messages are shown as they are.
- Can't move: done stops (folded away already) and started jobs (in progress). Owners and admins
  can reorder any tech's day they're viewing ("Whose day"); techs only their own.
- Undo puts the changed jobs back exactly as they were (the saved values of every row the move
  changed), not a second move.
- Phones work it out from their own database and save through the sync layer, offline included;
  the website through the existing route action (apps/web/src/app/actions/routes.ts).
- No push notification to the person who made the move. The day's Activity records it as a moved
  job (docs/plans/search-and-activity.md).

## Words

- Do Later, Reorder, Done, Move Up, Move Down, Undo (Title Case buttons).
- After Do Later: "Moved" (the move's own message; no clock times since the owner's 2026-10-21
  decision).
- A stop that can't move, in Reorder: "Started", "Locked", "Time locked" or "Two techs" beside the lock (the lock icons' words, no clock time; a Day lock alone can move within its day).
