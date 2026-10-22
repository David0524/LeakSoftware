# Admin portal (Sundeck Pro staff)

Owner, 2026-10-22: "Build a desktop-only Admin portal. Analytics, customer data, finances, Admin
access to customer accounts for tech help, etc. Make this elaborate and be comprehensive. … Make
the admin sign in at the bottom of the landing page near terms and stuff."

This is Sundeck Pro's own back office: who our customers (shops) are, how the business is doing,
and the tools support needs to help a shop. It is not a shop's office. It replaces the three loose
staff pages (`/admin/leads`, `/admin/requests`, `/admin/import`) with one portal around them.

## 1. Who gets in, and how

- **Staff** stay the emails in `SUNDECK_STAFF_EMAILS` on Vercel (decided 2026-10-16; kept out of
  the public repository). Nothing about staff is stored in the database except what they did.
- **Two-step sign-in is required for every portal page** (it already is for Leads). A staff
  session without the code sees "Turn on two-step sign-in" and nothing else.
- **Admin Sign In** in the landing page footer, next to Privacy, Terms, Security, Status. It opens
  the usual sign-in with `next=/admin`; the portal checks staff and two-step. Anyone else who
  signs in there lands in their own office as usual, so the link reveals nothing.
- **Desktop only** (owner): the portal is laid out for a computer (1024 px and wider). On a
  narrower window it shows one message, "The admin portal is made for a computer. Open it on a
  screen at least 1024 pixels wide.", and no data. It is not in the iPhone or Android apps, and
  has no phone layout. This is the exception the owner named to "every update ships on all four
  platforms".
- Every page is `noindex` and dynamic (never cached).

## 2. Layout (desktop, iOS/macOS conventions)

From the apple-design skill (`designing-for-macos.md`, `sidebars.md`, `lists-and-tables.md`,
`charting-data.md`):

- **A sidebar** on the left, always shown: Overview, Shops, People, Finances, Support, Health,
  Leads, Feature Requests, Activity Log. The staff person's email and Sign Out at the top right
  of the toolbar, not at the bottom of the sidebar ("avoid putting critical information or actions
  at the bottom of a sidebar").
- **Large title** on each page, with a one-line subtitle, as the office does.
- **Tables** for lists: sortable column headers (click again to reverse), alternating row tint,
  a search field over the table, and segmented controls for 2 to 5 filters (All · Trial ·
  Paying · Past Due · Canceled). Rows open a detail page.
- **Stat cards** (`.card`) for numbers, with the period they cover; **simple bar and line
  charts** in our own SVG, as the owner dashboard already does (no chart library), each with an
  accessible table of its values.
- Brand tokens only; light and dark follow the office's Appearance setting.

## 3. Pages

### 3.1 Overview (`/admin`)
The business at a glance:
- **Shops:** total, trialing, paying, past due, canceled, demo (access code), each a link to the
  filtered Shops list.
- **Monthly revenue (MRR)** from paying shops: each shop's price from `packages/core/src/plans.ts`
  and its active people, the same rule billing charges. **ARR** = MRR × 12. Change from 30 days
  ago.
- **Signups:** new shops per week for 12 weeks (bar chart); trial-to-paid conversion for shops
  whose trial ended in the last 90 days.
- **Active use:** people who signed in in the last 7 and 30 days; shops with a finished job in
  the last 7 days; jobs finished per week across all shops (line chart).
- **Money through shops (payment volume):** card and bank payments shops collected through
  Sundeck Pro (Stripe Connect), this month and last.
- **Needs attention:** trials ending in the next 7 days, past-due shops, shops that signed up but
  never finished a job, leads not called.

### 3.2 Shops (`/admin/shops`, `/admin/shops/[id]`)
- **List:** shop name, package (Pool Maintenance, Leak Detection, both), status, people, monthly
  price, signed up, last active, jobs in the last 30 days. Search by name, email, phone, or owner.
  Filters: All · Trial · Paying · Past Due · Canceled. Export CSV.
- **Shop page**, in sections:
  - **Summary:** status pill, package, price, owner name, email and phone (call and email
    buttons), address, time zone, signed up, onboarding done.
  - **Subscription:** status, trial end, period end, demo code used, Stripe customer and
    subscription (links to the Stripe dashboard), card required. Actions: **Extend Trial**
    (7, 14, 30 days), **Make Demo Shop** / **End Demo**.
  - **Payments setup:** Stripe connected account, charges and payouts enabled, details submitted;
    link to it in Stripe.
  - **Team:** each person's name, email, role, on/off, last sign-in, two-step on, apps they use
    (from `push_device`), last seen. Actions per person below (3.3).
  - **Usage:** customers, pools, jobs (open, done this month, all), reports sent, quotes and
    acceptance rate, invoices and money collected, photos and storage used; today's metered
    allowances (emails, AI drafts, transcription, texts, calls) against their limits.
  - **Recent activity:** the shop's own activity feed (last 50), so support sees what happened.
  - **Problems:** failed emails and texts in the last 30 days.
  - **Staff notes:** a running note per shop (who wrote it, when), like the Leads notes.
  - **Support:** Open Shop (3.5), and the shop's support history.

### 3.3 People (`/admin/people`, `/admin/people/[id]`)
Every account across shops: name, email, shops and roles, signed up, last sign-in, two-step,
apps. Search by name or email. A person's page has their shops and devices, plus support
actions, each needing a reason and each logged:
- **Turn Off Two-Step** for someone who lost their phone: removes their authenticator factors and
  clears `profile.two_step` (today this is a manual SQL step in HANDOVER). Asks "I checked it's
  really them" and how, first.
- **Waiting invites** with Copy Link (the app doesn't email invites; the owner sends the link).
- **Send Password Reset** (added 2026-10-22 with Forgot Password?): the person's own reset
  email, to their own address; logged.

### 3.4 Finances (`/admin/finances`)
- MRR, ARR, average revenue per shop, paying shops, by package (cards and a 12-month MRR line
  rebuilt from subscription history; see 5.3).
- **Subscriptions table:** shop, package, people, price, status, next charge, trial end. Filters
  as Shops. Export CSV.
- **Churn:** shops canceled this month and last, with their price.
- **Trials ending** in the next 14 days and **past due** shops, with call buttons.
- **Payment volume** shops collected through Stripe Connect, by month (cards and bank), and
  refunds and failed payments.
- What Stripe actually billed (Sundeck Pro invoices) stays in the Stripe dashboard, linked from
  here; the portal shows what the database knows, so it works without calling Stripe.

### 3.5 Support access to a shop ("Open Shop")
Staff open a shop's real office (the same pages the owner sees) to help. Built on the database's
row security, not by signing in as the owner, so every change shows as the staff person's:
- **Start:** on a shop's page, **Open Shop** asks for a **reason** (required, e.g. "Owner can't
  find last week's invoice, call 10/22"), **how long** (30 min, 1 hr, 2 hr), and **access**:
  **View Only** (default) or **Can Make Changes**.
- The portal records a `support_session` and the office opens on that shop. **A banner across
  the top of every office page**: "Support: viewing Blue Wave Pools · View Only · ends 3:45 PM ·
  End Session".
- **What staff can do there:** what a shop **admin** can (never owner-only things: billing,
  Stripe, roles, deleting the shop). With View Only, nothing can be changed: the database refuses
  any write from a view-only session, as it does for an unpaid shop, and the website refuses its
  actions. Staff never appear in the shop's Team, schedule, seats, notifications, or call
  ringing, because they get no membership.
- **Ends** at the time chosen, or with End Session, or when another session starts. An expired
  session simply stops working (the database checks the time on every query).
- **Logged:** start, end, reason, access, and every change through the shop's normal history.
- **Support list** (`/admin/support`): sessions open now, and the full history (who, shop,
  reason, access, started, ended).

### 3.6 Health (`/admin/health`)
For tech help across shops: the `/status` checks (database, email, payments configured); failed
emails and texts in the last 24 hours by shop; Stripe webhook events that failed; shops at or near
a daily allowance today; Mapbox budget used this month.

### 3.7 Leads, Feature Requests, Import
The existing pages, moved inside the portal's sidebar. Feature Requests gets a search field and
links the asking shop to its Shop page.

### 3.8 Activity Log (`/admin/activity`)
Every staff action: who, what (opened a shop, extended a trial, turned off two-step, sent a reset,
made a demo shop, wrote a note, exported a CSV), which shop or person, the reason, when. Nothing
in it can be edited or deleted, including by staff.

## 4. Security

- All portal data is read on the server with the service role, after `isStaff` and `aal2` are
  checked in one place (`requireStaff()`), so no staff data API is open to the browser.
- Each portal query is a SQL function executable only by `service_role` (pgTAP checks that
  `authenticated` and `anon` can't run them).
- Support sessions: rows are written only by the server. The database's membership checks
  (`app.member_companies()`, `app.is_member()`, `app.manager_companies()`, `app.is_manager()`,
  `app.all_jobs_companies()`) also accept an **open support session of the signed-in user whose
  token passed two-step**; `app.is_owner()` and `app.owner_companies()` never do.
  `app.guard_writable()` (the read-only lock) refuses writes from a View Only session.
- pgTAP: a staff user with no session sees nothing; with a session sees that shop only; an
  expired or ended session sees nothing; without two-step sees nothing; View Only can't write;
  Can Make Changes writes like an admin and can't do owner-only things; the staff user never
  appears among the shop's members.
- Every staff action writes `public.staff_action` in the same request; CSV exports are logged too.
- In View Only, the proxy also refuses the website's own changes (server actions and `/api/`
  writes, which may use the server's key). Sign Out and End Session are plain form posts, so they
  still work; switching shops waits until End Session.

## 5. Data

One migration (`20261022000700_admin_portal.sql`). The tables use `company_ref`, like
`feature_request`: they are staff tables, not shop tables, readable only by the server, and never
sync to devices:

1. `public.support_session` (id, `company_ref`, staff user, staff email, reason, access
   `view|edit`, started, ends, ended, ended by). Readable by the signed-in staff user only for
   their own open sessions (the office reads it to show the banner); written only by the server.
2. `public.staff_action` (id, staff user and email, action, `company_ref`, target user, reason,
   details jsonb, at). Insert-only.
3. `public.shop_note` (id, `company_ref`, staff, text, at).
4. **Subscription history:** `public.subscription_event` (company, status, price cents, people, at)
   written by a trigger whenever `subscription` changes, so MRR over time and churn can be drawn.
   History starts on the day this ships; earlier months show what can be rebuilt (signup and
   cancel dates).
5. Functions for the pages (service role only): `admin_overview()`, `admin_shops()`,
   `admin_shop(id)`, `admin_people(search)`, `admin_person(id)`, `admin_finances()`,
   `admin_health()`. Prices are worked out in TypeScript from `plans.ts`, not duplicated in SQL.

## 6. Build order

Each step is committed, checked, and shipped on its own (owner, 2026-10-21):

1. **Shell:** `(staff)` layout with the sidebar and the desktop-only message, `requireStaff()`,
   Admin Sign In in the landing footer, Leads, Feature Requests and Import moved in, the Activity
   Log table and page.
2. **Shops and People:** list and detail pages, notes, CSV export, Extend Trial, Make Demo Shop,
   Send Password Reset, Turn Off Two-Step, Resend Invite.
3. **Overview and Finances:** the numbers, charts and subscription history.
4. **Support access:** the migration's membership checks, the office banner, View Only, the
   Support list, pgTAP for every case in section 4.
5. **Health.**

Tests: pgTAP for the SQL (functions refused to `authenticated`, numbers on a made-up set of
shops, every support-session case); Vitest for the price and MRR math and `requireStaff`;
Playwright at 1280 × 800 for the portal and at 390 wide for the desktop-only message; screenshots
looked at before reporting.

## 7. Decisions (owner, 2026-10-22)

1. **Staff open a shop without asking it, silently:** a written reason is required and every
   session is in the portal's Support list and Activity Log; the shop isn't emailed.
2. **Access is chosen per session:** View Only (the default) or Can Make Changes; never the
   owner-only things.
3. **Money actions:** Extend Trial and Make Demo Shop / End Demo on a shop's page. Finances is
   read-only; anything else is done in the Stripe dashboard.
4. **The footer link says "Admin Sign In".**
5. Shops don't see a log of support visits (not asked for; it would be a four-platform screen).
