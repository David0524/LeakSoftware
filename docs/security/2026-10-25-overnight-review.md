# Security review: server side (2026-10-25)

Overnight review requested by the owner, with the `security-audit` skill in focused mode. Scope:
the website's server actions and API routes, service-role use, security-definer SQL, row
security and grants, Stripe billing and payments, the public customer pages, Twilio webhooks,
file uploads, secrets, the Admin portal, and rate limits on sign-in and on paid services. Most
attention went to what changed since the full audit of 2026-10-17 (admin portal, password reset,
usage, mass email, receipts, maps, route legs, sign-up changes).

Method: source tracing of each request path; a private local copy of the database with every
migration, where each shop-scoped security-definer function was called as another shop's owner
and tech; read-only GETs of the live project's public auth settings. No accounts, data, texts,
emails or charges were created on the live or dev project.

The repository is public. One finding below is not fixed yet; its details went to the owner
directly, not into this file.

## Summary

| # | Severity | Finding | State |
|---|---|---|---|
| H1 | High | A shop whose payments keep failing is never made read-only | Fixed (`20261022002200_past_due_lock.sql`) |
| H2 | High | Admin portal access depends on an auth setting of the live project that isn't in its required state | Owner action needed (details sent privately) |
| M1 | Medium | One shop can use up the map allowance every shop shares | Fixed (`20261022002400_map_shop_caps.sql`) |
| M2 | Medium | Uploads have no size or type limit, and unpaid shops can still upload | Fixed (`20261022002500_upload_limits.sql`) |
| M3 | Medium | Sign-in, two-step codes and sign-up have no rate limit of our own | Open |
| M4 | Medium | The browser's Mapbox token isn't covered by the map budget | Needs a check in Mapbox |
| L1 | Low | `x-map-note` could carry a signed Apple map address | Fixed |
| L2 | Low | Password reset: limit is per address only; response time differs for unknown addresses | Open |
| L3 | Low | The sign-up form's lead capture overwrites any lead's details, unauthenticated | Open |
| L4 | Low | A push token can be moved to another account by anyone who knows it | Open |
| L5 | Low | Sample report PDFs are rendered again on every request | Open |
| I1 | Info | Cron secret compared with `!==`, not constant time | Open |
| I2 | Info | Twilio webhooks have no replay window (Twilio's signature has no timestamp) | Accepted |
| I3 | Info | A trial shop can still buy a phone number; a paying shop can mass-email any address it imports | Owner's call (from 2026-10-16) |

## High

### H1. A failed payment never locked the shop (fixed)

- **Path:** `app.company_locked` (`supabase/migrations/20261012003600_onboarding.sql`), fed by
  the Stripe webhook (`apps/web/src/server/billing.ts` `applyBillingEvent`).
- **Rule:** read-only once "a payment has been past due for more than 7 days" (DECISIONS,
  billing).
- **Problem:** the lock tested `current_period_end < now() - 7 days`. Stripe moves the period
  forward when it makes the renewal invoice, before it is paid, so a failed renewal leaves
  `current_period_end` about a month ahead, and each later renewal moves it again. With Stripe's
  failed-payment setting on "leave past due" or "mark unpaid" (both map to `past_due` here), a
  shop kept full access without paying, indefinitely. With "cancel the subscription" it kept
  access until Stripe's retries ended. The existing test simulated a past period end, which
  Stripe doesn't send.
- **Fix:** `subscription.past_due_since`, kept by a trigger whatever writes the status (set when
  it turns past due, kept while it stays, cleared when it leaves); the shop locks 7 days after
  it. The old condition stays, so nothing unlocks. Shops past due at deploy get 7 days from
  then. Test: `supabase/tests/780_past_due_lock.test.sql`.
- **Also checked:** a trial that ends without a subscription locks (`trialing` past
  `trial_ends_at` with no Stripe subscription); a new shop without its card locks
  (`card_required`); canceled and paused subscriptions lock (`paused` maps to `canceled`);
  subscription events from connected accounts are ignored; the Checkout return page only links
  a finished session whose metadata names the owner's own shop.

### H2. Admin portal access and an auth setting (owner action)

Admin access is checked on every portal page, action and download (staff list plus two-step),
and the portal's database functions are callable only with the service key. But the live
project's auth settings make one of the inputs to that check weaker than the code assumes, and
DECISIONS already says production must keep that setting on. Details and the steps to close it
were sent to the owner directly. The fix is a dashboard setting plus a check of the staff list;
a later code change can key staff on something only the server can set.

## Medium

### M1. One shop can use up every shop's map allowance (fixed)

- **Path:** `public.mapbox_take(target_company, api_kind, how_many)` is granted to
  `authenticated` and checks only membership. It counts against monthly (and for Apple, daily)
  limits shared by every shop, and accepts up to 10,000 units a call.
- **Impact:** any member of any shop, including a brand-new unpaid one, can call it directly with
  their own shop and large counts until the month's allowance is gone. Every shop's day maps,
  Enlarge maps, Apple address suggestions and drive-time lookups then stop or fall back until
  the month (or day) turns over. Nothing is billed, since the budget refuses first.
- **Recommendation:** give each shop a share of each kind (a per-shop daily cap inside
  `mapbox_take`), lower the per-call ceiling to what the server asks for, and refuse locked
  shops; or revoke it from `authenticated` and call it with the service key after the routes'
  existing membership checks.
- **Fixed (2026-10-24):** `20261022002400_map_shop_caps.sql` gives each shop a daily cap per kind
  (sized well above the busiest shop's day; DECISIONS 2026-10-24), lowers one call to 625 units,
  and makes `mapbox_take` service-key only (the phones never called it; the website's routes
  check membership first). A shop past its cap gets a plain message. Test
  `562_map_shop_caps`.

### M2. Uploads: no limits, and unpaid shops can upload (fixed)

- **Path:** buckets `media`, `texts`, `company-assets` (`20261012000700_storage.sql`,
  `20261012003500_company_texting.sql`) have no `file_size_limit` or `allowed_mime_types`, and no
  storage insert policy checks `app.company_locked`.
- **Impact:** any member of any shop, including an unpaid one made in a minute, can upload files
  of any type up to the project's global limit, without end, on Sundeck Pro's storage bill. Files
  stay private to that shop.
- **Recommendation:** per-bucket size limits and MIME lists (photos, videos, audio, PDF), and a
  restrictive insert policy refusing locked shops. Check first that the phones keep a refused
  upload queued (DECISIONS: changes made while read-only go up once paid).
- **Fixed (2026-10-24):** `20261022002500_upload_limits.sql` sets each bucket's size limit and
  types (media 50 MB, texts 10 MB, logos 2 MB, PDFs 50 MB) and adds restrictive insert and update
  policies refusing locked shops. Checked first: both phones' upload queues keep a refused file
  and retry it. The apps and website say plainly when a file is too large, the wrong type, or
  the shop is read-only. Test `796_upload_limits`.

### M3. No rate limit of our own on sign-in, two-step and sign-up

- **Path:** `signIn`, `verifyTwoStep`, `startTrial`, `acceptInvite` (`apps/web/src/app/actions/auth.ts`,
  `two-step.ts`) call Supabase Auth from the server. Supabase limits sign-ins, sign-ups
  and code checks per IP address, and the address it sees is Vercel's, not the visitor's.
- **Impact:** guessing passwords or two-step codes through the website isn't limited per
  attacker; or, if Vercel's addresses hit Supabase's limits, everyone's sign-in is refused for a
  few minutes. Passwords are 10+ characters and two-step codes change every 30 seconds, which
  limits the first.
- **Recommendation:** a small database-backed counter by email and client address (Vercel's
  `x-forwarded-for`), like `take_password_reset`, before each of these calls; or Supabase's
  captcha (Turnstile) on sign-up and sign-in.

### M4. The browser's Mapbox token

`NEXT_PUBLIC_MAPBOX_TOKEN` is in the website's JavaScript. `/api/map/load` counts map loads, but
only for pages that ask; anyone can use the token directly. **Check in Mapbox:** the public token
has only the scopes the website needs, is restricted to sundeckpro.com, and the account has no
pay-as-you-go overage (or a billing alert).

## Low

- **L1. `x-map-note` (fixed).** The note on a day-map image said why Apple wasn't used, including
  fetch's error text, which can echo the signed Apple Snapshot address. Notes now drop addresses,
  `signature=`/`token=` values and JWTs (`safeMapNote`, `apps/web/src/server/map-draw.ts`;
  test in `apps/web/test/apple-maps.test.ts`). Only the shop's own signed-in members ever saw it.
- **L2. Password reset.** `take_password_reset` allows 3 emails an hour per address, but nothing
  limits one visitor asking for many addresses (Resend sends). An unknown address returns
  without sending, so it answers faster. Add a per-client limit and send the same work either way
  (or answer before sending, with `after()`).
- **L3. Lead capture.** `captureLead` (`apps/web/src/app/actions/leads.ts`) is a public server
  action that upserts `signup_lead` by email with the service key, so anyone can overwrite the
  name, company and phone of any lead staff see. Only fill empty fields, and rate-limit it.
- **L4. Push tokens.** `POST /api/push/devices` moves an existing token to the caller. Someone
  who learned another person's push token could take their notifications (customer names,
  messages). Tokens aren't exposed anywhere, so this needs a leak first.
- **L5. Sample PDFs.** `/r/<token>/pdf` for the sample job renders a fresh PDF with a headless
  browser on every request. Only the shop's own person gets that link; cache it for a few minutes.

## Informational

- **I1.** The cron routes compare `Authorization` with `!==`. Use `timingSafeEqual`.
- **I2.** Twilio's signature covers the URL and form but no time, so a captured webhook could be
  replayed. It would need the request first; the fix is to ignore a message or call SID already stored.

- **I3.** Still open from 2026-10-16: trial shops can buy a number on Sundeck Pro's Twilio account.
  And a paying shop can import any addresses and mass-email up to 2,000 a day from Sundeck Pro's
  sending domain (unsubscribe and allowance in place); worth watching Resend's complaint rate.

## Checked and safe

- **Shop-scoped database functions:** every security-definer function the apps can call with an
  id (35 of them) refuses another shop's owner and tech, or answers with nothing. Now a test:
  `supabase/tests/790_cross_shop_functions.test.sql` (72 checks). The `app` schema isn't
  exposed through the API; anon can call only the customer-link functions.
- **Row security and grants:** no table grants insert or delete to signed-in users (writes go
  through `sync_push` and functions); updates are column-listed; sent invoices refuse changes;
  server-only tables (`staff_action`, `support_session`, `signup_lead`, `subscription_event`,
  `usage_event`, `push_device`, `feature_request`, `shop_note`) grant nothing.
- **Service-key use:** each use follows a membership, role, staff (two-step) or signature check,
  or a customer-link token lookup; the Admin portal's database functions are service-key only.
- **Customer links** (`/r`, `/q`, `/i`, unsubscribe, weekly summary): 128-bit random tokens,
  180-day expiry, revocation; storage reads through a link are tied to the link's own shop and the
  files it froze (`app.shared_object`), so a changed `storage_path` can't reach another shop.
- **Stripe:** webhook signature verified against each configured secret; each event applied
  once; payments count only on the record's own shop's connected account; subscription events
  only from the platform account; card fee capped.
- **Twilio:** all nine webhook routes verify the signature (constant time) against
  `APP_BASE_URL`.
- **Maps:** `/api/map`, `/api/map/path`, `/api/map/load`, `/api/mapkit-token`,
  `/api/address/suggest` and `/api/locate` check membership of the shop named; image size is
  clamped, pins are capped at 60, and every paid call is counted first (but see M1).
- **Admin portal:** every page, action, download and the End Session route require a staff
  email and a two-step session; View Only is enforced in the database and in the proxy.
- **Secrets:** no keys in the repository or its history (test fixtures only); the only
  `NEXT_PUBLIC_` values are the Mapbox token (M4) and the Sentry DSN; the apps ship only the
  Supabase URL, publishable key and Sentry DSN.
- **Redirects and origins:** `next` paths are same-site only; link origins never come from
  request headers on Vercel.

## For the owner

1. The H2 steps (sent separately).
2. Check Stripe's failed-payment setting (Billing, Revenue recovery, "Subscription status"); with
   H1 fixed, any setting now locks after a week, and "cancel" also ends the subscription.
3. M4: Mapbox token scopes, URL restriction and billing.
4. Decide on M1 to M3 (each a small change with a test).
