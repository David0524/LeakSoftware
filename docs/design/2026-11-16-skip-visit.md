# Skip a Visit

Owner request, 2026-11-16 (Triton's skipped stops as the reference): a maintenance visit that can't
be done is skipped with a reason, not left sitting as a missed stop. Ships on the website (desktop
and phone), the Android app and the iPhone app with the same wording and behavior.

## What it does

- **Skip Visit** on a maintenance visit (tech or office, offline, synced like everything else on a
  visit): pick a reason (required), add a note and a photo (both optional), tap Skip. The visit
  becomes status `skipped`: not done, not billed, off the tech's list.
- **Undo** for five seconds in the banner ("Visit skipped · Undo"), per the Undo design
  (`2026-10-26-undo.md`). Undo Skip also stays as a button on the skipped visit.
- **Text the Customer** is offered right after, for a customer with a phone number: the tech's own
  Messages with a short text naming the reason ("Hi Rebecca, this is Alex from Blue Pools. We had to
  skip today’s pool service (dog in yard). We’ll be in touch to reschedule."). Same pattern as On My
  Way's phone fallback; the text is editable on the website, and Messages itself on the phones.
- **The office** sees skipped visits: a **Skipped** filter on Jobs (after Done), a gray-amber
  "Skipped" badge on Today and Schedule stops, and on the visit a Skipped card (reason, note, who and
  when, photo count, Dismissed when it was). Owners and admins get **Reschedule** (opens the usual
  schedule sheet: Move and Suggest Times; giving a skipped visit a day makes it Scheduled again) and
  **Dismiss** (stays skipped, marked handled). Techs get Undo Skip only.
- **Owners and admins are pushed** when a visit is skipped ("Visit skipped · Soto: Dog in Yard,
  skipped by Alex."), except the person who skipped it. New notification kind `skip`, "Skipped
  visits", in More › Notifications (on by default, per person).
- **Skip Unfinished Visits at Day's End**: Settings › Scheduling, "Missed visits", default **off**.
  On, the daily run skips Scheduled maintenance visits from the last three days that were never
  started, reason **Not Done** (a system reason), by nobody, and sends one digest push per shop
  ("3 visits weren’t done").

## Where

| | Website | Android | iPhone |
| --- | --- | --- | --- |
| Skip Visit button | end of Details (with Cancel Job) and the ••• menu | same | same |
| Sheet | `components/skip-visit.tsx` | `features/job/SkipVisit.tsx` | `UI/SkipVisitViews.swift` |
| Skipped card | job page Details | `SkippedCard` | `SkippedCard` |
| Jobs filter | `jobs/page.tsx` | `(jobs)/jobs/index.tsx` | `JobFilter.skipped` |
| Settings › Skip Reasons | `settings/skip-reasons` | `SimpleLists.tsx` | `SettingsPage.skipReasons` |
| Settings › Scheduling switch | `skip-unfinished.tsx` | `Scheduling.tsx` | `ShopSettingsPages.swift` |

The shared rules and words are in `packages/core/src/skip-visit.ts`, ported to
`apps/ios/Sources/SundeckCore/SkipVisit.swift` and checked by the `skip-visit` fixtures.

## Data

`supabase/migrations/20261022004500_skip_visit.sql`:

- `job.status = 'skipped'`, maintenance visits only (a check constraint). Transitions in the status
  machine (core, database, Swift): Unscheduled, Scheduled or In progress to Skipped; Skipped back to
  Scheduled, Unscheduled, In progress or Canceled. People are offered Undo Skip (Scheduled) and
  Cancel Job; the rest is reached by rescheduling.
- `job.skip_reason`, `skip_note`, `skipped_at` (the phone's own time is kept), `skipped_by` (the
  server's), `skip_handled_at` / `skip_handled_by` (Dismiss: owners and admins only, enforced by a
  trigger), `skip_notified_at` (server only). Leaving `skipped` clears all of them, so a rescheduled
  visit is a clean one and a second skip is announced again.
- Moving a skipped visit to a day sets it Scheduled by itself (a trigger, and `statusAfterMove` in
  core, the website's route actions and the Swift twin), so every existing move path works.
- `skip_reason` table: `label`, `sort_order`, `active`, `system`. A normal synced config table
  (members read, owners and admins write, phones download it), seeded for every shop by a trigger
  on `company` from `app.config_default` and backfilled for existing shops: Locked Gate, Dog in
  Yard, Customer Asked to Skip, Weather, Pool Covered or Closed, No Access, Other, and the system
  reason Not Done (never offered, never listed in Settings). The reason is copied onto the job as
  text, so renaming a reason later doesn't change history.
- Billing already bills only done, invoiced and paid visits, so a skipped visit is never billed
  (tested). `stop_finished` leaves skipped out, so a skip doesn't stamp the owner's "Last done".
- `auto_skip_visits(at)` and `skips_to_notify(only_job)`: service role only.

## Server

- `POST /api/jobs/{id}/skipped` (phones, bearer): once the skip has reached the server, pushes the
  owners and admins, once. 202 `{pending: true}` until it has. The Android app queues it (like
  automatic visit reports) and the iPhone app syncs and asks up to three times.
- The daily cron (`/api/cron/daily`) runs `runSkipVisits`: the day-end skip, then the catch-up push
  for any skip nobody announced (phone never got signal, etc.).
- The website's `skipVisit` server action pushes after the reply.

## Decisions I made (the owner may change)

1. The daily run is the morning one (15:45 UTC), so "day's end" skips yesterday's unstarted visits
   the next morning; three days back, so one missed run catches up without sweeping old history when
   the switch is first turned on. Started (In progress) visits are never auto-skipped.
2. A skipped stop counts as handled in Today's progress (it leaves the tech's to-do list, as a
   finished stop does) but never as done work: not billed, no "Last done" time, and its number tile
   on Schedule keeps its number instead of a check.
3. Skip photos are ordinary photos on the visit. On the website and Android they upload when Skip is
   tapped; on the iPhone a photo is saved to the visit as it's taken (a cancelled sheet keeps it).
4. Reschedule is the existing schedule sheet, not a new picker; Dismiss is separate from it.
5. Skip Reasons is a pool-shops page (hidden for leak-only shops), like Exclusion Reasons is a leak
   page.
6. Phone pushes for a skip are best effort in real time; the daily run guarantees them within a day.

## Not done / for later

- No Activity feed entry for a skip (the push is the notice).
- Swift was written without a compiler here; CI's `swift format lint --strict`, `swift test` and the
  iPhone build are the check.
