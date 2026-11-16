# Release Android 1.0.1 on Google Play (Claude in Chrome)

Before you paste this: download the app bundle so it's on this computer (the extension may not
be able to download or pick files itself):
https://expo.dev/artifacts/eas/DijtdbGitkdKAWZYiObHbVbom2i1f7IFWLE5pwFzGs4.aab
It saves as a `.aab` file in Downloads. Then paste everything below the line into Claude in
Chrome, signed in with the Google account that owns the Play developer account
(office@sundeckpro.com).

---

You're helping me release an update of my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), on Google Play. Work in the Google Play Console
(https://play.google.com/console). Version 1.0.0 (version code 4) is live in the United States.
This update is **version 1.0.1, version code 6**. I've downloaded its app bundle (`.aab`) to
this computer. I'm here to pick files and confirm.

## Rules

1. **Never type, read out, or store a password or key.** If a page asks for one, stop and ask me.
2. **Stop and ask me before you press Start rollout, Send for review, or Publish**, before
   accepting any agreement or declaration, and before changing anything not in these steps.
   Tell me what the screen says first.
3. If Play shows an error, a warning, or something these steps don't cover, copy it **word for
   word** and ask me. Don't guess.
4. Don't change the store listing, app content, countries, or pricing.

## Step 1: internal testing

1. Sundeck Pro › **Test and release › Testing › Internal testing › Create new release.**
2. **App bundles › Upload.** The file picker may need me: ask me to choose the `.aab` from
   Downloads. Wait until it finishes processing.
3. Check it shows **version code 6** and version name **1.0.1**. If it shows anything else, stop
   and tell me.
4. **Release name:** `1.0.1`
5. **Release notes** (en-US), exactly:

   ```text
   <en-US>
   Monthly Billing: review every pool customer's monthly invoice in one place and send them all at once.
   Charges on visits: add a part or service, like a skimmer basket or filter cleaning, right on the visit.
   Invoice day: choose the day each customer's monthly invoice is made.
   Invoices can also send themselves on the invoice day (Settings › Payments).
   </en-US>
   ```

6. **Next** (or Save) › copy every error and warning on the review page word for word. Errors
   block the release; warnings don't.
7. Ask me before **Save and publish** / **Start rollout to Internal testing**. After I say go,
   press it and tell me the result.

## Step 2: production

Only after Step 1 is rolled out, and only when I say go:

1. **Test and release › Production › Create new release.**
2. **Add from library** › pick version code **6** (1.0.1) › Add to release.
3. Release name `1.0.1`, and the same release notes as above.
4. **Next** › copy every error and warning word for word.
5. Ask me before **Save** / **Send changes for review** / **Start rollout to Production**, and
   tell me exactly what the button says. If it offers a rollout percentage, ask me (I expect
   100%).
6. After I say go, press it, then open **Publishing overview** and copy what it shows (in
   review, or changes ready to publish).

## Report back

```text
INTERNAL TESTING: code <n>, name <...>, status <...>
PRODUCTION: release <name>, code <n>, status <in review | ...>
ERRORS: ... (word for word)
WARNINGS: ... (word for word; I expect the edge-to-edge one may still show, and the
  obfuscation one should be gone)
PUBLISHING OVERVIEW: ...
```
