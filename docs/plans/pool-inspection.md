# Pool Inspection: a new job type for leak shops

Owner, 2026-10-20: "For leak detections, let's add Pool Inspection reports. Leak companies often
do a pool inspection when a new pool is built or whatever." Shared Leaktronics' "New Swimming
Pool Inspection with Leak Detection" form: "Huge report. Don't remove anything but you can
condense it. Pool inspection will be a new type of job."

The full form, every question word for word, is in
`docs/research/leaktronics-pool-inspection.md`: 11 tabs and 166 questions. Nearly every
question has its own Describe box and Take photo / Library buttons. Leaktronics shows all of
them, on one long page per tab.

## What we build

1. **A new job type, Pool Inspection** (`job.type = 'inspection'`), offered to leak shops
   (`offersLeak`). It sits beside Leak Detection and Repair in New Job, Jobs, Schedule and
   Today, on all four platforms. It has a price, like the detection fee.
2. **Its checklist is config, not code**: every question is a `component_type` row for the
   `inspection` job type, in `seed.sql` and the leak package defaults. Shops edit, reorder,
   add and remove questions in Settings › Checklist Components, as they do today.
3. **A Pool Inspection Report** for the customer, at the same `/r/{token}` link, with PDF,
   signature and send, like the leak report.

## Nothing removed, made shorter

Where Leaktronics' items go, and how each is condensed:

| Leaktronics | Sundeck Pro | How it's shorter |
| --- | --- | --- |
| 1. Contact information (13 fields) | The job's existing customer, pool address, bill-to customer, price, date, tech and internal notes | Nothing typed twice: the customer and pool come from New Job |
| 2. Phone Questionnaire | "From the Customer" (intake questions) for this job type, asked when booking | The 12 "features that apply" Yes/No pairs become one tap-all-that-apply list of chips; the heater types are a second chip list |
| 3. Jobsite Picture | A photo slot at the top of the checklist | Unchanged |
| 4.–11. Equipment, Self Cleaning, Heaters, Electrical Safety, Fencing and Child Barriers, Covers, Visual Leak Inspection, Plumbing Static Test | Checklist sections, one per tab, in the job's segmented sections (swipe between them) | See below |
| Leaks noted, Summary notes | The report's summary and findings, with Use Saved Report | Written once, on the report |
| Additional Photos | Job photos | Unchanged |

Inside each section:
- **One row per question.** The answer is a segmented control (Yes / No, or Leaking / Not
  Leaking / N/A, or the question's own choices) on the same row.
  - Describe and photos are two small icon buttons on the row.
  - Each opens only when used, and shows a count once it holds something.
  - That replaces about 150 always-open text boxes and 150 photo-button pairs.
- **Gate questions.** "Is solar present?", "Is there a booster pump?", "Is a salt system
  present?" and the like are the first row of their group. Answering No folds the rest of the
  group away, with "Not present" shown. Every question is still there, and Yes opens them all.
- **Groups** (Filtration System, Pool Pump, Spa Jet Pump…) are iOS grouped sections with their
  header; a group's photo button sits in its header.
- **Banners** stay word for word, as a notice at the top of their section and as a
  recommendation on the report. For example: "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A
  LICENSED GAS COMPANY", "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF
  BARRIERS MUST BE INSTALLED".
- **Flagged answers.** Each question knows which answer needs attention: "Does the system show
  visible leaking?" Yes, "Is the heater properly sized?" No.
  - Flagged answers are counted on the section's segment.
  - On the report they're listed first, as "Needs attention".
- **Progress.** The section shows "12 of 49 answered", and the job page's segmented control
  shows a count, as the checklist does now.

## Data model

Additions to the existing checklist (no new tables for answers):
- `component_type.job_type` allows `'inspection'`.
- `component_type.section` allows the 8 inspection sections.
- `component_type` gains:
  - `group_label`: the small header, e.g. "FILTRATION SYSTEM";
  - `gate`: this row opens or folds its group;
  - `options` (jsonb): the choices, each `{label, flag}`;
  - `notice`: a banner shown before this row.
- `component_type.answer` gains `choice` (one of `options`), `multi` (several), `text` and
  `number`, beside the existing `leak`, `yes_no` and `done`.
- `checklist_item_result` gains `value` (jsonb): the chosen option(s), text or number.
  `outcome` is still set (`ok` or `attention`) from the option's `flag`, so tallies, the
  Complete Job rule and the report keep working.
- `job.type` allows `'inspection'`.
- `report.template_key` allows `'inspection'`.
- Sync: the new columns are registered as client-writable, as the other checklist columns are.

## Report

A "Pool Inspection Report" in the shop's branding:
1. The header and the property strip, as on the leak report.
2. A summary with the tally (Pass / Needs Attention / Leaking).
3. **Needs attention**: every flagged answer, with its notes and photos.
4. Each section, as compact two-column rows: question and answer, with notes under the answer.
   Photos are grouped at the end of each section.
5. The recommendations (the banners) and the shop's terms.
6. Signature, then send.

Its text uses the same Write Draft, Use Saved Report and edit-before-send as the leak report.

## Decisions for the owner

1. **Gate questions fold their group** when the answer is No. Recommended: yes, it's the
   biggest saving, and nothing is lost.
2. **The 12 feature questions become one chip list**, asked when booking under From the
   Customer and editable on the job. Recommended: yes.
3. **Write Draft drafts the report summary** from the answers, as it does for leak reports.
   Recommended: yes, editable before sending.
4. **Price:** one price on the job, like the detection fee, from the Price Book (a new
   "Pool inspection" item). Recommended: yes.

## Order of work

1. Migration, seed (all 166 questions, word for word), core rules with tests (outcomes from
   options, gate folding, tallies), pgTAP.
2. Website: the job type, the checklist rows, the report.
3. iPhone and Android: the same, in the same piece of work.
4. Playwright and the app tests: an inspection from New Job to a sent report.
