# App Store submission: Sundeck Pro for iPhone (1.0)

Copy-paste text for App Store Connect, for the Swift iPhone app (`apps/ios`), written
2026-10-24 for the Nov 1, 2026 launch. Sections follow App Store Connect's own pages, top to
bottom; each text box is a `text` block with its length against Apple's limit (checked with a
script; `’` counts as one character). Facts come from the code as of this date; when a feature
or a data flow changes, update this file, the privacy policy
(`apps/web/src/app/(public)/privacy/page.tsx`) and the privacy manifest
(`apps/ios/PrivacyInfo.xcprivacy`) together.

The legal entity, its address and the copyright year are one constant, `COMPANY` and
`COPYRIGHT` in `apps/web/src/lib/site.ts`; the copyright line below is that constant.

Placeholders still to fill: **`[REVIEWER EMAIL]`, `[REVIEWER PASSWORD]`** (the review account,
made separately) and **`[CONTACT FIRST NAME]`, `[CONTACT LAST NAME]`, `[CONTACT PHONE]`** (who
Apple calls during review).

---

## 1. iOS App › 1.0 › Prepare for Submission (the version page)

### 1.1 Previews and Screenshots

iPhone 6.9" Display only. The app is iPhone only (`TARGETED_DEVICE_FAMILY: "1"` in
`apps/ios/AppHost/project.yml`), so no iPad screenshots. App Store Connect scales the 6.9"
set down for every smaller iPhone, so it's the only set needed. See section 6 for how they're
made and what each shows. Upload `01` to `10` in order; the first three show in search
results.

### 1.2 Promotional Text (170)

Can change any time without a new build.

<!-- field:promotional-text limit:170 -->
```text
Routes, checklists, chemical doses, reports, quotes, and invoices for pool service and leak detection crews. Works with no signal and syncs when you’re back.
```
157 / 170

### 1.3 Description (4,000)

No prices, no trial, and no link or instruction to buy on the website (see section 7: a free
companion app may not point to buying outside the app).

<!-- field:description limit:4000 -->
```text
Sundeck Pro is the field app for pool service and pool leak detection shops. Your techs see their day, work every visit from a checklist, and send a professional report, quote, or invoice before they leave the yard. The office sees it all as it happens.

Each shop picks its package, Pool Care, Leak Detection, or both, and the app shows only what the shop uses.

YOUR DAY
• Today: your stops in route order, with gate codes, notes, and directions in Apple Maps or Google Maps
• Schedule by day, week, or month, with each tech’s route on a map
• Optimize puts a day’s stops in the order with the least driving, and keeps the times you promised customers
• On My Way texts the customer when you’re headed over
• A Live Activity keeps your next stop on the Lock Screen and in the Dynamic Island

POOL CARE
• A service checklist for every visit, with a photo of the finished pool
• Water readings and a chemical calculator that says what to add, how much, and in what order
• A visit report for the customer
• Repair quotes from your price book, and the monthly service invoice

LEAK DETECTION
• A checklist for every skimmer, return, light, and drain
• Pressure tests that do the math
• Findings pinned on a drawing of the customer’s pool
• Pool inspections, question by question
• Review the report with the customer on your phone and get their signature on the spot

EVERY SHOP
• Works with no signal; everything syncs when you’re back
• Photos with markup, videos, and voice notes turned into text
• Quotes customers accept and invoices they pay online, by card or bank
• Cash and check payments recorded, with a receipt by text or email
• One company number for texts and calls, with an inbox the whole team shares
• Notifications when a customer texts, a quote is accepted, or a payment comes in
• For owners: the Dashboard, customers, and invoices on the phone too
• Two-step sign-in, and the shop’s records encrypted on the phone

Sundeck Pro is for teams with a Sundeck Pro account. Sign in with your account, or join your shop with the invite code your owner sends you.
```

### 1.4 Keywords (100)

Comma-separated, no spaces. The name and subtitle are already indexed, so "pool", "service",
"leak", "detection", "sundeck" and "pro" aren't repeated.

<!-- field:keywords limit:100 -->
```text
route,cleaning,chemical,calculator,pressure,test,report,quote,invoice,technician,schedule,dispatch
```

### 1.5 Support URL

```text
https://sundeckpro.com/status
```
The status page shows the service's health and the support address (`SUPPORT_EMAIL`,
support@sundeckpro.com).

### 1.6 Marketing URL

```text
https://sundeckpro.com/
```

### 1.7 Version

`1.0.0`. **The build must say the same:** `CFBundleShortVersionString` is still `0.1.0` in
`apps/ios/Info.plist` (and `LiveActivity-Info.plist`, and `MARKETING_VERSION` in
`apps/ios/AppHost/project.yml`). Raise all three to `1.0.0` before the release build; it was
left alone here because another change to those files was in progress.

### 1.8 Copyright

<!-- field:copyright limit:200 -->
```text
© 2026 Sundeck Pro, LLC
```

### 1.9 What's New in This Version (4,000)

App Store Connect doesn't show this box for an app's first version. For the record, and for
1.0.1 onward:

<!-- field:whats-new limit:4000 -->
```text
The first release of Sundeck Pro for iPhone.
```

### 1.10 Build

The TestFlight build of the release commit (TestFlight workflow, production backend). Export
compliance: section 5.

### 1.11 App Review Information

**Sign-in required:** Yes.

| Field | Value |
|---|---|
| User name | `[REVIEWER EMAIL]` |
| Password | `[REVIEWER PASSWORD]` |
| First name | `[CONTACT FIRST NAME]` |
| Last name | `[CONTACT LAST NAME]` |
| Phone number | `[CONTACT PHONE]` |
| Email | support@sundeckpro.com |

**Notes (4,000):**

<!-- field:review-notes limit:4000 -->
```text
Sundeck Pro is a business tool for pool service and pool leak detection companies. The account above is the owner of a review shop with sample customers, jobs, and messages; nothing in it belongs to a real customer, and the shop is set up for both pool care and leak detection.

HOW TO TRY IT
1. Sign in with the account above. The first sign-in downloads the shop to the phone (a few seconds).
2. Today: the day's stops in route order. Tap a customer's name to open the job.
3. On a pool service visit: work the Checklist, enter water readings, and tap What to Add for the chemical calculator.
4. On a leak detection job: Checklist, Tests (pressure test), and Findings with the pool drawing. Wrap Up shows the report for the customer to review and sign.
5. Schedule: day, week, or month, with the route map. Optimize reorders a day's stops.
6. Messages: texts with customers from the shop's number.
7. More: Notifications, Delete My Account (at the bottom), Privacy Policy, and Terms.

ACCOUNTS AND PAYMENT
The app is free and sells nothing. A company subscribes to Sundeck Pro outside the app as a business; the app is the field tool for its owners and staff, who sign in with the account the company set up (guidelines 3.1.3(c) and 3.1.3(f)). The app has no purchase screens, prices, or links to buy. Anyone can create a free account in the app (to join a team with the invite code the owner sends) and delete it in the app (More › Delete My Account).

Customer payments for pool services (quotes and invoices) are for physical services and are paid on the shop's own web pages through Stripe, outside the app (3.1.3(e)). The app only records cash and check payments.

PERMISSIONS (each asked when first needed; the app works without them)
• Camera: photos and videos of the pool, equipment, and leaks for the job's report.
• Microphone: voice notes, and the sound on job videos.
• Location (when in use only): where a job's photos, videos, voice notes, and signatures are taken, so the report shows the work was done at the pool. Looked up only at those moments, never in the background.
• Notifications: asked once after sign-in, after a short explanation. For customer texts, jobs assigned or moved, quotes accepted, payments, and signed reports.
• Live Activity: shows the tech's next stop during the work day. It can be closed from the Lock Screen.

TEXTING
Texts go to the shop's own customers from the shop's business number. Customers who reply STOP are not texted again. There is no public content and no chat between app users. On the review account, messages are sample data and nothing is sent to a real phone.

The app collects no data for tracking or advertising and contains no advertising or analytics SDKs.

Support: support@sundeckpro.com
```

### 1.12 App Store Version Release

**Manually release this version**, so the owner picks the moment after approval (and after
the production backend is confirmed).

---

## 2. General › App Information

| Field | Value |
|---|---|
| Name (30) | `Sundeck Pro` (11) |
| Subtitle (30) | `Pool service & leak detection` (29) |
| Bundle ID | `com.sundeckpro.app` (set) |
| Primary language | English (U.S.) |
| Primary category | Business |
| Secondary category | Productivity |
| Content rights | "No, it does not contain, show, or access third-party content." The app shows the shop's own records; maps are Apple's, inside MapKit. |
| License agreement | Apple's standard EULA. The Terms of Service (`/terms`) are the company's agreement with the shop and include the terms Apple requires of a developer's own agreement, so either works. |

<!-- field:name limit:30 -->
```text
Sundeck Pro
```

<!-- field:subtitle limit:30 -->
```text
Pool service & leak detection
```

### 2.1 Age Rating

Apple's current questionnaire (2025 onward). Answers:

| Question | Answer | Why |
|---|---|---|
| Parental controls | No | |
| Age assurance | No | |
| Unrestricted web access | No | The in-app browser opens only Sundeck Pro's own pages (privacy, terms, status, two-step sign-in) and the shop's customer links. |
| User-generated content | No | Photos, notes, and reports are private business records, seen only by the shop's own team and the customer they're sent to; nothing is published to other users. |
| Messaging and chat | Yes | The shop texts its own customers from its business number (SMS through Twilio). Not chat between app users. |
| Advertising | No | |
| Profanity or crude humor; horror or fear; alcohol, tobacco, or drugs; mature or suggestive themes; sexual content or nudity; violence (cartoon, realistic, prolonged, graphic); guns or weapons | None | |
| Medical or treatment information; health or wellness topics | None / No | Water chemistry is for pools, not people. |
| Gambling, simulated gambling, contests, loot boxes | None / No | |

Expected rating: **4+** (Apple may set a higher one because of messaging; any rating is fine
for a business app).

---

## 3. General › App Privacy

**Privacy Policy URL:** `https://sundeckpro.com/privacy`
**User Privacy Choices URL:** leave empty (no opt-out choices beyond account deletion and the
phone's permissions; both are in the policy).

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking:** No data type is used for tracking. The app has no advertising, attribution, or
analytics SDK and never reads the advertising identifier; its packages are Supabase, SQLCipher,
swift-crypto, and Sentry (off in the App Store build unless a `SentryDSN` is added; see Crash
Data below). The privacy manifest says `NSPrivacyTracking` false with no tracking domains.

For every type below: **Linked to the user: Yes. Used for tracking: No.** "Collected" means it
leaves the phone and is kept on Sundeck Pro's servers. Each row names where in the code it comes
from, so the answers can be checked when the code changes.

| Category › Data type | Collected | Purposes | Where it comes from |
|---|---|---|---|
| Contact Info › Name | Yes | App Functionality | Team members' names; the shop's customers' names (`customer`) |
| Contact Info › Email Address | Yes | App Functionality | Sign-in; customers' emails for reports, quotes, invoices |
| Contact Info › Phone Number | Yes | App Functionality | Team members' mobiles (calls ring them); customers' phones |
| Contact Info › Physical Address | Yes | App Functionality | Pool addresses (`property`); a tech's home start (`member_start`) |
| Contact Info › Other User Contact Info | No | | |
| Health & Fitness | No | | |
| Financial Info › Payment Info | No | | Cards go to Stripe on the website, never through the app |
| Financial Info › Credit Info | No | | |
| Financial Info › Other Financial Info | Yes | App Functionality | Quotes, invoices, and cash or check payments recorded for the shop's customers |
| Location › Precise Location | Yes | App Functionality | Where a photo, video, voice note, or signature is taken, only when allowed (`LocationLookup` in `Capture.swift`) |
| Location › Coarse Location | No | | |
| Sensitive Info | No | | |
| Contacts | No | | The app never reads the phone's address book |
| User Content › Emails or Text Messages | Yes | App Functionality | Texts with customers (shared inbox; `text_message`) |
| User Content › Photos or Videos | Yes | App Functionality | Job photos and videos, pictures in texts |
| User Content › Audio Data | Yes | App Functionality | Voice notes (transcribed by Deepgram); voicemails |
| User Content › Gameplay Content | No | | |
| User Content › Customer Support | Yes | App Functionality | Request a Feature (More) |
| User Content › Other User Content | Yes | App Functionality | Checklists, readings, findings, drawings, signatures, reports, notes |
| Browsing History | No | | |
| Search History | No | | Searches run on the phone; typed addresses are looked up and not kept |
| Identifiers › User ID | Yes | App Functionality, Analytics | The account ID on every record and usage event |
| Identifiers › Device ID | Yes | App Functionality | An ID the app makes for itself, stored with each change it syncs (`device_id`; not the advertising identifier or the phone's own ID) |
| Purchases › Purchase History | No | | The shop's subscription is bought on the website |
| Usage Data › Product Interaction | Yes | Analytics | Screens opened and for how long (`UsageRecorder`, `usage_event`, kept 180 days) |
| Usage Data › Advertising Data | No | | |
| Usage Data › Other Usage Data | No | | |
| Diagnostics › Crash Data | No* | | *Yes, not linked, App Functionality, if a `SentryDSN` is added to the build before release |
| Diagnostics › Performance Data | No | | Sentry tracing is off |
| Diagnostics › Other Diagnostic Data | Yes | App Functionality, Analytics | Errors people run into and the app version, with usage |
| Other Data | No | | |

`apps/ios/PrivacyInfo.xcprivacy` lists the same types.

---

## 4. Monetization › Pricing and Availability

| Field | Value |
|---|---|
| Price | Free (USD 0) |
| In-App Purchases and Subscriptions | None |
| Availability | **United States only** (recommended): texting, calls, payments (Stripe accounts in the US), weather, and address lookups all work in the US. It also keeps the launch inside the one storefront whose rules are clearest for this app (section 7) and out of the EU, where a trader's address and phone would be shown under the Digital Services Act. |
| Tax category | App Store software (default) |
| Distribution | Public on the App Store |
| Apple Silicon Mac and Apple Vision Pro availability | Off ("Make this app available" unchecked): it's built and tested for iPhone only |

---

## 5. Export compliance (asked on the build)

`ITSAppUsesNonExemptEncryption` is `false` in `apps/ios/Info.plist`, so TestFlight and review
don't ask. That is the right answer as we read the rules, with one thing to know:

- The app uses HTTPS (Apple's), and also **encrypts its own database on the phone with
  SQLCipher (AES-256)** and hashes files with swift-crypto. Both are standard algorithms, used
  to protect the app's own data; the app's primary function is business software, not
  information security, and it's sold to the mass market. That falls under the encryption
  exemptions Apple lists (Category 5 Part 2 Note 4 of the U.S. EAR; mass-market otherwise), so
  no export documentation is needed.
- If App Store Connect ever asks the questions: "Standard encryption algorithms instead of, or
  in addition to, using or accessing the encryption within Apple's operating system", then
  "Yes" to qualifying for an exemption, and "No" to distribution in France (US only).
- A lawyer can confirm this with the policy review; changing the answer later is a plist edit.

---

## 6. Screenshots

**Size:** 6.9" iPhone, **1320 × 2868** pixels, portrait, PNG, no transparency. (1290 × 2796
is also accepted; the 6.5" sizes 1284 × 2778 or 1242 × 2688 are only an alternative.)

**How they're made:** the `App Store screenshots` workflow
(`.github/workflows/app-store-screenshots.yml`, run by hand) renders ten screens of the real
app with the demo shop used in the launch film (Canyon State Leak Detections, a made-up shop
with made-up customers and 555 phone numbers), at exactly 1320 × 2868 with a 9:41 status bar
drawn in, checks the size and that there's no transparency, and saves them as the
`app-store-screenshots` artifact. The code is `storeShot` and the `store*` tests in
`apps/ios/Tests/SundeckAppScreenshots/LaunchVideoShots.swift`, which reuse the film's seeded
data. Download with `gh run download <run id> -n app-store-screenshots -D <folder>`.

**Look at every picture before uploading** (CLAUDE.md, "Look before you ship"): the shots are
drawn off screen, so they show the iOS 18 to 25 look (no Liquid Glass) and no live map; a
screen whose best part is below the fold can be moved with `storeShot(…, scrolled: points)`.

| # | File | Screen | Caption (optional, if frames with text are added) |
|---|---|---|---|
| 1 | `01-today.png` | Today: the day's stops in route order | Your whole day, in route order |
| 2 | `02-schedule.png` | Schedule, Day view (day map folded) | Every tech's route, planned |
| 3 | `03-pool-visit.png` | A pool service visit's checklist | A checklist for every visit |
| 4 | `04-what-to-add.png` | The chemical calculator's What to Add | Exactly what to add, and in what order |
| 5 | `05-leak-checklist.png` | A leak job's checklist | Every skimmer, return, light, and drain |
| 6 | `06-findings.png` | Findings pinned on the pool drawing | Leaks pinned on the customer's pool |
| 7 | `07-signature.png` | The customer's review and signature | Signed on the spot |
| 8 | `08-report.png` | Sending the report | A professional report before you leave |
| 9 | `09-quote.png` | The repair quote from the price book | Quotes from your price book |
| 10 | `10-messages.png` | Texting the customer from the shop's number | One number for the whole team |

**The day map:** a live map can't be drawn off screen, so Schedule is shot with its map
folded. For a shot with the map, take it on a real 6.9" iPhone (iPhone 16 or 17 Pro Max)
running the TestFlight build with the demo shop: the phone's own screenshot is exactly
1320 × 2868 and shows the real Liquid Glass and status bar. It can replace `02-schedule.png`.

---

## 7. App Review risks (checked 2026-10-24)

Not legal advice. Each item names what the code does and what to do.

1. **Buying outside the app (3.1.1, 3.1.3).** Sundeck Pro sells a subscription to businesses
   on the website (30-day trial with a card, Stripe). The iPhone app:
   - takes no payment and shows no price;
   - holds a new shop's owner on Finish Setting Up Your Account ("Finish setting up on the
     Sundeck Pro website, then come back here"), with no link or button;
   - says on the first-sign-in screen "The owner sets up the shop on the Sundeck Pro website,
     then signs in here with the same email.", with no link;
   - **had a "New to Sundeck Pro? Start a free trial." link on Sign In that opened the
     website's sign-up, where the trial takes a card.** That is a call to action to buy
     outside the app. Commit "iPhone sign-in: no "Start a free trial." link in the App Store
     build" turns it off behind `SignInView.offersTrialLink`.

   The app fits 3.1.3(f) (a free companion to a paid web tool, "provided there is no
   purchasing inside the app or calls to action for purchase outside of the app") and 3.1.3(c)
   (sold to businesses for their staff). Since May 2025 the US storefront has allowed links to
   outside purchases after the Epic v. Apple injunction, but that depends on litigation that
   was still moving; check the live guideline text on submission day rather than relying on
   it. **Recommendation:** no purchase link or wording anywhere in the app or its metadata, on
   every storefront; ship to the US only. The two remaining "on the Sundeck Pro website"
   sentences are informational and should pass; if a reviewer objects, the fallback is
   "Your shop's setup isn't finished yet. Ask the shop's owner." with no mention of the site.
2. **The in-app browser (low).** More › Privacy Policy, Terms, and System Status open those
   pages in Safari View; the website's header logo leads to the home page, which has prices and
   Start Free Trial. Reviewers rarely follow it, but if one does, hide the header's links on
   pages opened from the app (for example `?app=1`).
3. **Account creation and deletion (5.1.1(v)): passes.** Create an Account is in the app;
   More › Delete My Account deletes a tech's or second owner's account at once and turns a
   sole owner's into a deletion request handled within 30 days (`/api/account/delete`).
4. **Sign in with Apple (4.8): not required.** The app offers only email and password (with
   optional two-step codes); no third-party or social sign-in.
5. **Privacy manifest: added.** `apps/ios/PrivacyInfo.xcprivacy` (required-reason APIs
   UserDefaults, file timestamps, disk space; the collected data types; no tracking), copied
   into the App Store build; the TestFlight workflow fails without it. Sentry, SQLCipher and
   swift-crypto ship their own.
6. **Demo or placeholder content: none in release builds.** The "Demo accounts (dev only)"
   notice on Sign In is inside `#if DEBUG`, and the TestFlight workflow archives the Release
   configuration, so it isn't in the App Store build. The Design Gallery screen is never
   linked from the app. The review account's data is sample data, which is expected.
7. **Permission strings (5.1.1): specific.** Each names what the permission is for and an
   example (section 1.11).
8. **Minimum functionality (4.2) and sign-in (2.1):** a reviewer must be able to sign in;
   give a working account whose shop is finished setting up (an owner of an unfinished shop
   stops at Finish Setting Up) and has sample data, and keep it working through review.
