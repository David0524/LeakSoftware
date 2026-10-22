# Progress cues (owner, 2026-10-22: goal-gradient ideas)

Four small cues that show how close something is to done. Each ships on the desktop website, the
phone website, the iPhone app and the Android app, with the same words. The rules live in
`packages/core/src/progress-cues.ts` (Swift port `SundeckCore/ProgressCues.swift`, parity
fixtures `apps/ios/Tests/Fixtures/progress-cues.json`).

## 1. Today: the day's ring

A 28 pt ring leads the summary line. No new row is added.

| Day | Ring | Words |
| --- | --- | --- |
| No stop done yet | empty track | the plan, as before: "11 stops · 2 hr 5 min driving · Reorder" (plus "· from home") |
| 4 or more left | primary blue, stops done of all | "4 of 11 stops · Reorder" |
| 3 or fewer left | same | "2 left · about 1 hr" |
| Every stop done | filled green circle with a white check | "All 11 done" |

Decisions:
- **Before the first stop, the line keeps the plan.** "0 of 11 stops" says nothing useful and
  drops the driving total. The ring shows from the start as an empty track, so the line doesn't
  jump when the first stop is done.
- **Time left** is each stop not done: its planned time at the pool (`jobMinutes`: its own
  length, else the shop's default), plus the drive into it. A stop the tech is at already
  (started) has no drive left. The drive home is left out, since the stops are what's left to
  do. The time at the stop you're on isn't reduced by time already spent there.
- **"about"** rounds to the nearest 5 minutes under an hour (never below "about 5 min"), else to
  the nearest 15 minutes ("about 1 hr 15 min"). With no time known, the line is just "2 left".
- "From home" shows only with the plan line; after that the drive home row at the end of the
  list still says where the day ends.
- VoiceOver and TalkBack skip the ring. The words read as "4 of 11 stops done" or "2 stops left,
  about 1 hr".

## 2. Mark Complete as the last thing

When everything on the checklist is done (`checklistReady(done, total)`: at least one item, none
left), Mark Complete is the only thing left:
- **Today's card (all four):** "Everything’s checked. Mark it complete." over Mark Complete. The
  button is now the filled white one, full width. Open Checklist steps aside: the customer's
  name still opens the job. Core `heroActions(moment, mine, checklistDone)` returns
  `ready: true` with `primary: null`.
- **The job page (maintenance visits):** the same line over Complete Job. On the desktop website
  the line goes under the checklist. On phones (website, iPhone, Android) it goes inside the Next
  Step bar, above the button. Complete Job keeps its name, since that is the job page's word.
- Both scale in once (0.94 → 1.03 → 1, about half a second) when the state turns on. Nothing
  moves with Reduce Motion.

## 3. Getting Started: a head start

The list now opens with "Account created", which is always done. A new shop starts at 1 of N
("1 of 6 done") instead of 0. The step opens the shop's settings (Settings › Company).
Everything else is unchanged: the list still hides itself once every step is done.

## 4. Live Activity progress

The Lock Screen and the expanded Dynamic Island already had a thin bar. It counted the stop's
place in the day, plus half a stop while at the pool. It now shows **stops done of all**:
`LiveStopInput.doneStops`, set from Today's card (`todayHero`), so stops completed out of order
count. A state saved before this field existed falls back to the stops before this one.

Android: the current-stop notification uses `expo-notifications`, which can't draw Android's
progress bar. Adding one would need a native notification module (a new package outside the
plan), so Android's notification is unchanged.
