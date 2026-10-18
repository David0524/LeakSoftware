# Handover (2026-10-16, updated)

For the next chat picking up Sundeck Pro. Read `CLAUDE.md` first, then this, then the newest
entries in `docs/DECISIONS.md` (2026-10-15 and 2026-10-16 cover everything below).

## Where things are

- **Branch:** `claude/cool-keller-efjc00`. Push only there and don't open PRs. Pushing deploys
  the website (https://leaksoftware-web.vercel.app).
- **Launch is planned for next week** (owner, 2026-10-16). The owner's own to-do list (Apple
  account and D-U-N-S, app ID, production Supabase project on Pro, Vercel Pro, Resend and the
  domain, final privacy and terms, Twilio A2P registration and geo permissions, `APP_BASE_URL`)
  is in the chat of 2026-10-16 and in `docs/release/LAUNCH.md` and
  `docs/release/security-review-2026-10-16.md`. The phone app has never been built for the store:
  the first EAS production build and a TestFlight install come first.
- **Overnight 2026-10-16:** design review with fixes (`docs/design/2026-10-16-launch-review.md`),
  security fixes from the texting review, the store listing for both packages, and two plans for
  the owner: `docs/plans/first-visit-speed.md` and `docs/plans/package-billing.md`.
- **Lesson:** don't use PostgREST `onConflict` against a partial unique index (Postgres can't
  infer it); insert and treat 23505 as a duplicate.
- **Texting migration is deployed** (2026-10-16): `pnpm db:deploy` applied
  `20261012003500_company_texting.sql`; the dev project has 35 applied, 0 pending. The
  `api.supabase.com` network secret must be a personal access token (`sbp_…`, from the
  Supabase account's Access Tokens page, not a project's publishable or secret key) sent as
  `Authorization: Bearer sbp_…`. Never print it.
- **Live site checked** as the demo owner (read-only): Messages shows the empty inbox ("No
  messages yet"), and Settings › Phone and Texting shows the demo-mode notice, Get a New
  Number, Use Your Shop's Number, and Your Mobile Number. No number was taken.
- **Onboarding and card-first trials (2026-10-16):** migration `20261012003600_onboarding.sql`
  needs `pnpm db:deploy` once CI is green. The website is safe before it: without the
  migration, `company_access` has no `onboarded`, so nobody is sent to onboarding. After it, new
  shops on a server with `STRIPE_SECRET_KEY` must add a card. Owner to-do in Stripe: turn on
  trial-ending reminder emails and the customer portal (no price ids needed any more).
- **Package defaults, walkthrough (2026-10-16):** migration `20261012003700_package_defaults.sql`
  changes `create_company` (a third argument, `company_services`); deploy it right after CI
  passes, since sign-up calls the new form. The pool price book is approved as drafted. Demo code
  VIP26 gets a new shop past the payment page without a card (`app.access_code`). The app's welcome cards and tips have not been seen on a device: check them in
  the first TestFlight build.
- **Data protection (2026-10-16):** customer links expire after 180 days and can be turned
  off; two-step sign-in (enforced by the database); limited techs see only their customers'
  conversations; `/security` page; DPA draft in `docs/legal/`. **Someone who lost their
  authenticator:** after checking it's really them (from their account's email), remove their
  factors in the Supabase dashboard (Authentication › Users › the user › MFA factors) and run
  `select set_two_step('<user id>', false);` in the SQL editor. Two-step's app screens have
  not been seen on a device.
- **Leads (2026-10-16):** `/admin/leads`. To see it: set `SUNDECK_STAFF_EMAILS` on Vercel to the
  owner's email, turn on two-step sign-in (More › Two-Step Sign-In), sign in again.
- **Import Customers (2026-10-17):** Settings › Import Customers for owners; `/admin/import` from
  Leads for staff. Parsing and matching in `packages/core/src/import.ts`, the server in
  `apps/web/src/server/import.ts`, all-or-nothing in `public.import_customers`.
- **Milestones:** M0 to M11 are built (see the 2026-10-14 handover in git history for
  M11). Since then the work has been owner requests, listed below.

## What was built 2026-10-15 and 2026-10-16 (newest first)

| Commit | What |
|---|---|
| `2d3683b`, `952164a`, `a88853a`, (this commit) | Overnight: design review fixes (pill contrast, keyboard menu, jug thirds), security fixes (sign-in redirect, number reservation, US/Canada only, conversation race), store listing, speed and billing plans. |
| `ea1631b` | Desktop Messages like a Mac (newest conversation beside the list); mark unread from the list (hover button, right-click); sign-up asks Pool Care, Leak Detection, or Both. |
| `942d9b7` | Owners on a computer land on the Dashboard (`/home` decides); phones and techs on Today. |
| `b9288a5` | Calculator: What to Add as a bottom bar and sheet, everyday measures (jugs, cups, pounds, bags), doses checked against references; gallon commas; light iOS placeholders (new `placeholder` token). |
| `eecefb9` | Mark as unread (shared by the team), On My Way setting (Sundeck Pro Messages by default), visible settings fields, calculator results first; CLAUDE.md: every page feels like iOS. |
| `1b4f7e2` | Screens visited in the last minute are kept: revisits are instant. |
| `5124899`, `552b905`, `b0afe0e` | Messages and Customers share one tab, Messages first; the job page shows its messages; sample texts with Sam Sample (`seed_demo_messages.sql`). |
| `6ae0932` | Chemical calculator: pool size in gallons only (shape and measurements removed). The website uses outlined number boxes, which are now visible on phones. |
| `1d0e3b5` (+ `c608693`, `e63c95d`) | **Company texting and calls**, like Housecall Pro. Details below. |
| `626d418` | **Pool care and leak detection are separate experiences.** Settings › Company › Services is Pool Care, Leak Detection, or Both; it hides the other side's features (DECISIONS lists exactly what). **Chemical calculator** on the website (Chemicals) and the phone (Settings › Tools, and on pool service visits). |
| `060f965`, `af7c18d` | Public home page: a real SaaS landing page with two packages. Pool Maintenance is the default and Leak Detection is the toggle (prices: flat tiers, DECISIONS 2026-10-16). Live demos are built from app parts. Prices are in `packages/core/src/plans.ts`. |
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
  - Messages inbox: its tab also holds Customers (a Messages | Customers switch; unread badge
    on the tab).
  - The job's Details shows the latest texts with the customer (Messages group).
  - Swipe a conversation right for Unread/Read (shared by the team); Mark as Unread inside it.
  - On My Way: Sundeck Pro Messages by default, or the tech's phone (Phone and Texting setting).
  - Settings › Phone and Texting: take a number, or enter the shop's existing one (stays
    pending until Sundeck Pro finishes it by hand); photos switch; who rings; greeting.
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

- **Security audit follow-ups (2026-10-17, owner to check):**
  - Stripe dashboard: confirm the webhook listens to connected-account events (Connect) and
    that `STRIPE_CONNECT_WEBHOOK_SECRET` is set. Payments now count only from the shop's own
    connected account, and subscription events only from the platform account.
  - Vercel: set `APP_BASE_URL` for Production (the site no longer trusts request headers on
    Vercel, but the production URL should be the custom domain).
  - The demo code VIP26 is in this public repository: it is now capped at 25 shops. For real
    partners, add private codes straight in the database (`app.access_code`), not in a
    migration.
  - Resend, Anthropic, Deepgram, Twilio and Vercel: set account-level spend limits. Sundeck Pro
    now also caps each shop per day (`DAILY_LIMIT_*` in `.env.example`).
- **Owner decisions:**
  - Texting number choice: a new number or the shop's existing one (both are supported).
  - Billing per package and people is built (DECISIONS 2026-10-16); check it once in Stripe
    test mode: sign up, add a test card, invite a third person, and see the proration.
  - Competitor prices on the home page (`competitorPrices`, dated October 2026) need re-checking
    at least quarterly.
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
