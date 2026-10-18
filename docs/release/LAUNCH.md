# Launch checklist and store listings (M11)

What is built is in the repo. The steps marked **Owner** need accounts, money, or legal text,
and can't be done from here.

## 1. Accounts and decisions (Owner)

| Step | Notes |
|---|---|
| Apple Developer Program, company account | Needs a D-U-N-S number (takes days). $99/year. |
| Google Play Console | One-time $25. |
| Bundle ID / package name | Now `com.leakbook.app` (from the old name). It can't change after the first upload. Recommended: `com.sundeckpro.app`, now that the domain is bought. |
| Domain, support mailbox | `sundeckpro.com` (bought 2026-10-18, Google Workspace for mail). Support is `support@sundeckpro.com` (`SUPPORT_EMAIL`); app email sends from `send.sundeckpro.com` (`EMAIL_FROM_DOMAIN`, Resend). |
| Final privacy policy and terms | `/privacy` and `/terms` carry a plain-language draft marked as a draft. Replace with the final text. |
| Sentry project | Free plan is enough. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (Vercel) and `EXPO_PUBLIC_SENTRY_DSN` (EAS environment). Without them nothing is sent. |
| Stripe keys | Platform account with Connect. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (customers pay on our pages), and the webhook secrets in Vercel. Run one test-mode payment by card, Link, and Apple Pay before the pilot. |
| Uptime monitor | Point a free monitor (for example Better Stack or UptimeRobot) at `https://<site>/api/health` (200 = working, 503 = database or sign-in down). `/status` shows the same to people. |

## 2. Build and TestFlight

From `apps/mobile` with `EXPO_TOKEN` set:

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios   # to TestFlight
npx eas-cli@latest build --profile production --platform android
```

- `eas.json` has `development` (dev client), `preview` (internal install), and `production`
  (store, build numbers increase automatically).
- `ITSAppUsesNonExemptEncryption` is false (standard HTTPS only), so TestFlight skips the
  export questions.
- Sentry source map upload is off until a Sentry auth token is added
  (`SENTRY_DISABLE_AUTO_UPLOAD`).
- Set `EXPO_PUBLIC_API_URL` to the website's address in the EAS production environment.

## 3. App Store listing (draft, both packages, 2026-10-16)

One app with two packages (owner): Pool Care and Leak Detection, and Both for the rarer shop.
The listing leads with what both share and names each package; each shop sees only its own.

- **Name (30):** Sundeck Pro
- **Subtitle (30):** Pool service & leak detection (29)
- **Category:** Business (secondary: Productivity)
- **Keywords (100):** pool,route,cleaning,chemical,calculator,leak,detection,pressure test,report,quote,invoice,texting (97)
- **Promotional text (170):** Routes, checklists, reports, and texting for pool service and leak
  detection crews. Works with no signal and syncs when you're back. (132)
- **Description:**
  > Sundeck Pro is the field app for pool companies: route cleaning crews and leak detection
  > techs alike. Your shop picks its package, and the app shows only what you use.
  >
  > POOL CARE
  > • Today's route in order, with drive times and directions in Apple Maps or Google Maps
  > • A service checklist for every visit, with photos
  > • A chemical calculator that says what to add, in gallons and pounds, in the right order
  > • Repair quotes for pumps and filters, and the monthly service invoice
  >
  > LEAK DETECTION
  > • A checklist for every skimmer, return, light, and drain
  > • Pressure and bucket tests that do the math
  > • Findings pinned on a drawing of the pool
  > • The customer reads the report on your phone and signs on the spot
  >
  > EVERY SHOP
  > • Works without a signal and syncs when you're back
  > • Photos with markup, videos, and voice notes
  > • On My Way texts with an arrival time
  > • One company number for texts and calls, with a shared inbox the whole team sees
  > • Quotes customers accept and pay online, by card or bank
  >
  > Requires a Sundeck Pro shop account. Owners start a free 14-day trial at sundeckpro.com and invite
  > their techs.
- **What's New (first release):** First release.
- **Support URL:** `https://<site>/status` · **Privacy URL:** `https://<site>/privacy` ·
  **Marketing URL:** `https://<site>/`
- **Age rating:** 4+ (no objectionable content).
- **Account deletion:** Settings › Delete My Account (also on the website under More).
- **Purchases:** none in the app, and the app doesn't link to plans or prices (shops subscribe on
  the website; App Store Review Guideline 3.1.3(f) "Free Stand-alone Apps"/multiplatform
  services). Keep it that way.
- **Review notes and demo account:** sign in as the demo shop's tech (credentials in
  `apps/web/e2e/helpers.ts`; the data is made up; the demo shop is set to Both). Use Today, open a
  job, work the checklist, add a photo, then Report › Review with Customer. Settings › Tools has
  the chemical calculator and Messages. Texting and calls run in demo mode on the review build:
  nothing is sent.

### App Privacy answers (App Store) / Data safety (Google Play)

| Data | Collected | Linked to the user | Why |
|---|---|---|---|
| Name, email, mobile number (team member) | Yes | Yes | Account, app functionality (calls ring the person's own mobile) |
| Customers' names, phone numbers, emails, addresses | Yes (entered by the shop) | Yes | App functionality |
| Text messages and photos in texts with customers | Yes | Yes | App functionality (shared inbox) |
| Call records and voicemail recordings and transcripts | Yes | Yes | App functionality |
| Precise location | Yes, only when a photo is taken and allowed | Yes | Photo location on reports |
| Photos and videos, audio (voice notes) | Yes | Yes | App functionality |
| Other user content (reports, signatures, pool readings) | Yes | Yes | App functionality |
| Crash and error data | Yes | No | App functionality (Sentry, no personal data) |
| Tracking or advertising | No | — | — |

The privacy policy must name the processors: Supabase (database and files), Vercel (website),
Twilio (texts and calls), Deepgram (voice-note and voicemail transcription), Anthropic (report
summaries), Resend (email), Stripe (payments), Mapbox (drive times), Sentry (errors).

## 4. Screenshots needed

Sizes: iPhone 6.9" and 6.5", iPad 13" (the app supports tablets), and an Android phone. Ten at
most; the first three carry the page. Use the demo shop set to Both.

1. Today with a route of stops (both packages)
2. A pool service visit's checklist (Pool Care)
3. The chemical calculator's What to Add (Pool Care)
4. A leak job's checklist with a leaking line (Leak Detection)
5. A finding pinned on the pool diagram (Leak Detection)
6. Photo markup
7. Review with Customer: the report and the signature
8. Messages: a conversation with a customer
9. The sent report on a customer's phone

## 5. Done when (BUILD_PLAN M11)

A TestFlight build used by the design partner on real jobs for at least one week with no
data loss. Track: jobs worked, changes synced, problems shown in Settings, Sentry errors.
