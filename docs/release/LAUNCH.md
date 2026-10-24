# Launch checklist and store listings (M11)

What is built is in the repo. The steps marked **Owner** need accounts, money, or legal text,
and can't be done from here.

## 1. Accounts and decisions (Owner)

| Step | Notes |
|---|---|
| Apple Developer Program | **Approved 2026-10-19, as an individual (owner's name).** Before the public release, decide whether to convert it to the company (Apple Developer Support, with the company's D-U-N-S number); otherwise the store shows the owner's name as the seller. Next: register `com.sundeckpro.app`, create the App Store Connect app record, and an App Store Connect API key (App Manager) for TestFlight uploads; keep the key in GitHub and EAS secrets, never in the repo. |
| Google Play Console | One-time $25. |
| App Store Connect | App **Sundeck Pro**, Apple ID `6824555420`, team `C7HQJY52SV` (2026-10-19; in `apps/mobile/eas.json`). Upload key in GitHub secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`. |
| Bundle ID / package name | `com.sundeckpro.app` on iOS and Android (owner, 2026-10-18; link scheme `sundeckpro`). It can't change after the first upload. |
| Domain, support mailbox | `sundeckpro.com` (bought 2026-10-18, Google Workspace for mail). Support is `support@sundeckpro.com` (`SUPPORT_EMAIL`); app email sends from `send.sundeckpro.com` (`EMAIL_FROM_DOMAIN`, Resend). |
| Final privacy policy and terms | **Launch versions written 2026-10-24** from what the code does, naming Sundeck Pro, LLC (Nevada; `COMPANY` in `apps/web/src/lib/site.ts`). Templates, not legal advice: have a lawyer glance at them before the public release. |
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

### The Swift iPhone app (apps/ios) to TestFlight

- **Start a build:** GitHub › Actions › **TestFlight** › Run workflow (pick the branch), or
  push a tag `ios-vX.Y.Z` (for example `git tag ios-v0.1.0 && git push origin ios-v0.1.0`). It
  doesn't run on ordinary pushes. Run it once CI on that commit is green.
- It builds a Release archive on macOS from `apps/ios/AppHost/project.yml` (XcodeGen; the
  Xcode project isn't committed), signs it automatically with the App Store Connect API key
  (secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`; no certificates or
  profiles in the repo), and uploads it straight to App Store Connect. The job summary has the
  build number and a link to TestFlight; Apple processes a build for a few minutes before
  testers can install it.
- **Build numbers:** `CFBundleVersion` is **1000 + the workflow's run number**, set at build
  time and never committed. The Expo app uploads to the same record (`com.sundeckpro.app`) and
  counts its builds from 1, so the Swift builds stay above them. The version
  (`CFBundleShortVersionString`) is the one in `apps/ios/Info.plist`; raise it there for a new
  release.
- Testers are added in App Store Connect › TestFlight.

## 3. App Store listing, App Privacy, and review notes

The iPhone app's App Store Connect text is in **`docs/release/APP_STORE.md`** (2026-10-24), in
App Store Connect's order, with character counts: name, subtitle, promotional text,
description, keywords, URLs, copyright, App Review notes, age rating, App Privacy answers
matched to the code, pricing and availability (free, US only), export compliance, and the App
Review risks found. The Google Play listing and Data safety answers are in `docs/play-store/`.

## 4. Screenshots

iPhone 6.9" only (1320 × 2868; the app is iPhone only, so no iPad set). Made by the **App
Store screenshots** workflow (`.github/workflows/app-store-screenshots.yml`, run by hand):
ten screens of the demo shop at the exact size, saved as the `app-store-screenshots` artifact.
The list and captions are in `docs/release/APP_STORE.md` § 6. Look at each before uploading.

## 5. Done when (BUILD_PLAN M11)

A TestFlight build used by the design partner on real jobs for at least one week with no
data loss. Track: jobs worked, changes synced, problems shown in Settings, Sentry errors.
