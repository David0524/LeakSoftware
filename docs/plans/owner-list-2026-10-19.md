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
