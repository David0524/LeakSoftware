# The owner's Today: techs' progress, live (owner, 2026-10-22)

"The owner sees techs' progress live; desktop Week updates as stops complete. Maybe this is the
right use case for the owner's today page on desktop."

Built on all four platforms (desktop and phone website, iPhone, Android) with the same words. The
rules live in `packages/core/src/progress-cues.ts` (`techDayProgress`, `lastDoneLine`; Swift port
`SundeckCore/ProgressCues.swift`, parity fixtures `apps/ios/Tests/Fixtures/progress-cues.json`).

## 1. Team on Today

Owners and admins see a **Team** list on Today once another tech has stops today. It is an inset
grouped list, one row per person with stops today, in Whose Day's order (the shop's saved order,
else Me first, then A to Z).

| Part of the row | What it says |
| --- | --- |
| Leading | The day's ring from Today's summary line (28 pt; empty track, blue fill, green check when all done) |
| First line | The tech's color dot, their name (Me for yourself), and the ring's words at the right: "4 of 11 stops", "2 left · about 1 hr", "All 11 done"; before the first stop is done, "11 stops" |
| Second line | The stop they're on: the **Now** pill (water blue) and the customer, or **In progress** (the status chip) once started. Gone when every stop is done |
| Third line | "Last done: Jones at 10:42 AM" (13 pt, muted), or "Last done: Jones" when the time isn't known |

- **The stop they're on:** the stop started and not done; else the first still to do in route
  order. (Today's card also puts a stop the tech sent On My Way to first; the Team keeps to started
  and next, which is what the owner asked for: "Now / In Progress".)
- **The last one done:** the latest by when it was finished, so a stop done out of order counts.
- **Choosing a row** shows that tech's day, as Whose Day does. Whose Day stays as the compact way
  to switch.
- **Where:** desktop website, at the top of the right column, above Today's Map (Activity stays
  under the map). The chosen tech's row is tinted, and the day beside it is theirs. Phones (website, iPhone, Android): no Team list (owner, 2026-10-22, of it on a
  phone: "I do not like this … definitely not on mobile"); Whose Day switches days and Today
  still refreshes live.
- **VoiceOver and TalkBack:** the ring is hidden; a row reads "Tony Tech, 4 of 11 stops done, In
  progress: Smith, Last done: Jones at 10:42 AM".

## 2. When a stop was done: `job.stop_done_at`

Migration `20261022000300_stop_done_at.sql`. The moment a stop stopped being one to do, whichever
way: Today's Mark Complete on a leak or repair job (`stop_done_on`), a visit completed, or a job
moved on in its pipeline. The same line core `stopDone` draws.

- A trigger stamps it with the server's time when the stop becomes done, unless the phone sent its
  own time with the change. Mark Not Complete and Reopen Visit clear it. A job made already done
  (an import of past work) keeps what it was given.
- Today's Mark Complete on the iPhone and Android sends the phone's time, so a tech who was offline
  still shows the time they tapped, not the time it synced. The website and the job page's Complete
  Job use the server's time (they're online).
- Synced to phones like the job's other columns; anyone who can write the job can write it.
- Jobs finished before this change have no time: their row says "Last done: Jones".

## 3. Live

- **Website: a light poll, not Supabase Realtime.** Today and Schedule (Day, Week and Month) ask
  `/api/live/jobs?from&to` every 5 seconds while the tab is showing, and fetch the page again in
  place (`router.refresh`) when the answer changes. The answer is a fingerprint of the jobs booked
  in the page's window that the person can read: how many there are and when the latest changed
  (every change to a job bumps `updated_at`). One small query through row security; nothing new
  in the database.
  - Why not Realtime: nothing in the codebase uses it yet. It would need the job table added to the
    `supabase_realtime` publication, a browser Supabase client holding the session, and RLS checks
    per change per subscriber, none of which the local test database (the Postgres shim) can run.
    The poll reuses the page's own server render, so what shows is always what the page would show
    on a reload. Realtime can replace the poll later behind the same component (`LiveRefresh`).
  - It holds off while a finger or the mouse is down (a drag on the Schedule), while something is
    being typed, or while a sheet is open, and catches up on the next check. It stops while the tab
    is hidden and checks at once when it comes back. The day shown and open rows keep their state.
- **iPhone and Android:** the apps already sync every minute, when they come to the front, and 2
  seconds after a local change (so a tech's Start or Mark Complete reaches the server within
  seconds). While an owner's or admin's Today shows the Team, or their Schedule is showing, the app
  now also syncs every 15 seconds (only in the foreground). Today and Schedule redraw from the
  phone's database as soon as a pull lands.

## Decisions for the owner

1. The Team shows techs with stops today only (a tech with no stops has no row). Say if you'd like
   every active tech listed, with "No stops today".
2. (Settled: no Team list on phones.)
3. The website checks every 5 seconds; the apps every 15 seconds while Today or Schedule shows.
