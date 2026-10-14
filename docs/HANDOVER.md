# Handover (2026-10-14)

For the next session or account picking up Tidemark. Read `CLAUDE.md` first, then this, then
the newest entries in `docs/DECISIONS.md`.

## Where things are

- **Branch:** `claude/cool-keller-efjc00`. Everything is pushed. CI was green on the last commit
  (`eae9639`).
- **Milestones:** M0 to M10 done, plus the extras below. **M11 (launch hardening) is built as
  far as code goes**; its "Done when" (the design partner uses a TestFlight build on real jobs
  for a week with no data loss) is waiting on the owner's Apple account. Steps are in
  `docs/release/LAUNCH.md`.
- **Dev database:** the owner applies migrations from another chat with `pnpm db:deploy`.
  `20261012002600_report_sign_off.sql` is applied (the owner has signed reports with it).
  Run `pnpm db:deploy` after pulling to apply `20261012002800` and `20261012002900`.

## What this stretch added (newest first)

| Commit | What |
|---|---|
| `eae9639` | Signing in opens Today. Desktop schedule shows every tech; phones keep one-person chips. Speed: Sentry's browser code loads only when set up; Jobs pages 50 at a time with Show More and search; job page, Today, and schedule start their reads together; team and company read once per page. |
| `605c399` | M11 design review (`docs/design/2026-10-14-m11-review.md`) with every Critical and High fixed: link `#1A63A0` and warning `#8A5A0E` tokens, website text in rem, app text scales with Dynamic Type, 44 pt links. Cancel Job moved to the end of Details; Sign Out on More on phones; skip link; "min short" reads "min late". |
| `c74eaa0` | EAS build profiles, Delete My Account (app Settings and website More), draft privacy and terms, `/status` and `/api/health`, `docs/release/LAUNCH.md`. |
| `eaf5664` | Sentry (web and app, off without a DSN, no customer data); error and not-found screens; offline edge cases (revoked sign-in, full storage, app update with unsent changes) with tests; a job index on the phone database (1,000 jobs and 10,000 photos tested). |
| `b3b506d` | Signatures: the newest of each kind replaces the old one on a new version; signatures can be removed. |
| `340b37d`, `e439656` | Design pass: pills, soft cards, round icon buttons for call/text/email. Logo goes to Today. |
| `33767f4` | Review with Customer: the customer reads the report on the tech's phone and signs at the bottom; signing finishes and locks the version; Customer Not Here; the PDF never waits for a signature. |
| `309a105` | New Job books maintenance (one visit or a plan); schedule month view, date picker, chips; shorter Today cards. |

## Open items

**Owner decisions** (also in `docs/release/LAUNCH.md`):
- Bundle ID: still `com.leakbook.app`; recommended `app.tidemark.field` before the first upload.
- Apple Developer (company, needs D-U-N-S), Google Play, Sentry project, uptime monitor on `/api/health`.
- Final privacy policy and terms text (pages are marked drafts); support mailbox
  (`support@tidemark.app` placeholder, `SUPPORT_EMAIL`); domain purchase.

**Questions for the design partner (the owner's cousin):** checklist items and test thresholds,
real report examples and readers, typical repair prices, whether repairs are taxed and the
deposit, where jobs come from and who pays, how monthly maintenance billing should look,
water-chemistry readings and post-visit emails, pricing and pilot. List in BUILD_PLAN
section 10 and DECISIONS.

**M11 review:** every finding is fixed (see the review's Fixes section). The app's findings
were fixed from reading code; they still need a check on an iPhone with large text and
VoiceOver.

**Built 2026-10-14 (second pass):** job visibility reaches the server functions and stored
files (`20261012002800`); monthly maintenance invoices (`20261012002900`, Invoices page
"Maintenance to Bill", daily run on the 1st). See DECISIONS.

## Working notes

- Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:db` before
  every commit; CI also builds the website and runs Playwright against Supabase in Docker.
- Pushing cancels the CI run in progress.
- `DB_TIMING=1` logs every database call with its start time, to spot calls that wait on each
  other.
- Never kill processes by pattern (`pkill -f`, `pgrep -f` in a command that contains the
  pattern); it kills the shell. Find the PID and kill that.
- The repository is public: no customer details, keys, or the partner's disclaimer text.
