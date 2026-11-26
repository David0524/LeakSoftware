# Second business name and the tech on reports (2026-11-26)

Two ideas from Cole (pilot shop: Nick), passed on by the owner with "Plan and implement these":

1. "He runs the pool service company and leak detection company as two different names and
   logos ... for companies who pay for both service and leak accounts, we can allow them the
   option to add a secondary company name, logo, and info. That way when they send reports,
   invoices, etc, they can have the proper company name attached to it." Repairs: "If the
   repair comes from one, he sticks with that one. If they call just for a repair he usually
   uses All In Pool Solutions, the pool service name. So maybe that would be his default, and
   then Southern Nevada Leak Detection is his secondary."
2. "Profile picture for each tech. At the bottom of the report, it should say 'your pool was
   serviced by Brian' and then a picture of his face. Owner should have option to have this on
   or off."

Both features ship on all four platforms with the same words. Words and rules are in
`packages/core/src/business.ts` (Swift copy `SundeckCore/Business.swift`, checked by the
`business` fixtures).

## 1. Second business

### Who gets it
Only shops whose Services setting is **Both** (they pay for pool care and leak detection). With
Pool Care or Leak Detection alone, the section is hidden and any saved second business is
ignored everywhere (`hasSecondBusiness`). Turning Both back on brings it back as it was.

### Data (migration `20261022005900_second_business.sql`)
- `company.second_name`, `second_logo_path`, `second_phone`, `second_email`,
  `second_review_url`, `second_brand_primary` (hex, optional), and `second_for`
  (`'leak'` or `'pool'`, default `'leak'`): the line of work the second name is for. These sync
  to phones and owners and admins write them like the other company columns.
- `job.business`: `null` (automatic), `'main'`, or `'second'`. Anyone who can edit the job can
  set it. It syncs like the job's other columns.

### Which name a job uses (`jobBusiness`, SQL `app.job_business`)
1. No second business (not Both, or no second name): the main business.
2. The job's own choice (`job.business`), when set.
3. Leak detection and pool inspection jobs: leak detection work. Pool visits (maintenance):
   pool care work. The second business when its "Use For" matches, else the main one.
4. A repair follows the job it came from (`parent_job_id`), as Nick does. A repair with no
   source job (a call just for a repair, or a standalone quote) uses the main business.

So for Nick: main = All In Pool Solutions, second = Southern Nevada Leak Detection, Use For =
Leak Detection. Leak detection jobs and their repairs say Southern Nevada Leak Detection;
everything else says All In Pool Solutions.

What the second business shows (`businessIdentity`): its name, its logo (none if it has none;
never the main logo), its phone, email and review link (each falls back to the main one when
blank), its main color (falls back to the main color). The address, timezone, legal name and
report terms stay the shop's. (The footer shows the second name, not the main legal name.)

### Where it applies
Everything the customer sees about a job:
- Reports (leak, repair, inspection, visit, monthly): the snapshot's `company` is the job's
  business when the report is made, so a sent report keeps it. A monthly report takes its
  latest visit's (pool care work).
- Quote and invoice pages, receipts, their PDFs and link previews; invoice and receipt emails
  ("{Business} via Sundeck Pro", replies to the business's email); quote and invoice reminders
  and review requests (the business's review link); the feedback page; the Stripe checkout
  line ("Invoice #1042 · Southern Nevada Leak Detection").
- Texts the phones and website write for a job: the report, quote and invoice share texts,
  On My Way, Skip Visit, and the signature statement.
- Things not tied to one job use the business for pool care work, since they are about the
  service account: Request Card on File and autopay. Mass email, the shop's texting line,
  Stripe's own account name (it shows on card statements) and Sundeck Pro billing stay the
  main business.

### Screens
- **Settings › Company and Branding**, new section **Second Business** after the logo (Both
  only): Business Name, Logo (Choose Logo / Remove Logo), Main Color (filled from its logo as
  the main logo's is), Phone, Email, Review Link, and **Use For** as a segmented control
  `Leak Detection | Pool Care`. Footer: `SECOND_BUSINESS_FOOTER`. Saved with the page's one Save.
  Leaving the name blank turns the second business off.
- **Job page › Details**, a **Business** row under Assigned to (only with a second business):
  shows the job's business name; tapping offers both names (a pop-up menu on the website and
  iPhone, an action sheet on Android) with a check on the current one. Footer under it while
  automatic: none. Choosing writes `job.business`.

## 2. The tech on reports

### Data (same migration)
- `membership.photo_path`: the member's photo in this shop, in `company-assets` at
  `{company}/team/{user}-{time}.jpg` (a new name per upload, so sent reports keep theirs).
- `public.set_member_photo(target_member uuid, path text)`: owners and admins for anyone in the
  shop, everyone for themselves. Null removes it. The path must be under `{company}/team/`.
  Members may upload only their own (`{company}/team/{their id}-...`); owners and admins any.
- `company.settings.tech_on_reports` (default off).

### On the report
When the setting is on when the report is made, the snapshot keeps `tech_card`:
`{"techs": [{"name", "photo_path", "color"}]}` for the job's tech and second tech (a monthly
report: its latest visit's). The report ends, above the terms, with a centered card:
round photos (72 pt; without a photo, the first initial on the tech's team color) and
`techCardLine`:
- Pool visits and monthly reports: "Your pool was serviced by Brian"
- Leak detection: "Your leak detection was done by Brian"
- Pool inspection: "Your pool inspection was done by Brian"
- Repair: "Your repair was done by Brian"
Two techs: "Brian and Cole". No printable name (an email as the name): no card.

### Screens
- **Settings › Reports**: a switch **Show the Tech on Reports**, footer: `TECH_CARD_FOOTER`.
- **Settings › Team**, each member: a **Photo** row (owners and admins): Add Photo / Change
  Photo / Remove Photo. The photo is cropped square in the center and saved at 512 px.
- **More › My Profile** (everyone): **Your Photo**, same actions, footer `MY_PHOTO_FOOTER`.

## New Job and New Quote (owner, 2026-11-26: "Yeah add the picker")
- With a second business, New Job has a **Business** row right after the job type, and New
  Quote one right after the customer, built like the job page's row. It starts on the automatic
  choice (New Job: by the picked job type, following it until the person picks; New Quote: the
  main business) and saves `job.business` only when the person picks one, so an untouched job
  stays automatic. A maintenance plan (repeating visits) has no row: its visits are pool care.

## Not now
- Separate Stripe accounts or texting numbers per business.
