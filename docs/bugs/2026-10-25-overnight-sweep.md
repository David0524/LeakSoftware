# Overnight bug sweep (2026-10-25)

What the overnight hunt for glitches found, on the website, Android (`apps/mobile`, which uses
`packages/sync`) and the iPhone (`apps/ios`). Each finding has its severity, where it is, what
happens, and the fix (commit) or a recommendation. Fixes were written test first; each new test
failed before its fix.

## Fixed

### 1. "Discard changes?" missed edits made while the page was loading (High, website)

- **Where:** `apps/web/src/components/discard-guard.tsx`, mounted in the root layout inside its
  own `<Suspense>`; `apps/web/src/lib/dirty.ts`; the floating Save in
  `apps/web/src/components/settings-forms.tsx`.
- **What happened:** the guard starts watching a form on its first `focusin`, but its listener was
  added in a `useEffect`. Its Suspense boundary can hydrate after the page, so a field tapped in
  between (the page already usable) was never watched: the person typed, tapped a link or a tab,
  and the page left without asking, losing the changes. Typing before any script ran was missed
  the same way, and the floating Save stayed dimmed for such an edit. This is the flake in
  `e2e/company-save.spec.ts:73` (CI run 40064153635, job 120783911608): `fill()` right after
  `goto()` landed in that window. Real users on a slow phone hit the same window.
- **Fix (f0bf5b2):** the guard listens from the moment its module loads, and a form already
  focused or edited when it starts (or mounts) takes what the page's HTML gave its typed fields
  as its starting point (`fieldsOf(form, { loaded: true })`). The floating Save starts from the
  same values. New e2e test in `e2e/discard.spec.ts` holds the page's scripts back, types into
  the page's HTML, then checks the alert; it failed before the fix and passes after. The
  company-save test itself was not changed.
- **Platforms:** website only (the apps don't hydrate).

### 2. Signing out during a sync left part of it on the phone (High, Android and iPhone)

- **Where:** `packages/sync/src/engine.ts`, `store.ts`; `apps/ios/Sources/SundeckSync/SyncEngine.swift`,
  `LocalStore.swift`.
- **What happened:** Sign Out clears the store (`clearAll`) while the session is still valid,
  then ends the session. A sync waiting on the server (a first download, typically) kept saving
  what came back into the cleared store: a page or more of the old rows and the old pull cursor.
  The next sign-in then resumed from that cursor rather than downloading everything, and the phone
  showed a shop with most of its jobs and customers missing, with no error. A different account
  signing in got the same partial download (the scope check only catches it when a scope was
  stored). A sync started after the clear also joined the old one instead of starting over.
- **Fix (3335113):** the store has a generation that `clearAll` bumps; a sync notes it when it
  starts and saves nothing (rows, cursor, scope, outbox marks) once it changes, and a sync asked
  for after the clear waits for the old one to stop and starts fresh. Tests: "signing out while a
  sync is running" in `packages/sync/test/edge-cases.test.ts` and `EdgeCaseTests.swift`.

### 3. An upload finishing after sign-out wrote into the cleared phone (Medium, Android and iPhone)

- **Where:** `packages/sync/src/uploads.ts`; `apps/ios/Sources/SundeckSync/UploadQueue.swift`.
- **What happened:** the upload queue kept going after the clear. A file that finished wrote its
  "uploaded" mark: a media row with three fields and an outbox change for the old shop, which the
  next sign-in sent (refused for another account, so a problem in its sync screen). The rest of
  the run kept uploading the old account's files.
- **Fix (c8fa3ea):** the run stops once the store's generation changes. Tests in
  `packages/sync/test/uploads.test.ts` and `UploadQueueTests.swift`.

### 4. Invoice lines refused quantities like 1.1, 1.15 and 2.3 (Medium, all platforms with invoices)

- **Where:** `apps/web/src/lib/quantity.ts` (`parseQuantity`), `apps/mobile/src/lib/lineQuantity.ts`
  (`parseLineQuantity`), `apps/ios/Sources/SundeckApp/Model/InvoiceModel.swift`
  (`invoiceLineQuantity`).
- **What happened:** "at most two decimals" was checked as `round(q × 100) == q × 100`, exactly.
  Most two-decimal numbers aren't exact in floating point (1.1 × 100 is 110.00000000000001), so
  1,146 of the 9,999 quantities from 0.01 to 99.99 were refused as "not a quantity", including
  1.1, 1.15, 2.3 and 4.35.
- **Fix (bc52493):** whole hundredths within a millionth (1.005 stays refused), returning the
  rounded value. Tests try every quantity from 0.01 to 99.99 on all three.

## Written up (not changed)

### 5. Sign-up: a shop that fails to be created leaves an account without one (Low, website)

- **Where:** `startTrial` in `apps/web/src/app/actions/auth.ts`.
- **What happens:** the account is created and signed in, then `create_company` runs. If that
  fails, the form shows the database's own message (`companyError.message`), and sending the form
  again says "An account with this email already exists". The person has to know to sign in,
  which goes to `/setup`.
- **Recommendation:** on that failure, redirect to `/setup` (which creates the company for a
  signed-in account) with a plain message, and log the database error instead of showing it.

### 6. "This year" for dates on Customers and Email Customers (Low, website and Android)

- **Where:** `apps/web/src/app/(office)/customers/page.tsx`, `components/mass-email.tsx`, and the
  Android copies (`customers.tsx`, `email-customers.tsx`).
- **What happens:** whether a date shows its year compares years in the server's (UTC) or the
  phone's zone, while the date is formatted in the shop's zone. Around New Year (the evening of
  Dec 31 in the US is already the new year in UTC), a date can show without its year when it
  needs one, or with it when it doesn't. Cosmetic, a few hours a year.
- **Recommendation:** compare `localDate(…, shop zone).slice(0, 4)` for both, as
  `activityDay` in core does.

### 7. A time typed into the daylight-saving gap moves an hour (Informational)

- `zonedTimeToIso("2026-03-08", "02:30", "America/New_York")` gives 1:30 AM EST: 2:30 doesn't
  exist that night. No shop schedules at 2:30 AM, so nothing to change; noted in case a reminder
  or a cron ever builds times that way.

### 8. The demo shop's sample job is missing on the dev project (Test environment)

- `e2e/discard.spec.ts` "a sheet with changes asks…" and other specs open
  `/jobs/00000000-0000-4000-8000-00000000e001` (`SAMPLE_JOB`), which shows "Page not found" on
  the dev project today. CI seeds its own database, so CI is unaffected. `pnpm demo:reset` likely
  restores it; not run here, since the demo data is shared.

## Looked at and found sound

- **Day maps** (`packages/core/src/day-map.ts`, `route-path.ts`, `apps/web/src/server/map-*.ts`,
  `apple-maps.ts`, `apple-map.tsx`, `interactive-map.tsx`): zero stops, one stop, every stop at
  one address (framed at zoom 13, pins spread), missing coordinates (counted, not guessed), no
  shop address (no start pin, route without one), image sizes clamped, polyline encoding and
  decoding, map effects cleaned up on unmount.
- **Money:** integer cents through quotes and invoices; rounding half away from zero; discount
  clamped to the subtotal; dollars parsed from text, never floats.
- **Dates:** schedule weeks and months in UTC date arithmetic, bounds converted in the shop's
  zone, "today" from the shop's zone on the server.
- **Sync:** outbox coalescing and order, rejected versus read-only (TL423) changes (kept and
  retried once paid), rows with unsent changes kept through scope restarts and job pruning.
