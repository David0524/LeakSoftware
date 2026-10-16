# Decisions log

Newest first. Each entry: date, decision, reason.

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
