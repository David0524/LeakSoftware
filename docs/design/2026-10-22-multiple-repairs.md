# Several repairs on one repair job

Owner, 2026-10-22: "On repair jobs, (in the intake and actually working the job) we need a button
to 'add additional repair'. It's common to go out and repair multiple parts in one job."

Built on all four platforms (desktop and mobile website, iPhone, Android) with the same words and
rules. The rules live in `packages/core/src/repairs.ts`, ported to
`apps/ios/Sources/SundeckCore/Repairs.swift` and checked by fixtures (`apps/ios/fixtures/cases/repairs.ts`).

## Data model: one row per repair

A new synced table, `job_repair` (`supabase/migrations/20261022000800_job_repairs.sql`):
`company_id`, `job_id`, `price_book_item_id` (optional), `description`, `price_cents`,
`sort_order`, plus the usual sync columns. It follows the table rules: composite foreign keys,
`app.make_synced`, registered in `app.sync_table` (members read and write, `job_ref` so phones keep
a job's repairs with the job), restrictive job-visibility policy, `guard_writable`,
`app.speed_up_policies()`, and a row in `tests.make_company()`.

Why not a list in `job.intake`: the sync is last-writer-wins per field, so a list inside one jsonb
field would lose one of two repairs added at once by two techs. As rows, each phone adds its own,
offline too, and both stay.

**The job's price is the sum.** `job.fee_cents` stays the job's price (lists, dashboards and
billing already read it). Phones write it with each change, so it updates at once offline. The
server keeps it right whatever a phone wrote: a trigger on `job_repair` locks the job and sets the
price to the live repairs' total, and a trigger on `job` turns any other price written on a repair
job that has repairs into that total. So two phones that each added a repair offline end at the
full sum.

**Older repair jobs** (booked as `intake.repair_item` plus `fee_cents`, no rows) show their booking
as their one repair. The first add or remove on such a job writes that booking as a row whose id
is the job's id, so two phones doing it at once write the same row, not two.

`intake.repair_item` is still written by New Job (the repairs' names, "Pump motor, Heater
igniter"), so older app builds still show what the customer needs.

## Screens

**New Job › Repair, From the Customer:** "What do they need?" (price book menu, its price filled
in), then **Add Additional Repair** adds another (menu labeled "Repair", **Remove**). The menu ends
with **Something else**, which shows "Describe the repair". Each repair has its own "Price ($)";
with two or more, "Total $635.00" shows beside the button. The visit's own Price field is gone on a
repair (its price is the repairs'). A repair with a name needs a price ("Enter a price like 185.");
a blank row is left out.

**The job's Details › Repairs** (between Assigned to and From the Customer, replacing the Price row
and the On Site price field on repair jobs): each repair with its price, a Total row, and **Add
Additional Repair**, which opens a sheet (Repair menu or Something else, Price, **Add Repair**).
A repair is removed by swiping left (Remove), its always-visible "⋯" button, or touch and hold /
right-click; each asks first ("Remove this repair?" / **Remove Repair**). Footer: "Billed on the
invoice, one line each."

Every change on the phones is a local write with the outbox (row and job price in one
transaction). The website writes as the signed-in member.

## Invoice and report

- `app.create_invoice_unchecked`: a repair job with repair rows bills one line per live repair
  (its description and price), then the accepted quote's lines and deposit credit as before. Jobs
  without rows still bill one "Repair" line from the price. Invoices already made don't change.
- `app.report_snapshot`: a repair job's "What we did" (`work`) lists the accepted quote's lines,
  then every live repair; with neither, the item it was booked for (`intake.repair_item`), as
  before. A job whose repairs were all removed lists none.

## Decisions for the owner

1. **Which price book items the job's Add sheet offers.** New Job keeps offering the items marked
   "Show when booking a repair" (or all when none are marked). On the job, every active price book
   item is offered, since techs replace parts they weren't called about. Say if it should be the
   same short list.
2. **Repair lines aren't taxed** on the invoice, as the job's single "Repair" line wasn't. A price
   book item's Taxable setting could carry over instead.
3. **No editing a repair's price in place.** Remove it and add it again. Say if techs need to edit
   one.
4. The Create Invoice hint on repair jobs still says "Copies the accepted quote…", written for
   quote-made repairs. It could say "Bills each repair…" on booked repairs.
