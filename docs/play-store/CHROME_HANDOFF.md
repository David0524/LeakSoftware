# Handoff: submit the Android app with Claude in Chrome

Paste everything below the line into Claude in Chrome (the browser extension), signed in to
Chrome with the company Google account that owns, or will own, the Play developer account.
It covers the Play Console work from `README.md` steps 2, 5, 7 and 9, with every answer from
`listing.md`, `data-safety.md`, `content-rating.md` and `app-access.md` included, so the
extension doesn't need the repository.

Before you start, download the 10 images listed under "Files to upload" into one folder (for
example `Downloads/sundeck-play`). The extension may not be able to choose files in the
file picker; if so, it'll ask you to pick them.

Where things stood on 2026-11-11: the Play developer account (organization) is created. The
first Android build is still to do, because the Android workflow had no `EXPO_TOKEN` or
`GOOGLE_SERVICES_JSON` secret yet (`README.md` steps 3, 4 and 6). The extension can create the
app and fill in every form now. Uploading the `.aab` waits for the first build (`README.md`
step 7).

---

You're helping me publish my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), on Google Play. Work in the Google Play Console
(https://play.google.com/console) in this browser. I'm here to type passwords, pay, and confirm.

## Rules

1. **Never type, read out, or store a password, API key, or service-account key.** When a field
   needs one, stop and ask me to type it.
2. **Stop and ask me before you:** pay anything, accept a legal agreement or declaration, verify
   identity (ID, phone, or email codes), send an app for review, or press **Start rollout**
   on any track. Before each of those, tell me what the screen says.
3. Use the answers below exactly. If Play asks something they don't cover, or the wording
   doesn't match, stop and ask me. Don't guess.
4. **Save** each form before you leave it. At the end, list what you finished, what's left, and
   any warnings in the Play Console dashboard, word for word.

## Step A: developer account (already created; skip unless it's missing)

If https://play.google.com/console shows a developer account, go to Step B. Otherwise, at
https://play.google.com/console/signup:
- Account type: **An organization or business**.
- Organization: Sundeck Pro, LLC (Nevada). D-U-N-S number, legal address, and phone: ask me.
- Website `https://sundeckpro.com`. Contact email: ask me (`support@sundeckpro.com` is the
  public one).
- The one-time $25 fee: stop and let me pay. Google then takes a few days to verify the
  organization. Tell me, and stop there.

## Step B: create the app

**Home › Create app**: App name `Sundeck Pro`. Default language **English (United States)**.
**App**, not game. **Free**. Then stop and show me the declarations (Developer Program Policies,
US export laws) so I can tick them. Then **Create app**.

## Step C: App content (Policy and programs › App content)

**Privacy policy:** `https://sundeckpro.com/privacy`

**Ads:** No, the app has no ads.

**App access:** "All or some functionality in my app is restricted" › Add instructions:
- Instruction name: `Demo shop (owner)`
- Username: `owner@demo.leakbook.test`
- Password: **ask me to type it.**
- Any other information (paste exactly):

```text
Sundeck Pro is for pool service and leak detection shops; accounts are made by a shop on sundeckpro.com. This is a demo shop with made-up customers, set to both packages. Texts and calls run in demo mode: nothing is sent to real people.

1. Sign in with the email and password above. The app opens on Today, the day's route.
2. Tap a stop's customer name to open the job. Checklist: mark items Not Leaking, Leaking, or Needs Attention. Photos: take a photo (allow the camera).
3. Wrap-Up: open Report to see the report the customer gets, then Review with Customer for the signature.
4. Jobs, Schedule, and Messages are in the tab bar; More has settings, invoices, and Delete My Account.

Location is asked for only when a photo is taken, to show the photo was taken on site; declining it is fine. No purchases are made in the app.
```

**Content rating:** Start questionnaire. Email `support@sundeckpro.com`. Category: **All other
app types**. Answers:
- Violence, blood, gore: No
- Sexuality, nudity: No
- Language (profanity, crude humor): No
- Controlled substances (drugs, alcohol, tobacco): No (pool chemicals aren't controlled
  substances)
- Gambling or simulated gambling: No
- Fear, horror: No
- Users can interact or exchange content: **Yes** (team members share jobs and photos within
  their shop, and the shop texts its own customers; only invited people, not the public)
- Shares the user's current location with other users: **No**
- Users can buy digital goods: No
- Web browser or search engine: No
- Mainly news or education: No

Expected result: Everyone / PEGI 3, with "Users Interact". If the result differs, tell me
before you submit the questionnaire.

**Target audience and content:** **18 and over** only. Not designed for children. The store
listing doesn't appeal to children.

**News app:** No. **Government app:** No. **Financial features:** none of the listed ones (it
records a shop's own invoices; it doesn't lend, trade, or hold money). **Health:** No.

**Data safety:**
- Collects or shares any required user data types: **Yes**
- All collected data encrypted in transit: **Yes**
- Users can ask for their data to be deleted: **Yes**
- Account creation: **Username and password** (accounts are made on the website or by invite;
  the app only signs in)
- Delete account URL: `https://sundeckpro.com/privacy` (the "Your choices" section explains
  how to delete without installing the app)
- Shared with third parties: **No**, for every type (our providers process data only on our
  behalf).

Data types. Tick each one as **Collected**, **not Shared**, **not ephemeral**:

| Category › type | Required or optional | Purposes |
|---|---|---|
| Personal info › Name | Required | App functionality, Account management |
| Personal info › Email address | Required | App functionality, Account management |
| Personal info › Phone number | Optional | App functionality |
| Personal info › Address | Optional | App functionality |
| Personal info › Other info | Optional | App functionality |
| Financial info › Purchase history | Optional | App functionality |
| Location › Precise location | Optional | App functionality |
| Messages › SMS or MMS | Optional | App functionality |
| Messages › Other in-app messages | Optional | App functionality |
| Photos and videos › Photos | Optional | App functionality |
| Photos and videos › Videos | Optional | App functionality |
| Audio › Voice or sound recordings | Optional | App functionality |
| App activity › App interactions | Required | Analytics, App functionality |
| App activity › Other user-generated content | Optional | App functionality |
| App info and performance › Crash logs | Optional | App functionality |
| App info and performance › Diagnostics | Required | Analytics, App functionality |
| Device or other IDs | Optional | App functionality |

Leave everything else unticked, including Files and docs, Financial info › other types,
Health, Contacts, Calendar, Web browsing, App info › Other, and Approximate location. If Play
won't save Precise location without Approximate location, tick Approximate location with the
same answers and tell me. Show me the preview before you submit the form.

## Step D: store settings and main store listing (Grow users › Store presence)

**Store settings:** Category **App › Business**. Tags: up to five that fit (for example
Business management, Scheduling, Invoicing). Contact email `support@sundeckpro.com`. Website
`https://sundeckpro.com`. Leave the phone number blank.

**Main store listing:**
- App name: `Sundeck Pro`
- Short description: `Routes, checklists, reports, and invoices for pool service and leak detection.`
- Full description (paste exactly):

```text
Sundeck Pro is the field app for pool companies: route cleaning crews and leak detection techs alike. Your shop picks its package, and the app shows only what you use.

Today
Your day's stops in order, with drive times, gate codes and notes, and directions in Google Maps. Text the customer you're on your way, call them, and mark each stop complete.

Pool service
- A service checklist for every visit, with photos
- Water readings and a chemical calculator that says what to add, in gallons and pounds, in the right order
- Repair quotes for pumps and filters, and the monthly service invoice

Leak detection
- A checklist for every skimmer, return, light, and drain: not leaking, needs attention, leaking, or not applicable
- Pressure and bucket tests that do the math
- Findings pinned on a drawing of the pool
- A clear report the customer reads on your phone and signs on the spot, or gets by email or text

Quotes, invoices, and receipts
Build a quote from your price book, send it, and the customer accepts and pays online by card or bank. Turn the work into an invoice, record cash or check payments in the field, and send a receipt.

Schedule
Day, week, and month views for the whole team, with each tech's route and drive time. Owners see who is where and what's done.

Works without a signal
Everything you enter is saved on the phone first and syncs when you're back in range. Photos, videos, and voice notes upload in the background.

Every shop
- Photos with markup, videos, and voice notes with transcripts
- One company number for texts and calls, with a shared inbox the whole team sees
- Your logo and colors on every report, quote, and invoice

Requires a Sundeck Pro shop account. Owners start a free 30-day trial at sundeckpro.com and invite their techs.
```

- App icon: `icon-512.png`. Feature graphic: `feature-graphic.png`.
- Phone screenshots, in this order: `1-today.png`, `2-schedule.png`, `3-jobs.png`,
  `4-leak-checklist.png`, `5-service-checklist.png`, `6-wrap-up.png`,
  `7-review.png`, `8-invoices.png`. They're in a folder I downloaded; if you can't choose files,
  tell me which file goes where and I'll pick them.
- No video. Save.

## Step E: first release to internal testing (only once I have the .aab)

Ask me whether the app bundle (`.aab`) from the first Android build is downloaded. If not,
stop here and report.

**Test and release › Testing › Internal testing › Create new release**:
- If asked about **Play App Signing**, choose **Use Google-generated key**.
- Upload the `.aab` (I'll pick the file if needed).
- Release name `1.0.0`. Release notes: `First release.`
- **Save › Review release.** Read me every error and warning. Then stop: I'll say whether to
  press **Start rollout to Internal testing**.
- **Testers:** create an email list named `Sundeck team`, ask me for the addresses, save, and
  give me the "Copy link" invite URL.

## Not yet

Don't create a production or closed-testing release. Production waits until the screenshots
are real Android captures and the internal build is tested. If the dashboard says a closed test
with 12 testers for 14 days is required, tell me. Organization accounts should be exempt.

## Report back

When you stop, give me a short list:
1. Done (each form and section)
2. Waiting on me (what and why)
3. Dashboard warnings or errors, word for word
4. Any question Play asked that these notes didn't cover, and what you answered, if anything

---

## Files to upload

Download these from the public repository into one folder before you start:

- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/graphics/icon-512.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/graphics/feature-graphic.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/1-today.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/2-schedule.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/3-jobs.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/4-leak-checklist.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/5-service-checklist.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/6-wrap-up.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/7-review.png
- https://raw.githubusercontent.com/David0524/LeakSoftware/claude/cool-keller-efjc00/docs/play-store/screenshots/8-invoices.png

## Calls made for you in this handoff (from `data-safety.md` "Owner to confirm")

Change them in the prompt above before you paste it if you disagree:

1. Delete account URL: the privacy page's "Your choices", not a dedicated page.
2. Purchase history: listed (invoices and payments the shop records).
3. Files and docs: not ticked (the PDFs are generated, not uploaded).
4. Device or other IDs: listed (push token).
5. Crash logs: listed. Disclosing it is the safe answer even if Sentry is off in the build.
6. Location shared with other users (content rating): No.
