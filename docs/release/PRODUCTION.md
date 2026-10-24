# Production Supabase project

The website (sundeckpro.com) and both apps run today on the Supabase project `leakbook-dev`
(ref `evmxdfasurkaxbwkceti`), which also holds the shared demo company, the e2e test runs and
every session branch's migrations. Real shops get their own project before they sign up. The
owner creates it (it costs money); Claude does the rest with one script, and this page says who
does what and in which order.

## 1. What the live setup depends on

Most of it is in the migrations, so the new project gets it by running them. The rest is
copied by `scripts/provision-project.mjs` or set by hand, as below. Read from the dev project on
2026-10-24 through the Management API (read-only).

| Part | On dev | How production gets it |
|---|---|---|
| Tables, RLS, functions, sync registry | 109 of the repository's 110 migrations | Migrations |
| Shop configuration: checklist components, test types, severities, exclusion reasons, report templates, price book, sample inspection | `app.config_default` (7 kinds) | Migrations. `supabase/seed.sql` and the `seed_*.sql` files hold only the demo company and are never loaded |
| Job status rules, sync table registry, map budgets, the VIP26 code | `app.*` tables | Migrations |
| Storage buckets (`media`, `company-assets`, `documents`, `texts`), their size and type limits, 16 storage policies | | Migrations (`…000700_storage`, `…003500_company_texting`, `…2500_upload_limits`) |
| Extensions `pgcrypto`, `pg_trgm` | | Migrations. The others (`pg_stat_statements`, `uuid-ossp`, `supabase_vault`) every project has |
| Card required at sign-up | `app.platform_setting` | Script (the website also sets it the first time it bills) |
| Sign-in settings: passwords 10+ with lower, upper, digit and symbol; 1-hour sessions with refresh-token rotation; 8-digit email codes; two-step (TOTP) and passkeys for sundeckpro.com; rate limits | Auth config | Script copies them |
| Site URL and redirect URLs | `https://sundeckpro.com/`, plus localhost, Expo and Vercel previews | Script sets production's only: `https://sundeckpro.com/**`, `https://www.sundeckpro.com/**`, `https://leaksoftware-web.vercel.app/**`, `sundeckpro://**` |
| Email confirmation on sign-up | On | Script keeps it on |
| Supabase's own email (SMTP) | None: Supabase's built-in mailer, 2 emails an hour for the whole project | Resend, with the owner's key (step 2.4). The website sends its own confirmation, sign-in and reset emails through Resend already; Supabase's email is the fallback |
| Email templates | Supabase's defaults (they can't be changed without custom SMTP) | Script installs `supabase/templates/` once SMTP is on |
| Storage per-file limit 50 MB, API schemas, 1,000-row limit, search path | Project settings | Script copies them (never the JWT secret) |
| Statement timeouts (anon 3 s, signed-in 8 s) | Supabase defaults | Same defaults; the script checks them |
| Edge functions, cron jobs, database webhooks (`pg_net`), Vault secrets, project secrets, auth hooks, Realtime publications, SSO or social sign-in, `app.*` database settings | None used | Nothing to do. (`app.quote_server` and `app.invoice_server` are per-transaction flags the functions set themselves) |
| Network restrictions, SSL enforcement | Open, not enforced | Same defaults |
| Website's connection | Vercel env vars, falling back to `config/supabase-dev.json` when unset | Owner sets Production's (section 5) |
| iPhone app's connection | Was compiled in | Now a build setting; the TestFlight workflow's `backend` choice (section 6) |
| Android app's connection | `EXPO_PUBLIC_*`, falling back to dev | The Android workflow's `backend` choice sets them on EAS (section 6) |

**Callbacks:** nothing outside calls the Supabase project itself. Stripe's webhook
(`/api/stripe/webhook`), Twilio's numbers (`/api/twilio/sms`, `/voice`, `/status`,
`/recording`, `/transcription`) and Vercel Cron (`/api/cron/daily`, `/weekly`) all call the
website, whose address doesn't change. Resend and Sentry call nothing back. What does change is
the data those services point at: Stripe customers and subscriptions, Stripe Connect accounts
and Twilio numbers made for the test shops belong to dev rows (section 8).

## 2. Plan and region (owner's choice)

**Plan: Pro, $25 a month.** Free isn't fit for real shops: a Free project pauses after a week
without use, has no backups, and sends at most 2 sign-in emails an hour. Pro has daily backups
kept 7 days (point-in-time recovery is an add-on), no pausing, and room to grow (8 GB database,
100 GB files).

- **Recommended:** a new organization on Pro for production only, and leave dev where it is on
  Free. About $25 a month.
- Upgrading the existing organization instead puts both projects on Pro. Pro's $25 includes
  compute for one small project; the second (dev) adds about $10 a month. Check the current
  numbers on supabase.com/pricing before choosing.

**Region: West US (Oregon), `us-west-2`,** the same as dev. The website's server runs in
Vercel's Portland region (`pdx1` in `vercel.json`), so the database next door keeps each page's
round trips short. Other regions work but every page gets slower.

## 3. What the owner does

1. supabase.com › your account › **New organization**: name it "Sundeck Pro", plan **Pro**, add
   the card. (Or upgrade the existing organization; section 2.)
2. In that organization, **New project**:
   - Name: `sundeck-prod`
   - Database password: press Generate, and keep it in your password manager. Claude doesn't
     need it; don't send it.
   - Region: **West US (Oregon)**
   - Leave the rest as it is (Data API on, the default compute size).
3. Wait until the project says it's healthy (a minute or two).
4. Optional, for Supabase's own email: Resend › API Keys › Create, "Sending access" for
   `send.sundeckpro.com`. Then Supabase › the new project › Authentication › Emails › SMTP
   Settings › Enable custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password
   the Resend key, sender `account@send.sundeckpro.com`, name `Sundeck Pro`. (Or put the key in
   the cloud environment's secrets as `SUPABASE_SMTP_PASSWORD` and Claude sets it.)
5. **Send Claude:** the project's reference, the 20 letters in its address
   (`supabase.com/dashboard/project/<ref>`), and whether you did step 4. Nothing else: never
   send keys or passwords in the chat.

If Claude's next step says it can't reach the project (HTTP 401, 403 or 404), the cloud
session's Supabase token doesn't cover the new organization. Then Supabase › Account ›
Access Tokens › Generate, and put it in the cloud environment's secrets as
`SUPABASE_ACCESS_TOKEN`.

## 4. What Claude then runs

```bash
pnpm db:provision -- --ref <ref>            # dry run: shows every change
pnpm db:provision -- --ref <ref> --apply    # migrations, sign-in, storage, API, platform settings
pnpm db:provision -- --ref <ref>            # again: the check must pass with nothing to change
```

The script refuses `--apply` against the dev project. It ends with a check against dev: every
migration applied, the same configuration rows, buckets, storage policies, extensions and
timeouts, the sign-in settings as set, and no demo data. It writes
`config/supabase-prod.json` (the URL and publishable key, both public), which Claude commits.

Then:

1. The App Review shop on production (section 9):
   `pnpm review:account -- --ref <ref> --with-tech --apply`. The two passwords are printed once;
   Claude passes them to you for App Store Connect and nowhere else.
2. Makes the `backend` choice default to `production` in `.github/workflows/testflight.yml` and
   `android.yml`, and commits.
3. After you've switched the website (section 7, step 2): starts the TestFlight and Android
   builds with backend production, and checks sign-in, sync, a photo upload and a report PDF
   against production with the review shop.
4. Makes David's and Cole's staff logins on production (no shop), as on 2026-10-22; each sets
   up two-step sign-in again on first visit to the Admin portal.

## 5. Vercel environment variables (owner)

Vercel › the web project › Settings › Environment Variables. Change these for **Production
only**:

| Name | New value (from Supabase › the new project › Settings › API Keys) |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the publishable key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key (`sb_secret_…`; or the legacy `service_role` key, whichever kind the current value is) |

- **Preview and Development must stay on dev.** If any of the three is set for "All
  Environments", edit it to Production only, and give Preview the dev project's values (or leave
  Preview without them: the site then falls back to the dev project in
  `config/supabase-dev.json`).
- `SUPABASE_DB_URL` isn't used by the website; nothing to change.
- Everything else stays as it is: Stripe, Twilio, Resend, Mapbox, Apple Maps, APNs, Sentry,
  `CRON_SECRET`, `APP_BASE_URL`, `SUNDECK_STAFF_EMAILS`, `DEEPGRAM_API_KEY`, the daily limits.
  (Switching Stripe to live keys is its own launch step, `docs/release/LAUNCH.md`.)
- Then Deployments › the latest production deployment › Redeploy.

Nothing to set by hand on EAS or GitHub: the workflows read `config/supabase-prod.json`.

## 6. App builds

The apps carry the Supabase address and key inside the build, so **each needs a new build** to
move to production. Builds already installed keep using dev.

- **iPhone:** GitHub › Actions › TestFlight › Run workflow, backend **production**. The
  workflow passes the values as build settings (`SUNDECK_SUPABASE_URL`, `SUNDECK_SUPABASE_KEY`,
  `SUNDECK_WEB_URL`), checks the archive has them, and names the backend in the run's summary.
  A new TestFlight build, then a new App Store submission.
- **Android:** GitHub › Actions › Android › Run workflow, backend **production**. It sets
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL` on EAS's
  production environment from the same file, every run.
- A build with backend **dev** still works for testing against dev.

## 7. Cut-over order

Only the owner's test shops use the live site today, so a short gap is acceptable; do it at a
quiet time, in this order.

1. Before: Claude provisions and checks production (section 4), makes the review shop, and
   commits `config/supabase-prod.json`. Nothing live changes yet.
2. You switch Vercel's Production variables and redeploy (section 5). From here
   sundeckpro.com signs people in to production. Sign up a test shop on the website to see it
   work.
3. Claude starts the production iPhone and Android builds right away (about 30 to 60 minutes).
   Until testers install them, the old builds still sign in to dev, but anything that goes
   through the website (report PDFs, sending quotes, invoices and texts, transcription) fails for
   them, because the website now checks sign-ins against production.
4. You and your testers install the new builds and make your accounts again (section 8).
5. Clean up (section 8): Stripe test subscriptions, Twilio numbers.

## 8. Existing users: start fresh (recommended)

Recommended: **start fresh.** Production begins empty; you, Cole, David and the test shops sign
up again. Dev keeps everything (nothing is deleted there), but after step 7.2 the website no
longer shows it.

What you lose on production:

- The accounts: yours, cole@, David's and Cole's staff logins (with their two-step setup), and
  the test logins. Passwords and two-step sign-in are set up again.
- The test shops and everything in them: Canyon State, Blue Mesa and the other video shops,
  "David's" shops, Cole's Pool Care, the Stripe and Loop test shops. Their customers, jobs,
  reports, photos, texts, quotes and invoices.
- Customer links already sent from them (`/r/…`, quotes, invoices): they stop opening.
- Phones' push registrations (they register again on sign-in).

Also to tidy up:

- **Stripe:** the test shops' subscriptions and connected accounts belong to dev's shops. Cancel
  the test-mode subscriptions; their webhooks would otherwise reach production and find no shop.
- **Twilio:** numbers bought for test shops still send their texts and calls to the website,
  which no longer knows them. Release them (Twilio › Phone Numbers), or keep one for a shop you
  make again and Claude attaches it to the new shop.

Moving instead is possible (copy the sign-ins with their password hashes, each shop's rows and
its files) but takes about half a day, carries test data into production, and gains little
while every shop is a test shop.

## 9. App Review account

`scripts/review-account.mjs` (`pnpm review:account -- --ref <ref>`) makes a shop for Apple's
and Google's reviewers, separate from the demo company: **Palo Verde Pool Service (App
Review)**, owner `appreview@sundeckpro.com`, and with `--with-tech` a tech,
`appreview.tech@sundeckpro.com`. Dry run by default; `--apply` makes it, with new random
passwords printed once and saved nowhere. Run it again before each submission: it resets the
passwords, removes any two-step sign-in a reviewer turned on, and remakes the data, so today's
route and jobs are current.

- **Data:** 24 customers with pools in Phoenix (example.com addresses, `(602) 555-01xx`
  numbers, which are reserved for fiction), a weekly route of three stops every day of the week,
  yesterday's finished leak detection with its checklist, pressure test, finding, sent report,
  sent quote and sent invoice, and leak detections today at 1 PM and tomorrow with checklists to
  work.
- **No card gate, no lock:** billing goes through the Admin portal's own functions, Extend
  Trial (which also marks setup finished) and then Make Demo: the demo plan never asks for a
  card, never ends and never locks, like the demo shop. A trial alone would lock the shop 30 days
  later, possibly mid-review.
- **Sends nothing by itself:** customers are opted out of reminder and review emails, quote and
  invoice reminders are off, and visit reports go only when sent by hand.
- **The App Review shop switch** (`company.review_shop`, migration
  `20261022002800_review_shop.sql`; set only by the service role, so by this script, never by a
  member): whatever a reviewer does by hand, nothing reaches a real person, and the flows look
  normal (`apps/web/src/server/review-shop.ts`):
  - Texts are recorded as sent and never handed to Twilio, as on a server without Twilio keys.
    The shop gets a made-up texting number, `(602) 555-0100` (its own phone, reserved for
    fiction), so Messages works as in any shop; nobody can text or call it.
  - Emails (reports, quotes, invoices, receipts, reminders, Email Customers, the weekly summary)
    are recorded as sent and never handed to Resend, except to addresses at `sundeckpro.com`,
    which still get them, for testing.
  - Phone numbers can't be searched for, bought or set up: "Phone numbers can’t be added to the
    App Review shop." Calls aren't placed (a call rings the caller's own phone first): "Calls
    can’t be placed from the App Review shop." Every platform shows the server's words.
  - Invites aren't emailed by Sundeck Pro (the owner copies the link), so there's nothing to
    hold there. Sign-in, password reset and confirmation emails go to the person's own address,
    as for everyone.
- It refuses `--apply` on the dev project without `--allow-dev`. Putting it on dev (for a
  TestFlight review of a dev build) is the owner's call.
- Make `appreview@sundeckpro.com` a Google Workspace alias or group of yours, so a password
  reset a reviewer asks for reaches you.

Without the switch, the owner login could buy a real Twilio number, text or call any US
number, and email reports, quotes and invoices to any address (owner's decision, 2026-10-24:
build the switch).

**App Store Connect › App Review Information:** sign-in required, the owner login and its
password, and notes like: "Sign in with the account above (a shop owner in our sample shop).
Today shows the day's route; open a stop or the 1 PM leak detection to work its checklist, add
a photo, then Report › Review with Customer. Customers › Monica Reyes has a sent report, quote
and invoice. The sample customers are fictional (example.com, 555 numbers). Shops subscribe on
our website; the app has no purchases."

## 10. Session branches and deploys

- `pnpm db:deploy` with no `--ref` deploys to **dev**, as session branches do now. The
  production project needs `--ref <ref> --production` together; without `--production`
  `db:deploy` refuses it (once `config/supabase-prod.json` exists), and it never takes `--seed`.
- `pnpm demo:reset` refuses the production project. `pnpm test:hosted`, the e2e tests and
  `test:db` use dev or a local database, never production.
- **Proposed rule for CLAUDE.md (owner to approve):** a migration reaches production only from
  the default branch: after CI is green and right before merging, `pnpm db:deploy -- --ref
  <prod-ref> --production`, then merge (Vercel deploys the website on merge, and its code may
  need the migration). Session branches keep deploying to dev only.

## 11. Rollback

- **Before real shops sign up:** set Vercel's Production variables back to the dev values (or
  remove them: the site falls back to dev) and redeploy, or use Vercel's Instant Rollback to
  the previous deployment. In TestFlight, testers can install the previous (dev) build; on
  Google Play, roll the internal track back to the previous release.
- **After real shops sign up:** don't switch back; their data is only on production. Fix
  forward. Pro's daily backups restore the database as of a day (Supabase › Database ›
  Backups); point-in-time recovery is an add-on worth turning on before launch.
- **A bad migration:** fix it with a new migration (migrations never get edited after they
  run).

## 12. Decisions for the owner

1. The plan: a new Pro organization (about $25 a month) or upgrading the existing one (about
   $35 a month with dev).
2. The region: West US (Oregon), recommended.
3. Start fresh (recommended) or move the test shops.
4. A dev web address. After the switch, sundeckpro.com serves production, so dev-backed app
   builds and dev's own sign-in emails point at a website that doesn't know their accounts. If
   you want to keep testing against dev, give dev its own address (for example
   `dev.sundeckpro.com` on a Vercel branch with the Preview variables); Claude then points dev's
   site URL and the dev builds' web address there.
5. ~~The App Review shop's texting and email~~: decided 2026-10-24, the review-shop switch
   (section 9).
6. Leaked-password protection (Pro, off on dev): turning it on refuses passwords found in
   known leaks, which the apps' password checklist can't predict. Recommended to leave off until
   the apps say why.
7. The migration rule in section 10.
