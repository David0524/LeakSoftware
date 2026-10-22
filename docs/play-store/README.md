# Android on Google Play: the owner's checklist

Owner, 2026-10-22: "Android is back on the plan." Everything that doesn't need an account is
ready in the repo:

- `.github/workflows/android.yml`: builds the app on EAS and uploads it to Play's internal
  testing track.
- `apps/mobile/eas.json` and `apps/mobile/app.config.js`: the build and upload settings.
- `listing.md`, `data-safety.md`, `content-rating.md`, `app-access.md`: the store listing and
  the Play Console forms.
- `graphics/` and `screenshots/`: the icon, the feature graphic, and 8 phone screenshots.

These steps need you. Do them in order; each one says what to send back to Claude. Never paste
a key or password into a chat, an issue, or a file in the repo: keys go only into GitHub
secrets (step 6).

## 1. D-U-N-S number (shared with Apple)

Google Play needs one for an **organization** account, the same number Apple uses to move the
developer account to the company (`docs/release/LAUNCH.md` § 1).

1. If the company already has one, skip to step 2. Otherwise request it free from Dun &
   Bradstreet: https://www.dnb.com/duns/get-a-duns.html › Get a D-U-N-S Number. The legal name
   and address must match the company's registration exactly. It can take up to 30 days.
2. Send Claude: "D-U-N-S done" (not the number itself; it's not secret, but Claude doesn't need
   it).

## 2. Google Play developer account

1. https://play.google.com/console/signup, signed in with the company Google Workspace account
   you want to own it (for example david@sundeckpro.com).
2. Choose **An organization or business**. Enter the D-U-N-S number, the company's legal name
   and address, the website `https://sundeckpro.com`, and a contact email and phone.
3. Pay the one-time $25 fee. Google then verifies the organization (a few days) and the contact
   phone and email.
4. Send Claude: "Play account approved".

## 3. Expo account and EXPO_TOKEN

The build runs on EAS (Expo's build service).

1. https://expo.dev/signup: make an account (or an organization, for example `sundeckpro`,
   under Account › Organizations › Create).
2. https://expo.dev › your avatar › **Account settings › Access tokens › Create token**. Name it
   `GitHub Actions`. Copy it (it's shown once).
3. Add it to GitHub (step 6) as `EXPO_TOKEN`.
4. If the token's account can reach more than one Expo account (you and an organization), add a
   repository **variable** (not a secret) `EXPO_ACCOUNT` with the account that should own the
   app, for example `sundeckpro`: GitHub › the repository › Settings › Secrets and variables ›
   Actions › **Variables** tab › New repository variable.
5. Send Claude: "Expo token added", and the account name.

## 4. Firebase (push notifications on Android)

Android push goes through Firebase Cloud Messaging.

1. https://console.firebase.google.com › **Create a project** › name `Sundeck Pro` (Google
   Analytics: off; the app doesn't use it).
2. In the project: **Add app › Android**. Package name `com.sundeckpro.app` (exactly). App
   nickname `Sundeck Pro`. Skip the SHA-1 and the SDK steps.
3. **Download google-services.json**. Add the whole file's text to GitHub (step 6) as
   `GOOGLE_SERVICES_JSON`. Don't put the file in the repo (it's gitignored).
4. The push key for Expo (FCM V1): Firebase › ⚙ **Project settings › Service accounts ›
   Generate new private key** › Generate key. A JSON file downloads.
5. Give it to Expo, not GitHub: https://expo.dev › the `sundeckpro` project (it appears after the
   first build, step 7) › **Credentials › Android › com.sundeckpro.app › FCM V1 service account
   key › Add a service account key** › upload the file. Then delete the downloaded file.
6. Send Claude: "Firebase done" (Claude then checks push on an Android build).

## 5. Play Console: create the app and fill the forms

https://play.google.com/console › **Create app**.

1. App name `Sundeck Pro`, default language English (United States), **App**, **Free**. Tick
   the declarations. Create app.
2. **Dashboard › Set up your app** lists the forms. Use the files in this folder:
   - App access → `app-access.md` (you type the demo owner's password there).
   - Ads → No ads.
   - Content rating → `content-rating.md`.
   - Target audience → 18 and over (`content-rating.md`).
   - Data safety → `data-safety.md`. Settle its "Owner to confirm" lines first, or ask Claude.
   - Government apps, Financial features, Health → No / None.
   - Privacy policy → `https://sundeckpro.com/privacy`.
   - App category → Business; contact email `support@sundeckpro.com`.
   - Main store listing → `listing.md` (name, short and full description), the icon
     `graphics/icon-512.png`, the feature graphic `graphics/feature-graphic.png`, and the phone
     screenshots `screenshots/1-today.png` to `8-receipt.png` in that order.
3. Send Claude: "Play app created", and anything a form asked that these files didn't cover.

## 6. GitHub secrets

GitHub › the repository › **Settings › Secrets and variables › Actions › Secrets › New
repository secret**, one each:

| Name | Value | From |
|---|---|---|
| `EXPO_TOKEN` | the Expo access token | step 3 |
| `GOOGLE_SERVICES_JSON` | the whole text of google-services.json | step 4 |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | the whole text of the Play service account's key | step 8 |

The workflow checks them first and names any that are missing or wrong.

## 7. First build, uploaded by hand

Google Play accepts uploads from tools only after the app's first bundle is uploaded in the
Play Console.

1. GitHub › **Actions › Android › Run workflow**, branch `main`, **untick "Upload to Google
   Play"**, Run. It takes 20 to 40 minutes (EAS queues free builds). It links the EAS project
   and makes the app's signing key on EAS the first time.
2. When it's green, open the run: its summary has a link to the app bundle (`.aab`). Download
   it. If the summary also says "EAS project linked for this run", send Claude that line (Claude
   adds the project ID to `apps/mobile/app.json`, which push needs).
3. Play Console › Sundeck Pro › **Test and release › Testing › Internal testing › Create new
   release**. If asked about **Play App Signing**, choose "Use Google-generated key" (Google
   keeps the app's signing key; the EAS key is the upload key). Upload the `.aab`. Release name
   `0.1.0`; release notes "First release." **Save › Review release › Start rollout to Internal
   testing**.
4. **Internal testing › Testers**: make an email list with your team's Google accounts, save,
   and open the "Copy link" invite on an Android phone to install it.
5. Send Claude: "First Android build is on internal testing", with anything that looked wrong.
   Claude then replaces the store screenshots with real Android captures.

If the build fails with a message about the keystore, run the workflow once more; if it still
fails, send Claude the run's link.

## 8. Play Console service account (so later builds upload by themselves)

1. https://console.cloud.google.com › pick (or create) a project, for example the Firebase one
   › **IAM and admin › Service accounts › Create service account**, name `play-upload`, Done.
2. Open it › **Keys › Add key › Create new key › JSON**. A file downloads.
3. Enable the API: Google Cloud › **APIs and services › Library** › "Google Play Android
   Developer API" › Enable.
4. Play Console (the account level, not the app) › **Users and permissions › Invite new users**
   › the service account's email (`play-upload@…iam.gserviceaccount.com`) › **App permissions ›
   Add app › Sundeck Pro** › tick **Release to testing tracks** › Invite user. (Release to
   production isn't needed: the workflow uploads to internal testing only, and you promote
   releases yourself.)
5. Add the key file's whole text to GitHub as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (step 6), then
   delete the file.
6. Send Claude: "Play service account added". From then on, **Actions › Android › Run
   workflow** (with "Upload to Google Play" ticked) builds and uploads to internal testing in
   one go.

## 9. Closed testing (if Google requires it), then production

- **Personal accounts** made after November 2023 must run a closed test with at least 12
  testers for 14 days before production. **Organization accounts are exempt**, which is one
  more reason for step 1. If Play's dashboard shows "Run a closed test" as a step anyway: Test
  and release › Testing › **Closed testing › Create track**, promote the internal release to
  it, add 12 or more testers by email list, and keep them opted in for 14 days.
- **Production:** Test and release › **Production › Create new release** › "Add from library"
  (the tested build) › release notes › **Review release › Start rollout to Production**.
  Google reviews it (usually 1 to 7 days for a new app). Before this step the screenshots must
  be real Android captures (`listing.md`).
- Send Claude: "Android is live" (or the rejection email, word for word, if Google refuses it).
