# Session handoff (2026-10-13)

Branch `claude/cool-keller-efjc00`. Read `CLAUDE.md`, `docs/BUILD_PLAN.md`, and `docs/DECISIONS.md` first.

## Where things stand

| Milestone | State |
|---|---|
| M0–M6 | Done; owner accepted M5 and M6 without hands-on testing. |
| M7 Reports | Done and deployed to the dev project. Email and AI wait for the owner's keys (`docs/testing/M7-checklist.md`). |
| Website light/dark switch | Done (Auto / Light / Dark). |
| M8 Quotes and deposits | Done. CI run 28 green, including e2e at phone width with signed simulated Stripe webhooks (bank and card deposits, replay). Migration `20261012001300_quotes.sql` is deployed to the dev project. Real Stripe test mode waits for the owner's keys (`docs/testing/M8-checklist.md`). No formal M8 report was given to the owner yet. |
| M8.5 Field parity | **In progress** (approved by the owner). See below. |

## M8.5: what's done

Plan: `docs/BUILD_PLAN.md` § M8.5. Background: `docs/research/2026-10-13-current-report-system.md`.

- Migration `20261012001400_field_parity.sql` (committed, CI not yet confirmed, **not deployed**):
  - checklist verdicts (`outcome`, `location_text`); method and reason are no longer required;
  - `component_type.section` / `answer` / `applies_to_pool_type`, and the partner's 27-item default list;
  - job fields: `fee_cents`, `second_tech_id`, `intake`, `location_marked`;
  - `customer.cc_emails`, `company.report_disclaimer`;
  - `set_next_job_number`;
  - booking questions in `company.settings.intake_questions`;
  - an extended `app.report_snapshot`.
- Core:
  - verdict types, `checklistTally`, `verdictLabel`, `CHECKLIST_SECTION_LABELS`, `splitEmails`, `IntakeQuestion`;
  - narrative facts, the plain draft and the number check use verdicts and "repaired on site".
- Tests: `supabase/tests/100_field_parity.test.sql`; the rule, sync and core tests are updated for the new rules.
- Phone (last commit):
  - sectioned checklist with a one-tap verdict and "where" (`features/inspection/ChecklistTab.tsx`, `verdict.ts`);
  - item screen reworked;
  - new-job form: booking questions, detection fee from the price book, second tech, other emails;
  - job screen: fee and "location marked".

## M8.5: what's left

1. **Website report** (`apps/web/src/components/report-view.tsx`):
   - pass / attention / leaking tiles (`snapshotTally`);
   - every item with a verdict badge, grouped by section;
   - "Leaks noted", fee, both techs, date performed, a large first photo;
   - "repaired on site" wording on findings;
   - the disclaimer before the footer;
   - booking answers (optional).
   - Keep the reports e2e strings working, or update `e2e/reports.spec.ts`: it checks "Not inspected" and "No diver on site".
2. **Settings**:
   - disclaimer textarea and "next job number" (`set_next_job_number`) on Company settings;
   - editing booking questions can wait.
3. **Office job page**: show the fee, second tech, booking answers, and verdicts in the checklist table (it still shows the old inspected/excluded wording).
4. **Report email** goes to `cc_emails` too (`apps/web/src/server/reports.ts`), and the phone/office customer edit for extra emails.
5. **A second sample job** in `supabase/seed_sample_job.sql`, entered the partner's way: two techs, the 27 items, one leaking skimmer seam repaired on site, a fee. Keep the M4 sample job unchanged, because e2e depends on it. Add an e2e for it as the M8.5 "done when" (web page and PDF show the counts, itemized verdicts, fee, and disclaimer).
6. Run all checks; wait for green CI; `pnpm db:deploy`; run the e2e against the dev project (`NODE_USE_ENV_PROXY=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`); report M8.5 to the owner, then M9.

## Things to know

- **Design reviews:** no per-milestone reviews anymore. Use the apple-design skill while planning screens; there is one full review before the pilot (owner decision, `CLAUDE.md`).
- **Pushing:** each push cancels the in-progress CI run (concurrency). Don't push while waiting on a result you need.
- **Deploying:** `pnpm db:deploy` applies every pending migration in the folder. Move unfinished migrations aside if you deploy early.
- **Repo is public:** never commit customer details or the partner's disclaimer text from his sample report.
- **Hosting:** the website is live on Vercel at https://leaksoftware-web.vercel.app. Production builds from `claude/cool-keller-efjc00`, so every push there goes live. Report PDFs need files that Next's tracing misses; `apps/web/next.config.ts` adds them for the PDF routes.
- **Owner setup still pending:**
  - `APP_BASE_URL` in Vercel (the site address, for links in emails);
  - `ANTHROPIC_API_KEY`;
  - Resend and a verified domain;
  - a Stripe test account, Connect, and keys;
  - `SUPABASE_SERVICE_ROLE_KEY`;
  - `EXPO_PUBLIC_API_URL`.
- **Demo sign-ins:** `owner@demo.leakbook.test` / `tech@demo.leakbook.test`, password `leakbook-demo`.

## Also requested

Route optimization with scheduling has its own handoff: `docs/ROUTE_OPTIMIZATION_HANDOFF.md`.
