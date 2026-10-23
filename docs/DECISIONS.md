# Decisions log

Newest first. Each entry: date, decision, reason.

## 2026-10-23 (owner, of the home page: "put it in the closing band just like the mockup"; "white texts on those orange buttons"; "A small strip of facts that are already true")
- **The closing band shows the 3D mark clip** (apps/video/logo3d) fading in from the right on wide screens and above the text on phones; the headline and buttons stay real text. It loads only near the band, plays muted and looping, and holds its still for Reduce Motion. The band's drifting water lines are gone (the clip has the water).
- **Start Free Trial is white text on a deeper orange**, Safety Deep `#C64B0C` (4.8:1), on the marketing site; white on the logo's Safety orange (3.1:1) stays ruled out (brand/BRAND.md).
- **Three facts under the hero:** payments go straight to your Stripe account, works with no signal, cancel any time. App Store and Google Play badges join them once the apps are live. Website only: the home page exists only there.

## 2026-10-23 (owner: "I need to build a video for this app that hypes it up but also demonstrates the full functionality")
- **A third video: a launch film of about 4 minutes, 16:9**, half SaaS launch and half blue collar, for owners of pool and leak detection companies. It tours everything: tech side on the iPhone app's real screens, owner side on the desktop website's real screens. Then a 60-second hype cut from the same project. Plan, storyboard, iPhone shot list and image prompts in `docs/plans/launch-video.md`.
- **An AI voice narrates it** (the owner generates it in ElevenLabs from the script in the plan's section 8), with captions kept on. **The music is made in code**, written new. **Built from scratch** (owner: "Please don't build on top of the other video. I didn't like it at all"): nothing is reused from the 45-second videos' code, music, look or edit; only the shop names and the owner's photos and logos carry over. **Both video shops appear:** Canyon State Leak Detection in the leak chapters, Blue Mesa Pool Co. in the pool chapters.

## 2026-10-22 (owner: "There are issues downloading my company on iOS … Let run via the internet for the beginning")
- **A new phone's first download leaves out deleted rows** (all four platforms' phones; the website doesn't download). On the dev project's demo company it was ~70,000 rows, 83% of them deleted by demo resets and tests (jobs 745 live of 4,253, checklists 5,765 of 30,135); now it is 13,900 rows in 8 pages of 2,000 (about 11 MB instead of ~72 MB). A pull from no cursor is a first download; the server marks its cursors (`"first": true`) so every page, and a download resumed after the app was killed, skips deleted rows. Changes and deletes made while it runs reach the phone with the next pull as before. Older app builds work unchanged (same calls; they pass the cursor back as it came). Discarding a rejected change now pulls from `{"from": "0"}`, which still includes deletes. Migration `20261022001900_first_download.sql`.
- **The company comes first.** A first download sends the company and memberships, then settings and lists, then customers, pools, plans and jobs, then everything under the jobs (`app.sync_table.first_download_rank`). Before, rows came in transaction order, and the demo company's row (changed recently) came after 68,459 of ~70,000 rows, so "opens as soon as its company arrives" (2026-10-21) waited for nearly the whole download. Today's and upcoming jobs aren't put first: a child row's place would move when its job changes, which could skip it mid-download.
- **Each page is quicker:** it picks its rows' keys first (from a new `(sync_xid, id)` index on every synced table) and builds JSON only for the rows it sends; before, every page built and sorted every row left in the download. On the dev project a page took 1.6–2.1 s whatever its size; now 0.26–0.68 s for 2,000 rows (before the new index, which isn't on dev yet). `sync_pull_count` counts live rows, so "Downloading your company · 42%" stays right.
- **A pull page that fails on the network is asked for again** after 1, 3 and 8 seconds before the sync gives up (Swift and TypeScript engines, so iPhone and Android); a refused sign-in or a server error isn't retried. A download picked up again after a failure shows the progress screen counting what's already on the phone, not 0%. The iPhone asks iOS for background time while it syncs, so locking the screen or switching apps doesn't cut a download off part way.

## 2026-10-22 (owner: "I'm getting a permission denied for function sync_pull error")
- **The website's Sign Out signs out this browser only** (`scope: "local"` in `apps/web/src/app/auth/sign-out/route.ts`). It used Supabase's default, which ends every session of the account, so any website sign-out of the demo account (automated tests included) also signed out every phone. The phone then called the sync functions without a user token, and Postgres answered "permission denied for function sync_pull", which the iPhone showed as is while the company never finished downloading.
- **A phone whose sign-in the server ended goes to Sign In** (iPhone and Android, same wording): when a sync call fails for want of a valid sign-in (HTTP 401, an expired or revoked token, "Sign in to sync", "permission denied for function …"), the app refreshes the sign-in once and tries again. A refresh that fails only for want of signal keeps the sign-in (offline, as before). A refresh the server refuses ends the session on that phone only (scope local, never global), stops any sync still running (its late answer is ignored, so Sign In never waits on a stuck download) and shows Sign In with "You were signed out. Sign in again to keep going." and the account's email filled in; with unsent changes it adds "3 changes on this phone will sync once you sign in as tech@shop.test. Signing in with another account removes them." Words in core `signed-out.ts` (`SIGNED_OUT_MESSAGE`, `signedOutNote`), ported to Swift with fixtures.
- **The phone keeps its data and unsent changes for the same account** (`session:signed_out_user` on the phone): signing in again as that account sends them; another account's sign-in clears the phone first, as before, so one person's changes never go up as someone else's. Signing out from the app still clears the phone.
- **Sync errors are shown in plain words, never the database's** (core `syncErrorText`): "No connection. …", "Phone storage is full. …", "The server didn’t accept this phone’s sign-in. Sign out and sign in again if this keeps happening." (a valid sign-in still refused), or "Couldn’t sync with the server. Sundeck Pro will try again in a minute." On Getting Ready and More › Sync.
- **Tokens refresh while the app is open and on return to the front** on both apps (supabase-swift's and supabase-js's auto refresh, started when the app becomes active and stopped in the background); every sync call uses the current session's token.

## 2026-10-22 (owner: "Android is back on the plan")
- **The Android (Expo) app is part of the launch again**, on Google Play, beside the website and the Swift iPhone app. Replaces the 2026-10-19 line "it isn't part of the launch for now" (below). The four-platform rule is unchanged.
- **Builds go through GitHub Actions, only when asked** (`.github/workflows/android.yml`, Actions › Android › Run workflow, like TestFlight): EAS Build makes the app bundle (`eas.json` production, version codes counted on EAS) and EAS Submit uploads it to Play's **internal testing** track when "Upload to Google Play" is ticked. The first bundle is uploaded by hand in the Play Console, which Google requires before uploads from tools.
- **Secrets stay out of the repo:** `EXPO_TOKEN`, `GOOGLE_SERVICES_JSON` (Firebase, for push) and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` are GitHub secrets; the workflow names any that are missing before it builds. google-services.json reaches the build server as an EAS file variable (a gitignored file isn't uploaded to EAS), read by `apps/mobile/app.config.js`; the Play key is written to a temp file that `eas.json`'s `serviceAccountKeyPath` names.
- **Store listing, Data safety, content rating and reviewer access** are drafted in `docs/play-store/`, with the owner's steps in `docs/play-store/README.md`. The screenshots are phone-website captures until an Android build exists, then replaced by real Android ones before production.

## 2026-10-22 (owner's answers: mass email limit, setting label, techs record payments, another color)
- **Mass email has its own daily allowance** (owner: "Give mass email its own limit"): Email Customers counts as `mass_email`, 2,000 recipients per shop per day by default (`DAILY_LIMIT_MASS_EMAIL` in `.env.example`), apart from the 300 a day (`DAILY_LIMIT_EMAIL`) for reports, quotes, invoices and receipts, so neither uses up the other. Send Test to Me counts against the mass email allowance. A list larger than what's left says "Your shop can email 258 more customers today. Narrow the list or send the rest tomorrow." (all four platforms, from core `massEmailLimitText`), or "Your shop has reached today’s limit for emailing customers. It resets tomorrow." The Admin portal's Health and shop pages show "Mass emails" as its own line. One count may now be up to 100,000 at once (it was 1,000, which a mass email to more than 1,000 customers would have tripped). Migration `20261022001700_mass_email_allowance.sql`. Replaces the "share the shop's daily email allowance" line below.
- **The customer's setting is "Reminder, review and shop emails"** (owner confirmed one switch for mass, reminder and review emails), on the customer page (On or Off) on all four platforms; its switch in Contact Details reads "No reminder, review or shop emails" (core `CUSTOMER_EMAILS_LABEL`, `CUSTOMER_EMAILS_OFF_LABEL`, ported to Swift). The reminder and review emails' link now reads "Stop reminder, review and shop emails from {shop}", its page asks "Stop reminder, review and shop emails?" and says the shop also sometimes emails its customers news and offers, and the privacy page matches. The mass email's own Unsubscribe page didn't name the setting and is unchanged.
- **Techs record payments** (owner: "Techs should be able to record payments"): cash, check (with its number) or other, on the invoice of any job they can see, everywhere Record Payment appears (the job's invoice in Wrap-Up, and the Invoices list's swipe and menu), on all four platforms, with the Send Receipt sheet after it as for managers. One rule in core `canRecordPayment` (anyone on the team, a sent invoice, something owed), ported to Swift with fixtures. The server holds a tech to the jobs they can see (with "Techs see all jobs" off, only their own); voiding, editing and sending invoices, and refunds stay with owners and admins, and payments are still written only through `record_invoice_payment`. Migration `20261022001800_tech_payments.sql`. Replaces "Still owners and admins record payments" below. A monthly maintenance invoice sits on the month's last visit, so a tech who can see that visit can record a payment on the whole month's invoice. The owner confirmed this ("Yes").
- **More colors has six swatches:** red #B3261E went (owner: "Drop another color"). It was the closest pair left (to orange #C2410C, ΔE 16 against 31 for the next closest, blue and purple) and nearly the app's own red for problems and Delete (#C62F2B), so a red brand reads as an error; orange stays, a common trades color. Accent's None and six, and Main color's six, fit one row of 44 pt swatches on a 6.1" or 6.3" iPhone (and on the phone website and Android). A shop already on red keeps it: it shows first and selected, as slate does.

## 2026-10-22 (owner: "A receipt for cash or check")
- **Record Payment says how it was paid**, on all four platforms: Paid by **Cash | Check | Other** (a segmented control, Cash to start), and for a check an optional **Check number** ("Optional. It shows on the receipt.", up to 20 characters, a leading # dropped). `payment.method` gains `cash` and `check`, and `payment.check_number` is new (`20261022001600_payment_receipts.sql`). An older app's call without a method still records Other. Office lists show "Cash" and "Check #1234"; the CSV export too.
- **Send Receipt follows at once:** after recording a payment (full or partial), a sheet asks "Payment recorded. Send the customer a receipt?" (or "Paid in full. …") with the payment's line ("$200.00 · Check #1234 · Balance remaining $449.00"), **Email | Text**, the customer's email or mobile filled in, then **Send Receipt** or **Not Now**. Text shows only when the shop has a working company number (it's sent from that number, through the shop's texting); otherwise email only. Shared rules and words: `packages/core/src/receipt.ts`, ported to Swift with fixtures.
- **Send Receipt stays on the invoice** (and in the Invoices list's menu) once a payment is received, for anyone who can see the invoice, so it can be sent later or again; it's for the latest payment received.
- **A manual payment no longer emails a receipt by itself** when it pays the invoice in full: the Send Receipt sheet replaces that, so the customer never gets two. Card and bank payments through Stripe still email their receipt automatically, as before.
- **The receipt is the invoice's own page and PDF** (its existing link): each payment with its method and date ("Check #1234, October 22, 2026"), the total, and the balance; a partly paid invoice adds "Thank you for your payment of $200.00 (Check #1234, …). The balance due is $449.00." above Pay. The email lists Invoice, Payment date, Method, Amount paid, Invoice total, and Balance remaining (or Paid in full), with the link.
- **Sending needs a connection** (it's the server's, like recording the payment). Offline, the sheet says "Sending a receipt needs a connection. Use Send Receipt on the invoice when you're back online." Nothing is queued.
- **Each receipt sent is in Activity**: "Receipt sent", "Sam Lee, $200.00, emailed by Tony" (or texted), and on the job's message log (`log_receipt`). A failed send is logged on the job but not in Activity.
- **Still owners and admins record payments** (unchanged): the request mentions techs; letting techs record cash and checks in the field is the owner's call. *(Changed the same day: techs record payments too, see above.)*

## 2026-10-22 (owner: branding page Save, More Colors, clipped fields)
- **Settings › Company and Branding has one Save, floating at the bottom** (owner: "Any time you leave the branding/compliance on iOS it says 'discard changes' even after hitting save. Let's remove all the save buttons on that page and just have one floating one on the bottom"), on all four platforms: the Next Step bar's floating glass with one Save pill above the tab bar. It saves every part that changed at once (company profile, reminders and reviews, report terms, next job number, logo and colors; on the website Services too, since it's on that page there). It's dimmed until something changes, reads "Saving…", then "Saved." with a check shows above it until the next change; a problem shows there instead (the first field's message on the phones, "Fix the highlighted fields." with each field marked on the website). Like the Next Step bar it steps aside while a field has the keyboard on a phone.
- **The "Discard changes?" bug:** reading the stored logo again after a save (the iPhone re-read it on every sync, the website on every new signed address) filled a main color still on the default with the logo's color, so the page looked changed right after Save. The stored logo is now read once per logo; after a save each part's starting point is what was stored (trimmed, "az" as "AZ"). **A color the stored logo suggests when the page opens lights Save but doesn't make leaving ask**, since the owner changed nothing (on the website, as long as no field was touched first).
- **The phones' logo waits for Save** like everything else (Android uploaded it as soon as it was picked). The synced parts save offline; the logo and the next job number need a connection, and when it's missing they stay unsaved with "You’re offline. Try again with signal." while the rest saves. The next job number is sent only when it changed (numbers only go up).
- **More colors has seven swatches:** slate #3C4450 went (owner: "Remove one color from Accent -> More Colors to save space"). It was the closest pair in the list (to the default navy #12263A) and the least like a brand color. Main color's More colors now fit one row on every phone (seven at 44 pt; before, eight wrapped to a lone swatch on a 6.1" or 6.3" iPhone), and Accent's None plus seven fill one row on a Pro Max (it wrapped to one lone swatch before); on a 6.1" or 6.3" phone Accent is still seven and one. A shop already on slate keeps it: it shows first and selected, as any color outside the list does.
- **Fields at the top of an iPhone list aren't clipped** (owner: More › Customers' search and Sort and Show "sit on rounded tiles and their edges/corners get cut off. That occurs in a few places"): an inset grouped list clips each row's content to its section's rounded corners, which on iOS 26 are much rounder than a field's 10 pt, so outlined fields laid edge to edge in a row lost their corners, outline and focus ring. Blocks of controls at the top of a list (Customers, the Checklist Components segmented control) are now drawn as a section header, which isn't clipped (`ListTopSection`). The website and Android don't put these fields in a clipping container; checked at phone size on the website.

## 2026-10-22 (owner: "send mass email (with some filtering)")
- **Email Customers**, for owners and admins, on all four platforms with the same words: a pill by the Customers title on desktop, an envelope in the navigation bar on phones (website, iPhone, Android). It opens its own page: **To** (Show: the Customers Show choices; City: the cities of the shop's pools; Last Job: Any Time, Last 30 Days, Last 90 Days, Last Year) with the server's live count ("42 customers with an email. 5 left out: 3 without an email, 2 unsubscribed."), **Message** (subject and plain text, {first name} filled per customer), **Send to 42 Customers** after an alert ("Send to 42 customers?"), **Send Test to Me**, and **Sent** (subject, date, "Sent to 40 · 2 didn't go"). Design: `design/2026-10-22-mass-email.md`.
- **The website's server sends every mass email** (the apps call `/api/mass-email` with their sign-in); composing needs a connection and the apps say so ("Sending needs a connection."). Resend's batch endpoint, 100 a request, about 2 requests a second. A list that changed between the alert and the send sends nothing ("The list changed. Check the count and send again.").
- **CAN-SPAM:** every mass email ends with the shop's name and mailing address and an unsubscribe link, carries `List-Unsubscribe` and one-click `List-Unsubscribe-Post`, comes from "{Shop} via Sundeck Pro" <news@…>, and replies go to the shop's email. **A shop without a full mailing address in Settings › Company can't send** until it adds one.
- **Unsubscribe is one switch**: the email's link opens a page with one Unsubscribe button (not on open, so mail scanners can't unsubscribe people), and the mail apps' one-click header works without a page. It sets the customer's existing "reminder and review emails" opt-out, so an unsubscribed customer gets no mass, reminder or review emails, but still gets reports, quotes, invoices and receipts. **Owner to confirm:** one switch for all three, rather than a separate one for mass email; and whether the customer page's label "Reminder and review emails" should become "Reminder, review and shop emails". *(Confirmed the same day: one switch, and the new label.)*
- **Mass emails share the shop's daily email allowance** *(changed the same day: mass email has its own allowance, see above)* (`DAILY_LIMIT_EMAIL`, 300 a day, with reports and invoices). A list larger than what's left today can't be sent ("Your shop can send 258 more emails today. Narrow the list or send the rest tomorrow."). **Owner to confirm:** keep 300, raise it, or give mass email its own allowance; a shop with 800 customers can't email them all in one day as it stands.
- **History is server-only** (`email_campaign`, `email_campaign_recipient`; managers read, only the server writes; phones get it from the API, not sync). Sundeck Pro staff in a support session can see the page but can't send a shop's mass email. Migration `20261022001500_mass_email.sql`.
- Not in this version: scheduling, pictures or formatting beyond paragraphs, and opens or clicks.

## 2026-10-22 (owner: customer filter counts, Dashboard customer trackers)
- **Every choice of the Customers list's Show menu shows its count** (owner: "have a number showing the total next to each thing"), on all four platforms in one format: `On a Plan (65)`, `All Customers (128)`, `Builders (0)`, thousands with commas. The counts are of the whole shop's customers, not the page shown; **with a search typed, they count what the search finds**, so picking a choice lists as many as it says. The website counts in one query (`public.customer_counts`, migration `20261022001400`); the apps count their synced rows. Shared rules and wording: `packages/core/src/customer-counts.ts`, ported to Swift with fixtures.
- **"On a Plan" means a current maintenance plan:** not deleted, and not ended before the shop's today (its end date is today or later, or none). **A paused plan still counts** (the customer is on it; only the visits are on hold). An ended plan no longer counts, which changes the filter from "has any plan". No Plan is everyone else.
- **The Dashboard has two trackers, first among its stat cards:** Customers (every customer not deleted; note "+4 in 30 days", or "None new in 30 days") and On a plan (the same number as the filter; note "52% of customers"). Each opens Customers, the second on On a Plan. On a plan shows only for shops that offer pool service, like the filter. In the apps they come from the phone's rows. Labels are sentence case like the other cards; the card has a chevron after its label instead of a blue note.
## 2026-10-22 (owner: "In the admin page, can we track screen time, how users use the app, things like that?")
- **Usage, per person, in our own database** (owner chose per person over per shop or overall, and our database over PostHog): the website and both apps send which screen is open and for how long, their platform and app version, and errors people hit, to `POST /api/usage` every minute and when the app goes to the background. **What people do** (jobs made, started and completed, photos, quotes, invoices, reports, chemicals, texts...) comes from the audit log the database already keeps, so it's the same on every platform without counting taps.
- **Screen time counts only while Sundeck Pro is in front:** on the phones, while the app is open; on the website, while the tab is showing and someone touched it in the last 5 minutes. A screen left open counts at most 30 minutes. A new session starts after 30 minutes away.
- **Errors** are error screens and changes that didn't save (the website's forms, the apps' server calls).
- **Admin portal › Usage** (7 / 30 / 90 days): people active, screen time, a person's day, sessions and platforms, daily charts, screens by time, what they did, app versions in use, errors, and people by screen time. Each person's and each shop's page has the same, for them.
- **Not counted:** Sundeck Pro staff helping a shop (they aren't its members). At most 5,000 events a person a day; events are kept 180 days (the daily cron prunes them).
- **The privacy policy says so** (What we keep), and its "Who owns it" now matches staff support access (to help the shop and its people, logged), rather than "only when the shop asks".

## 2026-10-22 (owner: "Add a password reset feature for our users")
- **Forgot Password? on every sign-in screen** (website on computers and phones, iPhone app, Android app) opens **Reset Password**: the account's email, then **Email Me a Reset Link**. Every address gets the same answer ("If … has a Sundeck Pro account, a reset link is on its way. It works for an hour."), so nobody can learn who has an account.
- **The server makes the link and emails it through Resend** ("Reset your Sundeck Pro password", from `account@send.sundeckpro.com`), not Supabase's own email. Supabase's link only works in the browser that asked for it, and the apps ask from the phone. At most 3 reset emails an hour go to one address (`take_password_reset`).
- **The link opens Choose a New Password on the website** (new password typed twice, at least 10 characters), once, for an hour. With two-step on, the authenticator code comes first. The page only works just after a reset link (15 minutes), never from an ordinary signed-in session. Afterwards **every other device is signed out**, and the person gets "Your Sundeck Pro password was changed".
- **Staff can send the same email** from the Admin portal (People › the person › Send Password Reset), logged in the Activity Log. Staff never see or set a password.

## 2026-10-22 (owner: "Build a desktop-only Admin portal")
- **An Admin portal for Sundeck Pro staff at `/admin`**, desktop only (narrower windows get a message, not the pages; not in the apps): Overview, Shops, People, Finances, Support, Health, Leads, Feature Requests, Activity Log. Staff are still `SUNDECK_STAFF_EMAILS`, and every page needs two-step sign-in. Plan: `plans/admin-portal.md`.
- **Admin Sign In** sits in the landing page footer with Privacy, Terms, Security and Status.
- **Staff can open any shop's office to help, without asking the shop** (owner: "Yes, silently"): a written reason, 30 minutes to 2 hours, View Only by default or Can Make Changes, never the owner-only things. The database enforces it; staff get no membership, so they never show in a shop's team, seats or notifications. Every session and staff action is in the portal's Activity Log, which can't be edited.
- **Money actions in the portal are Extend Trial and Make Demo Shop / End Demo.** Finances is read-only; refunds and plan changes stay in the Stripe dashboard.

## 2026-10-22 (owner: "remove dark mode on the landing page")
- **The public site is always light:** the landing page, terms, privacy, security, status, sign-in, sign-up and invite pages, whatever the person chose in the office. Their footer has no sun/moon button. The office keeps Light | Dark as before. Replaces, for those pages only, the 2026-10-13 sun/moon button in the public footer.

## 2026-10-22 (owner: "It's slightly too easy to slide jobs around in the schedule when flicking to scroll …")
- **The schedule's grip (≡) lifts a job only after the finger rests on it briefly**, on every platform, touch only (a mouse still drags at once): 0.13 s within 8 pt, then it drags as before. A finger that moves past 8 pt first (a flick, a scroll) scrolls the page and never moves the job; the tile's 0.4 s hold uses the same 8 pt; and a finger landing while the page still glides only stops it. One set of numbers in core `SCHEDULE_DRAG`. Design: `design/2026-10-22-schedule-hold-drag.md` section 1a.

## 2026-10-22 (owner, of "Marked 2 · U…" after Mark Remaining: "Glitched bubble after marking all … we can just remove it completely")
- **Mark N Remaining has no "Marked N" and Undo after it**, on every platform: the items are answered at once and each item's icons change any of them back.

## 2026-10-22 (owner: "Add a filter on the jobs and activity pages for job type")
- **A Type menu on Jobs and on More › Activity, on every platform** (core `jobTypeFilters`): All Types, then the job types the shop does in New Job's order, named as the rows name them in Title Case (Maintenance, Repair, Leak Detection, Pool Inspection; a pool care shop sees no leak types, a leak shop no Maintenance). On Jobs it narrows the status pills, the search and Sort; on Activity it keeps the events about jobs of that type, filtered by the server (`activity_feed(..., job_type)`, `20261022001000_activity_job_type.sql`) so each page of 50 is full, and customer texts (about a conversation, not a job) show only under All Types. Websites: a "Type" menu beside Sort (on phones the two share one row, labels for screen readers only), kept in the address as `?type=`; iPhone: the filter symbol in the navigation bar, filled while a type is picked; Android: a "Type" pull-down beside Sort. Empty states: "No repair jobs here." / "No activity on repair jobs yet." The Dashboard's Activity dropdown and Today's Activity beside the map stay unfiltered (latest few, then See All opens the page with the menu).

## 2026-10-22 (owner: "Remove the checklist entirely for repair jobs.")
- **A repair job has no checklist, on every platform** (core `jobHasChecklist`): its job page has Details, Findings, Photos and Wrap-Up, with no Checklist segment or count (an old `?tab=checklist` link opens Details); on Today, an on-site repair stop shows Mark Complete alone (no Open Checklist), and its card, Live Activity and Android notification count no checklist; the shop's "Finish the checklist first" never holds up a repair; and Wrap-Up's report line reads "from this job's repairs, notes, and findings". New Job and Set Up Checklist make no checklist rows for a repair, and the server ignores any a client sends (`20261022000900_repair_no_checklist.sql`). Checklist rows older repair jobs already had are deleted (owner: "delete"; `20261022001100_repair_checklist_delete.sql`, soft deletes so phones drop them), except an item a finding, test or photo still points to; repair reports frozen from now on have no checklist, and reports already sent keep their snapshot.

## 2026-10-22 (owner, of the phone checklist: "Wait hold on. I actually like your icons. Let's go with that. Consider that we'll need different icons for leaks vs maintenance vs pool inspections")
- **Phone checklists answer in one tap from icon pills on the item's line** (sketch B, `design/2026-10-22-checklist-options.png`): the item's name opens nothing, "›" opens its screen in the apps, and the line under the name starts with the chosen answer's word. Icons per answer set (`design/2026-10-22-phone-checklist.md`): leak items ✓ drop ! –; maintenance ✓ ! ⏭ (Skipped); yes/no and pool inspection by their words. Questions with more than four answers, or answers without an icon, use a "Choose ⌄" menu pill. Computers keep the segmented control.

## 2026-10-22 (owner: "On repair jobs, (in the intake and actually working the job) we need a button to 'add additional repair'")
- **A repair job holds several repairs**, one synced `job_repair` row each (not a list in `job.intake`, which last-writer-wins sync would lose under two phones). The job's price is their total, kept right by the server. **Add Additional Repair** is in New Job › Repair and in the job's Details (Repairs group, with Remove and Total) on every platform. The invoice bills one line per repair; the repair report lists them. Design and the open choices (price book list on the job, untaxed lines, remove-and-add to change a price): `design/2026-10-22-multiple-repairs.md`.

## 2026-10-22 (owner: "The reorder button takes up a full horizontal line. Move it elsewhere. Then the 'move up/down' buttons take up so much space and are redundant to the drag")
- **Reorder sits in the navigation bar beside New Job** (Done while reordering), as iOS puts Edit, on the phones; on computers at the end of Today's title row. No line of its own above the card.
- **No Move Up / Move Down buttons on screen in Reorder:** the drag handle moves a stop. They stay as VoiceOver and TalkBack actions on each stop, and on the website as buttons that show only when a keyboard focuses them.
- **The iPhone's logo wordmark folds away as Reorder's list scrolls**, as on every other tab page (owner: "The text part of the sundeck pro logo does not disappear when you scroll on the reorder page").
- **A Today stop's buttons stay on one line** (owner: "I don't like these being on 2 rows … Even if you have to change 'mark complete' to 'complete' or shrink tiles"): on the stop's row the button reads **Complete** (screen readers still say "Mark Complete for …") and the row's pills have 14 pt side padding, so Complete, Do Later, Message and Call share one line. Only very large text wraps them. Today's card keeps Mark Complete.

## 2026-10-22 (owner's overnight list: hold-to-drag, "5 Days | 7 Days", instant changes, skeletons, progress cues, live owner view, opened/paid pushes, weekly email, first win, first stop in one tap)
- **Holding a schedule tile drags it** (0.4 s for a finger; a mouse after 6 px), on every platform. The grip stays. The tile menu moved to a "⋯" button, since a hold can't both drag and open a menu; right click and Shift+F10 still open it on desktop. Design: `design/2026-10-22-schedule-hold-drag.md`.
- **Desktop Week: "5 Days | 7 Days"** in the This Week row, remembered per browser; it replaces the weekend column ("we can't eliminate weekends entirely").
- **Optimize and Optimize Week show the new order at once with Undo;** "Already the best order" when nothing moves; a failed save puts the order back.
- **The website changes things at once and saves after,** like the phones: job status, Mark Complete, Reopen Visit, Start Job, deletes. A failed save changes back: "Changed back. Nothing was saved." Forms with a Save button still wait for the server (their fields are checked there). Design: `design/2026-10-22-instant-and-skeletons.md`.
- **Skeleton screens, not spinners,** in the page's shape on every platform; spinners stay only inside buttons, the first download and report steps.
- **Progress cues:** Today's ring ("4 of 11 stops"; with 3 or fewer left "2 left · about 1 hr"; "All 11 done"); "Everything's checked. Mark it complete." with a filled Mark Complete; Getting Started starts at "Account created"; the Live Activity bar counts stops done. Design: `design/2026-10-22-progress-cues.md`.
- **Owners see the team live on Today:** on the desktop website, a Team list at the top of the right column with each tech's ring, current stop and last stop done. Not on phones (owner, of it on the phone: "I do not like this … definitely not on mobile"); there the tech chips switch days and the owner's Today still refreshes live. The website checks for changes every 5 s; the apps sync every 15 s on Today and Schedule. A poll, not Supabase Realtime, for now. Design: `design/2026-10-22-owner-live-today.md`.
- **Pushes when a customer first opens a report** ("Rebecca Soto opened the report.") **and when they pay,** to the job's techs and owners, each with its own switch. Visit reports don't notify on open.
- **Weekly summary email at 7 AM Monday** in each shop's own time zone (an hourly Vercel Pro cron, `/api/cron/weekly`; owner: "I have Vercel pro"), with Tuesday as a catch-up, to owners (admins opt in, never techs): jobs done, money in, owed, quotes waiting, this week's jobs. No email for an empty week.
- **First win:** every new leak detection shop gets one finished sample job on today's schedule, marked Sample, with its own name and logo, "Send Yourself This Report" (to the signed-in person only), never counted anywhere, gone for good once deleted. Pool-only shops get none for now. Design: `design/2026-10-22-first-win.md`.
- **Start of the day:** each tech's phone schedules a local notification at the shop's start time ("5 stops today · First: Smith"); one tap opens the first stop. Local rather than a server push, so it works with no signal and no push keys.
- **The shop's own logo is on reports, quotes and invoices,** and the main color is filled from the logo with a picker ("A hex code alone is not useful"). Sent reports keep the logo they were sent with.
- **No tips or hints in the apps** ("The app is super intuitive").
- **No summary line over Today** on any platform (owner: "Get rid of this on all platforms: 0 of 4 stops done. 4 stops · 1 hr 37 min driving"); the card says "Stop 1 of 4". Reorder stays at the top of the day on the right.
- **Desktop Today: the Team list is the tech selector;** the tech chips are gone there (owner: "remove the highlighted portion, and make the names on the right side the selector"). Phones keep the chips.
- **A quote already on the job never reads "No quote yet":** the start line says "Need another price? Start a new quote." on every platform.
- **Owner's answers the next morning:** the "⋯" tile menu with hold-to-drag stays ("Yes that's super smooth"); no pool-visit sample job for pool-only shops ("Nah we're fine"); the apps' Dashboard keeps its skeleton instead of the "Getting your numbers…" steps ("it's a fast loading screen anyway").

## 2026-10-21 (owner: "The nav bar still shrinks on 'Wrap Up'"; "Fix this white space. Keep the weather on one line. I don't need 'showers and thunderstorms'"; "make sure this is the most seamless app possible")
- **The iPhone tab bar never shrinks** while a page scrolls (iOS 26 minimizes it by default; on the job page the Next Step bar sits on it).
- **Today's weather is one line:** the icon, the temperature and the high; the conditions are read to screen readers only. Today's sync bar takes no room when it has nothing to say. Every platform.
- **Shorter labels that fit a phone:** a plan repeats "2+ a Week | Weekly | Biweekly | Monthly"; arrival time customers are told "Exact | 1 Hour | 2 Hours | 4 Hours". Scheduling settings say routes start at the shop or at home.
- **No "Move Back to Scheduled" on an unscheduled job:** an unscheduled job is scheduled with a day, from the Schedule.

## 2026-10-21 (owner: "Downloading your company takes a very long time. This needs to run in the background or something. You can't hold up new users this long")
- **A new phone opens as soon as its company arrives** (the first page of the first download); the rest downloads behind the app. The sync bar says "Downloading your company · 42%", and the screens fill in every two seconds as rows land. iPhone and Android (the website doesn't download).

## 2026-10-21 (owner: "The logo needs to park over the title"; "I can't scroll on a Scheduling tile"; "The cards should slide into new positions as I dangle the tile. Redesign those tiles too. They look super busy")
- **The logo sits right above the large title** on the five tab pages and scrolls away with it; the bar keeps only its buttons. Every platform.
- **Schedule scrolls from a card:** sideways gestures claim only clearly sideways drags; swipe actions on schedule cards are gone (their actions are in the card's menu); a card is picked up only from its grip or after a touch-and-hold.
- **Two-line schedule cards** (`docs/design/2026-10-21-schedule-card.md`), and the other cards slide into place while one is dragged. The website keeps a small "⋯" on cards so mouse and keyboard users can reach the menu; desktop cards are two lines now too.

## 2026-10-21 (owner, TestFlight build 1016: logo "above the page title"; Findings and Wrap Up "the navigation bar should not shrink"; Today has "too many gestures" and freezes)
- **The logo sits in the bar's top row, at the leading edge level with the round +** (28 pt), and the large title takes its own full-width row under it on Today, Jobs, Schedule, Messages and More.
- **The job page keeps a fixed inline title that never collapses**, on every section (Details, Checklist, Findings, Photos, Wrap Up), since all of them sit on tiles and switching sections shouldn't move the bar.
- **Today has no sideways swipe between techs' days**; the Whose Day pills switch.
- **Today's stop rows have no swipe actions and no touch-and-hold menu**; the open row shows Mark Complete, Do Later, the address (directions), the customer's name (the job), and round Message and Call buttons.
- **Today's hero card still swipes between stops**, but takes a drag only when it's clearly sideways (at least 10 pt, and 1.5 times the vertical); anything else scrolls the page.
- **The Live Activity's On My Way and Mark Complete are round 44 pt icon buttons** (a car, a check) with their names for VoiceOver, with more room above them on the Lock Screen; the expanded Dynamic Island uses the same buttons.
- **Reorder Techs is a round icon button (arrow.up.arrow.down) at the end of the Whose schedule pills**, not a row of its own (owner: "shouldn't take up so much space"); owners and admins only, as before.
- **On a computer, Reorder Techs sits in the Schedule's date row, after Day / Week / Month**, with "Reorder Techs" as its tooltip.
- **Reordering stops is as smooth as Reorder Techs** (owner: "Let's make reordering jobs just as smooth"): on Today's Reorder (Move Up, Move Down, the grip) and when dragging a stop within a day on the Schedule, the row moves to its new place at once with a spring, then saves through the sync layer; on the Schedule the stop under a drag slides down to open its place. Reduce Motion moves rows without the spring.

## 2026-10-21 (owner: "We need to speed up this process. It's taking hours to commit"; "Ok let's do all 6 changes")
- **CI runs only the jobs a change can affect** ("What changed" in `ci.yml`): iPhone jobs for `apps/ios` and `packages/core`, the database for SQL, sync and Swift, the browser tests for the website and packages. Workflow, lockfile and script changes run everything. A branch is compared with the default branch, so a cancelled run never hides a change.
- **The website goes live once its own CI jobs pass**; the iPhone jobs must pass before TestFlight.
- **Local checks are only what a change touches**; `swift test` and the iPhone build run in CI.
- **Each request ships when it's done**, not batched; CI is watched minute by minute.
- **One session merges into the default branch at a time.**

## 2026-10-21 (owner: "Make a way to reorder techs in the schedule.")
- **Owners and admins set the order of techs** with **Reorder Techs** on the Schedule, on all four platforms: a sheet with the active techs (color dot, Move Up, Move Down, a grip to drag), Done saves and Cancel discards. Saved per shop in `membership.schedule_order`, like a tech's color. Spec: `docs/design/2026-10-21-tech-order.md`.
- **The order is used everywhere techs are listed on the Schedule and Today:** Day columns, Week rows, Whose schedule, the Move sheet and Plan Week, and Today's Whose Day.
- **Me first only until an order is saved.** Once an owner sets one, it wins for everyone, Me included, because it was set on purpose. People added since go after it, A to Z.

## 2026-10-21 (owner, after a $5.44 Mapbox invoice: "Leave it on I guess. As long as I won't be charged a lot more this month")
- **Paid lookups stay on at 100 a month** (at most $0.50). The $5.44 came from Oct 16 to 20, before the counter existed, when pools were looked up with Mapbox's permanent geocoding uncounted; since Oct 20 the dev database counts 5.

## 2026-10-21 (owner: "On dashboard, make activity a dropdown on the right side at the same level as the title text. It is currently eating up space in the dashboard.")
- **The Dashboard's Activity is a dropdown in the title row**, on all four platforms: an **Activity** pill with a chevron (and the blue dot when there's something new) at the right of the "Dashboard" title, in place of the Activity section between the stats and the charts. It opens the latest 3 events and See All: a popover on the desktop website, a sheet on the mobile website, iPhone and Android. Spec: `docs/plans/search-and-activity.md`, section 2.

## 2026-10-21 (owner: "The desktop today page looks awkwardly wide. Shrink to the left half of the screen and consider what to put on the right half. Maybe activity? Invoices? Something new? I'm not sure.")
- **Desktop Today is two columns** (lg and up): the day as it is now on the left, about half the page; on the right, staying in view as the stops scroll, **Today's Map** of the day shown (the Schedule's day map: the start, the stops numbered in order, Enlarge for the live Apple map; it follows Whose Day), then **Activity** (the latest 5, See All, the new dot). Each person sees the Activity they can open, so techs get it too. Spec: `docs/design/2026-10-20-today-card.md`, Desktop.
- **Why:** a tech's day is a route, so the map is the most useful thing beside the list; Activity is what owners check next. Invoices stay on Invoices and the Dashboard.
- **Desktop website only:** phones (the mobile website, the iPhone and Android apps) keep the one-column Today. Between phone and desktop widths Today stays one column, capped at 42 rem.

## 2026-10-21 (owner: "Thirds is prob fine. Keep the 6 customers. No team chat")
- **Swipes turn a page past a third of the width** (was a quarter), or on a flick, on every platform: Today's cards, Schedule's pages and date strip.
- **The six customers the owner typed in stay** in the demo; the demo reset keeps them.
- **No internal team chat.** Not planned.
- **"Routes start at the shop, which has no map location yet"** shows only while someone on the schedule starts from the shop (website, iPhone, Android).

## 2026-10-21 (owner: "Merge it straight in. You got to start merging on your own going forward")
- **Sessions merge their own finished work into the default branch** once checks and CI are green, after bringing the default branch's newer commits in first (CLAUDE.md, Checks before every commit).

## 2026-10-21 (owner: "Remove the 'Runs 28 min past the end of the day.'"; "I don't care about days running late. … times are pretty irrelevant in this business"; "make the techs slide horizontally"; "Yes, start clearing out going forward")

- **No lateness warnings or clock times on all four platforms:**
  - "Runs … past the end of the day", "· … late" between stops, the fixed-time notes and
    Android's "+28 min" are gone.
  - Moving a stop says "Moved.", and Optimize says "Optimized · 1 hr less driving", with no
    "Back by".
  - The planner still prefers days that fit, but it doesn't say so.
- **Desktop Schedule's Day view:** techs sit side by side in one row that slides sideways
  (22 rem each), not wrapped into rows. Phones stack them.
- **TestFlight clears signing certificates:** each run revokes the development certificates
  that earlier runs made through the API ("Created via API"), before and after the upload
  (`scripts/asc-revoke-ci-certs.mjs`). Certificates made on a Mac, and distribution
  certificates, stay.

## 2026-10-20 (owner, from a screenshot of the iPhone app's Today: "The page titles sit a little low. Let's push up towards where the plus button is.")
- **Tab roots put the large title in the bar's row**, left of the bar's buttons (the "+"), as in the App Store and Music; the page rises with it. Screens with Back keep the title under the Back row. Scrolled, the small centered title shows in the bar as before. With very large text the title wraps before the buttons, and when a word can't fit beside them it takes its own row under the bar. All four platforms (spec 3.1).

## 2026-10-20 (owner: "Yes do your suggestion"; Apple Maps on the website)

Plan: `docs/plans/apple-maps.md`.
- **Apple for maps, map images, address search and desktop directions; Mapbox for drive times
  only.** The website's live maps use MapKit JS, day-map images come from Apple Snapshots (days
  with 10 or more stops stay on Mapbox, since an Apple pin's number is one character), address
  suggestions come from Apple's autocomplete, and "Open in Maps" on a computer opens
  maps.apple.com. Drive times for Plan Route, Plan Week and Routes stay on the Mapbox matrix.
- **Apple's free allowance is guarded in `app.mapbox_budget`** for every shop together:
  `apple_snapshot` 22,500 a month, `apple_service` 600,000 a month and 22,500 a day,
  `apple_map_view` 6,000,000 a month and 225,000 a day (a new `daily_limit`, counted in
  `app.mapbox_usage_daily`). Apple never bills; past its limit it refuses, and Mapbox takes over.
- **`MAP_PROVIDER`:** `apple` by default once `APPLE_MAPS_TEAM_ID`, `APPLE_MAPS_KEY_ID` and
  `APPLE_MAPS_PRIVATE_KEY` are set, `mapbox` without them; `MAP_PROVIDER=mapbox` forces Mapbox.
  Until the keys exist nothing changes, desktop directions links included.

## 2026-10-20: owner list g (team colors, Week with routes, the demo)

Spec: `docs/design/2026-10-20-team-week.md`.
- **Today's card:** the name opens the job only on a clean tap, and the address is plain text
  (Directions is the round button).
- **Team:** one list. Active members are A to Z; turned-off members follow, the most recent
  first ("2. Is perfect"). The On/Off switch is on each row, and the profile holds Role and
  Color.
- **Tech colors:** ten palette colors (`color.tech`), one per member (`membership.color`),
  shown as a dot by the name and a 4 pt stripe on schedule cards.
- **Maps wording:** buttons say "Maps". The setting reads "Maps (Apple)" and "Maps (Google)".
- **Moving a weekly visit** to another day or tech asks Change Schedule or Just This Visit
  (`job.plan_moved`). Taking one off the schedule, or choosing Nobody yet, is a one-off and
  doesn't ask.
- **Routes is gone:** its work moved into Week, with a left sidebar on desktop (Needs a Time,
  then Customers to Add). Desktop cards are one line.
- **Demo:** `pnpm demo:reset` rebuilds the demo company on the dev project.

## 2026-10-20: owner list f (after TestFlight 1010)

Spec: `docs/design/2026-10-20-gestures.md`.
- **Cleaning alerts:** filter and salt-cell cleanings due show on Today's card and the Live
  Activity / Android ongoing notification.
- **Today's card:**
  - It swipes between the day's stops, its segments are tappable, and Back to Now returns to the
    current stop.
  - A finished stop's card offers only its undo.
  - Mark Complete moves straight to the next stop, with an Undo banner. There is no 60 s hold.
- **On My Way** lives in Message: on the tech's own stop before arriving, Message starts as the
  On My Way text, and the tech can edit it. There's no car button.
- **No clock times** on the Live Activity or the card.
- **Live Activity switch** in Notifications, on unless turned off.
- **Gestures:**
  - swipe between a job's pages, an owner's techs on Today, and Schedule's days;
  - pull to refresh;
  - swipe actions on Today's rows;
  - the Findings title doesn't collapse when the page fits.
- **Plan Week** takes several techs and splits the open jobs evenly by minutes of work.
- **Jobs** sort like Invoices.
- **The first download** shows real progress (`sync_pull_count`) as a pool that fills, and uses
  bigger, overlapping pages.

## 2026-10-20 (owner: "Go with option 1, cap at 100")
- **Addresses the free lookups miss get one try with Mapbox's paid permanent geocoding**, at most 100 a month for every shop together (`app.mapbox_budget` `geocode_paid`; $5 per 1,000, so at most $0.50 a month). Free lookups (Census, then OpenStreetMap) always come first and aren't counted.

## 2026-10-20 (owner, TestFlight 1010: "Place 'Start Job' to the left of the three icons"; "Change 'plan route' to 'optimize'. Change 'start job' to 'start'"; the planner's note "looks horrible. Display it on a banner on the top of the screen"; "Smooth out the scheduling screen"; "The Liquid Glass literally freezes up when I press 'plan route'"; "the whole app can honestly be smoother"; "Schedule dragging should be on the right side of the card"; "edit access notes on the job screen underneath the address"; "still getting address not found on real addresses")
- **Today's card:** Start sits left of the round buttons on one row before leaving and while driving; the button says "Start".
- **"Plan Route" is "Optimize"**, and its result ("Optimized · 1 hr 6 min less driving · Back by 4:28 PM") and the Schedule's other results show as a short banner at the top of the screen that goes away by itself, not a block in the page.
- **Smoothness:** planning runs off the main thread on the iPhone and after the tap's frame on Android; buttons show their progress at once; Schedule and Today show placeholders while loading; pool lookups run after the page is sent, never before it.
- **Drag grips are on the right of every card.**
- **Access notes are edited from the job page**, under the address.
- **Pool lookups:** a miss is remembered with its address, so it isn't retried on every load (only a changed address tries again), and the apps ask for lookups of their unplaced stops as the website does. All existing unplaced pools were looked up once.

## 2026-10-20 (owner: "I think the live activity only starts when you have the app open at the day start time. It should run anytime you have the app open during the work day")
- **The Live Activity (iPhone) and the ongoing stop notification (Android) start whenever the app is opened during the work day**: a work day, after the working day's start, with a stop not done, and nothing showing. A tech who removes it keeps it off only while the app stays in the background; opening the app brings it back. Before, a removal (or what looked like one after the app was closed) kept it off until the next work day.

## 2026-10-20 (owner: "In the regular maintenance report, do not list/include items that were not completed"; "make the 'on my way' text to just be an icon and make 'Start Job' stay there from the beginning. You have to remember, not every tech is going to use every function all the time"; the job's address "should open up the screen to edit it. You can put a little pin icon to open in maps"; a picked suggestion still said "not found")
- **The maintenance visit report lists only what was done**; skipped items are left out (the report page is shared by every platform).
- **Today: Start Job is the main button from the start**, so a tech never has to send On My Way. On My Way is a round car icon, first among the card's round buttons and on Today's rows, until it's sent.
- **The job's Pool row opens the pool's details to edit** (the customer page's editor, with suggestions); a round pin at its end opens Maps.
- **Pool lookups no longer count against the shop's daily Mapbox allowance**: they're free (Census, OpenStreetMap), and a day that used the allowance up on drive times had left newly picked addresses unfound.

## 2026-10-20 (owner on the route-maps build: "1. Can move 2. Great! 3. Include")
- **Plan Week with Everyone may move a tech's scheduled jobs to another tech**, as planned; a waiting job already given to a tech stays theirs.
- **The iPhone's small day map stays a preview** that doesn't take drags; tapping it opens the map you can pan and zoom.
- **Locks are icons, not messages** (owner, then: "Don't do lock messages. Do icons"): saving a lock shows no message, and cards show the lock as an icon only, a calendar with a padlock (day), a clock with a padlock (time) or a padlock (both), read aloud and shown on hover as "Day locked", "Time locked" or "Locked". The job's own Lock row keeps its words; "Two techs" stays words.

## 2026-10-20 (route maps built: day maps, Plan Week, locks, Routes)
- **Day maps:** the small map is a preview (an image on the website and Android, a muted Apple map on the iPhone that doesn't take drags, so the Schedule still scrolls); tapping it or Enlarge opens a map you can pan and zoom (Mapbox GL on the website, Apple Maps on the iPhone; Android shows a larger image until an interactive one is added). On phones the selected tech's map leads the day, under the tech chips. Dark mode gets Mapbox's dark map.
- **Plan Week's sheet has "Place Jobs from Needs a Time"** (on by default, with the count waiting), so one tap never silently fills the week with every waiting job. A waiting job given to a tech stays theirs; unassigned ones are placed only with the switch on. Scheduled jobs come first, then the oldest waiting, up to 150.
- **Locks are set on the job's schedule** with None · Day · Time · Both; cards show the lock's icon. Moving a time-locked job by hand keeps its clock time on every platform.
- **Routes** is a fourth Schedule segment for owners and admins (Day · Week · Month · Routes), as designed in `docs/plans/route-maps.md`. Its drive times are estimates (no Mapbox calls), said as "about … driving".

## 2026-10-20 (owner: "For the address error, just put a little error symbol next to the address. Don't waste space with text"; "On the today hero, you have to have customer notes there")
- **"Not on map" is a warning symbol right after the address** on Today's card and rows and on Schedule's cards, every platform, read aloud as "Not found on the map". The job page keeps its full explanation, where it's fixed.
- **Today's card shows the customer's notes**, then the pool's, two lines at most, with a note symbol.

## 2026-10-20 (owner: "I added a payment method to Mapbox. Please ensure I do not surpass the free tier")
- **One monthly Mapbox budget for every shop together** (`app.mapbox_budget`, `public.mapbox_take`), at about 90% of each free tier (mapbox.com/pricing, checked 2026-10-20): map images 45,000 of 50,000; address suggestions 90,000 of 100,000; drive times 90,000 of 100,000 matrix elements (Mapbox bills origins × destinations, so a 25-stop day is 625); interactive map loads 45,000 of 50,000. Past it, each falls back as it does without a key: estimated drive times, no map image, typed addresses, the map image instead of the interactive map. The per-shop daily limits stay as well.
- **Pools are looked up for free, not with Mapbox.** Mapbox's permanent geocoding (the kind that may be stored) has no free tier: $5 per 1,000 from the first. Lookups use the US Census Bureau's geocoder, then OpenStreetMap's Nominatim (at most one a second, per its policy), and a match counts only when its house number and street direction are the ones typed (Census offered 1000 E Charleston for 1000 W). Suggestions as you type stay Mapbox's temporary geocoding, shown and never stored.
- The iPhone draws its maps with Apple Maps (free).

## 2026-10-20 (owner, Today's card from TestFlight: "get rid of this button now. It exists on the card"; "find a better place for the call/direction icon … so we can shorten the card"; "Add a text icon too"; "consider iOS and Swift principles. As if designed by Apple")
- **Today's card follows `docs/design/2026-10-20-today-card.md`** on every platform, reviewed against Apple's guidelines: the top line names the moment and the stop ("At the pool · Stop 2 of 3"), the name leads, the figure is smaller, the address is plain text that opens directions, details line up behind their symbols, and the two buttons share the row at equal widths. Secondary text is white at 92% (4.8:1; 85% was 4.3:1, under the 4.5:1 text needs). Numbers roll and text cross-fades when the moment changes, without motion under Reduce Motion.
- **Message, Call and Directions** are round buttons on the card's Next line. Message opens the company number's conversation when there is one, else the phone's own texts.
- **"Next Stop in Apple Maps" / "Open Route in Maps" is gone from Today**: the card's Directions does it. Schedule keeps its route buttons.
- **The Now row in Today's list** shows only "Now", not the job's state, so the name has room.

## 2026-10-20 (owner, route maps plan `docs/plans/route-maps.md`: "1. Cool by me. 2. Ok 3. Yeah. There needs to be locks for jobs whether that's day, time, or both. 4. Yes. 5. Yes")
- **Maps by Mapbox** on the website and Android, Apple Maps on the iPhone: a map for each day on Schedule with numbered pins, Enlarge, and Plan Route.
- **Plan Week** places a week's jobs on days and in order for the least driving, across techs when asked, with one Undo; up to 150 jobs a run.
- **Routes** (owners and admins): Customers to Add, drag a pool customer onto a weekday to set the plan's day and tech, and Suggest Days. Visits already made for coming weeks move with the plan's new day.
- **Locks:** each job can be locked to its day, its time, or both. Day: stays on its day, order and time may change. Time: keeps its clock time, may move to another day. Both: stays put. "The customer was told this time" becomes Both. Planning respects every lock.
- **Day maps fold away on phones:** open on the Day view, closed on the week strip.
- **Schedule cards look like Today's**, and stops can be dragged on phones again (website, iPhone, Android), with Move… kept. Leak detections carry their "Leak detection" tag like the other types.

## 2026-10-20 (owner, Today hero plan `docs/plans/today-hero.md`: "1. Agreed 2. Sure 3. Yes 4. Yes 5. Yes")
- **Today opens with a card for the stop you're on**, on every platform: the Live Activity's stop, words and figure (scheduled time, arrival time, checklist count, or ✓), the customer's name (opens the job), job type and stop count, the address (opens directions, "Not on map" when it isn't), the access notes on one line with a key, the next stop, and one progress segment per stop. Its main button is the moment's: On My Way, Start Job, or Open Checklist with Mark Complete. One rule in core (`todayHero`) picks the stop for the card, the Live Activity and Android's notification. No timer or countdown.
- **Water blue card, white text, white main button with blue text.**
- **On My Way is recorded on the job** (`job.on_my_way_at`, `arrive_at`, synced), so the website, the office and a second phone show "On the way, arriving 9:42".
- **Done stops fold into one "N done" row**; the card's stop stays in the list as one row marked Now.
- **Owners and admins looking at a tech's day see that tech's card** without On My Way or Start Job (Call and Directions stay).
- **Before leaving, the card shows the drive**, such as "14 min drive" (a fixed estimate, not a countdown).

## 2026-10-20 (owner: "reschedule a job from the jobs page after creating it"; "an indicator for when address doesn't register"; "an auto complete or something for the mapping")
- **A job can be rescheduled from its page until its work is done** (unscheduled, scheduled, or in progress; repairs as before), not only before it starts.
- **"Not found on the map"**: a pool with an address but no map location for it shows a warning on the job page, "Not on map" on Today, Schedule and the customer's page. Routes and drive times leave it out until it's found. A lookup now counts only a match to the address or its street; a town or ZIP code's middle reads as not found instead of a wrong pin.
- **Address suggestions as you type** in every street-address field, from the same Mapbox account (no new service): up to 5 real addresses near the shop after a short pause; picking one fills street, city, state and ZIP. Suggestions have their own daily allowance per shop (`ADDRESS_SUGGEST_DAILY_LIMIT`, default 2000), apart from lookups and drive times. They're Mapbox's temporary results, so only the address picked is kept; its location comes from the usual lookup.
- **New Job's types are Service, Repair, Leak, Inspection**, in that order, short enough to fit across a phone.

## 2026-10-20 (owner: tech profiles, centered pool shapes, the sync note, Reopen Visit on Today, phone numbers)
- **Profiles for each person** (Settings › Team › Profiles): name, phone, email, address, emergency contact (name and phone) and notes. Owners and admins read and write them, on the website and their phones; techs don't see them, their own included. Team members get one each, and Add Person keeps one for someone who doesn't use the app.
- **Pool shapes are drawn in the middle of the diagram** and of their buttons. Pools saved before sat 10 units left to leave room for the spa; those with nothing placed on them moved now, the rest move with their spa, landmarks and drawing the next time their shape is saved. Finding pins already placed and sent reports keep where they were.
- **The "needs to sync" note shows only after 8 seconds** of changes waiting, so a quick sync doesn't flash it.
- **A completed maintenance visit has Reopen Visit on Today**, as on its page; leak and repair stops keep Mark Not Complete.
- **Phone numbers format as they're typed** on every phone field: "(602) 555-0142", "+1 (602) …" with a leading 1; numbers from other countries (starting "+") and extensions are left as typed.

## 2026-10-20 (owner, from TestFlight: "live activity logo appears black"; "use our lighter blue for live activities"; "It doesn't seem to allow me to access photos from my camera roll")
- **Live Activity and Android's current-stop notification in the water blue** (#1F6FAE) instead of navy: white text, white progress and check; the Dynamic Island keeps its black, with the water blue's light shade for its text and keyline.
- **The Live Activity's logo** is drawn in its own colors where the Lock Screen tints Live Activities, and at the size it shows (the 512 by 749 file is redrawn to 144 pixels tall).
- **The photo library:** build 1006 opened it only from a long press on Add Photo. The one-handed changes (merged here) put a Library button beside Add Photo on every platform.

## 2026-10-20 (owner: "Pool inspection plan approved, go with your recommendations")
- **Pool Inspection is a job type for leak shops** (`docs/plans/pool-inspection.md`), with the four recommendations: a gate question's No folds its group ("Not present"); the twelve feature questions are one tap-all-that-apply list in From the Customer; Write Draft drafts the report's summary; one price on the job from a new "Pool inspection" price book item ($495 to start; shops set their own).
- **Every question of the Leaktronics form is a checklist row** (133 in eight sections, word for word, with group headers and banners). Contact fields are the job's own; Leaks noted and Summary notes are the report's text; the insurance claim question is left out ("Remove the insurance stuff").
- **Which answer needs attention** is set per option, from the wording (No on "Is the heater properly sized?", Yes on "Does the system show visible leaking?"); "is there one" questions flag nothing. Shops can change any of it in Settings.
- **The inspection report uses the homeowner report's draft, sign-off, and send**, titled Pool Inspection Report, rather than a separate report template.
- **An inspection's report can be signed and sent before every question is answered** (unlike a leak detection, which waits for its whole checklist): the report lists the questions answered, and Needs attention lists the flagged ones. Write Draft doesn't check an inspection's text for leak checklist names ("Main drain", "Pool"), since its questions use those words.

## 2026-10-20 (owner: techs change the order of stops from Today, "Fix this")
- **Do Later and Reorder on Today** on every platform (`docs/plans/today-reorder.md`): Do Later moves a stop to the end of the day's route (with a 5-second Undo); Reorder puts the day in edit mode with drag handles and Move Up / Move Down. Both use the Schedule's own move, so promised times and started jobs stay put and techs move only their own stops.

## 2026-10-20 (owner: navigation compared with other SaaS apps)
- **Search across the shop** on every platform (`docs/plans/search-and-activity.md`): customers, pools, jobs, quotes and invoices by name, phone, address or number; at the top of Jobs on phones (offline, from the phone's data), a header field and ⌘K on desktop; Recent when empty. It follows the existing visibility rules.
- **Activity** in More on every platform, with a card on the owner's Dashboard: quotes accepted, payments, reports signed and sent, jobs completed, assigned or moved, customer texts. Recorded by the database; techs see only events about jobs and conversations they can see.
- **Kept as is:** no create-anything "+" (customers are added through jobs); Customers and Invoices stay under More (jobs drive them).

## 2026-10-20 (owner: "Job numbers should never have commas to separate digits")
- **Job, quote and invoice numbers never have thousands separators** on any platform ("Job #1038", not "#1,038"). On iPhone a number put in a SwiftUI `Text` literal is formatted with them, so document numbers use `Text(verbatim:)` or a `String`; `DocumentNumberTests` fails on a `#\(…)` inside a Text literal.

## 2026-10-20 (owner: one-handed use review, "Do all changes except for 11")
- **One-handed use on every platform** (`docs/design/2026-10-20-one-handed-use.md`): a Next Step bar at the bottom of the job page on phones (Start Job, Complete Job, Add Test · Add Finding, Add Photo · Add Video, Write Draft); photos on a test or finding before its first save; Save pinned in the test and finding sheets; typed text saves by itself (no Save Text); Android back asks before discarding; completing a visit asks "Ready to send the visit report?" when it would send one (Automatic shops), and Mark Remaining gets a 5-second Undo; report send controls first and versions folded; offline Finish and Send queue on the phones; checklist answers as one-tap segments (Remove Item only behind Edit and swipe); Delete in a photo's More menu; camera straight from Add Photo, Library visible; sync bar pinned; Today's tip after the stops. Reason: frequent field actions were at the top of the screen, two or more taps deep, or one slip from losing work.
- **Not changed:** tap targets stay at the 44 pt minimum (review item 11, declined).
- **New shops start with techs seeing only their own jobs** (owner: a tech reaching jobs not assigned to them is "not intended"; "Default to Only Their Own"). Owners can still choose Every Job in Settings › Team. Existing shops keep what they had (written down as Every Job by `20261020000100_techs_see_own_jobs.sql`); the demo shop stays on Every Job.
- **Discard changes, everywhere:** every editor with unsaved changes asks "Discard changes?" before closing, on all four platforms and every way out (Cancel, swipe down, tap outside, Escape, Back, Android back, links and notifications).

## 2026-10-20 (owner: "Dashboard should be in the apps"; "On invoices tab add some filtering and sorting"; visit reports)
- **The Dashboard is in both apps**, first in More, for owners and admins: the website's numbers (collected, owed, quotes accepted, invoiced, collected by month, jobs by status) as phone cards and a bar chart, from the same `owner_dashboard`. Replaces decision 12 of the native-apps spec ("Dashboard is left out of the apps").
- **Invoices filter, search, and sort** on every platform: All, Unpaid, Overdue, Drafts, Paid, Void (with counts); customer, invoice, or job number; Newest, Oldest, Due Date, Amount Owed, Total, Customer. An unpaid invoice past its due date reads "Overdue".
- **Maintenance visit reports:** the water test (each reading against its range), what was done, notes, and photos, at the customer link. Send by email or text; in shops that choose Automatic, sent once by itself when a visit is completed (and by the daily catch-up). Settings › Report Templates › Visit reports: Automatic, By Hand (the default), or Off. Pool care shops now get the Report Templates page for this.
- **Saved reports:** a shop's own wording by report section, used word for word with Use Saved Report.

## 2026-10-20 (owner: Liquid Glass sliders, gestures, addresses, no website links, texting, the steps, job titles, Today)
- **Segmented controls are the system's on iOS 26** (Day/Week/Month, the job tabs, Light/Dark): the real Liquid Glass control, which can be held and dragged; our own stays for iOS 18. On the website and Android, the thumb of every segmented control, the job tabs and Day/Week/Month included, can be held and dragged.
- **Gestures:** swipe sideways across a job for its next or previous part, and across Schedule for the next or previous day, week, or month. Swipes that start on a drawing, slider, map, or sideways scroller are left to them. Swipe actions on list rows have a visible alternative.
- **A changed address is looked up again:** editing a pool's or the shop's address clears the old pin in the same write, and the server finds the new one (the apps call `/api/locate`). Cole Izhaky's pool had a GPS pin from a phone in New York (Mark Location Here, since removed); it was cleared so it's looked up from its Las Vegas address.
- **The apps don't open the website when they can help it:** Company and Branding, Scheduling and Routes, Report Templates, and Phone and Texting are native in both apps (`/api/phone` for the company number). Left on the web: Stripe's own onboarding, Billing (store rules), and the customer-facing quote and report pages.
- **Texting needs a company number,** which the shop doesn't have yet; a person's own mobile number is only where calls ring. Phone and Texting now says so on every platform.
- **The steps mirror top to bottom** when tapped (they're the same both ways across); the other landmarks mirror left to right.
- **A job's title is the customer's name**, with the job number smaller below it.
- **Today has no Open Job button:** on an open stop card, the customer's name is the link to the job.

## 2026-10-19 (owner: "Live Activity should begin at the beginning of the workday")
- **The Live Activity runs the tech's whole day:** it starts by itself at the start of the shop's working day (Settings › Scheduling, on its work days) while the tech has stops left today, showing the first stop as "Up next" with its scheduled time. On My Way, Start Job, and Mark Complete change it as before; after a stop is done it moves on to the next one, and it ends after the last. If the tech closes it, it stays closed until the next work day. Still no timers. On Android, the ongoing notification does the same (core `liveStopRuns`, phase `ahead`).

## 2026-10-19 (owner: "Continue to build Android, but I don't think we're going to launch with the Android app. At least not as of today. I just don't have time")
- **The Android (Expo) app keeps getting every change** (the four-platform rule stands), but it isn't part of the launch for now: the launch is the website and the Swift iPhone app. Android-only setup the owner would have to do (an EAS project, the Firebase key for Android push, Google Play) waits until Android is back on the plan.

## 2026-10-19 (owner: landmarks, lines, the arrow, Liquid Glass, Today, the + button)
- **Landmarks are small filled pictures** (green tree, gray rock, blue water over rocks, concrete steps, a pump on its pad, a house with a red roof) with a thin dark outline, in new `color.landmark` tokens, drawn larger (20 of the diagram's 160 units). Tap one to select it: an **X** at its top right deletes it (no Remove button below), its corner handle or a pinch resizes it (10 to 44 units, `landmarks[].s`), and a tap on the selected one **mirrors** it (`landmarks[].flip`).
- **Drawn lines snap straight** within 8 degrees of level or plumb.
- **Markup arrows** have a wider head and a shaft that stops inside it, so the point stays sharp (core `arrowShape`).
- **Liquid Glass on the iPhone:** the app's tab bar, bars, and controls are the system's, which are Liquid Glass on iOS 26, but the `.ipa` built on Linux was stamped "built with the iOS 18 SDK", so iOS ran it in compatibility mode with the old flat look. `scripts/build-ios.sh` now stamps the SDK it was compiled with (`scripts/stamp-ios-sdk.py`) and builds in release mode. Our own segmented controls get the iOS 26 hold-and-drag: hold the chosen segment and slide it (all four platforms).
- **Today:** every stop on the day's route has **Mark Complete**. A maintenance visit is completed (Complete Job, with the shop's rules); a leak or repair job keeps its pipeline and its stop is done for the day (`job.stop_done_on`, migration `20261012006000`), with Mark Not Complete to undo. Stops are collapsed to one row except the one you're on; a tap opens one, with Open Job inside.
- **The iPhone app's + (New Job) opened a blank screen:** its form was made in an `onAppear` on an empty view, which never appears. Fixed.

## 2026-10-19 (owner: Pool Shape order, Complete Job, no Wrap-Up on visits, Today)
- **Pool Shape tiles:** row 1 Rectangle, Oval, Kidney, L-shape, Roman; row 2 Grecian, **Draw, Clear, Landmarks**, Figure 8. The spa has no text buttons: the Has a spa switch, then tap (round or square), drag, and pinch or the corner handle on the drawing. Keyboard and screen readers keep their (invisible) actions.
- **Complete Job** replaces Mark Done, at the end of a visit's Checklist and in its header, and a visit can be completed straight from Scheduled (`scheduled → done`, migration `20261012005900`). **Settings › Team › Completing a job** (owners and admins): **Finish the checklist first** (`settings.require_checklist_to_finish`, new) and **Take a pool photo first** (`require_finish_photo`, moved out of the owner-only form). Both apply to whoever completes the job, checked by the apps and the website; the database doesn't enforce them, so an offline completion isn't refused when it syncs before its photo.
- **Maintenance visits have no Wrap-Up.** What it held: the homeowner report and signatures (leak detection paperwork, unused on visits), the invoice (visits are billed monthly; that invoice is under Invoices and the customer), and Quotes, which visits do use for repairs found on site, so **Quotes moved to the end of a visit's Details**. Leak detection and repairs keep Wrap-Up.
- **Today:** a maintenance stop on your own route has **Complete Job**, so a tech can move on to the next stop without opening the visit. If the shop wants the checklist or a photo first, it says so with Open Job. Leak detection and repair stops don't (they end with a report or invoice).

## 2026-10-19 (owner: "Evaluate the CI and tests you run. If some are no longer necessary, please cut them.")
- **The iPhone (Xcode) job no longer re-runs the Swift tests.** They are the same package tests the Linux job runs (UI code is iOS-only and is compiled by the iPhone build and the simulator screenshots), and they took about 10 of the job's 25 minutes on every push.
- **The checks job no longer builds the website.** The e2e job builds it (against Supabase) before Playwright, so the second build caught nothing new.
- **The Today diagnostic screenshots are gone** (66 to 74, from chasing a blank Today in the tab view; the Getting Started card they tested is turned off).
- **Kept:** format, lint, typecheck and unit tests (2 minutes), the Expo bundle check (catches broken imports and assets that typecheck misses), Swift on Linux (the only full run of the Swift tests), the iPhone build and screenshots (the only check that SwiftUI screens render), pgTAP with the Swift sync engine against the database, and Playwright.

## 2026-10-19 (owner: "Let all future updates be pushed to all of the following: desktop site, mobile site, Swift app, android app")
- **Every update ships on all four platforms:** the desktop website, the mobile website, the Swift iPhone app, and the Android (Expo) app, with the same wording and behavior, unless the owner says a change is for one platform. Recorded in CLAUDE.md (How to work).
- **Cleanings sync to phones** (owner: "Sync"): `plan_cleaning` is synced to phones (`device_sync = true`), so the apps show the countdowns, cadence, and due-soon pills the website shows.
- **Request a Feature is a text box in the apps** (owner: "Make it a text box built into the platform. No need to make a separate email"): the apps post to a new `POST /api/feature-requests` (bearer token) that saves to `feature_request` like the website; no mailto.
- **Wording** (owner: "Your call"): scheduled → unscheduled is **Unschedule**; **Reopen Job** only for a canceled job; a finished visit back to in progress is **Reopen Visit**. The job's price is **Detection fee** on leak detection only, **Price** on repairs and visits.
- **Second batch of requests** planned in `docs/plans/owner-list-2026-10-19b.md`: Chemical as a dropdown on the visit's checklist with What to Add inside it; remove any checklist item; "When they called" renamed **From the Customer**, with Gallons instead of "Size of the pool"; Pool gallons in job Details; no leak checkbox on visits; plain icon-and-time cleaning pills; a **Replace filter** tracker with the filter's age; directions and routes from the address, no Mark Location Here; pool shape tiles with **Landmarks**, **Draw**, and **Clear** (Freeform leaves the tiles); the spa resized and reshaped on the diagram itself. The landmark button is named **Landmarks** (the owner's own word, and plain on a tile).

## 2026-10-19 (owner: "Ensure you include Liquid Glass, smooth animations, all of that uniquely swift stuff")
- **The Swift app uses Liquid Glass on iOS 26** for the controls layer: pill buttons (tinted with their usual colors, so primary stays blue), round icon buttons, segmented controls (a glass thumb that slides), the job page's section switcher (floating over the page instead of a bar), the What to Add bar, the message composer, a photo's toolbar, and half-height sheets. Content (cards, lists, the checklist) stays solid, as Apple's guidelines ask. iOS 18 to 25 keep the website's look.
- **The tab bar shrinks while scrolling down on iOS 26** (`tabBarMinimizeBehavior(.onScrollDown)`). Replaces the spec's "Don't turn on" (8.1).
- **Motion:** job rows, Today's stop cards, Schedule stops and a customer's jobs zoom into the job page (and back); segments and buttons move with springs; counts roll to their new value; a ticked check pops in; verdict pills animate to their color with a haptic; tips and the sync bar fold away; switching job sections cross-fades; stop cards ease in as they scroll on. Every animation is off with Reduce Motion.
- The Expo app keeps its drawn glass (it can't use the system's); the website is unchanged.

## 2026-10-19 (overnight build, owner: "I trust your judgment"; for the owner to review)
- **Route, schedule and timeline rules run on the phone**, ported to SundeckCore with fixtures from TypeScript, instead of new website endpoints for them. Drive times still come from the shop's cached times on the server (`cached_drive_times`) when online.
- **The job Timeline reads the audit log straight from Supabase** (managers only; RLS gives techs nothing), like the website, since the audit log isn't synced. Offline it says "The timeline shows when you're online."
- **Regular cleanings (`plan_cleaning`) stay on the website.** Phones can start, change, pause and end visit plans, but `plan_cleaning` isn't synced to phones; the plan sheet says so. Syncing it would need a migration; ask if you want it.
- **Starting a maintenance plan needs a signal** (the visits are made on the server by `create_service_plan`); both apps say so and disable Start Plan offline.
- **Dates and times use the system pickers** in both apps (Android's dialogs, the iPhone's calendar and wheels), per the spec; added `@react-native-community/datetimepicker` to the Expo app.
- **The Expo app's tints stay computed from token colors** at the spec's opacities rather than becoming new entries in `brand/tokens.json`; no brand color is hardcoded.

## 2026-10-19 (owner, after installing the Swift build: "The mobile web app is beautiful. Please base the Swift build around that ... Do the same for the expo app, because we're going to have to push to Google Play too.")
- **Both native apps follow the mobile website.** The Swift app and the Expo app (now also headed to Google Play) take the website's phone design and navigation: the floating tab bar (Today, Jobs, Schedule, Messages, More), large Barlow titles, soft cards, pill buttons and chips, and the job page split into Details, Checklist, Findings, Photos and Wrap-Up. The spec is `docs/design/2026-10-19-native-apps-follow-web.md`.
- **Supersedes "No tab bar"** in the 2026-10-12 field app review and the phone app's Messages under Settings › Tools (2026-10-16): Messages, Schedule and Today become tabs in both apps.
- **Order:** the redesign first (both apps), then S7, S8 and S9 of the Swift plan. S8's screens (Today, Schedule, Messages, More, Chemical Calculator) fill the new tabs.
- **The spec's decisions are taken as written** (owner: "I trust your judgment"), including: one tab bar for every role (Dashboard stays on the website), **Android follows the website too** (replaces the 2026-10-14 "Android keeps its own look"; Android keeps only the system back, ripples, Public Sans and the system pickers), New Job is a pushed screen, the job page's five sections (Details, Checklist, Findings, Photos, Wrap-Up), our own 44 pt segmented control, the sync bar kept, Light by default with a Light | Dark choice, and no Sundeck Pro Billing in the apps (store payment rules).
- **The Expo app gets the new screens too** (Today's route, Schedule, Customers, Invoices, Settings), since it is the Google Play app. Replaces "fixes only" (2026-10-18) for this work.
- **Small read-only API endpoints are added to the website where the apps need what the website renders on the server** (route days and drive times, Plan Route, Suggest Times, weather, customer links, the timeline), each with tests, as S8 reaches them. Until then the apps work out what they can from synced rows (stop order and drive estimates from the shared routing rules).
- **The iPhone build leaves Sentry's static framework out of the .ipa** (`scripts/build-ios.sh`): Sideloadly couldn't sign it, and its code is already linked into the app.

## 2026-10-18 (owner: "Approve all as recommended, start S0"; "I want the expo app to get fixes too")
- **Swift plan approved** (`docs/plans/swift-app.md`), every decision as recommended: the pilot runs on the Expo app once enrollment is active and the Swift app replaces it as an App Store update after S9; the Expo app is the Android app meanwhile; iOS 18 and later; SQLCipher stays; the rules the app uses are ported to Swift and checked against fixtures from `packages/core`; iPhone builds and simulator tests on GitHub's macOS runners, xtool in cloud sessions; new field features go to the website and the Swift app.
- **The Expo app keeps getting fixes** (bugs, wording, anything the pilot turns up) on iPhone and Android until the switch; only new features skip it.

## 2026-10-18 (owner: "I am awaiting Apple Developer Enrollment"; "I am going to have you build this app in Swift")
- **The field app will be rebuilt in Swift** (native iOS), replacing the Expo app in `apps/mobile`. The build plan's mobile stack (section 2) and milestones still describe Expo; they get a written plan for the move, approved by the owner, before any Swift code. Until then the Expo app stays as it is.
- **Android is a separate app** (owner), planned on its own; the Swift app is iPhone only.
- **Test installs from Windows, no WSL** (owner): until enrollment is active, a cloud session builds the `.ipa` and the owner installs it with Sideloadly on Windows (iTunes and iCloud from Apple's website, not the Microsoft Store), signed with their Apple ID; a free Apple ID's install stops opening after 7 days. After enrollment, TestFlight builds from CI (for example a Mac runner), no cable. First check, 2026-10-18: xtool's sample app built to an arm64 `.ipa` here and installed on the owner's iPhone (iOS 27.0) with Sideloadly. Sideloadly's Anisette setting must be Local (uses iCloud for Windows); Fake Anisette made Apple refuse the sign-in (-22406, then HTTP 503).
- **iOS builds from Linux use xtool** (xtool.sh: SwiftPM projects built, signed and installed without a Mac). Cloud sessions can build and sign an `.ipa` but cannot install to a phone (no USB); installing runs on a machine with the iPhone plugged in. xtool needs `Xcode.xip` (Xcode 27, downloaded by the owner) to make its iOS SDK.
- **Apple Developer Program enrollment is pending.** Once it is active, sign in to xtool with an App Store Connect Team API key (App Manager role) as a session secret, not an Apple ID password.

## 2026-10-19 (owner: "LLC as of last night")
- **The business is an LLC** (formed 2026-10-18). Plan: get the LLC's free D-U-N-S number (Apple's lookup tool), then ask Apple Developer Support to convert the individual developer account to the LLC before the public App Store release. The terms, privacy policy, and App Store copyright should name the LLC once its exact legal name is confirmed.

## 2026-10-19 (owner: "I have been approved to Apple Developer")
- **Apple Developer Program account is approved, as an individual** in the owner's own name (the plan was a company account, 2026-10-12). TestFlight works the same. Before the public App Store release, decide whether to move it to the company (Apple Developer Support converts an individual membership to an organization with the company's D-U-N-S number; apps and testers carry over), since the seller name and the EU trader details shown on the App Store would otherwise be the owner's personal ones. Next, owner steps: register the bundle ID `com.sundeckpro.app`, create the App Store Connect app record, and create an App Store Connect API key for uploads to TestFlight (`docs/release/LAUNCH.md` § 1).

## 2026-10-19 (owner's overnight list: "I will trust your judgement")
Built on the website first; `docs/plans/owner-list-2026-10-19.md` has each change and what the apps need for the same.
- **Free trial is 30 days** (was 14). The first charge is on day 31.
- **Contact us is office@sundeckpro.com**, on the landing page (under the FAQ and in the footer) and in the portal (More › Help, account menu).
- **Onboarding** drops the "Chlorine your techs carry" question and Share This Sample.
- **Gallons** is a plain number on the pool profile; no size remarks.
- **Chemical** (was "Chemical Calculator") is the first thing on a visit's checklist. **Submit** saves the left side (gallons, readings, products) to the pool's chemical log, a new synced table `chemical_reading`; any team member adds or removes entries. Judgment call: one entry per Submit (not one per week), so a second visit in a week is kept too; the log is listed newest first.
- **Require a pool photo to finish a job** is an owner setting (off by default). It blocks Mark Done on visits and finishing or sending a report until the job has a photo. Judgment call: any photo on the job counts, and it is checked by the website and apps, not a database rule (an offline phone's status change could sync before its photo row).
- **Every test, pass or fail, is on the homeowner report** ("Tests we ran"), after What we checked.
- **Pool shapes:** Roman, Grecian, and Figure 8 added; any shape can be mirrored; the spa goes anywhere, small/medium/large, round or square (`property.diagram_layout`).
- **Markup has a Pen** (freehand, first tool), on photos and on the pool diagram. Diagram markup is per job (`job.diagram_markup`) and shows on the report. Judgment call: per job, because each visit marks what it found; the pool's shape and spa stay per pool.
- **Filter and salt cell cleanings due within a week** show on Today (a pill with an icon) and on the visit's checklist (Regular cleanings, with weeks to go). Settings › Scheduling › Regular cleanings sets the shop's usual frequency for new plans, optionally applied to existing plans. Frequencies: monthly, 2, 3, 6 months, yearly.
- **Card fee to customers** is an owner setting (off; up to 3%). Customers then choose Pay by Bank (no fee) or Pay by Card (fee added as its own line). Judgment calls: a percentage only (no fixed 30¢), capped at 3% per card network rules, bank payments never carry it, and the fee is not recorded as a payment on the invoice or deposit. **Owner to check:** some states restrict card surcharges; the settings hint says so.
- **When They Call for repairs:** New Job › Repair asks "What do they need?" from the price book and fills the price. The owner picks the menu (Settings › Price Book › Show in When They Call); with none picked, every active item shows.
- **Both packages pricing** (proposed, owner to confirm): the Pool Maintenance price for the team plus a flat $49 a month for leak detection, as already in `plans.ts` (`BOTH_ADDON_CENTS`). For example 4 people: $149 + $49 = $198 (the two bought separately would be $248). Now shown on sign-up (Both), the home page's pricing, and the onboarding trial page as two lines.
- **Request a Feature** in the portal (More › Help, account menu) saves to a staff-only list (`/admin/requests`) and emails office@sundeckpro.com.

## 2026-10-18 (owner: "Should we change the favicon to have a transparent background?")
- **Yes, for the browser tab:** the favicon is the pin alone on a transparent background, water blue, switching to the lighter dark-mode blue (`color.role.dark.link`) when the browser is dark. The home-screen and app icons keep the navy square, since iOS and Android fill transparency with black or white.

## 2026-10-18 (owner: "Can we clean up the header? Can it all fit in one row?"; the "+" was "in a weird spot and it disappears as you scroll")
- **Desktop header is one row that stays in view:** logo (the mark alone on narrower screens), the sections as tabs, a blue New Job button (just "+" on narrower screens), the Settings gear, and a round account button with initials. The account menu holds the name, email, shop (and switching shops), Appearance, Account and Help, and Sign Out.

## 2026-10-18 (owner: "Partner report should be gone")
- **One report per job, the homeowner report.** The partner (pool company) report is gone from the job page, the app, Settings › Report Templates, and the report API. Partner reports already sent still open from their links and the Reports list. Its template rows stay (off) in the database, so it could come back.

## 2026-10-18 (owner: home page "a tad more interesting", not too busy; "Get paid" on one line on phones)
- **The home page reads in chapters, not more motion:** section backgrounds alternate (plain, a pale water tint, one navy band for In the Office), each section's heading and demos fade up once as they first scroll in, and the closing band has slow drifting water lines, so the page opens and closes on water. No motion behind the demos, which already animate. With Reduce Motion nothing moves or waits to appear; without script nothing is hidden.
- **"Get paid." keeps to one line**, on a line of its own on phones.

## 2026-10-18 (owner: launch list: "Update this" for the privacy policy and terms; bundle ID "Ok")
- **Privacy policy and terms** are final text (no draft notice): trial and billing (card to start, monthly by package and team size, prorated, cancel any time, no partial-month refunds, read-only after an unfixed failed payment, 30 days' notice of price changes), the shop owns and answers for its records and reports, customer payments go to the shop's own Stripe, texting consent and STOP, as-is service with liability capped at 12 months of fees, deletion within 30 days on request, no ad or tracking cookies. A lawyer should still read them; the legal entity name and governing state go in once the business registration is done.
- **App ID** is `com.sundeckpro.app` on iOS and Android, link scheme `sundeckpro` (before the first store upload, after which it can't change).
- **Stripe live mode waits** for the business registration; the pilot runs on the sandbox and the free trial.

## 2026-10-18 (owner: "Any job with a date already set cannot be dragged around"; Needs a Time cards "a little too bulky"; "The checklist for maintenance jobs can just be check buttons")
- **Moving jobs by hand:** any job but a canceled one can be dragged to another day or tech; a started or finished job keeps its status when it moves, and only a job that hasn't started can go back to Needs a Time. Plan Route still leaves started and finished jobs where they are.
- **Needs a Time cards** are two lines (customer and number; address and note), with Suggest Times and Move… behind a "…" button.
- **Maintenance checklist** items are a round check on the website and in the app (done or to do). Leak detection items keep their choices.

## 2026-10-18 (owner: swipe the Schedule's week strip; "so many jobs that need to be scheduled it gets super cluttered on desktop"; the onboarding checklist "pushes lots of our information out of the way"; "remove report templates settings now that AI reports are removed?"; the Messages conversation "feels a little wide/fat")
- **Schedule › Day:** the strip of days follows the finger sideways; letting go past a quarter of the way (or a flick) moves to the week before or after, on the same weekday.
- **Needs a Time** is one row of cards that scrolls sideways at every size, each card one line per detail, with Show All on wider screens to open them as a grid.
- **Getting Started** on wider screens is a small panel in the bottom-right corner, after Stripe's setup guide: closed it shows the progress, open it lists the steps; Hide still turns it off. Phones keep the card.
- **Report Templates** stays for the report names and "Techs can send this report"; the tone box is gone (it only fed the AI). The `tone` column stays, unused, in case AI comes back.
- **Messages** on large screens: a third column shows the person (phone, email, pools, latest jobs, Customer Details), and texts are at most about 60 characters a line.

## 2026-10-18 (owner: "Make our desktop experience look more like Stripe… I love how the top nav bar looks and the side nav bar in settings")
- **Desktop header** is a light bar in two rows: the logo, the shop as an outlined pill, then the name, appearance, Sign Out, and a round blue New Job "+" (when the person may make jobs); below, the sections as tabs, the current one in the link color with an underline, and the Settings gear at the end. The tab row stays in view while scrolling. Phones keep the iOS navigation and tab bars.
- **Settings sidebar** groups the pages as the Settings list does (Your shop, Money, Checklists and reports), each with an outline icon; the open page is in the link color. It stays in view while the page scrolls. No global search yet (Stripe's search box); add it if wanted.

## 2026-10-18 (owner: "strip out the AI writing for reports. I don't think it's needed (plus we can always add back later)"; "Remove the disclaimer by texting")
- **No AI report writing.** Write Draft always fills in the plain draft from the job's checklist, tests, and findings; the tech edits it before sending. The Anthropic SDK, its prompts, the `ANTHROPIC_*` settings, and the daily AI-draft allowance are gone; the privacy page no longer lists Anthropic. Old drafts keep their saved `model` value. To add it back, restore `apps/web/src/server/narrative.ts` and the prompts in `packages/core/src/report.ts` from git history; the draft check (`validateNarrative`) is still in place.
- **Phone settings** no longer show the "texting isn't connected on this server" demo note.

## 2026-10-18 (owner: "Add an Admin role between Owner and Tech")
- **Three roles:** Owner (full access plus shop-level control), Admin (office staff: everything owners could do before, except the owner-only items), Tech (unchanged). Stored as `owner`, `admin`, `tech`.
- **Owner-only:** Sundeck Pro billing (subscribe, Manage Billing, the portal, demo codes); connecting or changing the shop's Stripe account; deleting the shop (only an owner's account deletion closes a shop); making someone an owner or admin, changing anyone's role, and turning an owner off; and the shop's security settings, which today are "What techs can do" (whether techs see every job, and whether they make new jobs). There is no shop-wide two-step requirement yet; two-step sign-in is per person. Admins see these pages with "Only the shop owner can do this."
- **Admins can:** the schedule, customers, jobs, quotes, invoices, monthly billing, maintenance plans, the price book, checklist components, other settings (company, branding, deposits and tax, services, phone and texting), inviting techs, turning techs and admins off and on, company texting, and the import screen. Admins see every job and can always make jobs. Default call ringing (no one chosen) goes to owners and admins.
- **How it's enforced:** in the database, `app.is_manager()` and a once-per-query `app.manager_companies()`. Every row rule that was owner-only now accepts managers. The manager functions were switched in place, and the migration fails if an owner check is left unclassified. Triggers refuse role changes, turning an owner off, and security-setting changes by non-owners. A shop always keeps one active owner. On the website, `office.isOwner` (owner-only) and `office.isManager`. The phone app's checks use the same helpers.
- **Seats:** admins count as a person for the subscription price, like everyone else.

## 2026-10-18 (owner: "move shop onboarding to Accounts v2 … so we don't depend on that switch")
- **Shops' Stripe accounts are made with Accounts v2** (`POST /v2/core/accounts`) and onboarded with a v2 account link (`account_onboarding`, merchant configuration). New Stripe platforms refuse v1 account creation unless "Accounts v1 support" is turned on; we no longer need it.
- **Same deal for shops as before:** each shop has its own full Stripe Dashboard (`dashboard: full`), is the merchant of record for direct charges, and pays Stripe's fees and covers its own losses (`fees_collector` and `losses_collector`: `stripe`). Card and bank (ACH) payments are requested.
- **Nothing else changes:** Stripe answers v1 calls for a v2 account in v1 form, so reading the account after onboarding stays on v1, and it still sends v1 `account.updated` events for v2 accounts to the Connected accounts webhook. Customer payments are still checked against the shop's own account.

## 2026-10-18 (owner: "Ensure that adding users effects the pricing")
- **The subscription follows the team, checked against the Stripe sandbox:** a leak detection shop went from 1 person ($49) to 2 people ($99) when a teammate joined, and Stripe's billing page showed $99 for the next bill. Turning someone off lowers it the same way, prorated. Changes happen when someone joins or is turned on or off, when the shop's services change, when an owner opens Sundeck Pro Billing, and in the daily run.
- **Each package is billed under its own permanent Stripe product** (`sundeckpro_leak_detection`, `sundeckpro_pool_maintenance`, `sundeckpro_pool_maintenance_leak_detection`), made the first time it's needed. Products made inline at Checkout are inactive, and Stripe refused every later price change for them; shops subscribed that way are moved over on their next price check.
- **Sundeck Pro Billing shows the plan, people, and monthly price.** If Stripe refuses a price change it's logged; in the sandbox the page also shows Stripe's message.

## 2026-10-18 (owner: "New job options should be leak detection, pool service, repair. Both profiles get repair.")
- **New Job offers Repair to every shop**, website and app: Leak Detection | Repair for leak shops, Pool Service | Repair for pool shops, all three for shops doing both (`newJobTypes` in `packages/core`). A repair job made here is like one from an accepted quote without the quote: no checklist, a second tech allowed, no booking questions or detection price. Its price (website; optional) goes on the invoice as "Repair" (`20261012005100_new_repair_job.sql`), where parts are added before sending. Accepted quotes still make their own repair jobs.

## 2026-10-18 (owner: "number of users should default to 2 for maintenance and 1 for leaks. We want to show the lowest possible price")
- **Home page pricing starts at the lowest price:** 2 people for Pool Maintenance ($79, Starter) and 1 for Leak Detection ($49, Solo). Each package keeps its own count when the visitor switches.

## 2026-10-18 (owner: "I have the domain now and have Google Workspace" — `sundeckpro.com`)
- **The site is `https://sundeckpro.com`** (Vercel; the old `leaksoftware-web.vercel.app` redirects there). The phone app talks to it directly (`config/supabase-dev.json` → `webUrl`).
- **Mail:** Google Workspace on `sundeckpro.com` for people (support is `support@sundeckpro.com`); the app's email goes out through Resend from `send.sundeckpro.com`, a subdomain so the two never share records. Code defaults now use these; `SUPPORT_EMAIL` and `EMAIL_FROM_DOMAIN` still override.
- **Recommended bundle ID** is `com.sundeckpro.app`. It still isn't changed: the owner decides before the first App Store upload.
- **Email is live (owner, 2026-10-18).** Resend sends from `send.sundeckpro.com` (DKIM and return path in Vercel DNS), DMARC on `sundeckpro.com` is `p=none` with reports to `support@sundeckpro.com`, and a report email from the website arrived. Tighten DMARC to `p=quarantine` once a few weeks of reports show only Resend sending as the domain.
- **Links use `https://sundeckpro.com`** (owner: links in emails still showed the Vercel address). The website builds every link from `APP_BASE_URL`, set to `https://sundeckpro.com` on Vercel; the old `leaksoftware-web.vercel.app` address redirects there, and Supabase sign-in links already used `sundeckpro.com`.

## 2026-10-18 (owner: "Add a reports tab under JOBS - that just shows you reports"; "allow you to sort customers by a variety of filters")
- **Jobs › Reports:** a Jobs | Reports switch at the top of Jobs. Reports lists each job's current report (resent versions replace the older one), newest first, with All, Sent, and Drafts; a row opens the job's Report and Sign-Off. Techs limited to their own jobs see only those reports.
- **Customers: Sort and Show.** Sort by name (A–Z or Z–A), newest, oldest, last visit, or city; show all customers, those on a maintenance plan or not (pool shops), or one kind (homeowners, pool companies, builders, insurers, property managers, other). The choice stays in the address, so it survives Back and can be bookmarked.

## 2026-10-18 (owner: "new brand name is Sundeck Pro - update everything accordingly")
- **The product is Sundeck Pro** (two words), on the website, in emails, in the app (its display name), in the docs, and in the logo's wordmark ("Sundeck" navy, "Pro" water blue). The drop-pin mark, colors, and type stay. Older entries below say Tidemark.
- **Placeholders follow the name:** `sundeckpro.app`, email from `send.sundeckpro.app`, `support@sundeckpro.app`, recommended bundle ID `app.sundeckpro.field`. None are bought or set; the owner checks the domain and trademark first. The bundle ID stays `com.leakbook.app` until the owner decides.
- **Kept as they were, because changing them would break what's already stored:** the Stripe metadata `tidemark_subscription`, keys saved on devices (`tidemark:`), the database migrations already applied, and package names (`@leakbook/*`). `SUNDECK_STAFF_EMAILS` replaces `TIDEMARK_STAFF_EMAILS`, which still works.

## 2026-10-18 (owner: "Create an owner setting toggle that allows techs to make new jobs")
- **Techs can make new jobs** is a switch in Settings › Team (What techs can do), on by default so nothing changes for current shops. Off: techs don't see New Job on the website or in the app, and the database refuses a job a tech adds. Owners always can; plan visits and accepted repairs are made by the server either way.

## 2026-10-18 (owner: "Remove pool temp from chemical calculator"; "Move 'customers' to 'more'"; plan price per month; plan repeat options; "remove the salt/chlorine selector")
- **Chemical calculator:** no water temperature (the saturation index assumes 80 °F) and no Chlorine/Salt choice. Salt is one of the readings, left blank on a chlorine pool. One set of targets for every pool, whatever its type or sanitizer: calcium 200 to 400 (aim 300), stabilizer 30 to 80 (aim 40), salt 2,700 to 3,400. Aim For still sets a different level. Same in the phone app.
- **Customers is under More** on computers (the More menu) and phones (the More tab). The Messages and Customers switch is gone.
- **Plans repeat four ways:** Several Days (pick the days of the week, two or more), Weekly, Every 2 Weeks, or Monthly (the first visit's weekday in the same week of each month, like the 2nd Tuesday; a 5th weekday repeats on the 4th). Plans every 3 or 4 weeks became monthly. Importing a plan with more than one service day still uses the first.
- **Plans are priced by the month:** "Price per month" on the plan. The month's invoice gets one "Pool service, October" line per plan with a visit done that month, plus priced cleanings; plan visits carry no price of their own. Single visits (Just Once) keep their own price. Imported monthly rates are used as is; a price per visit becomes a month (× 52 ÷ 12 ÷ weeks between visits). Prices already on plans were kept as they were and are now monthly; check them.

## 2026-10-18 (owner: "On the maintenance package, let's have a way to schedule regular salt cell and filter cleanings")
- **Checklist items on a schedule:** a pool visit item can be marked "On a schedule" (Settings › Checklist Components). It stays off ordinary visits. Pool shops get two: Clean filter and Clean salt cell. The price book's filter and salt cell cleanings point at them.
- **Per plan, under Regular Cleanings:** turn one on, then choose how often (monthly, or every 2, 3, or 6 months), when it's next due, and an optional price. It goes on the plan's first visit on or after the due date (a visit up to six days late still counts). Done on that visit, it's next due one interval after the visit's date. Skipped, it stays due and moves to the next visit. Visits already started keep what they have.
- **Billing:** a priced cleaning that was done is its own line on the month's invoice ("Clean filter, Nov 4") after the visit's line. No price means the visit price covers it. A visit with no price but a priced cleaning is still billed.

## 2026-10-18 (owner: "Have 'Deposit percentage' default to 0 for new accounts. Same with 'largest tech discount'")
- **New shops start with no deposit and a 0% tech discount limit** (company settings default; onboarding's deposit choice starts at None). Owners turn either on in Settings › Payments. Existing shops keep their settings; the demo shop keeps 50% and 10% so the demo shows them.

## 2026-10-18 (owner, passing on notes: "Remove warranties entirely", "Make settings a gear icon", "a 'more' dropdown on desktop", custom chemical levels, "Techs should not see 'needs a time'")
- **Warranties are gone:** no page, no nav entry, no price book field, no "N-month warranty" on quotes and invoices, and paid repairs no longer make warranty records (table dropped). `warranty_months` stays on price book, quote, and invoice lines, unused, because installed phones still send it.
- **Desktop header:** Dashboard, Today, Jobs, Schedule, Messages, then a More pull-down menu (Invoices, Chemicals), then Settings as a gear. Phones keep the tab bar with More.
- **Chemical calculator:** every reading has an Aim For level beside it, showing the recommended level until the tech types their own (for example chlorine 6); doses go to that level. pH and alkalinity also come down to a lower chosen level; the rest come down only by draining, as before. Each device remembers the levels; Use Recommended clears them. Same in the phone app (an Aim For group).
- **Needs a Time is for owners:** techs don't see it on the Schedule.

## 2026-10-17 (owner: "Yes, run a full security audit"; "fix whatever it finds when it's done")
- **Full security audit** with the Cloudflare skill (standard profile, sandboxed local checks, no live systems): 8 confirmed findings (2 medium, 6 low) and 6 leads that depend on deployment settings; no cross-tenant data access found. The report stays out of this public repository.
- **Fixed** (migration `20261012004400_security_audit_fixes.sql` and the web code): Stripe payments count only from the record's own shop's connected account, and subscription events only from the platform account; read-only (unpaid) shops can't buy numbers, text, call, email, or transcribe; account deletion needs the two-step code on the phone API too; demo codes have limits (VIP26 capped at 25) and never revive canceled or overdue shops; shops made by calling `create_company` directly need a card when billing is on; the routing counter can't be reset; limited techs can't reach a hidden job through a second reference (signature quote, picture finding, quote line finding) or turn off its links, can't open hidden conversations' pictures, and their phones drop conversations when a job's customer changes or the job is deleted; links and opt-outs honor expiry; the site origin never comes from request headers on Vercel; invoice PDFs are printed once per version; the leads CSV quotes carriage returns.
- **Daily allowances per shop** for work Tidemark pays for (email recipients 300, AI drafts 60, transcriptions 200, texts 500, calls 100), counted by the server only; `DAILY_LIMIT_*` overrides. A voice note is transcribed by one request at a time.

## 2026-10-17 (owner: "npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit")
- **Security audit skill** (Cloudflare, MIT) for security questions, focused reviews, and full audits. Like the other skills it is installed by `scripts/session-start.sh` at a pinned, reviewed commit into `~/.claude/skills/security-audit`, not committed. A full audit writes its report outside the repository (`~/security-audit-skill/`), since the repository is public.

## 2026-10-17 (owner: "How should I handle integrations?" … "Yes, build the importer")
- **Shops switch to Tidemark with Import Customers** (Settings › Import Customers), not by sending files to be imported by hand. A CSV exported from Skimmer, Pool Brain, Jobber, QuickBooks, Excel, or Google Sheets becomes customers, their pools, and (pool care) visit plans, whose visits go straight onto the schedule. Columns are matched from their names and can be changed; a preview shows what will be made and what's worth a look (a second service day, a tech not on the team, a bad email); everything is made in one transaction or not at all.
- **Customers already in Tidemark are left out** (same email, phone, or name and address), so the same file can be imported twice safely.
- **Choices:** CSV only (Excel files are saved as CSV first; no spreadsheet library); up to 2,000 rows a file; a "Monthly price" column becomes a price per visit over the visits in an average month; two service days a week use the first (Tidemark plans one day); visits start on the next service day; no job history (shops keep their old system read-only for a while).
- **Staff can import for a shop** during the setup call (Leads › Import Customers, `/admin/import`, staff with two-step sign-in), so a shop's file never travels by email.
- **No live integrations yet.** Later, if shops ask: QuickBooks Online (invoices and payments) and a calendar feed of each tech's schedule.

## 2026-10-16 (owner: "If someone puts their name/email in and doesn't pay, I want that information, so we can call them")
- **Sign-up asks for a mobile phone** (US or Canada, required), saved on the account and the owner's profile.
- **Leads are kept from the moment the email is valid** on the sign-up form, with whatever name, company, phone, and package are filled in, even if the person leaves (`public.signup_lead`, readable and writable only by the server). The form says "We may call or text to help you get set up"; the privacy policy says so too. Everyone who signed up before is on the list from their accounts.
- **Staff see them at `/admin/leads`**: To Call (not paid, not called yet), Not Paid, and All, with how far each got (left the form, account but no shop, left during setup, reached the payment page, card in, demo code, canceled), call and email buttons, notes, Mark Called, and Export CSV. Staff are the emails in `TIDEMARK_STAFF_EMAILS` on Vercel (not in the public repository), and the page needs two-step sign-in, since it's people's contact details.

## 2026-10-16 (owner: "How do we protect customer data. Both our users and their clients"; "Just do as much as you can"; "I trust your judgement")
- **Customer links last 180 days** (`20261012003900_link_expiry.sql`), and anyone on the shop's team can turn one off from the job page (Customer Links). Sending again after expiry makes a new link; the daily job turns expired links off so a dead one is never reused. 180 days covers quotes, invoices, and their reminders with room to spare; a homeowner who needs an old report asks the shop to send it again.
- **Two-step sign-in** (authenticator app, Supabase TOTP), optional for everyone, under More › Two-Step Sign-In on the website (the app's Settings links there). It is enforced by the database, not just the screens: with it on, every membership check also requires that the session passed the code (`aal2`), so a stolen password opens nothing through the website, the app, or the API (`20261012004000_two_step.sql`). The website and the app ask for the code after the password; the app also notices when two-step was turned on elsewhere and stops syncing until the code is in. Lost phone: support turns it off (see HANDOVER). Not required for owners yet; worth requiring once shops are used to it.
- **Limited techs see only their own customers' conversations** (`20261012004100_conversation_visibility.sql`): with "techs see only their own jobs", a tech sees a conversation, its texts, and its calls only when its customer has a job they're on. Texts from numbers that aren't a customer stay with the office.
- **A public Security page** (`/security`, linked from the footer and the privacy policy) says plainly what protects shops and their customers; only what's built. **The privacy policy** now covers pool service, texts and calls, and lists Twilio.
- **A draft data-processing addendum** for shops (`docs/legal/dpa-draft.md`), for a lawyer to review: Tidemark as processor, the subprocessors, 72-hour breach notice, deletion within 30 days of leaving.
- **Backups:** daily backups come with Supabase Pro (owner: "I will get Supabase pro eventually"). Until then there's no backup beyond Supabase's own; nothing else changed for it.

## 2026-10-16 (owner: "Use the pool prices as drafted"; "When making a new account, you should be sent to a payment page. Add a demo code - make it VIP26")
- **The pool price book is approved as drafted** (see the entry below).
- **Every new shop ends onboarding on the payment page**, whether or not the server has Stripe. With Stripe it's Start 14-Day Free Trial (card on Stripe's page). Without Stripe the button is off and the page says card payments aren't connected yet; there's no longer a way to finish without a card or a code.
- **Demo codes, starting with VIP26.** On the payment page an owner can enter a code instead of a card. A valid code makes the shop a demo shop like the built-in demo: no card, no charge, no trial end, nothing locked. Codes are rows in `app.access_code` (any case, spaces ignored); turning a code off stops new shops using it and leaves existing ones alone. Which code a shop used is on `subscription.access_code`.
- **The status page shows whether card payments are set up** (`/api/health`, "Card payments"), as information, like Email.

## 2026-10-16 (owner: Invite Someone "under the open invites"; "go ahead" with the walkthrough; "adjust the default pricebook depending on maintenance and leak companies. You need to be more thorough")
- **Team: Invite Someone is the last row of Open Invites** (blue, with a +, as iOS Settings adds rows), on every screen width. Phones keep the + in the navigation bar too.
- **A new shop starts with its own package's setup** (`20261012003700_package_defaults.sql`, `create_company(…, company_services)`). Pool care: the visit checklist and a pool service price book. Leak detection: the inspection checklist, test types, severities, exclusion reasons, and the leak price book. Both: both. Report templates go to every shop. Choosing another package later (Settings › Company › Services) adds that package's setup once (`add_package_defaults`); nothing is removed. Existing shops keep what they have.
- **The pool price book (approved as drafted, 2026-10-16):** Service: Filter clean, cartridge $95; Filter clean, DE $125; Salt cell clean $85; Green pool cleanup $350; Drain and acid wash $595; Extra service visit $65. Chemicals (taxable): Liquid chlorine $8/gal; Muriatic acid $15/gal; Stabilizer $9/lb; Salt $18/40 lb bag; Phosphate remover $35. Repair (taxable): Replace pump motor $650 (12-month warranty); Replace pump lid O-ring $45; Replace filter pressure gauge $45 (6 months); Replace skimmer basket $35; Replace pool light bulb $175 (12 months).
- **Checklist Components follows the package.** Pool shops see their visit checklist, leak shops their inspection checklist (grouped by report section), shops with both switch between Pool Visits and Leak Inspections. Fixed: an item added there always went onto the leak checklist, so a pool shop's new item never appeared on visits. Leak items now also take a section. The Price Book's description follows the package.
- **The phone app no longer creates shops.** It skipped onboarding and the card. The app's setup now joins a shop by invite and says new shops are set up on the website (no link: an iPhone app may not send people to an outside purchase).
- **Walkthrough: tips on each screen, Getting Started for owners, welcome cards in the app** (`packages/core/src/walkthrough.ts`). A tip shows once on the screen it explains, chosen by role and package (on the website: Today, Schedule, Messages, Customers, Invoices, Dashboard, Chemicals, Jobs; in the app: Jobs, a visit or inspection, Report, Chemicals, Messages). Owners get a Getting Started checklist on Today and the Dashboard, ticked from the shop's own data, until it's done or hidden. The app opens with three cards for the shop's package the first time. Show Tips Again: More on the website (the name in the header opens More on a computer) and Settings in the app. The website remembers per person (on the account); the app per phone.

## 2026-10-16 (owner: "Install this onboarding skill, then implement for new subscribers"; card required; "Card required, 14-day trial")
- **New shops go through onboarding after sign-up** (`/welcome`), designed with the app-onboarding-questionnaire skill (pinned in `scripts/session-start.sh`) and the HIG's onboarding guidance: welcome, goal, what gets in the way, how Tidemark answers each, setup choices, a hands-on demo, the homeowner's result with Share, then the trial. Questions can be skipped. Blueprint: `docs/plans/onboarding.md`.
- **Different per package.** Pool Maintenance: its own goals and pains, the chlorine the techs carry, and a sample visit whose What to Add follows the readings, then the visit summary. Leak Detection: its own goals and pains, the deposit on repairs, and a sample inspection (four spots marked Leaking or Not Leaking), then the homeowner report. Both follows Pool Maintenance.
- **The answers set things up:** report color (`company.brand_primary`), the deposit (leak), and the team size for the price shown. The answers are kept on `subscription.onboarding` for us to read.
- **No testimonials or invented statistics** (the skill suggests placeholders): Tidemark has no customers yet, and made-up reviews are not allowed (FTC rule on fake reviews, 2024). Add real ones when there are some. The swipe-card screen is left out too.
- **A card is required for a 14-day free trial** (was 30 days, no card). Reason: card-first trials convert far better and fit a sales-led launch. When the server has Stripe (`STRIPE_SECRET_KEY`), a new shop is read-only until Checkout makes its subscription; onboarding's choices apply after the card is in. Without Stripe (development, CI) onboarding finishes without a card. Shops from before keep their trials and never see onboarding.
- **Tidemark charges by package and people** (built from `docs/plans/package-billing.md`): Checkout sends the amount from `plans.ts`, no Stripe price ids (`STRIPE_BILLING_PRICE_ID` is gone). Active members count; turned-off teammates and pending invites don't. The amount follows the team (accepting an invite, turning someone off or on) and the package (Settings › Company › Services), prorated, and the daily cron corrects any drift.

## 2026-10-16 (owner: pricing, "I don't want to charge per pool"; "maintenance should maybe be more expensive than leaks"; "include the comparison calculator")
- **Flat tiers by team size, unlimited pools** (`packages/core/src/plans.ts`). Pool Maintenance: Starter $79 (up to 2 people), Team $149 (up to 6), Fleet $249 (up to 12), then $15 per extra person. Leak Detection: Solo $49 (1 person), Team $99 (up to 4), then $25 per extra person. Both: a Pool Maintenance tier plus $49. Replaces $69/$100 with 2 people included. Reason: per-pool pricing (Skimmer's $2) taxes growth; a flat price is predictable and undercuts every pool-care competitor checked at 1 to 12 people.
- **Pool Maintenance is not above Leak Detection at every size:** lower at 2 people ($79 vs $99) and from 11 people up; equal at 6 and 10. Kept as recommended; the tests state this.
- **The home page compares Pool Maintenance with Skimmer, Pool Brain, and Pool Office Manager** for the visitor's team size and pools, with the yearly saving and a dated fine print (`COMPETITORS_CHECKED`). No leak detection comparison: Jobber ($29) and LeakTronics ($25) are cheaper for a single person. Competitor prices must be re-checked before each pricing change and at least quarterly; update `competitorPrices` and the date together.
- **Stripe still charges one price** until the billing plan (`docs/plans/package-billing.md`) is built.

## 2026-10-16 (owner: calculator liquids in gallons, "different states have different jug standards")
- **Liquids read in gallons, not jugs:** "½ gallon", "⅓ gallon", "1½ gallons" (`gallonMeasure`, which replaces `jugMeasure`). Under one gallon, quarters and thirds; quarters to 4 gallons; halves past that. Small amounts stay "A splash" (under 6 fl oz) and cups (up to 3). The exact amount in fluid ounces stays under it ("About 65 fl oz").

## 2026-10-16 (owner: desktop Messages "in this big open space"; mark as unread on the list, "maybe even a right click"; one app, two packages)
- **Messages on a computer works like Messages on a Mac:** opening it shows the newest conversation filling the right side, with the conversations on the left; each side scrolls on its own and the reply box sits at the bottom. Phones still show the list first (`?list=1` always shows the list, e.g. Back from a conversation in a narrow window).
- **Mark as unread from the list, every way:** a Read/Unread button on hover (or keyboard focus), a right-click menu (Mark as Unread or Read, Open Conversation), and the swipe on touch screens. Marking the open conversation unread sticks; it's marked read again only when a new message comes in while it's open.
- **One app, two packages, and Both for the rarer shop** (owner prefers this to two apps). Shops now choose at sign-up ("Your shop does: Pool Care, Leak Detection, Both"), preset from the package shown on the home page; it was already in Settings › Company › Services. New shops start with what they chose (Pool Care if nothing was chosen); shops from before keep Both.

## 2026-10-16 (owner: "A business owner wants the Dashboard to be the main page on desktop")
- **Owners at a computer or tablet land on the Dashboard** after signing in, signing up, joining, or switching company, and from the logo (`/home` decides: owner and not a phone → Dashboard, else Today). The Dashboard also leads the header's sections on wider screens.
- **Phones and techs are unchanged:** they land on Today, the tab bar still starts with Today, and the Home Screen app opens on Today. Today stays in the header for owners on a computer.

## 2026-10-16 (owner: calculator "pop up card from the bottom", everyday measures, "in line with others online", gallon commas, placeholder text)
- **What to Add is a bar docked at the bottom** on phones and tablets (above the tab bar), with a live one-line summary ("½ jug muriatic acid · 1 more"). Tapping it opens a sheet with the steps: the website's sheet, and an iOS page sheet in the phone app (swipe down or Done). Wide screens keep it beside the readings.
- **Amounts read the way a tech measures them** (`measure` on each step, `jugMeasure`/`dryMeasure` in `packages/core/src/chemistry.ts`): liquids as a splash (under 6 fl oz), cups up to 3, then 1-gallon jugs by the quarter (by the half past 4); dry products as a scoop (under 6 oz), then pounds (nearest ½ lb to 10, pound to 40, 5 lb past that); salt in 40 lb bags. The exact amount shows under it ("About 65 fl oz").
- **The doses were checked** against the chemistry and published labels and charts. Matching already: chlorine (10.7 fl oz of 12.5% per ppm per 10,000 gal; charts say 10.6), cal-hypo, muriatic acid for alkalinity (25.6 fl oz per 10 ppm, the "about a quart" rule), calcium chloride, stabilizer, salt. Corrected: acid for pH 16 → 13 fl oz of 31.45% per 0.2 at 100 ppm alkalinity (labels say 12 to 16; Pool Nerd works out to 12.8; kept low because too much acid is the worse mistake); 14.5% muriatic and dry acid now account for density and purity (60 fl oz and 34 oz per 10 ppm alkalinity); baking soda 1.5 → 1.4 lb per 10 ppm (the chemistry).
- **Gallons get thousands commas as they're typed** (website and phone app).
- **Placeholders are iOS's light placeholder gray** (new `placeholder` brand token, light and dark), so an example like "20,000" never reads as a typed value.

## 2026-10-16 (owner: iOS feel, unread, On My Way, Phone and Texting fields, calculator)
- **Every new page feels like iOS, not Android** ("Consider iPhone/Swift design principles"). Now a house rule in `CLAUDE.md`.
- **Mark as unread, for the whole team.** Unread is one shared flag per conversation. Website: swipe a conversation right for Unread (or Read), with a full swipe acting on release, as in iOS Messages, and Mark as Unread inside a conversation, which goes back to the list so opening it doesn't mark it read again. Phone app: the same swipe right in Messages, plus a VoiceOver action.
- **On My Way sends from Tidemark Messages by default,** with a setting in Settings › Phone and Texting › On My Way: Tidemark Messages (company number, kept in the shared inbox) or Tech's Phone (opens the phone's Messages app). With Tidemark Messages and no working company number, an action sheet says so and offers Send From My Phone. Stored as `company.settings.on_my_way`.
- **Phone and Texting fields are visible:** the grouped rows had no outline and no placeholder. Phone fields show a sample number, and every grouped settings field without its own placeholder now shows "Required" or "Optional", as iOS Settings does.
- **Chemical calculator:** What to Add comes first (the right-hand column on wide screens), the page's subtitle and the "starting points" note are gone, and so is Surface. Surface only moved the calcium target (plaster 250 to 450 ppm, vinyl and fiberglass 150 to 250), so the calculator takes it from the pool's recorded type when opened from a visit (which also fills in the gallons) and uses plaster, the most common, otherwise (`surfaceFor`).

## 2026-10-16 (owner: "I still don't like the loading times in between screens"; "do both and measure")
- **The website keeps screens visited in the last minute** (`experimental.staleTimes.dynamic: 60` in `apps/web/next.config.ts`). Going back to a tab is instant: measured locally with the same script, 1.4–2.0 s became 0.09–0.17 s. The trade-off: a teammate's change can take up to a minute to show on a screen you just visited. Your own saves refresh at once (the save actions revalidate), and Messages refreshes itself every 20 seconds.
- **Loading tabs ahead of a tap was tried and not shipped.** In this Next.js version, data loaded ahead must be in `"use cache: private"`, and the Supabase client's `connection()` call is refused there. Removing that call broke other pages (clock errors while loading ahead), and catching the error still failed and made Jobs slower (4.4 s). Doing it properly means reworking how every page reads its data. Not scheduled.
- **Where first visits spend their time** (live site, from the cloud machine): a plain static page takes about 0.34 s to download, and signed-in screens 0.35–0.8 s, so server work is about 0.05–0.45 s per screen, with Today the heaviest. The phone app avoids all of this by reading from its on-device database.

## 2026-10-16 (owner: "place some sample messages in a job"; messaging "needs to be more reachable ... shared with the contacts tab"; "Messages should be the main side and customers should be secondary")
- **Messages and Customers share one tab, Messages first,** on the website (phones and wider screens). The tab is Messages, in the fourth slot where Customers was, so phones reach it without going through More. Both pages open with a **Messages | Customers** segmented switch, and the Messages tab stays selected on either. The tab shows the number of unread conversations as a badge (blue, like the inbox's unread dots), and the switch shows it on Messages.
- **Jobs show their messages.** The job's Details has a Messages group under Customer with the latest four texts and calls with that customer, then Open Conversation (See All Messages without a working number). With a working company number and no conversation yet, it offers Text {name}. The customer row's text button sends from the company number when there is one, as on the customer page.
- **Sample texts for demos** (`supabase/seed_demo_messages.sql`, idempotent, run with the other demo seeds and by `pnpm db:deploy -- --seed`): the demo shop's conversation with Sam Sample about the sample inspection. Sam asks the day before, the shop books it, On My Way, the result, and Sam's unread reply. The shop's texts are tied to the sample job.
- **Not changed:** the phone app's Messages (Settings › Tools › Messages, and the job's text button). It has no tab bar to share.

## 2026-10-16 (owner: chemical calculator "I can't see the text boxes"; "only measure by gallons")
- **The pool is entered in gallons only;** the Measure option and pool shape are gone from the calculator (website and phone).
- **The website calculator uses outlined number boxes at every width,** two per row on phones, with the unit inside the box. Phone-style grouped rows inside a white card had no visible edge.

## 2026-10-16 (owner: company texting and calls: "Twilio is fine", "We will pay", calls "follow" Housecall Pro, pictures "Yes for now")
- **Twilio, one Tidemark account, Tidemark pays.** Numbers, texts, and calls are on Tidemark's Twilio account (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` for the registered A2P 10DLC campaign). No Twilio SDK: its REST API and webhook signatures in `apps/web/src/server/twilio.ts`. Without the keys the server runs in **demo mode**: numbers are made up (555-01xx), texts are saved as sent, and no call is placed.
- **One company number per shop** (`phone_line`), set up by an owner in Settings › Phone and Texting: a new local number by area code (live at once), or the shop's existing number (saved as pending; Tidemark finishes porting or registering it by hand, since the number choice is still open).
- **A shared inbox** (`conversation`, `text_message`, `call_log`): one conversation per customer number, matched to the customer, the same for the whole team on the website (Messages) and the phones (Settings › Tools › Messages, and a text button on the job). Read and unread are shared, as in a team inbox. Only the server writes texts and calls (it talks to Twilio); members read them and mark them read; owners change the line's settings.
- **Calls, as Housecall Pro does them:** in working hours (Settings › Scheduling) an incoming call rings the chosen people's own mobiles at once (by default the owners) and the first to answer gets it; after hours or when nobody answers, the caller hears the shop's greeting and leaves a voicemail, which is recorded, transcribed, and shown in the conversation. Calling a customer rings the person's own mobile first, then connects them from the company number. Each person adds their mobile number (Settings › Phone and Texting on the website, Settings on the phone).
- **Pictures in texts (MMS) are on,** with a switch in Settings › Phone and Texting. Pictures are stored in a private `texts` bucket, in the shop's folder.
- **On My Way** goes out from the company number when the shop has one (website Today); otherwise it still opens the tech's own Messages app.
- **STOP and START** from a customer turn texts to them off and on (carriers answer the keywords themselves on a registered campaign).
- **Not built yet:** push notifications for new texts, automatic reminder texts, sending report, quote, and invoice links through the company number, and per-tech visibility of conversations (everyone on the team sees every conversation for now).

## 2026-10-16 (owner: pool care and leak detection are separate experiences; pool company requests)
- **Services setting** (Settings › Company › Services: Pool Care, Leak Detection, or Both), saved as `company.settings.services` and synced to phones with the company row; shops from before the split have Both. Going forward a shop is usually one or the other, each its own subscription; Both is mainly for the demo. Core: `companyServices`, `offersLeak`, `offersPool`.
- **What each hides.** Pool Care hides leak detection: the Leak Detection job choice, detection fee, booking questions, second tech, and pool shape on New Job; Tests and Findings on visits; Warranties; the Test Types, Severities, Exclusion Reasons, and Report Templates settings; and report terms. Leak Detection hides pool care: maintenance plans, Maintenance to Bill, the maintenance scheduling fields, and the chemical calculator. Existing jobs of the other kind still open.
- **Pool service visits** have no Tests or Findings tab, and now take repair quotes (pumps, filters), on the website and the phones. Phones can create pool service visits (New Job follows the setting; with Both it asks).
- **Fixed:** the phone's checklist skipped the service section, so pool service items didn't show on phones.
- **Chemical calculator** (pool company request): website (Chemicals, and a button on pool service visits) and phone (Settings › Tools, and the visit screen). Enter the pool's size (gallons, or shape and measurements) and readings. It says what to add, in order: alkalinity, pH, calcium, stabilizer, salt, then chlorine. It also gives the saturation index. Doses are standard per-10,000-gallon chart amounts (`packages/core/src/chemistry.ts`, tested). Readings aren't saved yet; saving them on the visit is a follow-up if wanted.
- **Company texting with a shared inbox** (pool company request, like Housecall Pro): proposed in `docs/plans/company-texting.md`; built the same day (entry above).

## 2026-10-15 (owner: Pool Maintenance first; each package shows only its own)
- **The home page opens on Pool Maintenance**; Leak Detection is the other side of the switch (hero and pricing switches move together).
- **Each package shows only what applies to it.** Maintenance: the service checklist, plans, repair quotes for pumps and filters, the monthly service invoice, its own questions, and "Clean it. Bill it. Get paid." Leak Detection: tests, the pool diagram, the report, leak repair quotes, its own questions, and "Find it. Report it. Get paid." Shared: On My Way, offline, Plan Route, the dashboard. Pricing shows the chosen package's card only.
- **The site description** now names both: "Routes, checklists, quotes, and invoicing for pool service and leak detection shops."

## 2026-10-15 (owner: "Go ahead" on blue buttons)
- **Primary buttons are filled blue with white text** in the app, the website, and customer pages (`role.primary` `#1A63A0`, 6.3:1; dark `#2B78B8`, 4.7:1), the same blue as links and tinted buttons: one accent, filled for the main action, tinted for the rest, as on iOS. Navy on orange read as signage, competed with the blue, and sat too close to the Leaking and Attention colors.
- **Orange is the brand accent:** the logo dot, a display highlight ("Get paid."), and on the marketing site the Start Free Trial button, at most one per screenful (hero and closing band; the header's is tinted blue). Orange buttons keep navy text. PDFs don't show buttons, so they are unchanged.

## 2026-10-15 (owner: two packages, their prices, and a real home page)
- **Two packages:** Leak Detection ($100 a month) and Pool Maintenance ($69 a month). Each includes 2 people; each person after that is $25 (Leak Detection) or $20 (Pool Maintenance) a month. Owners, office staff, and techs each count. The rule is `packages/core/src/plans.ts` (integer cents, tested). This replaces the placeholder flat price (2026-10-12). **Not built yet:** billing still charges one Stripe price per shop (M10); per-package prices, counting people, and limiting a shop to its package's features are follow-ups for the owner to schedule.
- **Home page** (owner: "like the landing page of any SaaS software", Lovable as the reference): a centered hero with a package switch (the headline and a looping phone demo follow it), feature sections with small working demos built from the app's own pieces (stop cards, verdict pills, the pool diagram, the report, quote and pay, Plan Route, the dashboard, offline sync, maintenance plans), pricing with a team-size stepper, questions, and a navy closing band. The header is the frosted bar with Features and Pricing links.
- **No gradient** (brand/BRAND.md): where Lovable has a color wash, the hero has the app's pool diagram drawn large in flat water colors. Demos are illustrations (hidden from screen readers, each section says it in words), only run while on screen, and rest on a still frame with Reduce Motion.
- **The report demo's signature** is "Sam Sample" in Herr Von Muellerhoff (SIL Open Font License), turned into a path that writes itself.

## 2026-10-15 (owner: "make this app faster ... so everything feels lighter and older content loads faster")
- **Measured first** (Playwright and curl against the live site, plus a local copy of the database scaled to three years: 9,300 jobs, 3,000 customers, 68,000 checklist results). The gaps: pages waited on chains of database round trips (the customer page made 8 in a row), and every row-security check ran a membership lookup per row, so anything over history got slower as a shop grew (counting three years of photos: 0.8 s).
- **Related rows come back together:** jobs embed their pool, its owner, and the billed customer; the customer page is one query; the job page starts its Wrap-Up panels with the job. Each saved round trip is about 0.1 s in production.
- **Row security looks up the caller's companies once per query** (`20261012003200_fast_row_security.sql`), with the same answers as before (tenant-isolation and visibility tests unchanged). At three years of history: last month's jobs 32 → 3 ms, a year of jobs 291 → 5 ms, all photos 827 → 5 ms. New tables run `app.speed_up_policies()` after creating policies.
- **Phones keep recent work, not the whole history** (owner: "Ok"). Open jobs plus jobs scheduled, finished, or changed in the last 90 days, with everything under them; customers, pools, plans, and settings stay on every phone. A reopened or changed old job comes back whole. Phones drop aged-out jobs a week later, never with unsent changes. On the three-year copy, a new phone's first sync went from 161,022 rows / 89 MB / 51 s of server time to 28,542 rows / 15 MB / 2.7 s. Old jobs are on the website.
- **No session replay in crash reporting** (owner: "Leave off"). Crash reporting stays off until a key is set, and never records screens.
- **Team names load with the team** (`membership` → `profile` key, `20261012003300`).

## 2026-10-14 (owner: "the mobile website feels more like Google than Apple"; do all of it)
- **The office website follows iOS conventions on phones.** iOS navigation bar (large title that hands off to a small frosted title as you scroll, "‹ Back" on the left, the page's main action on the right; the navy logo bar is for wider screens); New Job is a **+** in that bar instead of a floating button; segmented controls with a white thumb; tinted buttons instead of outlined ones; switches instead of checkboxes; inset grouped lists with chevrons; sheets (grabber, swipe down to close) for short tasks; action sheets instead of the browser's confirm box; swipe actions on list rows (with a visible alternative); no snackbars.
- **Type and color:** body text and controls use the system font (San Francisco) on Apple devices; Barlow stays for titles and the logo. The page background is iOS's grouped gray (#F2F2F7) behind white rows; new tokens `fill`, `separator`, and `thumb` (`brand/tokens.json`).
- **Home Screen app:** a web app manifest and Apple web-app settings, so "Add to Home Screen" opens Tidemark full screen on Today.
- **Customer pages (report, quote, invoice) follow the same look on phones** (owner: "Do these please"): grouped rows on gray, Accept/Pay as a grouped block, tinted Download PDF pill, tap-to-call and tap-to-email in the header. The printed PDF stays pixel-identical (owner: "Don't change the PDF at all"); every change is phone-only or switched off when printing. Wider screens keep the paper document.
- **Field app, second iPhone pass** (owner: "Do 1-4, 6"): haptics at meaningful moments (switch on Android, segment change, save, confirmed destructive action, pull-to-refresh, full swipe); swipe left to delete or remove on list rows, always asking first, with the visible button and a screen-reader action kept; Add/Edit Test and Finding open as sheets on iPhone (photos open inside the sheet; swipe-down is blocked while there are unsaved changes or while marking up); SF Symbols on iPhone with Ionicons on Android; a frosted see-through navigation bar on iPhone (iOS 26 uses its own glass bar). Android keeps its navy bar and full-screen pages.
- **Customer page is a contact card, and everything on it can be edited** (owner, 2026-10-15: "There is no way to change a homeowner's address. Plus this page doesn't look very Apple"). Call, text, and email at the top; Contact, Pool, Maintenance, and jobs as grouped rows; Edit Contact Details (name, type, company, phone, emails, notes, reminder emails) and each pool's Edit (address, pool type, spa, access notes) open sheets; each maintenance plan opens a sheet with Pause, End Plan, and its details; Delete Customer is one red row at the end. A changed address drops the pool's old map location and looks the new one up, so routes never use the old place. Sent reports keep the address they were sent with.
- **Forms follow iOS on both apps** (owner: "Go do 1 and 2"). Website Settings: each item is a row that opens an edit sheet, "+" adds, single-record pages use grouped fields. Field app on iPhone: Test, Finding, Quote, Report, invoice, Signature, Review and the sign-in screens use grouped field rows (label left, borderless field), picker rows that open action sheets, Next/Done on number keypads, and the right autofill; customer-detail fields (customer email, signer name) no longer offer the tech's own autofill. Android keeps its outlined fields and chips.
- **Report PDF cleaned up** (owner: "clean up the design of the report PDF", which replaces "don't change the PDF" for the report; quote and invoice PDFs are unchanged). Job details as a three-column strip on a light panel under the header; summary tiles tinted in their verdict color instead of outlined with a side bar; checklist in two columns with tinted pills instead of solid ones; smaller, centered pool diagram; even two-column photo grid; full-width signature lines; thinner section rules; long sections may run across pages but a title never sits alone at the bottom of a page. The sample report went from 4 pages to 3. Desktop screens show the same layout; phones are unchanged.
- **The field app follows each platform:** on iPhone, system font, light navigation bar with large titles, New Job as a sheet opened from a **+**, tinted buttons, native switches, inset grouped lists, and action sheets for confirmations; on Android, the navy bar, floating New Job button, ripples and dialogs stay. It will move to Swift later, so this keeps Android right in the meantime.
- **Not possible on a website:** haptics (Safari has none), the system's own swipe-back (Safari provides its own), and true Liquid Glass (approximated).

## 2026-10-14 (owner: partner report is rarely needed)
- **The partner (technical) report starts turned off.** Most shops report to homeowners; pool companies wanting a technical version is assumed rare until the design partner says otherwise. Owners turn it on in Settings › Report Templates ("Techs can send this report"); Wrap-Up and the app then show it again. Existing shops that never sent one have it off too (`20261012003000`).
- **No further work on the partner report** unless the design partner says pool companies ask for it. The homeowner report gets the attention.

## 2026-10-14 (owner: "credit card processing directly on the website")
- **Customers pay on our own pages.** The Pay buttons on the quote (deposit) and invoice pages open Stripe's embedded Checkout in place, so the customer never leaves the site. Stripe still draws and holds the card form (in its own secure frame), so card numbers never touch Tidemark and the shop stays merchant of record on its own Stripe account. Payments, webhooks, and receipts are unchanged.
- **Ways to pay:** card (with Apple Pay and Google Pay where the device offers them), Link (Stripe's saved-card wallet), and US bank account. Apple Pay and Google Pay need the site's domain registered on each shop's Stripe account; that happens automatically when a shop finishes payment setup.
- **Fallback:** without `STRIPE_PUBLISHABLE_KEY` the Pay button opens Stripe's own page as before.
- **Demo mode (owner: "I want to see it to demo"):** on a server with no Stripe secret key, the quote and invoice pages still show the Pay button with a "Demo only" note; tapping it shows a picture of the payment form (wallet buttons, card fields, bank option) that has no inputs and can't submit. It disappears once the keys are set.
- **Not now:** a fully custom card form (Payment Element) and tapping a card on the tech's phone (Stripe Terminal). The second is a question for the design partner.

## 2026-10-14 (owner: "do the design fixes, monthly invoices, and tightening"; details my calls)
- **Job visibility reaches the server functions and stored files.** With techs_see_all_jobs off, a tech can no longer prepare, preview, or send a hidden job's report, send its quote, or create, send, void, or record a payment on its invoice, even knowing its id; the job's photos, signatures, and PDFs are hidden too. The original functions moved to the `app` schema behind wrappers with the same names, so nothing that calls them changed.
- **Monthly maintenance invoices:** each month, one draft invoice per customer with a line per finished, priced visit ("Pool service, Sep 17"), not taxed. The daily run drafts last month on the 1st (the shop's time zone); owners can also draft any month from the Invoices page ("Maintenance to Bill"), including this month so far. Owners review and send drafts as usual. The invoice sits on the month's last visit, so sending, the customer page, card and bank payment, and receipts work like any invoice. Visits follow it: sent makes them invoiced, paid makes them paid, void frees them to bill again. A visit finished late joins the month's draft; once that month's invoice is sent, a late visit waits for the office to bill it by hand. A visit on a monthly invoice can't get one of its own.

## 2026-10-14 (owner: faster site; Today first; whole team on the desktop schedule)
- **Signing in opens Today** (also after joining from an invite, starting a shop, or switching companies). Links that carry a destination still go there.
- **Schedule:** desktop shows every tech at once; phones keep one person at a time with the chips (Everyone shows all). Month view counts everyone on desktop.
- **Speed:** the error-monitoring code loads only when Sentry is set up (about 250 KB less script on every page); Jobs shows 50 at a time with Show More and a search (customer name or job number), instead of every job (about 1 MB of page on the demo shop); the job page, Today, and the schedule start their database reads together instead of one after another; the team and company are read once per page.

## 2026-10-14 (M11 launch hardening; my calls, adjust as needed)
- **Error monitoring is Sentry, errors only.** Website (server and browser) and app; off until a DSN is set. No customer data: no request bodies, headers, cookies, query strings, screenshots, or session replay.
- **Offline edge cases:** a refused sign-in keeps everything on the phone and shows "Sign in again"; a full phone rolls the save back whole and explains it (no crash), and the sync bar warns below 200 MB free; an app update keeps unsent changes (tested from the first schema).
- **The phone database has a job index** (schema 4), so a job's screens read only that job's rows.
- **Delete My Account** (App Store rule): techs and second owners are deleted at once; a shop's only owner becomes a request to support, done within 30 days, because the shop's records go with it.
- **Privacy policy and terms** are plain-language drafts marked as drafts; the owner supplies the final text. Support is `support@tidemark.app` (placeholder) via `SUPPORT_EMAIL`. `/status` and `/api/health` for an uptime monitor.
- **Design review (M11):** report in `docs/design/2026-10-14-m11-review.md`. Critical and High fixed: link color `#1A63A0` and warning `#8A5A0E` (contrast on the page background), website text in rem, app text scales up to 2.4×, 44 pt links. Also: Cancel Job moved to the end of Details; on phones Sign Out moved to More; "min short" now reads "min late".
- **Bundle ID stays `com.leakbook.app` until the owner decides** (it can't change after the first upload); recommended `app.tidemark.field`.

## 2026-10-13 (owner: "still feels super boxy"; more pills, phone as an icon)
- **Pills:** every button is a pill (orange still only for the primary action; secondary and danger keep a 1 px outline in `color.controlBorder`). Status labels are solid pills in sentence case. Filters and "whose day" chips are pills; segmented controls are a pill track with a navy thumb. The app follows the same shapes (`radius.pill`, `radius.xl` added to `brand/tokens.json`).
- **Soft cards:** content sits on raised surfaces with a faint shadow and no outline (`.card`); groups inside a card use a quiet inset well (`.well`). Increase Contrast brings the outlines back. The job's customer, pool, and tech are one grouped card instead of three.
- **Icons for contact:** call, text, and email are round icon buttons (named for screen readers; the number shows beside them). Today's Call is the same.
- Text fields are rounded (12 px) and keep their outline.

## 2026-10-13 (owner: show the customer the report, then get the signature)
- **Review with Customer replaces the bare signature sheet.** After writing the draft, the tech hands over the phone: the customer reads the report exactly as they will get it (the website renders the real report; the app shows the same content from the phone's data) and signs at the bottom, under the sentence they confirm.
- **Signing finishes the report.** That version locks, so what they read is what they get; later changes go out as a new version, and the signature shows as "signed on version N" there. Signatures are tied to the version they were finished with (`signature.report_id`).
- **Customer Not Here** finishes the report without a signature, and it says "Not signed: customer not present." The tech can also still send without a signature from the report panel. A finished version can be sent by email or text, or downloaded as a PDF, signed or not.
- **Offline (app):** the customer can read and sign without signal; the written summary appears once the draft is written, and the report is finished from the Report tab (Finish Report) when the phone is back online.
- **Re-signing replaces (owner, 2026-10-13):** a report shows the newest signature of each kind, so signing a new version replaces the earlier signature there; a version nobody signed shows the last one, marked "signed on version N". Signatures can be removed (job page Signatures, the app's Report tab): finished versions keep their copy and the drawing stays in storage, but new versions don't show it.
- **Work authorization** comes before the work, so it is still signed on its own. The visit's sign-off (inspection acknowledged, work completed) is at the end of the report.
- **The checklist must be done before the customer signs**, as before sending.

## 2026-10-13 (owner: no way to add a maintenance job; schedule and Today feedback)
- **New Job books maintenance too.** A Job switch (Leak Detection / Maintenance). Maintenance can be Just Once (one visit with the service checklist) or, for owners, a plan (Weekly, Every 2 Weeks, Every 4 Weeks) started for a new or existing customer in one step; the owner lands on the customer's page with the plan. Maintenance hides the second tech, the detection price, and the intake questions.
- **The schedule shows one person at a time by default**, picked from a sideways row of chips like Today's (Me first, Everyone last). It opens on the first person with work in view. Month view added: a calendar with each day's job and cleaning counts, tapping a day opens it.
- **Picking a date:** a date field between the arrows opens the phone's date picker, and day view has a strip of the week's days.
- **Today's stop cards are shorter:** time, status, and Call / On My Way on one row; the whole card opens the job (no Open Job button); finished stops shrink to time and name.

## 2026-10-13 (owner: regular pool cleaning; my calls, adjust as needed)
- **Maintenance plans live on the customer's pool** and make ordinary jobs of type Maintenance, so visits use everything routes already do (schedule, Plan Route, moving, Today, phones, who-sees-what). Plans are made and changed by owners.
- **Visits are made four weeks ahead** (Settings › Scheduling, 1 to 12) when a plan is saved and topped up every morning. Changing, pausing, or ending a plan replaces its upcoming visits that haven't started; started and finished visits are kept. A visit moved by hand keeps its plan date, so it isn't made twice.
- **30 minutes by default** (Settings › Scheduling; each plan can differ). A visit without a set time goes after the tech's last job that day and Plan Route places it properly; a set time is kept like a promised time.
- **Service checklist** (configurable rows like the leak checklist): skim, brush, vacuum, empty baskets, filter pressure, test and balance water, equipment for leaks or noise. Each is Done, Needs Attention, or Skipped. A visit ends with the new status Done (only maintenance visits offer it).
- **Price per visit** is saved on the plan and the visit. **Billing is monthly** (owner, 2026-10-13): one invoice per customer per month for the visits done. Built 2026-10-14 (see above).
- **Water-chemistry readings and a service summary email to the customer:** on hold; ask the cousin (BUILD_PLAN section 10).
- **Demo:** the demo shop's techs have cleaning plans too (`supabase/seed_demo_maintenance.sql`), so each route mixes leak jobs and 30-minute cleanings (four to six stops a day).

## 2026-10-13 (owner: techs seeing other techs' schedules and jobs)
- **Owners choose what techs see** (Settings › Team › Techs see: Every Job / Only Their Own; default Every Job, as before). With Only Their Own, a tech sees only jobs where they are the tech or second tech, and everything under them (checklist, tests, findings, photos, reports, quotes, invoices, payments, signatures, messages, warranties), on the website and on their phone. Owners always see everything. **Customers and pools stay visible to the whole team**, so a tech can still look up a customer and book a job (always for themselves).
- **Enforced in the database** (restrictive row policies, `20261012002300_job_visibility.sql`), not only hidden on screens. The schedule shows such a tech only their own route, and suggestions and moves stay on it.
- **Phones follow changes:** when the setting changes or a job changes hands, the tech's phone downloads everything again and drops jobs that are no longer theirs (unsent changes stay until sent).
- **Not covered yet:** a few server functions (sending a report, quote, or invoice) check only that the person belongs to the shop. A tech can't find hidden jobs' ids through the app, but a tech who saw a job before it was taken away could still call them with its id. Photos in storage are protected the same way. Tightening these is a follow-up if wanted.

## 2026-10-13 (owner: route optimization; my calls, adjust as needed)
- **Routing is in scope now** (was "No" in BUILD_PLAN section 1), folded into scheduling as milestone M10.5. Ordering each tech's day and suggesting where a job fits; assigning jobs across techs automatically ("fleet routing") is not built.
- **Mapbox** (owner's pick) behind one server module (`apps/web/src/server/routing.ts`): permanent geocoding and the Matrix API, one Tidemark key (`MAPBOX_TOKEN`, server only). Our own solver orders the stops (exact up to 8 stops, then improving swaps), so the 12-stop Optimization API limit doesn't apply. **Without a key everything still works**: drive times are estimated from distance (road factor 1.35, city and freeway speeds, 3 minutes to park). Each call is counted per shop per day (`ROUTING_DAILY_LIMIT`, default 300); drive times are kept for a day.
- **Times decide a day's order.** Plan Route re-times a tech's day for the least driving. Started jobs, times the customer was told ("The customer was told this time", off by default), and two-tech jobs stay where they are; a two-tech job moves only by hand, which moves it for both techs. Moving one job never pulls anyone earlier: stops after it move later only if they must. Suggestions only use gaps, so they never move anyone.
- **Where a pool is:** looked up from its address when a job is made (with a key), or marked exactly with Mark Location Here at the pool (phone GPS, free). Either is kept with the address it belongs to; a changed address is looked up again. The shop's location comes from its address or Use My Location at the shop.
- **Working day** 8:00 AM to 5:00 PM, Monday to Friday, jobs 2.5 hours unless booked longer; arrival windows off (exact time). All in Settings › Scheduling. On My Way texts come from the tech's own phone with now plus the drive.
- **Addresses are the link to directions** (owner: no separate button; keep pages short). Every address links to `/maps`, which picks the app on the server so it never changes after the page loads: the device's choice (More › Directions open in: Automatic, Apple Maps, Google Maps), else Apple Maps on iPhone, iPad, and Mac and Google Maps elsewhere. The field app uses Apple Maps on iPhone and the default maps app on Android. The day's route button follows the same choice: Google Maps opens the whole route; Apple Maps (whose links take one stop) opens the next stop not yet done. The button names the app.
- **Weather on Today** comes from the shop's zip code, never the device's location (owner): the zip is turned into a point by Zippopotam.us (GeoNames data), and the forecast comes from the National Weather Service (free, no key, US only). It shows the temperature now, the conditions, and today's high, and refreshes at most every half hour. If either service is down, the weather is simply left off.
- **Photos and videos can come from the camera roll** (owner), on the website and in the field app (Take Photo or Choose from Library). A library photo keeps the time it was taken (from the photo) but gets no location, since where the phone is now isn't where it was taken. Library videos over 60 seconds are refused, as when recording. On the website, Add Photo, Add Video, and Voice Note sit in one row.
- **Needs a Time holds every job that isn't on someone's route** (owner: a job taken away from a tech should go back there): jobs without a time, and booked jobs with no tech (shown with their booked time). There is no separate Unassigned column.
- **Today** is the first tab: the signed-in tech's route in order. Invoices moved under More on phones.
- **Demo addresses** are real public places around Phoenix (parks, libraries, civic buildings, never homes) with coordinates from OpenStreetMap (ODbL), so maps and drive times are real.

## 2026-10-13 (owner: the mobile pages are too long; Apple, Liquid Glass feel)
- **Job page on phones is in five parts** (Details, Checklist, Findings, Photos, Wrap-Up) with a segmented switcher pinned under the header. It was about 15 screens long. Wider screens keep one page. The part shown is in the URL (`#checklist`).
- **Checklist rows:** one line per item with its verdict as a pull-down (the phone's own menu), instead of four buttons per item. Sections fold to a one-line summary ("All clear", "1 leaking · 1 attention") once done, and each has "Mark N Remaining Not Leaking" ("Answer N Remaining No" for yes/no questions). "Remove Item" is in the item's menu; adding another skimmer or return is in "Add an item".
- **Customer sign-off** moved to Wrap-Up, before the report: "Hand to Customer to Sign" opens a full-screen sheet with the statement they confirm in plain words (for example "I confirm Demo Leak Co. inspected the pool at … today and explained what they found."), their name filled in, a large box, and Sign always in reach.
- **Liquid Glass, web approximation:** translucent blurred material only on the floating controls (the header, a floating tab bar, the job switcher, and sheet bars). Content stays on solid surfaces. Reduce Transparency and Increase Contrast get solid fills.

## 2026-10-13 (M10: my calls, adjust as needed)
- **Reminders:** once a day (about 8:45 am Arizona). Each quote or invoice gets only its newest due reminder (a quote 8 days out gets the 7-day one, not the 3-day one too), and each goes out once. They stop when the quote is accepted or expires, or the invoice is paid. Defaults: quotes 3 and 7 days after sending, invoices 7, 14, and 30. Owners change them in Settings.
- **Review requests:** one per job, between 2 hours and 14 days after it is paid, only when the shop has a review link and hasn't turned them off.
- **Opting out:** every reminder and review email has a "stop these emails" link; the office can tick the same thing on the customer. It never stops reports, receipts, or anything the office sends by hand.
- **Warranties** start the day the repair job is paid (shop's time zone) and come from the accepted quote's lines with a warranty term. "Expiring soon" means within 60 days.
- **Phone navigation:** the tab bar shows four sections and puts the rest (Dashboard, Warranties, Settings) under More, as iOS apps do.
- **Billing:** one Stripe price per shop per month (the amount is still the owner's decision; set it in Stripe as `STRIPE_BILLING_PRICE_ID`). Subscribing during the trial keeps the remaining trial days; the card is charged when the trial ends.
- **Read-only, never data loss:** a shop is read-only when its trial ended without subscribing, its subscription is canceled, or a payment has been past due for more than 7 days. Members can see everything but not change anything; customers can still accept quotes and pay; the server keeps working. Changes made on a phone while read-only stay on the phone and go up once paid. The demo shop never runs out.

## 2026-10-13 (owner: the website and the app are the same)
- **The website does everything the phone app does** (milestone M9.5), except offline work: the website saves straight to the server. Demos will use the website on a phone, so every office page must work at phone width. Replaces BUILD_PLAN's split of "field app for techs, office view for the office".

## 2026-10-13 (owner: the website is slow; more demo data)
- **Website speed:** an office page made up to about 40 database calls, each crossing from Vercel's Washington DC region (`iad1`) to the database in Oregon (`us-west-2`), and checked the sign-in with the auth server twice. Now the website runs in Oregon (`pdx1`, `vercel.json`) and checks the sign-in token's signature locally (`getClaims`). `DB_TIMING=1` logs each call a page makes.
- **Demo data** (`supabase/seed_demo_schedule.sql`): three more techs (Luis, Jake, Priya; password `leakbook-demo`), 24 made-up customers around Phoenix, and a schedule from last week through next week (three jobs a weekday): last week checked, invoiced, and paid, some with a leak found; today in progress; the rest scheduled; three not yet scheduled.
- **Fuller demo routes** (`supabase/seed_demo_routes.sql`, owner 2026-10-13): 16 more customers at real public places, and from today through the next week every tech has four or five 90-minute stops a weekday in their part of the valley, booked in calling order so Plan Route has something to improve. Loaded with the other seeds (`pnpm db:deploy -- --seed` on the dev project).

## 2026-10-13 (owner: add jobs from the website)
- **The office can add detection jobs** (Jobs → New Job): a new or existing customer and pool, scheduled or not, tech and second tech, detection fee from the price book, booking answers, notes. The same fields as the phone. The checklist is created with the job, so it is ready on the tech's phone. Saved in one transaction by `create_job`, which runs with the user's own access rules. Repair jobs still come from accepted quotes.
- **The phone app uses the dev website by default** (`config/supabase-dev.json` → `webUrl`), so sending from the phone works without setting `EXPO_PUBLIC_API_URL`.

## 2026-10-13 (owner: the name is Tidemark)
- **Renamed from LeakBook to Tidemark** everywhere people see it: website, phone app name and permission text, emails ("{Shop} via Tidemark"), the "Powered by" line, the logo wordmark ("Tide" navy, "mark" water blue; the drop-pin mark is unchanged), and the docs. Reason: a name not tied to leak detection, for selling to other pool shops. PoolDeck was considered and dropped (pool-deck contractors, Skimmer's "The Pool Deck").
- **Kept as they are, because changing them would break things:** package names (`@leakbook/*`), phone storage keys (renaming would wipe phones' local data), the app's bundle id and URL scheme (`com.leakbook.app`, `leakbook`), the `leakbook-dev` Supabase project, and the demo sign-ins.
- **New mark (owner's concepts):** the same drop pin with two parallel wave lines (the tide mark) and a round dot; straight sides tangent to the head. On light backgrounds the pin is water blue with the dot and lines cut out; on navy (app icon, favicon, reverse logo) the pin is white with the orange dot and the lines filled water blue (owner asked for the light blue there). Rebuilt as geometry in `brand/scripts/build_logo.py`.
- **Domain placeholder** is now `tidemark.app` (email from `send.tidemark.app`). Not bought; the owner checks the domain and trademark before buying. Older entries below say LeakBook; they were true when written.

## 2026-10-13 (owner: appearance and deleting customers)
- **The website is light by default** with one sun/moon button for dark. It no longer follows the device's setting (no "Auto"). Replaces the Auto / Light / Dark switch.
- **Owners can delete customers.** Only when every job is paid or canceled and no invoice is waiting for money; the customer and their pools are soft-deleted, and finished jobs, reports, quotes, invoices, and payments keep their history.

## 2026-10-13 (M9 invoicing, made for now; owner can change)
- **One invoice per job.** A detection job's invoice bills its detection fee (untaxed, like the price book's detection items). A repair job's invoice copies the accepted quote's lines and discount and credits the deposit paid, after tax. The office can edit a draft (lines, discount, due date, note); the phone creates and sends it as built. To bill the fee and the repair together, the office adds the fee line to the repair invoice.
- **No invoice while a bank deposit is still clearing,** so the credit is never wrong.
- **Due on receipt** unless the office sets a due date.
- **Paying:** Stripe Checkout for the whole balance (card or bank), on the shop's account like deposits. Owners record checks and cash ("Record Payment"), which allows partial payment. The job becomes Paid when the balance reaches zero.
- **Receipts:** a paid invoice's page becomes the receipt (with a PDF), and the customer and their other emails get a receipt email.
- **Void:** an owner can void a sent invoice with no payments; any member can delete a draft. The link then says it was canceled, and the job can be invoiced again.
- **CSV export** of invoices and payments for owners (Invoices page), for the books or a QuickBooks import.
- **Invoice is its own section on the phone's job screen,** not a sixth tab (house rule: segmented controls hold 2 to 5 views).

## 2026-10-13 (M8.5 report, made for now; owner can change)
- **"Items Pass" counts only "Not leaking" (and "No" on yes/no items).** Not applicable items are listed with their badge but not counted as passing. The partner's old tool appears to count them as passing (27 items: 26 pass, 1 failed).
- **Extra customer emails are copied (cc) on the report email,** so the household sees who got it.
- **Reports sent before M8.5 keep their old "what we checked" text;** sent reports are frozen.

## 2026-10-13 (route optimization, requested; not built yet)
- **Route optimization folded into scheduling is in scope**, reversing "Dispatch/routing is out" (2026-10-12). It waits until M8.5 is finished. Its milestone placement (suggested: right after M9) is still to be confirmed. Plan: `docs/ROUTE_OPTIMIZATION_HANDOFF.md`.
- **Provider: Mapbox** ("fine for now, but the goal is to sell this elsewhere"). All calls go through one server module so the provider can be swapped, and usage is counted per company.
- **Routes start and end at the shop**, so the company address must be geocoded.
- **Two-tech jobs are sometimes routed together**: same slot, or the same route when the office chooses "ride together".
- **Still open:** arrival windows (built as a company setting, off by default), automatic assignment across techs, lunch break or end-of-day limits.

## 2026-10-13 (hosting)
- **The website is on Vercel** at `leaksoftware-web.vercel.app`. Production currently builds from `claude/cool-keller-efjc00`; a dedicated production branch is suggested.

## 2026-10-13 (M8 quotes and deposits)
- **Totals are recomputed by the database when a quote is sent or accepted,** with the same rules as `packages/core/src/quote.ts` (tests check the same figures). The discount comes off before tax, shared between taxable and untaxed lines. Sent quotes and their lines are frozen.
- **Quotes are built on the phone; the office sends them and sees status.** A tech's discount over the company limit is refused when sent; owners can give any discount.
- **On-site acceptance is a `quote_acceptance` signature with the quote id.** When it syncs, the server accepts the quote; if that fails (for example, a discount over the limit), the signature still syncs and the quote waits for the office.
- **Accepting creates the repair job** (unscheduled, same pool and customer, pointing at the detection job). The office schedules it from the job page.
- **Stripe:** Standard connected accounts, Checkout Sessions on the shop's account (card and US bank account). Webhooks are verified and applied once per event id; a payment never moves back to pending, so out-of-order events change nothing. Card = paid at checkout; bank = pending until `async_payment_succeeded`.
- **Server-only writes use the service-role key** (webhooks, connected accounts), through functions only the service role may call. Payments need both `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
- **Verified with signed simulated webhook events** in CI (bank and card deposits, replay). A real Stripe test-mode run waits for the owner's Stripe keys.
- **Not yet:** rate limiting on the customer endpoints (plan section 7) moves to M11 hardening; a customer can't decline online (the office can mark it later).

## 2026-10-13 (design reviews)
- **Owner: per-milestone Apple Design reviews cost more than they find.** The skill is now used when planning new screens; one full review of every screen happens before the pilot (M11 accessibility pass). The house rules in CLAUDE.md still apply to all UI.

## 2026-10-13 (owner: match his current tool)
- **Owner approved the 10 changes** proposed in `docs/research/2026-10-13-current-report-system.md`, as milestone M8.5 right after M8 and before invoicing.
- Customer details and the shop's disclaimer text from his sample report are not committed (public repository); the owner enters the disclaimer in settings.

## 2026-10-13 (website appearance)
- **Owner asked for light mode with a toggle.** The website has an Auto / Light / Dark switch (office header, public footer). Auto follows the device. The choice is kept in the browser and applied before the page draws. Customer reports and PDFs stay light whatever the setting.

## 2026-10-13 (M7 reports)
- **Server writes to reports go through database functions** (`prepare_report`, `save_report_draft`, `send_report`, `log_message`), called as the signed-in member so membership checks apply. Freezing the snapshot, superseding the previous version, creating the customer link, and moving the job to "report sent" happen in one transaction. Clients can only edit `final_sections` on a draft; sent reports never change.
- **The snapshot is built in SQL** (`app.report_snapshot`), so the website, the phone API, and the tests all freeze the same facts. Signatures for quote acceptance are left out of reports.
- **AI narrative:** Claude through the Anthropic API, model from `ANTHROPIC_MODEL` (default `claude-opus-5-5`), structured output, medium effort, with server-side fallback to another model if the first declines. The validator gets one retry with its problems listed; anything still wrong is shown to the tech above the text. **Without `ANTHROPIC_API_KEY` the draft is a plain summary built from the job data** (labeled `leakbook-plain`), so reports work before the key is set.
- **PDF:** the customer page printed by headless Chromium. It is stored at a fixed path (`documents/{company}/{job}/report-{id}.pdf`) only when the server has the service-role key; otherwise it is rendered on request. The email attaches it when under 5 MB.
- **Customer link files:** signed-out visitors can read only the files listed in the snapshot of a report with a live link (photos, signatures, logo, PDF).
- **Email:** Resend. Sender "{Shop} via LeakBook" from `EMAIL_FROM_DOMAIN`, replies to the shop's email. Without a key the office shows Send by Text only. Tests write emails to `EMAIL_OUTBOX_DIR`.
- **Signatures** are drawn strokes saved as an SVG beside the job's photos (crisp in the PDF, tiny, works offline) and uploaded through the photo queue. Quote acceptance is hidden until quotes exist (M8).
- **Writing and sending from the phone need a connection and `EXPO_PUBLIC_API_URL`**; editing the text works offline and syncs. Sending first pushes edits and refuses if they have not reached the server, so the customer gets what the tech approved.

## 2026-10-12 (M6 accepted)
- **Owner opened the website and accepted M6** without running the checklist, and asked to continue with M7.

## 2026-10-12 (M6 office web app)
- **The website talks to Supabase only from the server** (Server Components and Server Actions, as the signed-in user so RLS applies). The browser never holds a Supabase client. Sessions are cookies refreshed by `proxy.ts`. Office edits go straight to the database (no outbox): the office is online by nature, and the database triggers stamp field clocks and the audit log, so phones pick the changes up through normal sync.
- **Sign in:** email and password, or an emailed sign-in link (existing accounts only). **Start a trial** creates the account and the company in one form; if email confirmation is on (production), the company is created after the person confirms, on `/setup`.
- **Invites are links the owner copies and sends** until email arrives in M7. A link works once, for the invited email, for 14 days. Signed-out invitees see the company name and role first (`invite_details`), then create an account or sign in. Owners can revoke invites and change roles or turn off access; **a company always keeps at least one active owner** (database trigger).
- **Techs can use the office view** (jobs, schedule, customers) but not settings; settings show an "owners only" message, and every settings action checks the role on the server (RLS checks it again).
- **The timeline is built from the audit log** and shown to owners only (the log holds every field change, including notes and prices).
- **Test types:** built-in pressure and bucket tests expose only their thresholds; custom test types are defined one field per line (`Label (unit)`, `: notes`, choices with `/`). Changing a custom type's fields bumps its schema version, so earlier results keep their own fields.
- **Sample inspection seed:** `supabase/seed_sample_job.sql` adds an inspected job (Sam Sample, 9 Sample Way) to the demo company. It is idempotent and also applied to the hosted dev project by `pnpm db:deploy -- --seed`.
- **End-to-end tests** (`pnpm --filter @leakbook/web test:e2e`) run in CI against Supabase in Docker. They also run against the hosted dev project; each run adds one disabled test tech account there.
- **Fixed:** Tailwind's default grays are replaced by the brand neutrals in the token theme, so `neutral-*` classes stay on brand.

## 2026-10-12 (M5 accepted)
- **Owner accepted M5 without the device checklist** and asked to continue. The phone flows (camera, markup, voice notes, killed uploads) were verified only by automated tests and the hosted upload test; `docs/testing/M5-device-checklist.md` stays for a later pass.

## 2026-10-12 (M5 media)
- **Uploads are resumable (TUS) for every file**, not only those over 6 MB. One code path; the upload URL is saved on the phone, so an app killed mid-upload continues from the last confirmed 6 MB chunk. Uploads never overwrite: if an earlier attempt finished but the phone did not hear back, the server answers "already exists" and that counts as done. Verified against the dev project's real storage (`pnpm test:hosted`, which leaves about 16 MB per run in the dev bucket because app users cannot delete originals).
- **Video quality: the camera's medium preset for now** instead of `react-native-compressor` (BUILD_PLAN 4.5). The compressor needs a development build; Expo Go (how the owner tests today) cannot load it, and full-quality iPhone video passes Supabase's 50 MB per-file limit in well under a minute. Medium keeps a 60-second clip far below the limit, at visibly lower resolution. **Revisit when we switch to a development build** (also needed for encrypted storage): compress to 720p with the compressor. Files over 50 MB are refused at capture with a message.
- **Photos are re-encoded on the phone** (2048 px long edge, JPEG 0.7). This also turns HEIC into JPEG and drops EXIF; the capture time and GPS are stored on the media row instead, and the SHA-256 is of the saved file.
- **Markup is vector JSON** (arrows, circles, text; positions as fractions of the photo; three colors: red, yellow, white, each drawn with a black outline). Unknown shapes are ignored, never an error, so later shape types do not break older phones.
- **Photos attach to the job, a component, a finding, or a test.** On a new finding or test the section asks to save first, so a capture never points at a record the server has not seen.
- **Voice-note transcription runs on the website** (`POST /api/media/{id}/transcribe`, Deepgram nova-3), called by the phone after the audio uploads. The server writes the transcript (devices cannot); it reaches phones through normal sync. **Dormant until the website is deployed** (M6/M7) with `DEEPGRAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `EXPO_PUBLIC_API_URL` set; until then voice notes show "Not transcribed yet".
- **Local files are kept after upload** so the job works offline; they are deleted on sign-out. Clearing old local files (for example, jobs older than 30 days) is deferred to M11.
- **Upload triggers:** after each sync, after each capture, when the network comes back, and from Settings → Sync Now. Background uploads while the app is closed (`expo-background-task`) are deferred until the development build.
- **Fixed:** the sync package's unit-test run also ran the hosted tests against the dev project (including in CI). Hosted tests now run only through `pnpm test:hosted`.

## 2026-10-12 (Apple Design skill)
- **Owner asked to follow the Apple Design skill** (HIG-based review) for the app's look now and going forward. It is installed per session by `scripts/session-start.sh` at a pinned commit, not committed: the repository is public and the skill reproduces Apple's guideline text.
- **First review applied** (`docs/design/2026-10-12-field-app-review.md`): iOS default type sizes (17/15), stronger control outlines (5.7:1), segmented controls for view and state switching, 44 pt tap targets, consistent "Excluded" wording, and Title Case for buttons, segment labels, and titles (sentence case elsewhere).
- **Kept on purpose:** the field app stays light-only for sunlight readability (trade-off against HIG dark-mode guidance, documented in the review).

## 2026-10-12 (M4 inspection)
- **Thresholds are test-type settings** (`field_schema.options`), editable per shop later in M6. First drafts to confirm with the design partner: a pressure test passes only with **no drop** over **at least 15 minutes**; a bucket test fails above **1/4 inch per 24 hours** of loss beyond evaporation. Rising pressure is "unclear", not a pass.
- **The app suggests an outcome; the tech decides.** Changing the suggestion prompts for a note. Dye and listening tests have no calculator; the tech picks the outcome.
- **New jobs get their checklist when created** (offline, in the same save). Jobs created elsewhere (office, demo data) show "Set up checklist".
- **Diagram:** five shape presets (rectangle, oval, kidney, L-shape, freeform) and an attached spa, drawn from shared code so reports match the phone. Pins are stored as fractions of the diagram. **Placing component icons (skimmers, returns) on the diagram is deferred** until the design partner says it helps; pins carry the information that matters.
- **Removing a component** is allowed (soft delete) for instances added by mistake; tests and findings keep their own records.

## 2026-10-12 (M3 accepted)
- **M3 passed the owner's device test** on an iPhone with Expo Go. The server shows jobs #1012 and #1013 created on the phone, and an offline batch (a cancel plus a new customer, property, and job) arriving together after reconnecting.
- **Bug found and fixed:** job notes saved only when the field lost focus, which often does not happen on iPhone. Notes now save shortly after typing stops and when leaving the screen.

## 2026-10-12 (M3 field app shell)
- **Dev project auth:** accounts confirm automatically (`mailer_autoconfirm`) so testing needs no email round trip; passwords need 10+ characters; redirect URLs allow `leakbook://`, `exp://`, and localhost. **Production must keep email confirmation on.**
- **Signed-in state is kept on the device**, separate from the Supabase token. An expired token offline never locks a tech out; sync pauses and Settings offers "Sign in again" without touching local data. Signing in as a different account clears the previous account's data first.
- **Sign-in in the app is email and password.** Magic links move to the website (M6), where they fit better.
- **Teammates' names** come from `profile` (not a synced table) and are cached on the phone after each sync.
- **Encryption:** SQLCipher is on in the app config, with the key in the device keychain. Expo Go cannot encrypt; dev and production builds do. Settings shows which applies.
- **Sync window (12 months) deferred to M11** performance work. Phones pull all company records; fine for small shops.
- **Public Sans static weights** (Regular, Medium, SemiBold, Bold) generated from the variable font, because React Native on iOS does not reliably select weights from a variable font.

## 2026-10-12 (dev Supabase project)
- **Dev project:** `leakbook-dev` (ref `evmxdfasurkaxbwkceti`, us-west-2). Public settings are committed in `config/supabase-dev.json`.
- **Cloud environment access** is a Network secret: a Supabase personal access token sent only to `api.supabase.com` under `/v1/projects/evmxdfasurkaxbwkceti/`. Migrations reach the dev project through the Management API (`POST .../database/query`), because this environment cannot open direct Postgres connections. The secret/service_role key is not in the environment, so tests from here always go through RLS.

## 2026-10-12 (M2 sync engine)
- **Device storage is one JSON table, not a typed schema per table.** Every synced server table lives in `sync_records` (table, id, company, JSON row). A server schema change never needs a phone database migration, which matters for an app people may not update for months. Screens read through `LocalStore.get/list`; typed wrappers come in M3. Replaces "Drizzle ORM for typed schema and migrations" in BUILD_PLAN section 2.
- **Field clocks and the audit log are kept by database triggers on every write**, not only by `sync_push`. Office web edits and server code therefore take part in last-writer-wins and are audited too. `sync_push` runs as the caller (RLS and column grants apply) and passes the device's clocks to the trigger through a transaction-local setting.
- **A device clock more than 5 minutes ahead of the server is clamped**, so a phone with a wrong date cannot win every future conflict.
- **Rejected changes are kept on the phone as "problems"**, shown to the user, and not retried. The user can discard one to restore the server value.
- **Deferred to M3:** the 12-month sync window (phones currently pull all company records; fine for small shops) and pulling teammates' profiles (names) for display.

## 2026-10-12 (owner: "make your own call for now, adjust later")
- **Product shape:** a website and an app. The website covers a public marketing page with signup, the office view, and customer report/quote/pay pages. The app is the tech's field app. A public home page with signup is added to M6 (layout) and M10 (signup flow).
- **Fixed costs:** approved. Reasonable fixed monthly costs (around $65/mo) are fine.
- **Texting:** v1 sends from the tech's own phone (share sheet / prefilled SMS). Twilio later.
- **Stripe:** Connect with Standard accounts and direct charges. The shop is merchant of record.
- **Sales tax:** one configurable rate per company, taxable flag per line item. Default 0% until set.
- **Deposit:** default 50% of the quote total, configurable per company (percent or fixed, with a minimum).
- **On-site signatures:** support inspection acknowledgment, work authorization, quote acceptance, and completion. Inspection acknowledgment and quote acceptance on by default.
- **LeakBook pricing (placeholder):** flat price per shop per month, up to 5 techs, 30-day free trial. Final price after the design partner pilot.
- **Domain:** placeholder `leakbook.com` (app) and `send.leakbook.com` (email) in config only. Owner confirms availability before purchase.
- **Apple account:** company developer account (needs a D-U-N-S number).
- **Tooling:** TypeScript 6.0 (typescript-eslint does not support 7 yet), pnpm 10 workspaces, ESLint 9 (eslint-plugin-react, used by both the Next and Expo configs, does not support ESLint 10 yet). Expo SDK 57, Next.js 16.4.
- **Database tests:** real Supabase in Docker in CI; local Postgres 16 + a small Supabase shim where Docker is unavailable (cloud sessions). CI is authoritative.

## 2026-10-12
- **Build plan drafted** (`BUILD_PLAN.md`). Owner approval pending, including the open decisions in its section 10.
- **Scope goes beyond the MVP:** add simple scheduling, reminders, review requests, light warranty tracking, basic owner dashboard, and shop signup with LeakBook billing. Insurance template, partner portal, and QuickBooks wait. Dispatch/routing, payroll, inventory, and accounting are out.
- **Logo:** drop-pin mark, concepted in ChatGPT and rebuilt as exact geometry (`brand/scripts/build_logo.py`).
- **Brand:** name LeakBook; "Work Truck" palette (navy, water blue, safety orange); Barlow Semi Condensed + Public Sans. Primary buttons use navy text on orange for contrast in sun.
