# Handover (2026-10-16, updated)

For the next chat picking up Tidemark. Read `CLAUDE.md` first, then this, then the newest
entries in `docs/DECISIONS.md` (2026-10-15 and 2026-10-16 cover everything below).

## Where things are

- **Branch:** `claude/cool-keller-efjc00`. Push only there and don't open PRs. Pushing deploys
  the website (https://leaksoftware-web.vercel.app).
- **Last code commit:** `03ec976`. **CI is green** on it, and `e2e/texting.spec.ts` passes in CI
  (36 of 36). Two fixes got it there:
  - `b0d885c` (test): the reply text shows both in the conversation and as the thread list's
    preview, so the test now looks inside the "Conversation with …" region.
  - `03ec976` (app bug): incoming calls were never logged. `call_log` was upserted with
    `ON CONFLICT (provider_sid)`, but `call_log_provider` is a partial unique index, which
    Postgres can't infer from that clause; the error was ignored. It's now a plain insert, with
    a duplicate (23505) treated as already logged, the same as incoming texts. Lesson: don't
    use PostgREST `onConflict` against a partial unique index.
- **Texting migration is deployed** (2026-10-16): `pnpm db:deploy` applied
  `20261012003500_company_texting.sql`; the dev project has 35 applied, 0 pending. The
  `api.supabase.com` network secret must be a personal access token (`sbp_…`, from the
  Supabase account's Access Tokens page, not a project's publishable or secret key) sent as
  `Authorization: Bearer sbp_…`. Never print it.
- **Live site checked** as the demo owner (read-only): Messages shows the empty inbox ("No
  messages yet"), and Settings › Phone and Texting shows the demo-mode notice, Get a New
  Number, Use Your Shop's Number, and Your Mobile Number. No number was taken.
- **Milestones:** M0 to M11 are built (see the 2026-10-14 handover in git history for
  M11). Since then the work has been owner requests, listed below.

## What was built 2026-10-15 and 2026-10-16 (newest first)

| Commit | What |
|---|---|
| (this commit) | Messages moved into the Customers tab; the job page shows its messages; sample texts with Sam Sample (`seed_demo_messages.sql`). |
| `6ae0932` | Chemical calculator: pool size in gallons only (shape and measurements removed). The website uses outlined number boxes, which are now visible on phones. |
| `1d0e3b5` (+ `c608693`, `e63c95d`) | **Company texting and calls**, like Housecall Pro. Details below. |
| `626d418` | **Pool care and leak detection are separate experiences.** Settings › Company › Services is Pool Care, Leak Detection, or Both; it hides the other side's features (DECISIONS lists exactly what). **Chemical calculator** on the website (Chemicals) and the phone (Settings › Tools, and on pool service visits). |
| `060f965`, `af7c18d` | Public home page: a real SaaS landing page with two packages. Pool Maintenance ($69) is the default and Leak Detection ($100) is the toggle; each includes 2 people, extra people cost $20/$25. Live demos are built from app parts. Prices are in `packages/core/src/plans.ts`. |
| `c20e8ca` | Primary buttons are filled blue with white text; orange is an accent only. |

A 74-second promo video was also made. It isn't in the repo; it lived in the old session's
scratchpad, which the next chat can't open.

## Company texting: how it works

- **Tables:** `phone_line`, `conversation`, `text_message`, `call_log`, plus a private `texts`
  storage bucket.
  - Only the server writes texts and calls.
  - Members read them and mark them read (unread is shared by the team).
  - Owners change the line's settings.
  - pgTAP test: `300_company_texting`.
- **Server:**
  - `apps/web/src/server/twilio.ts`: Twilio REST API (no SDK) and webhook signatures.
  - `apps/web/src/server/texting.ts`: send, receive, calls and voicemail.
  - Webhook routes live under `app/api/twilio/*`.
  - Phone API: `POST /api/texts`, `POST /api/calls`, `GET /api/calls/[id]/recording`.
- **Demo mode:** without `TWILIO_ACCOUNT_SID`, numbers are made up (555-01xx) and texts are
  saved as sent. Nothing goes out.
- **Calls:**
  - In working hours, all chosen mobiles ring at once (the owners by default).
  - After hours, or when nobody answers, the caller leaves a voicemail, which is recorded and
    transcribed.
  - Click to call rings your own mobile first, then connects you from the company number.
  - Each person's mobile number is `profile.phone`.
- **Website:**
  - Messages inbox, inside the Customers tab (a Customers | Messages switch; unread badge on
    the tab).
  - The job's Details shows the latest texts with the customer (Messages group).
  - Settings › Phone and Texting: take a number, or enter the shop's existing one (stays
    pending until Tidemark finishes it by hand); photos switch; who rings; greeting.
  - The customer page's Text button and On My Way on Today send from the company number when
    one is active.
- **Phone:**
  - Settings › Tools › Messages (list and conversation).
  - A text button on the job.
  - "My mobile number" in Settings.
- **To make it real:** the owner needs a Twilio account and A2P 10DLC registration, which give
  the three `TWILIO_*` env vars on Vercel. `SUPABASE_SERVICE_ROLE_KEY` on Vercel is also
  required for sending and webhooks.
- **Not built:**
  - push notifications for new texts;
  - automatic reminder texts;
  - report, quote, and invoice links through the company number;
  - per-tech visibility of conversations.

## Open items

- **Owner decisions:**
  - Texting number choice: a new number or the shop's existing one (both are supported).
  - Billing per package and per person: `plans.ts` exists, but Stripe still charges one price.
  - Launch items in `docs/release/LAUNCH.md`: bundle ID, Apple/Google accounts, Sentry, final
    terms and privacy text, domain.
- **Never checked on a real device:**
  - the services split, the calculator, and Messages on the phone app;
  - the M11 large-text and VoiceOver fixes.
- **Calculator:** readings aren't saved on the visit. Saving them is a possible follow-up if
  wanted.
- **Old pending tasks:** M8.5 field-parity items depend on the design partner's answers
  (BUILD_PLAN section 10).

## Working notes

- **Before every commit:** `pnpm format:check && pnpm lint && pnpm typecheck`, plus
  `pnpm test` (logic) and `pnpm test:db` (SQL).
- **CI:** also builds the website and runs Playwright against Supabase in Docker. Check the
  last run before pushing again. A push cancels the run in progress.
- **Watching CI:** the repository is public, so `curl -sS
  https://api.github.com/repos/David0524/LeakSoftware/actions/runs?head_sha=<sha>` works without
  a token. Wait on it with a background command, not repeated sleeps. Failed Playwright runs
  upload a `playwright-report` artifact; its `data/*.md` holds the page snapshot at the failure.
- **`pnpm test:db` locally** needs pgTAP: `apt-get install -y postgresql-16-pgtap` if
  `session-start.sh` didn't install it.
- **Database deploys:** run `pnpm db:deploy` only after CI is green on the migration's commit.
- **Seeing a page locally:**
  - Build with `pnpm exec next build`.
  - Start it with `pnpm exec next start -p 3100` in `apps/web`; it talks to the dev project.
  - Drive it with a throwaway Playwright spec using `signIn` from `e2e/helpers.ts`. Never print
    those demo credentials.
  - Run the spec with `E2E_BASE_URL=http://localhost:3100 NODE_USE_ENV_PROXY=1
    PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
  - Delete the spec afterwards.
  - Don't run e2e specs against dev that leave data behind.
- **Processes:** never kill them by pattern (`pkill -f`). Find the PID, check its command
  line, and kill that one.
- **Public repo:** no customer details, keys, or the partner's disclaimer text. Never print
  the Supabase access token.
- **Next.js:** this version differs from older docs (`apps/web/AGENTS.md`). After adding a
  route, run `npx next typegen` in `apps/web` so `PageProps`/`RouteContext` types know it.
- **PostgREST embeds:** on the composite foreign keys, name the constraint, e.g.
  `customer!conversation_customer_id_company_id_fkey(name)`. A bare `customer_id(...)` fails.
