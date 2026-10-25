# Added chemicals, charging for them, and monthly visit reports

Owner, 2026-10-24 (dictated): "For chemicals, you want to include an added chemicals section. So
we'll have the actual reading, the aim for, the suggested chemicals to add, and what was actually
added … some pool companies charge for chemicals, so that should be automatically invoiced in the
monthly portion, which means that we also have to have a setting asking owners whether they charge
for chemicals or not … on the maintenance report, we're going to have to include the added
chemicals. If the company charges for chemicals, that report should also include the price of
that chemical … for maintenance reports, we should have the option for them to go out either when
the tech leaves the home, or on a monthly basis, and it acts like side by side or with in hand
with the invoice."

Status: **design for the owner's approval; nothing built.** Mockups (phone, 390 px):
`video-delivery/chem-mockups/` and `contact-sheet.jpg`. Ships on all four platforms (desktop and
mobile website, iPhone, Android) with the same words and rules. Dates and "the 1st" are in the
shop's time zone (Eastern for the demo shop).

## 1. The visit's Chemicals section, restructured (mockups 1, 2)

The visit's **Chemical** dropdown (first on the Checklist, DECISIONS 2026-10-20) becomes
**Chemicals** and is laid out one row per reading, in the reading's own order (FC, pH, TA, CH,
CYA, salt):

| Reading | Aim For | Suggested | Added |
| --- | --- | --- | --- |
| typed | typed, or the recommended level as a placeholder (as today) | from `calculateChemistry`, with its order number (1, 2, 3 = the order to add them) and its safety note | defaults to the suggestion |

- **Phones** stack each row: name and status (Low / In range / High) with the Reading and Aim For
  boxes on one line, then a gray well with *Suggested* and *Added*. **Wide screens** show the
  literal table, one line per reading, with Price as a last column when the shop charges.
- **Added, one tap.** A suggestion shows as a Reminders-style empty circle, "Not added yet, 1½ lb
  Stabilizer". Tapping the circle adds it exactly as suggested (filled green check, "Added").
  Tapping the text opens the **Added Chemical** sheet to change the chemical or the amount, mark it
  Customer Supplied, add a note, or Remove. **Mark All Added** adds every open suggestion at once
  (the usual case: the tech did what it said).
- **Also Added** lists chemicals not tied to a suggestion (tabs, shock, algaecide, enzyme,
  clarifier, salt, phosphate remover and so on), with **Add Chemical** opening a sheet: the shop's
  price book chemicals with search, then an amount group (number field in the item's unit plus a
  −/+ stepper, Customer Supplied switch, note). Sheet: Cancel / Add, grabber, medium and large
  detents, swipe to dismiss asks first when something was typed.
- Under the rows: water balance (saturation index), the Chlorine and Acid products the suggestions
  are worked out for (moved down: set once, rarely changed), Notes, and, when the shop charges,
  **Chemicals today $15.25 · Billed on Rebecca's October invoice.** Techs see prices only when the
  shop charges.
- **Amounts in the item's unit.** The calculator's everyday measure becomes a number and a unit
  (`½ gallon` → 0.5 gal, `1½ lb` → 1.5 lb, `2 bags` → 2 bag). Steps: gal ¼, qt ½, lb ½, bag ½,
  tab 1, each 1; a suggestion smaller than one step (a splash, a scoop) defaults to one step,
  which the tech can lower to the exact amount by typing.
- **Saved as you go**, like the rest of the visit (2026-10-20: typed text saves by itself): each
  reading as typed, each added chemical on the tap. No Submit on a visit (question 4). The
  standalone Chemicals page (More › Chemicals, and a customer's pool) stays a calculator with
  Submit to the pool's log and no added chemicals, since those belong to a visit.
- **Typing and the keyboard** (owner, 2026-10-25: "There isn't a good way to minimize the number
  keyboard"; "a little laggy … when typing in multi digit numbers"). The readings save as typed
  text does everywhere (one-handed use, item 4): one second after typing stops, when a field is
  left and when the screen is left, never per keystroke; the levels aimed for are remembered on
  the device with each save. Typing redraws only the reading that changed. The number pads have
  no return key, so: iPhone apps show the keyboard bar (**Previous**, **Next**, **Done**, through
  Gallons, each Reading and Aim For, then Notes); Android's return key is **Next** and, on the
  last Aim For, **Done**; the website's fields show **Done** (`enterkeyhint`) and Enter puts the
  keyboard away. Scrolling the job page, or tapping beside the fields, puts it away too.

## 2. Data model

**New synced table `chemical_addition`** (one row per chemical added on a visit; a suggestion
that wasn't added is not a row, it's worked out live):

| Column | Notes |
| --- | --- |
| `company_id`, `job_id`, `property_id` | composite FKs; `property_id` copied so a pool's usage reads without the job (phones keep only recent jobs) |
| `price_book_item_id` | the chemical (nullable only if the item is later deleted) |
| `name`, `unit` | copied from the item when added, so a later rename doesn't rewrite history |
| `reading_key` | `fc`/`ph`/`ta`/`ch`/`cya`/`salt` for an accepted suggestion, null for Also Added |
| `suggested_quantity` | what the calculator said, for the Suggested column after a reload |
| `quantity` | numeric(8,2) > 0 |
| `customer_supplied` | boolean, default false: shown on the report, never billed |
| `note` | short text |
| `unit_price_cents` | integer; **set by the server** from the price book when the row arrives, never by a client |
| `billed_invoice_id` | server-set when a monthly invoice bills it |
| `added_by`, `added_at`, `sort_order`, sync columns | |

Why rows and not a list on the reading or the job: two techs (or two phones) adding chemicals on
one visit must both keep theirs under last-writer-wins sync, as with `job_repair`. The table
follows the CLAUDE.md rules: `app.make_synced`, `app.sync_table` (members read and write, `job_ref`
so phones keep a visit's additions with it; insert and update columns exclude `unit_price_cents`
and `billed_invoice_id`), the restrictive job-visibility policy, `guard_writable`,
`app.speed_up_policies()`, and a row in `tests.make_company()`.

**`chemical_reading`** becomes one row per visit, updated in place: its id is the visit's id (the
`job_repair` trick), so two phones write the same row. New column `goals jsonb` holds the Aim For
levels used, so the report shows the tech's level. This replaces "one entry per Submit" on visits
(DECISIONS 2026-10-20); readings submitted from the standalone page are still one row each.

**`price_book_item.chemical`** (new, nullable text): which calculator product an item is
(`liquid_chlorine`, `muriatic_acid`, `dry_acid`, `cal_hypo`, `baking_soda`, `soda_ash`,
`calcium_chloride`, `stabilizer`, `salt`, `tabs`, `algaecide`, `clarifier`, `enzyme`,
`phosphate_remover`), so a suggestion finds its price book item. Both strengths of liquid chlorine
or muriatic acid map to the one item; the first active item by sort order wins.

**`invoice_line_item`**: new `unit` (for "2¾ gal × $8.00") and server-set `chemical_item_id`
(to merge a re-drafted month into the same line).

**Core**: `chemistry.ts` steps gain `chemical`, `quantity`, `unit`; a new
`packages/core/src/chemical-additions.ts` holds units and steps, quantity formatting (2¾ gal),
suggestion → addition defaults, the month's grouping (the same figures as the SQL, checked by both
test suites), and the report rows. Ported to `apps/ios/Sources/SundeckCore` with fixtures.

## 3. Chemical prices (mockup 3)

Price book rows (config, not code), in the existing **Chemicals** category, priced per unit. The
five seeded items get their `chemical` key; new defaults are added to `app.config_default` for new
pool shops and to existing pool shops where the name is missing (never touching a shop's edits).
First drafts, taxable like the existing chemicals:

| Item | Price | | Item | Price |
| --- | --- | --- | --- | --- |
| Liquid chlorine (existing) | $8.00 / gal | | Baking soda | $3.00 / lb |
| Muriatic acid (existing) | $15.00 / gal | | Soda ash | $4.00 / lb |
| Stabilizer (existing) | $9.00 / lb | | Calcium chloride | $4.00 / lb |
| Salt, 40 lb bag (existing) | $18.00 / bag | | Dry acid | $5.00 / lb |
| Phosphate remover (existing) | $35.00 each | | Algaecide | $15.00 / qt |
| Chlorine tabs (3″) | $2.50 / tab | | Clarifier | $15.00 / qt |
| Shock (cal-hypo) | $6.00 / lb | | Enzyme | $18.00 / qt |

Only owners and admins edit the price book (as today).

## 4. "Charge for Chemicals" (mockup 3)

`company.settings.charge_chemicals`, **off by default**, owners and admins only. It sits at the top
of the price book's Chemicals group (Settings › Price Book on every platform), next to the prices
it gives meaning to, with a footer saying what on and off do.

- **On:** the month's added chemicals become lines on the customer's monthly invoice, **one line
  per chemical for the month** ("Liquid chlorine, October · 2¾ gal × $8.00 · $22.00"), at the price
  stored on each addition (two prices in one month make two lines). Why per chemical: the monthly
  invoice already bills service as one "Pool service, October" line; four weekly visits × three
  chemicals would be twelve lines, and the per-visit detail is in the report that goes with it.
  A customer with more than one pool gets the pool's street on the line, as plan lines do.
  Customer-supplied chemicals are never billed. Taxable per the item.
- **Off:** additions are still recorded and shown on reports and in the pool's log, without prices.
  The setting is read when a month is drafted; turning it on mid-month bills that whole month.
- **Billing rules**, following monthly invoices (DECISIONS 2026-10-14):
  `app.bill_maintenance_month` adds or merges the chemical lines on the month's **draft** and sets
  `billed_invoice_id`; a customer whose only unbilled item is chemicals still gets a draft. An
  addition made after the month's invoice was **sent** is never added to it: it bills on the next
  month's invoice, labeled with its own month. A billed addition can be changed only while its
  invoice is a draft (the line is rebuilt); once sent, a trigger refuses the change; voiding the
  invoice frees its additions to bill again.

## 5. The visit report (mockups 5a, 5b)

The report snapshot (`app.visit_snapshot`) adds the visit's additions, the Aim For levels and
whether the shop charged, frozen at send like everything else (sent reports stay immutable; a later
change shows only in a new version sent by hand).

- **Water Test** keeps its table; **Aim for** shows the tech's level when one was set, else the
  range; a **Water balance +0.3 · Balanced** line closes it.
- **Added Chemicals** follows: one line each, "½ gal Liquid chlorine", with why ("To lower pH",
  from the reading it answered) or its note. Charging: each line's price and **Chemicals $28.75 ·
  Billed on your October invoice, with tax.** Not charging: no prices at all. Customer supplied:
  "Supplied by you", never a price.
- The free-text "Added 1 gal liquid chlorine…" in the reading's notes is replaced by this list;
  Notes stays for anything else.

## 6. When reports go out (mockups 4a, 4b, 6, 7, 8)

Settings › Report Templates › Visit Reports becomes a segmented control **Each Visit | Monthly |
Off**, with **Send Automatically** (switch) under Each Visit. Stored in the existing
`company.settings.visit_reports`: `auto` (Each Visit, switch on), `manual` (Each Visit, switch
off; still the default), `monthly`, `off`. Installed apps that don't know `monthly` read it as By
Hand, which only shows Send Visit Report, so nothing breaks before they update.

- **Each Visit:** today's behavior, unchanged.
- **Monthly:** no report when a visit is completed. When the customer's **monthly invoice is
  sent**, the server freezes one **monthly service report** for that customer and month (a `report`
  row, `template_key` `maintenance_month`, versioned and superseded like visit reports) and the
  invoice message carries both links: one email ("Your October invoice and service report", buttons
  View and Pay Invoice and View Service Report) or one text with both links. The two stay separate
  pages, each linking to the other (the invoice shows an "October Service Report" row above its
  lines; the report has View October Invoice), because the invoice page carries payment and
  receipts and the report must stay frozen. The report: the month at a glance (visits, chemicals
  with their month totals and prices when charging, photos), then each visit newest first with its
  readings as status pills, what was added, what was done, and photos.
- Customers with **no invoice** that month (no priced plan, nothing billable) get the monthly report
  on its own on the 1st, from the daily run, by email.
- Techs can still send one visit's report by hand in any mode but Off.

## 7. Permissions, sync and edge cases

- **Techs** record readings and additions (any member, offline, through the sync layer: row plus
  outbox in one transaction). **Owners and admins** set prices, Charge for Chemicals and report
  timing, and edit draft invoices. Nobody writes an addition's price or billing directly.
- **Offline:** the phone shows the price from its synced price book; the server sets the stored
  price when the row arrives (the same unless the owner changed it meanwhile). Suggestions are
  computed on the device, so they work with no signal.
- **Two phones on one visit:** additions are separate rows; the reading row is shared and
  last-writer-wins per field, as today.
- **Sent things never change:** reports by snapshot; sent invoices by the billing trigger; late
  additions roll to next month instead.
- **Package:** pool care only (leak detection shops never see any of it).

## 8. Anything else (proposals)

Build now (small, and each makes the main feature better):
1. **Mark All Added**: one tap when the tech followed the suggestions (the usual visit).
2. **Customer Supplied** on each addition: the customer's own algaecide is recorded, not billed.
3. **Water balance on the report**: the saturation index is already computed; one line.
4. **Monthly usage on the pool's chemical log** (customer page and phones): "October: 2¾ gal
   chlorine, 1¼ gal acid, 12 tabs", so owners spot a pool that drinks chemicals.

Later (each needs its own decision):
5. **Unusual use alert**: a pool taking 2–3× its usual chlorine or acid can mean water loss; flag
   it to the owner as a leak lead (it fits Sundeck's leak side).
6. **Truck stock and low-stock reminders**: needs inventory, a new concept.
7. **Chemical cost and margin** on the Dashboard: needs a cost per item.
8. **Chemicals included in a plan** (up to a dollar amount a month) or per-customer prices.

## 9. Questions for the owner (recommended default first)

1. **Invoice lines:** one line per chemical per month (recommended), or one line per chemical per
   visit?
2. **Saving on a visit:** Chemicals saves as you go with no Submit (recommended, so a forgotten tap
   never loses billable chemicals), or keep Submit on visits too?
3. **Seeded chemicals and prices** (section 3): approve as drafted (recommended; every shop edits
   its own)?
4. **Monthly reports with no invoice:** send the month's report on its own on the 1st (recommended),
   or send nothing?

## 10. Build plan (after approval)

Migrations from `20261022003000` (checked against `supabase_migrations.schema_migrations`):
table and registry, price book key and defaults, server price and billing triggers, monthly
billing, snapshot and monthly report, report mode. Core logic with tests and matching pgTAP tests;
website (visit section, sheet, settings, report, monthly report, invoice link, email and text);
iPhone (SwiftUI: inset grouped sections, Reminders-style buttons, sheet with detents, Stepper plus
field; `swift format lint --strict`, CI builds and screenshots); Android (Expo); e2e for add,
bill, and both report modes; phone-size Playwright screenshots looked at before reporting.
