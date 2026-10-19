# Owner's list, 2026-10-19: website changes and app handover

The owner asked for these changes on the website first, with notes so the iPhone (Swift) and
Expo apps can get the same. Each section says what changed on the website, the data behind it,
and what the apps need to do. Database changes are shared: the apps read and write the same
tables and columns through sync.

Status key: **Website done** means built, checked, and committed on `claude/cool-keller-efjc00`.

## 1. Free trial is 30 days

- **Website done.** New shops get `trial_ends_at = now() + 30 days`
  (`20261012005300_trial_30_days.sql`). Landing page, pricing, sign-up, onboarding ("Start 30-Day
  Free Trial"), and the billing message say 30 days; the FAQ says the first charge is on day 31.
- **Apps:** change any "14 days" / "14-day" wording to 30. The trial date itself comes from the
  server.

## 2. Contact us: office@sundeckpro.com

- **Website done.** Landing page: under the FAQ ("Still have a question? Contact us at ...") and
  in the footer of every public page. Portal: More › Help › Contact Us (phones) and the account
  menu (wider screens). Constant `CONTACT_EMAIL` in `apps/web/src/lib/site.ts`.
- **Apps:** add a Contact Us row (Settings / More, Help group) that opens
  `mailto:office@sundeckpro.com`, showing the address under the label.

## 3. Onboarding: no chlorine question, no Share This Sample

- **Website done.** The pool shop's setup step no longer asks "Chlorine your techs carry". The
  sample visit / sample report no longer has a Share This Sample button.
- **Apps:** if the apps show onboarding, remove the same two things.

## 4. Gallons on the customer's pool profile

- **Website done.** Customer › Pool › Edit has a Gallons field (typed as "20,000"; blank clears
  it). The pool row shows "20,000 gallons" as a plain number, with no size remarks. The job's
  Pool row shows it too. Column: `property.approx_gallons` (already synced; now in core's
  `Property` type).
- **Apps:** add Gallons to the pool edit form and show it on the pool/job screens. The Chemical
  screen fills gallons from the pool.

## 5. Chemical button at the top of the checklist, renamed "Chemical"

- **Website done.** On a maintenance visit's Checklist tab, a **Chemical** button is the first
  thing, above the checklist title (it used to be "Chemical Calculator" below the list). It
  opens `/chemicals?property=<pool>&job=<visit>`. The screen's title is now "Chemical".
- **Apps:** same placement and label on the visit's checklist screen; open the Chemical screen
  for that pool and visit.

## 6. Submit on the Chemical screen: the pool's chemical log

- **Website done.** Opened for a pool (from a visit, or Customer › Pool › Chemical), the
  Readings card ends with a **Submit** button. It saves the left side: gallons, the six
  readings that were filled in (FC, pH, TA, CH, CYA, salt), and the chlorine and acid products.
  The screen then lists the pool's **Chemical log** (newest first: readings, when, who,
  gallons), each with Remove (confirm sheet). The customer's pool shows the latest entry
  ("Last: FC 3 · pH 7.6 · TA 90 · Mon 8:15 AM"). Opened from the nav with no pool, the screen
  says to open it from a visit or a pool to save readings. The first submit with gallons fills
  in a pool's missing gallons.
- **Data:** new synced table `chemical_reading` (`20261012005400_chemical_readings.sql`):
  `property_id` (required), `job_id` (optional), `recorded_at`, `recorded_by` (server default
  `auth.uid()`), `gallons`, `fc`, `ph`, `ta`, `ch`, `cya`, `salt`, `chlorine_product`,
  `acid_product`, `notes`, plus the usual sync columns. At least one reading is required.
  Every team member reads and writes (insert, update, soft delete); `device_sync = true`, so it
  reaches phones through normal sync. Core: `ChemicalReading`, `READING_LABELS`,
  `READING_LIMITS`, `readingSummary` in `packages/core/src/chemistry.ts`.
- **Apps:** add Submit under the readings on the Chemical screen when it was opened for a pool.
  Write a `chemical_reading` row through the sync layer (row + outbox, UUIDv7 id) so it works
  offline. Show the pool's log below the calculator, with Remove (sets `deleted_at`).

## 7. Require a pool photo before a tech finishes a job

- **Website done.** Settings › Team › What techs can do: **Require a pool photo to finish a
  job** (owners; off by default). Stored as `company.settings.require_finish_photo`. When on, a
  maintenance visit can't be marked Done, and a report can't be finished or sent (Send, or
  Review with Customer's sign-off), until the job has at least one photo (`media.kind =
  'photo'`, not deleted; a photo still uploading counts). The message is "Take a photo of the
  pool before finishing this job." Core: `requiresFinishPhoto(settings)`,
  `FINISH_PHOTO_MESSAGE`. Server check: `requireFinishPhoto()` in
  `apps/web/src/server/reports.ts`, used by the phone report API too.
- **Apps:** check the same before **Mark Done** on a visit and before finishing/sending a
  report, using the local photos (rows in the outbox count). Show the message and offer Take
  Photo. It is a client check on purpose: a database trigger would reject an offline status
  change that syncs before its photo row.

## 8. Every test, pass or fail, on the finished report

- **Website done.** The homeowner report now has a **Tests we ran** block (after What we
  checked, before Photos) listing every test: test, where, the reading summary, and a
  Pass / Fail / Unclear / Recorded pill. Hidden when the job had no tests. It is in the web
  report, its PDF, and the customer link. Core: `REPORT_BLOCKS.homeowner` includes `"tests"`;
  `testOutcomeLabel(outcome)` gives the label and color tone.
- **Apps:** the Swift Report tab and any in-app report preview should show the same block in
  the same place, from `report.data_snapshot.tests`.

## 9. Request a Feature

- **Website done.** **Request a Feature** in More › Help (phones) and in the account menu
  (wider screens) opens a sheet with one box and Send Request. It saves to
  `public.feature_request` (server only, like `signup_lead`;
  `20261012005500_feature_requests.sql`) and emails office@sundeckpro.com with the person,
  shop, and page (reply-to is the person). Staff read the list at `/admin/requests` (two-step
  sign-in, like Leads). Action: `apps/web/src/app/actions/feature-requests.ts`.
- **Apps:** add a Request a Feature row in Settings › Help. Simplest parity: a small website
  API endpoint the apps can POST to with the bearer token (not built yet; ask before adding),
  or open `mailto:office@sundeckpro.com?subject=Feature%20request` for now.

## 10. Markup has a pen

- **Website done.** The photo Mark Up screen's tools are now **Pen**, Arrow, Circle, Text (Pen
  first and selected). Drag to draw freehand in the chosen color; Undo and Clear All work as
  before. Stored in the same `markup` JSON as a new shape:
  `{"type": "pen", "color": "red", "points": [[x, y], ...]}` with x and y 0..1 of the picture,
  at most 400 points (core `penShape()` thins a drag; `penPath()` draws it; `parseMarkup()`
  accepts it). Drawn with the same dark outline as the other shapes.
- **Apps:** add Pen to the markup tools (first). Old app builds ignore unknown shapes only if
  their parser drops them: the Expo `MarkupLayer` now draws pen strokes; the Swift markup
  parser must accept or skip `"pen"` without failing.

## 11. Pool shape: more shapes, mirror, and the spa anywhere

- **Website done.** On a leak job's Findings tab, a new **Pool Diagram** section shows the
  pool with the findings' pins and the job's markup, with **Edit Pool Shape** and **Mark Up**.
  Edit Pool Shape is a sheet: the shape tiles (now 8: Rectangle, Oval, Kidney, L-shape,
  Freeform, **Roman**, **Grecian**, **Figure 8**), **Mirror (flip left to right)**, **Has a
  spa**, then for a spa: tap the drawing to place it anywhere (arrow keys nudge it; "Put the
  Spa Back in the Corner" resets), **Spa size** Small / Medium / Large, and **Spa shape**
  Round / Square. Save Pool Shape. The Add Finding sheet's shape tiles and pin picker use the
  same drawing.
- **Data:** `property.diagram_shape` allows `roman`, `grecian`, `figure_eight`.
  `property.diagram_layout` (jsonb, client-writable, synced):
  `{"mirror": true, "spa": {"x": 0.85, "y": 0.2, "size": "large", "shape": "square"}}`, x and
  y the spa's center as 0..1 of the 160 x 100 diagram. Empty means the old drawing (spa top
  right, or top left when mirrored). Core: `poolDiagram(shape, hasSpa, layout)`,
  `parseDiagramLayout`, `mirrorPath`, `SPA_SIZES` (radius 10 / 13 / 17), `SPA_SHAPES`;
  `PoolDiagram.spa.square` draws a rounded square (corner radius 4).
- **Apps:** the Swift and Expo diagrams should draw from `poolDiagram(..., layout)` (or port
  it): the new shape paths, the mirror, and the spa's place, size, and shape. Add the same
  editing (shape tiles, mirror, spa tap-to-place, size, shape).

## 12. Markup on pool diagrams

- **Website done.** **Mark Up** on the Pool Diagram opens the same full-screen markup tools
  (Pen, Arrow, Circle, Text, colors, Undo, Clear All) over the diagram. Saved per job in
  `job.diagram_markup` (jsonb, client-writable, synced; same format as `media.markup`,
  coordinates 0..1 of the diagram). The homeowner report's diagram shows the markup with the
  pins and the spa's place; the report snapshot now carries `property.diagram_layout` and
  `job.diagram_markup` (`20261012005600_pool_diagram_layout.sql`). The report shows the
  diagram when there are pins or markup.
- **Apps:** add Mark Up on the job's diagram, saving `job.diagram_markup` through sync; draw it
  over the diagram wherever the diagram appears, scaled as the website does (markup space
  800 x 500 over the 160 x 100 diagram, so lines weigh the same as on photos).

## 13. Filter and salt cell cleanings: due soon, weeks to go, and how often

- **Website done.**
  - **Today:** a visit whose plan has a cleaning due within a week of that visit (or overdue)
    shows a pill on its card with an icon: "Clean filter: due in 3 days", "Clean salt cell:
    due today", "...: overdue".
  - **Checklist:** a maintenance visit's Checklist tab shows **Regular cleanings** (under the
    Chemical button): each of the plan's cleanings with its icon, "On this visit's checklist"
    and "Today" when the item is on this visit, otherwise "Every 3 months · next Nov 30" and
    the countdown ("Due in 5 days" in orange within a week, else "In 6 weeks").
  - **Customer › Maintenance:** each plan's cleaning line has the icon and the countdown
    ("Clean filter every 3 months · $40.00 each · In 6 weeks (Nov 30)").
  - **Settings › Scheduling › Regular cleanings** (pool shops, owners and admins): the usual
    frequency for each cleaning (Monthly, 2 Months, 3 Months, 6 Months, Yearly), which new
    plans start with, and **Also change existing plans** (each keeps its next due date and
    repeats at the new frequency after it). Stored in
    `company.settings.maintenance.cleaning_months` (`{"svc_filter_clean": 3,
    "svc_salt_clean": 6}`). The per-plan frequency on the customer's plan stays.
  - Icons: a pleated cartridge for filters, a tube with a spark for salt cells, a repeat
    arrow for anything else (`apps/web/src/components/icons.tsx`).
- **Core:** `cleaningCountdown(nextDue, onDate)` → `{ days, weeks, soon, label }` (soon is 7
  days or less), `cleaningKind({ key, name })` → `filter | salt_cell | other`,
  `cleaningDefaultMonths(settings, key)`, `cleaningMonthsLabel`, `CLEANING_DUE_SOON_DAYS`;
  `CLEANING_MONTHS` is now 1, 2, 3, 6, 12.
- **Apps:** show the same pill on the app's Today/route list and the Regular cleanings box on
  the visit checklist (data: `plan_cleaning` + `component_type`, already synced to phones? It
  is office-only today (`device_sync = false`); either turn on device sync for
  `plan_cleaning` or read the cleaning item already on the visit (`job_component.
  plan_cleaning_id`). Ask before changing sync scope.

## 14. Pass the card fee on to customers

- **Website done.** Settings › Payments and Deposits › **Card fee** (owners): **Pass the card
  fee to customers** and **Card fee (%)** (default 3, at most 3; the hint says some states
  don't allow card fees). Stored as `company.settings.card_fee_bps` (0 = off).
  - On the customer's quote (deposit) and invoice pages, with the fee on and online payments
    ready, the one Pay button becomes two: **Pay $657.30 by Bank** (filled, no fee) and **Pay
    $677.02 by Card**, with the line "Paying by card adds a 3% card fee ($19.72). Bank account
    payments have no fee...".
  - Card starts a Stripe Checkout with card and Link only and the fee as its own line ("Card
    fee (3%)"); bank starts one with bank account only. The session's metadata carries
    `card_fee_cents`. The webhook records the payment without the fee (capped at 3%), so the
    invoice or deposit is paid exactly; the fee stays in the shop's Stripe balance.
  - Core: `cardFeeBps(settings)`, `cardFeeCents(amount, bps)`, `cardFeeChoice(amount, bps,
    what)` (labels and note), `CARD_FEE_MAX_BPS`. Server: `feeTerms`/`cardFeeFor` in
    `apps/web/src/server/stripe.ts`.
- **Apps:** customers pay on the website, so nothing changes in the apps unless an app shows
  totals before sending a pay link (then mention the fee the same way). If the apps get a
  settings screen for payments, add the same switch and percentage.
