# Session handoff (2026-10-13)

Branch `claude/cool-keller-efjc00`. Read `CLAUDE.md`, `docs/BUILD_PLAN.md`, and `docs/DECISIONS.md` first.

## Where things stand

| Milestone | State |
|---|---|
| M0–M6 | Done; owner accepted M5 and M6 without hands-on testing. |
| M7 Reports | Done and deployed to the dev project. Email and AI wait for the owner's keys (`docs/testing/M7-checklist.md`). |
| Website light/dark switch | Done (Auto / Light / Dark). |
| M8 Quotes and deposits | Done. CI run 28 green, including e2e at phone width with signed simulated Stripe webhooks (bank and card deposits, replay). Migration `20261012001300_quotes.sql` is deployed to the dev project. Real Stripe test mode waits for the owner's keys (`docs/testing/M8-checklist.md`). No formal M8 report was given to the owner yet. |
| M8.5 Field parity | **Built; CI green.** Waiting on the dev deploy and the owner's acceptance. See below. |
| M9 Invoicing | **Built** on `claude/cool-keller-efjc00` (migration `20261012001500_invoices.sql`, not deployed). Device and Stripe test-mode steps: `docs/testing/M9-checklist.md`. |

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

Built in commit `58a3d72`: the report page (tiles, every item by section, fee, both techs,
disclaimer, "repaired on site"), company settings (disclaimer, next job number), the office job
page (verdicts, second tech, fee, booking answers), report emails to `cc_emails` (editable on the
office customer page and by the phone's send button), the second sample job, and its e2e.

1. **Deploy:** `pnpm db:deploy -- --seed` applies `20261012001400_field_parity.sql` and `20261012001500_invoices.sql` to the dev
   project, adds the second sample job, and gives the M4 sample its Return 3 and light
   verdicts. It needs the Supabase access token in the session's network secrets; the session
   that built this did not have it (HTTP 401). The website on Vercel uses the dev project, and
   the migration only adds columns, so the code already live keeps working.
2. Then run the e2e against the dev project and report M8.5 to the owner.

## Things to know

- **Design reviews:** no per-milestone reviews anymore. Use the apple-design skill while planning screens; there is one full review before the pilot (owner decision, `CLAUDE.md`).
- **Pushing:** each push cancels the in-progress CI run (concurrency). Don't push while waiting on a result you need.
- **Deploying:** `pnpm db:deploy` applies every pending migration in the folder. Move unfinished migrations aside if you deploy early.
- **Repo is public:** never commit customer details or the partner's disclaimer text from his sample report.
- **Hosting:** the website is live at https://sundeckpro.com (on Vercel; https://leaksoftware-web.vercel.app still works). Production builds from `claude/cool-keller-efjc00`, so every push there goes live. Report PDFs need files that Next's tracing misses; `apps/web/next.config.ts` adds them for the PDF routes.
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
