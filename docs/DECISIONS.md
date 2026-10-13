# Decisions log

Newest first. Each entry: date, decision, reason.

## 2026-10-13 (owner: route optimization; my calls, adjust as needed)
- **Routing is in scope now** (was "No" in BUILD_PLAN section 1), folded into scheduling as milestone M10.5. Ordering each tech's day and suggesting where a job fits; assigning jobs across techs automatically ("fleet routing") is not built.
- **Mapbox** (owner's pick) behind one server module (`apps/web/src/server/routing.ts`): permanent geocoding and the Matrix API, one Tidemark key (`MAPBOX_TOKEN`, server only). Our own solver orders the stops (exact up to 8 stops, then improving swaps), so the 12-stop Optimization API limit doesn't apply. **Without a key everything still works**: drive times are estimated from distance (road factor 1.35, city and freeway speeds, 3 minutes to park). Each call is counted per shop per day (`ROUTING_DAILY_LIMIT`, default 300); drive times are kept for a day.
- **Times decide a day's order.** Plan Route re-times a tech's day for the least driving. Started jobs, times the customer was told ("The customer was told this time", off by default), and two-tech jobs stay where they are; a two-tech job moves only by hand, which moves it for both techs. Moving one job never pulls anyone earlier: stops after it move later only if they must. Suggestions only use gaps, so they never move anyone.
- **Where a pool is:** looked up from its address when a job is made (with a key), or marked exactly with Mark Location Here at the pool (phone GPS, free). Either is kept with the address it belongs to; a changed address is looked up again. The shop's location comes from its address or Use My Location at the shop.
- **Working day** 8:00 AM to 5:00 PM, Monday to Friday, jobs 2.5 hours unless booked longer; arrival windows off (exact time). All in Settings › Scheduling. On My Way texts come from the tech's own phone with now plus the drive.
- **Addresses are the link to directions** (owner: no separate button; keep pages short). Every address links to `/maps`, which picks the app on the server so it never changes after the page loads: the device's choice (More › Directions open in: Automatic, Apple Maps, Google Maps), else Apple Maps on iPhone, iPad, and Mac and Google Maps elsewhere. The field app uses Apple Maps on iPhone and the default maps app on Android. A whole day opens in Google Maps (Apple Maps links take one stop), and its button says so.
- **Weather on Today** comes from the shop's zip code, never the device's location (owner): the zip is turned into a point by Zippopotam.us (GeoNames data), and the forecast comes from the National Weather Service (free, no key, US only). It shows the temperature now, the conditions, and today's high, and refreshes at most every half hour. If either service is down, the weather is simply left off.
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
