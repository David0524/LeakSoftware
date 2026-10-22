# Instant changes and skeleton screens

Owner, 2026-10-22 (overnight list): "On the website, make changes instantly, the way the phones do
(save first, sync after)" and "Skeleton screens, not spinners."

## 1. Changes show at once on the website

The phones write to their own database first and sync after, so a tap answers at once. The
website can't keep its own copy, so it shows the new state while the save is under way (React's
`useOptimistic`) and the page catches up when the server answers. A failed save puts the old
state back by itself and says why in the top banner (`top-banner.tsx`), which stays until it's
put away: the reason on the first line, "Changed back. Nothing was saved." on the second.

Shared parts: `apps/web/src/components/instant.tsx`.

- `InstantProvider` (office layout) holds jobs' new statuses while they save, so a status
  change shows everywhere at once: the job page's status pill, Jobs and a customer's job list
  (`LiveStatusBadge`), the job's status buttons and the Next Step bar.
- `saveFailed(reason, action?)` is the banner for a save that didn't go through.
- `useRun({ instant: true })` (job-work.tsx) sends a button's errors to the banner.

What now changes at once:

| Where | Action |
| --- | --- |
| Today (card and stop rows) | Mark Complete, Mark Not Complete, Reopen Visit: the button turns into its undo, "{Customer} done" with Undo shows at once; a failure says why with Open Job |
| Today's card | Start Job: the card offers Open Checklist at once |
| Job page | Start Job, Put On Hold, Reopen and the other status buttons, Complete Job (header, under the checklist, Next Step bar) |
| Job page checklist | Answers already showed at once; a failed one now says why in the banner |
| Jobs list | Mark Complete (swipe or menu): the row's status changes, "Completed." shows at once |
| Settings lists (price book, components, severities…) | Delete…: the row leaves at once |
| A conversation (phones) | Mark as Unread goes back to the list at once |

Left as they were, on purpose:

- The Schedule board's drag and Optimize (already instant), Today's Reorder and Do Later (rows
  already slide at once), team switches and colors, inbox Read/Unread (already instant).
- Forms with a Save button (job details, settings, Save Schedule, New Job, notification
  settings): they check fields on the server and can fail field by field. What was typed stays
  on screen either way; putting it back would lose typing. They keep "Saving…" on the button.
- Sends, payments, calls, Optimize suggestions, Plan Week, deletes of jobs or customers: the
  result is the server's (a message went out, a card was charged), so showing it before the
  server says so would be untrue.

## 2. Skeleton screens, not spinners

While a screen or list loads, it shows gray shapes where its content goes, laid out as it will
be: soft cards, rounded lines and pills, on the real title when the title is known. A soft
highlight sweeps across the shapes every 1.6 s, left to right; with Reduce Motion the shapes stay
and the sweep is off. Shapes are `color.fill`; the highlight is white at 60% (8% in Dark). Row
widths vary the same way on every platform (40, 50, 33, 60, 40, 50%). Screen readers hear one
"Loading …" label, never the shapes.

| Platform | Parts |
| --- | --- |
| Website | `globals.css` › `.shimmer`; `page-skeleton.tsx`: `Bone`, `GroupBone`, `ListSkeleton` (Jobs, Customers), `JobSkeleton`, `CustomerSkeleton`, `MessagesSkeleton`, `SettingsSkeleton` (each settings section, with its title), `SettingsShellSkeleton`, `DocSkeleton` (customer quote and invoice), `CardSkeleton` (email preference pages), plus the sign-in forms and Today's Activity |
| Android | `ui/Skeleton.tsx`: `Bone` (react-native-svg gradient, one shared sweep), `SkeletonCards`, `SkeletonRows`, `SkeletonLines`, `SkeletonDashboard`; used by Today, Schedule, Activity, Dashboard, the job's Timeline, Phone and Texting, photo cards and the photo viewer |
| iPhone | `UI/Skeleton.swift`: `.shimmer()`, `Bone`, `SkeletonRows`, `SkeletonLines`, `SkeletonCard`, `SkeletonDashboard`; used by Today, Schedule, Activity (screen and panel), Dashboard, Timeline, a job's schedule, report, quotes and invoice, New Job, Phone and Texting, photos, voice notes and the viewer |

Spinners stay only where something is being done, not shown: inside a button doing an action
(Optimize, Sending, a capture tile), the first download of the company, the steps of making a
report or a PDF, setting up a new shop, and pull to refresh (the system's own).

The Dashboard on both phone apps used to show its loading steps ("Getting your numbers…"); it
now shows the page's shape, as the website does.
