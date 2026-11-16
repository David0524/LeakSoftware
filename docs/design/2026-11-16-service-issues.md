# Report an Issue → Make a Quote or Job (2026-11-16)

A tech on a visit spots a problem (leaking pump, cracked skimmer, possible leak, failing heater)
and reports it with a few words and photos, so it becomes repair or leak detection work instead
of being forgotten. The office resolves it or turns it into a job. Competitor reference: Triton's
service issues.

## Data

- `service_issue` (synced, `company_id`, composite foreign keys, generated policies,
  `speed_up_policies`, a `tests.make_company` row): customer, pool (`property_id`), the job it was
  reported on (`job_id`, optional), `description` (1–2,000 characters), `suggested_type`
  (`repair`, `detection`, or empty for Not Sure), `status` (`open`, `resolved`, `converted`),
  `resolution_note`, `resolved_by`/`resolved_at`, `converted_job_id`, `reported_by`/`reported_at`,
  and the server's `notified_at`. Migration `20261022004600_service_issues.sql`.
- Who can do what: any member reports (insert) and can edit what an issue says. Only owners and
  admins change its status, note or job (`app.service_issue_guard`; techs get "insufficient
  privilege"). A report is always open and by whoever wrote it, whatever a client sends.
- Techs who see only their own jobs (`techs_see_all_jobs` off) see the issues they reported and
  those on their jobs. Everyone else sees all. Lists show techs only the ones they reported.
- Photos and videos: ordinary job media on the visit, with a new `media.service_issue_id`. The
  upload queue, storage paths and viewer don't change. A picture's issue must be on the same job
  (`app.same_job_refs`).
- Make Quote / Make Leak Detection Job copy the issue's media rows onto the new job (same file,
  never uploaded twice, still linked to the issue). A copy made before the original finished
  uploading is marked uploaded with it (`app.media_copy_uploaded`). Storage lets whoever sees the
  new job read the copied file, and only a file under the issue's own visit qualifies
  (`app.object_job_visible`).

## Wording (core `ISSUE_TEXT`, the same on all four platforms)

Report an Issue · What's wrong? · Suggested Work: Not Sure | Repair | Leak Detection (Leak Detection
only where the shop does leak detection) · Report · "Issue reported. The office will see it." ·
"Say what's wrong first, then add photos." · Issues (3) · Open | Done | All · Make Quote ·
Make Leak Detection Job · Resolve · Resolve Issue · Note (optional) · Reopen · Open Job ·
statuses Open, Resolved, Job made.

## Where it lives

| | Website (desktop and phone) | Android (Expo) | iPhone (Swift) |
|---|---|---|---|
| Report an Issue | Job › Details › **Issues** group: the job's issues, then a Report an Issue row opening a sheet | same group on the job's Details | same group on the job's Details |
| List | Jobs › **Issues** segment (after Reports), "Issues (n)" open count, Open / Done / All pills | Jobs tab segment, same | Jobs segment, same |
| Issue page | `/jobs/issues/[id]`: description, photos, actions, Customer, Reported (By, On, Made into) | `/issues/[id]` screen | `Route.issue` screen |
| Customer page | **Open Issues** group (only when there are some) | same | same |

- The sheet: a multi-line text field (the keyboard's dictation works), photos and videos, the
  Suggested Work segmented control, and Report. Website: Add Photo or Video and Library tiles; the
  files go up after the issue is saved. Apps: the job's capture tiles; the first photo saves the
  issue (as a test or finding is saved before its first photo), so it works offline.
- Make Quote makes an unscheduled, unassigned repair job for the issue's pool and customer, with the
  description as its notes and the photos copied in, and opens it at Wrap-Up to build the quote.
  Make Leak Detection Job makes a leak detection job with the pool's checklist and opens it. The
  issue becomes "Job made" and links to the job. Resolve takes an optional note. Reopen is for a
  resolved issue; an issue that became a job offers Open Job.
- Apps write everything through the sync layer (job, then issue, then media copies, then the
  checklist, in one transaction), so the office's actions work offline too.

## Notifications

New kind **Reported issues** (`issue`) in Notifications, on by default: "Issue reported" ·
"Rebecca Soto: Cracked skimmer throat" to the shop's owners and admins (not the reporter). A tap
opens the visit it was reported on, whose Issues group lists it. The website reports and tells at
once. Phones report offline; after each sync they ask `/api/issues/notify` about their reports the
server hasn't announced, and the server tells once per issue (`notified_at` is claimed first).

## For the owner to decide

1. Issue photos also show in the visit's Photos (labeled "Issue") and so can appear in that
   visit's report. Keep, or hide issue photos from the visit's own Photos and report?
2. Only owners and admins resolve and make jobs. Should techs who may make jobs (Techs Can Make
   Jobs on) also be able to Make Quote?
3. A tap on the notification opens the visit, not the issue. Open the issue itself (an app change
   on both phones)?
4. Make Quote leaves the job unscheduled and unassigned, with no repair lines (the office builds
   the quote). Should it prefill a repair line from the description?
