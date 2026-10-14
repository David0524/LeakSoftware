# Launch checklist and store listings (M11)

What is built is in the repo. The steps marked **Owner** need accounts, money, or legal text,
and can't be done from here.

## 1. Accounts and decisions (Owner)

| Step | Notes |
|---|---|
| Apple Developer Program, company account | Needs a D-U-N-S number (takes days). $99/year. |
| Google Play Console | One-time $25. |
| Bundle ID / package name | Now `com.leakbook.app` (from the old name). It can't change after the first upload. Recommended: `app.tidemark.field` once the name and domain are cleared. |
| Domain, support mailbox | `tidemark.app` and `support@tidemark.app` are placeholders (`SUPPORT_EMAIL`). |
| Final privacy policy and terms | `/privacy` and `/terms` carry a plain-language draft marked as a draft. Replace with the final text. |
| Sentry project | Free plan is enough. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (Vercel) and `EXPO_PUBLIC_SENTRY_DSN` (EAS environment). Without them nothing is sent. |
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

## 3. App Store listing (draft)

- **Name:** Tidemark
- **Subtitle (30):** Pool leak detection reports
- **Category:** Business (secondary: Productivity)
- **Keywords (100):** pool,leak,detection,inspection,report,pressure test,dye test,spa,quote,invoice,field service
- **Description:**
  > Tidemark is the field app for pool leak detection shops. Run the whole inspection on site,
  > even with no signal: a checklist for every skimmer, return, light, and drain; pressure
  > and dye tests that do the math; findings pinned on a pool diagram; photos with markup,
  > videos, and voice notes. The customer reads the report on your phone and signs. Back at
  > the office, send a branded report, quote the repair, and get paid by card or bank.
  >
  > Requires a Tidemark shop account (free 30-day trial at tidemark.app).
- **Support URL:** `https://<site>/status` · **Privacy URL:** `https://<site>/privacy`
- **Account deletion:** Settings › Delete My Account (also on the website under More).
- **Review notes and demo account:** sign in as `tech@demo.leakbook.test` / `leakbook-demo`
  (the demo shop's tech; the data is made up). Use Today, open a job, work the checklist,
  add a photo, then Report › Review with Customer.

### App Privacy answers (App Store) / Data safety (Google Play)

| Data | Collected | Linked to the user | Why |
|---|---|---|---|
| Name, email (team member) | Yes | Yes | Account, app functionality |
| Customers' names, phone numbers, emails, addresses | Yes (entered by the shop) | Yes | App functionality |
| Precise location | Yes, only when a photo is taken and allowed | Yes | Photo location on reports |
| Photos and videos, audio (voice notes) | Yes | Yes | App functionality |
| Other user content (reports, signatures) | Yes | Yes | App functionality |
| Crash and error data | Yes | No | App functionality (Sentry, no personal data) |
| Tracking or advertising | No | — | — |

## 4. Screenshots needed

iPhone 6.9" and 6.5", iPad 13" (the app supports tablets), and Android phone:
Today with a route; a job's checklist; a finding pinned on the pool diagram; photo markup;
Review with Customer (report and signature); the sent report on a phone.

## 5. Done when (BUILD_PLAN M11)

A TestFlight build used by the design partner on real jobs for at least one week with no
data loss. Track: jobs worked, changes synced, problems shown in Settings, Sentry errors.
