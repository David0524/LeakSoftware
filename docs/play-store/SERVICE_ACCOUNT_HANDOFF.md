# Handoff: the Play service account, with Claude in Chrome

So Android builds upload to Google Play by themselves (`README.md` step 8). Paste everything
below the line into Claude in Chrome, signed in to Chrome with the Google account that owns the
Play developer account and the Firebase project. It takes about 10 minutes.

The one step you do yourself is the last: pasting the key into GitHub. The key is a password;
it never goes through Claude.

---

You're helping me let GitHub Actions upload my Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), to Google Play's internal testing track. Work in this browser. I'm here
to confirm and to handle the key file.

## Rules

1. **Never open, read, copy, or type the contents of a key file.** When a key downloads, tell
   me the file name and stop.
2. **Stop and ask me before you** accept terms, enable billing, or give any permission beyond
   the ones below.
3. If a screen doesn't match these steps, tell me what it says, word for word, and ask.

## Step 1: the service account (Google Cloud)

1. Open https://console.cloud.google.com and pick the project that holds the Sundeck Pro
   Firebase app (its name is in https://console.firebase.google.com). If you can't tell
   which, ask me.
2. **IAM and admin › Service accounts › Create service account.** Name: `play-upload`.
   Description: `Uploads Sundeck Pro Android builds to Google Play`. Create and continue. Skip
   the optional role and user steps. Done.
3. Tell me the service account's email (`play-upload@<project>.iam.gserviceaccount.com`).
4. Open it › **Keys › Add key › Create new key › JSON › Create.** A file downloads. Tell me its
   name and stop until I say go on. Don't open it.

## Step 2: the API

**APIs and services › Library**, search "Google Play Android Developer API", open it, **Enable**
(if it says Manage, it's already on).

## Step 3: permission in the Play Console

1. Open https://play.google.com/console at the account level (not inside the app) ›
   **Users and permissions › Invite new users.**
2. Email: the service account's email from step 1.
3. **App permissions › Add app › Sundeck Pro › Apply.** Tick only **Release to testing
   tracks** (under Releases). Leave account permissions off. Don't give Release to production
   or Admin.
4. **Invite user**, and confirm when asked. Tell me what the users list shows for it.

## Report back

The service account's email, whether the API is enabled, the Play permission it shows, and the
key file's name.

---

## Then you (not Claude in Chrome)

1. Open https://github.com/David0524/LeakSoftware/settings/secrets/actions › **New repository
   secret.** Name: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Secret: open the downloaded key file in
   a text editor, copy all of it, paste. **Add secret.**
2. Delete the key file from Downloads (and empty the Trash).
3. Tell Claude: "Play service account added". Claude runs the Android workflow with "Upload to
   Google Play" on; the workflow checks the key is a service account key before it uploads.

Google can take up to a day to let a newly invited service account upload. If the first
upload says the account has no permission, wait and run it again.
