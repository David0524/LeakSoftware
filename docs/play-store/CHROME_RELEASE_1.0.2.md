# Release Android 1.0.2 on Google Play (Claude in Chrome)

Before you paste this: download the app bundle so it's on this computer (the extension may not
be able to download or pick files itself):
https://expo.dev/artifacts/eas/pmgBCK1MKIPY8TOiPFqkTAC5JB6tLN2qpNVPshmTZkE.aab
It saves as a `.aab` file in Downloads. Then paste everything below the line into Claude in
Chrome, signed in with the Google account that owns the Play developer account
(office@sundeckpro.com).

---

You're helping me release an update of my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), on Google Play. Work in the Google Play Console
(https://play.google.com/console). The last update was version 1.0.1 (version code 6); it may
be live in Production or only in internal testing. This update is **version 1.0.2, version
code 7**, and includes everything in 1.0.1. I've downloaded its app bundle (`.aab`) to this
computer. I'm here to pick files and confirm.

## Rules

1. **Never type, read out, or store a password or key.** If a page asks for one, stop and ask me.
2. **Stop and ask me before you press Start rollout, Send for review, or Publish**, before
   accepting any agreement or declaration, and before changing anything not in these steps.
   Tell me what the screen says first.
3. If Play shows an error, a warning, or something these steps don't cover, copy it **word for
   word** and ask me. Don't guess.
4. Don't change the store listing, app content, countries, or pricing.

## Step 0: where things stand

1. Sundeck Pro › **Publishing overview**, and **Test and release › Production**. Write down
   which version is live in Production (name and code), and whether anything is in review or
   waiting to publish.
2. If a 1.0.1 (code 6) Production release is **in review or not yet published**, stop and ask
   me before going on.

## Step 1: internal testing

1. **Test and release › Testing › Internal testing › Create new release.**
2. **App bundles › Upload.** The file picker may need me: ask me to choose the `.aab` from
   Downloads. Wait until it finishes processing.
3. Check it shows **version code 7** and version name **1.0.2**. If it shows anything else, stop
   and tell me.
4. **Release name:** `1.0.2`
5. **Release notes** (en-US), exactly:

   ```text
   <en-US>
   Pool equipment: record each pool's sanitizer, heater, and solar heater, with pool notes.
   Skip Visit: skip a maintenance visit with a reason, note, and photo.
   Report an Issue: report a problem from any job, with photos.
   Chemistry trends: each pool's readings over time, with out-of-range alerts.
   Autopay: customers can save a card so monthly invoices are paid automatically.
   Ask How We Did: reports ask for a thumbs up or down before asking for a review.
   </en-US>
   ```

6. **Next** (or Save) › copy every error and warning on the review page word for word. Errors
   block the release; warnings don't.
7. Ask me before **Save and publish** / **Start rollout to Internal testing**. After I say go,
   press it and tell me the result.

## Step 2: production

Only after Step 1 is rolled out, and only when I say go:

1. **Test and release › Production › Create new release.**
2. **Add from library** › pick version code **7** (1.0.2) › Add to release.
3. Release name `1.0.2`, and the same release notes as above.
4. **Next** › copy every error and warning word for word.
5. Ask me before **Save** / **Send changes for review** / **Start rollout to Production**, and
   tell me exactly what the button says. If it offers a rollout percentage, ask me (I expect
   100%).
6. After I say go, press it, then open **Publishing overview** and copy what it shows (in
   review, or changes ready to publish). If changes are ready to publish but not sent, ask me
   before **Send changes for review**.

## Report back

```text
BEFORE: Production was <name> (code <n>), <live | in review | ...>
INTERNAL TESTING: code <n>, name <...>, status <...>
PRODUCTION: release <name>, code <n>, status <in review | ...>
ERRORS: ... (word for word)
WARNINGS: ... (word for word)
PUBLISHING OVERVIEW: ...
```
