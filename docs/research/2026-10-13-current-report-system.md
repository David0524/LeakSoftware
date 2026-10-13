# What the design partner uses today (2026-10-13)

Source: one real customer report (PDF, 4 pages), a screen recording of the field app he
enters jobs in (Leaktronics), and a recording of the customer report page on a phone.
Customer names, addresses, contact details, and the shop's legal text are deliberately not
copied here: this repository is public.

## How his current tool works

**Report types** (one list each): Swimming Pool Leak Detection (about 200 reports), Swimming
Pool Inspection with Leak Detection (7), Plumbing Leak Detection (0). Report numbers are around
10,000, so the shop has years of history in that system.

**The tech fills in one long form, in tabs:**

1. **Contact information:** customer name, address, phone, several emails (all get the
   report), person responsible for payment, **price for the leak detection** ($599, $649),
   date performed, **tech name(s)** ("Javi and Cole": two techs on one job), notes.
2. **Phone questionnaire** (what the customer said when booking): pool water level dropping,
   spa level dropping, pool company told them to call, other; pool size (normal about 15x30 or
   20x40, smaller, larger, other); spa size, approximate dimensions, description.
3. **Job site:** photos.
4. **Visual leak inspection:** equipment area, backwash, around water feature, vinyl stretched
   (vinyl pools), noticeable tears in vinyl, structural cracks in pool, bond beam. Each item:
   Leaking / Attention / No leaks noted, plus Add Picture.
5. **Plumbing static test** ("hydrophoned and/or dye tested"): returns, skimmer, skimmer seam,
   skimmer suction, skimmer ports, main drain, all light niches and conduits, cleaner lines,
   side suctions, front to equalizer or main drain, structural cracks, spa jets, spa fill,
   surge tank, scum gutters. Each item: **Leaking / Attention / Not leaking / Not
   applicable**, a "Where" box when leaking, and Add Picture.
6. **Bond beam:** pool, spa, autofill, around all fittings, autofill EQ line (same four
   choices).
7. **Wrap-up:** "If static test failed on any line, pressure tested" (text), was the location
   marked (yes/no), leaks noted (text), summary notes with a **Generate with AI** button,
   estimate to follow (yes/no), additional photos.

**The customer report** (web page plus a PDF of the same):

- Header in the shop's red with logo, shop name, phone, email, website.
- Customer information: property, client, contact, email; date performed, report date,
  tech names, **price**.
- Summary: the tech's paragraph (in the example, the leak was found **and sealed during the
  same visit**).
- **Three tiles: "26 Items Pass", "0 Need Attention", "1 Failed".**
- Job site photos: one large, then a row of smaller ones.
- **Every checklist item with a colored badge** (NOT LEAKING, LEAKING, NOT APPLICABLE, NO
  LEAKS NOTED), grouped by section.
- "Leaks noted: Skimmer seam."
- The shop's long legal disclaimer (limits liability to the fee, venue, one-year claim limit).
- Footer in the shop color; Download PDF button.

## What this tells us

1. **The checklist is the report.** Customers (and the shop) expect every item listed with a
   clear verdict. Our report summarizes coverage in one sentence; his lists 27 items with
   badges and a pass / attention / failed count at the top.
2. **Four verdicts per item,** not "inspected or excluded": Not leaking, Leaking, Attention,
   Not applicable. Not applicable needs no reason. A leaking item needs "where".
3. **His item list is longer and more specific than our defaults** (skimmer seam, skimmer
   ports, cleaner lines, side suctions, equalizer, surge tank, scum gutters, autofill, bond
   beam areas, equipment area, backwash, water feature, vinyl checks), in three sections.
4. **Small repairs happen on the detection visit** (epoxy on a skimmer seam). The finding is
   repaired on site, not quoted.
5. **The detection fee is on the report.** He prices each job ($599 to $649) when booking.
6. **Two techs often go together.**
7. **Booking questions matter** (why they called, pool size) and come before the visit.
8. **The shop has its own disclaimer** that must appear on every report.
9. **He already has "Generate with AI".** AI writing alone is not a reason to switch. What is
   new for him: the AI is checked against the job data, the phone works with no signal,
   readings and the pool diagram, numbered findings, quotes with deposits, signatures,
   versions with a live link, and the office view.
10. **He has history** (about 10,000 report numbers). Importing past reports or at least
    continuing his numbering may matter at switch-over.

## Proposed changes (for the owner to approve)

Most are configuration rows and report layout; two need small schema changes.

| # | Change | Where | Size |
|---|---|---|---|
| 1 | Checklist verdicts: Not leaking / Leaking / Attention / Not applicable, with "where" and photos per item. Leaking or Attention offers to create a finding. | `checklist_item_result.outcome`, phone checklist | Medium |
| 2 | Checklist sections (Visual inspection, Plumbing static test, Bond beam) and his item list as the default checklist. Items without a test (vinyl stretched) use Yes / No. | `component_type.section`, seed | Small |
| 3 | Report: pass / attention / failed tiles, every item with its badge by section, "Leaks noted", fee, techs, date performed, large first photo. | report page and PDF | Medium |
| 4 | Shop disclaimer in settings, printed on every report. | company settings | Small |
| 5 | Repaired on site: a finding can be marked repaired during the visit, and the report says so. | finding status already exists; report wording | Small |
| 6 | Detection fee on the job (from the price book, editable), shown on the report and carried into the invoice (M9). | `job.fee_cents` | Small |
| 7 | Second tech on a job. | `job_tech` or `job.helper_user_ids` | Small |
| 8 | Booking questions (why they called, pool and spa size) as configurable questions on the job. | config rows, job form | Small |
| 9 | Several emails per customer; the report goes to all of them. | customer, send | Small |
| 10 | Continue report numbering from his current number; import of past reports later if wanted. | company setting | Small |

Suggested timing: right after M8 (quotes), before invoicing, so the field app and report match
how he works before the first pilot.
