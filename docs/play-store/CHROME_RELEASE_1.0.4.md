# Release Android 1.0.4 on Google Play (Claude in Chrome)

Before you paste this: download the app bundle so it's on this computer (the extension may not
be able to download or pick files itself):
https://expo.dev/artifacts/eas/r9hhWGlOGsMt26pZgmPLRtm1TFkDZBILf_fYRwPaGt8.aab
It saves as a `.aab` file in Downloads. Then paste everything below the line into Claude in
Chrome, signed in with the Google account that owns the Play developer account
(office@sundeckpro.com).

---

You're helping me release an update of my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), on Google Play. Work in the Google Play Console
(https://play.google.com/console). The last update was version 1.0.3 (version code 8); it may
be live in Production or still in review. This update is **version 1.0.4, version
code 9**, and includes everything in 1.0.3. I've downloaded its app bundle (`.aab`) to this
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
2. If the 1.0.3 (code 8) Production release is **in review or not yet published**, stop and ask
   me before going on.

## Step 1: internal testing

1. **Test and release › Testing › Internal testing › Create new release.**
2. **App bundles › Upload.** The file picker may need me: ask me to choose the `.aab` from
   Downloads. Wait until it finishes processing.
3. Check it shows **version code 9** and version name **1.0.4**. If it shows anything else, stop
   and tell me.
4. **Release name:** `1.0.4`
5. **Release notes** (en-US), exactly:

   ```text
   <en-US>
   Quotes on their own: make a quote without a job, and set a deposit on each quote.
   Two business names: shops that do pool care and leak detection pick which one a job is for.
   OK to Text: mark which customers said it's OK to text them.
   Jobs and Schedule: an icon for each kind of job, shorter rows, and the street only.
   Search Settings, Dashboard by tech, and Refer a Pool Company in More.
   Faster on Android; Day, Week and Month always show their names.
   </en-US>
   ```

6. **Next** (or Save) › copy every error and warning on the review page word for word. Errors
   block the release; warnings don't.
7. Ask me before **Save and publish** / **Start rollout to Internal testing**. After I say go,
   press it and tell me the result.

## Step 2: production

Only after Step 1 is rolled out, and only when I say go:

1. **Test and release › Production › Create new release.**
2. **Add from library** › pick version code **9** (1.0.4) › Add to release.
3. Release name `1.0.4`, and the same release notes as above.
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
