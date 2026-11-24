# Standalone quotes and the Quotes list (2026-11-24)

Owner: "Implement a feature where we can send a quote and have the customer agree/decline", then
"It's more about having the ability to send quotes more often. Also instead of creating a full
job, we should be able to just create a quote for a new/existing customer."

Owner's answers: store it as a hidden quote-only job; New Quote in the + menu, on the customer
page and in a new Quotes list; pool optional; no customer Decline button for now.

Ships on all four platforms with the same words and behavior. Words and rules live in
`packages/core/src/quote-list.ts` (Swift copy `SundeckCore/QuoteList.swift`).

## Data (migration `20261022005700_standalone_quotes.sql`)

- A standalone quote is a **quote job** plus its quote: `job.type = 'repair'`,
  `job.status = 'quote'`, the customer in `bill_to_customer_id`, `property_id` optional (null
  allowed only while `status = 'quote'`), `assigned_user_id` = the person making it when they
  are a tech (so a tech limited to their own jobs still sees it), otherwise null.
- A quote job has **no job number** until it becomes a job.
- Status `quote` is a valid starting status; only the server moves it on (`quote → unscheduled`).
  People get no status buttons for it (`userTransitions("quote") = []`).
- **Accepting** (customer link or on-site signature, both through `app.accept_quote`): the quote
  job itself becomes the repair job: its pool, or the customer's newest pool, `unscheduled`, a
  job number, "Repair from quote #N" in its notes, and `quote.repair_job_id` = its own id. No
  second job is made. Quotes on ordinary jobs work as before.
- **Accepted with no pool** and the customer has none: the quote is accepted and the job stays
  a quote job. The Quotes list shows "Accepted. Add a pool to schedule the repair." Setting the
  job's `property_id` (the Quote screen's Add Pool) turns it into the unscheduled, numbered
  repair job (trigger `a_quote_job_gets_pool`).
- Hidden from: the dashboard's job counts (`owner_dashboard`), search's jobs (`search_candidates`
  still finds its quote), Activity (except "quote accepted").
- Phones write New Quote through the sync layer in one batch: customer (if new), property (if
  new), the quote job, the quote. No device migration (rows are JSON).

## Hidden from every job list (each platform)

Leave out `isQuoteJob(job)` (`status === "quote"`) in: the Jobs list, Schedule, Today, Needs a
Time, Plan Week and routes, customer page visits/history, a customer's last visit, getting
started counts, pool history, end of day, search's Jobs group (its Quotes group stays), and the
office Jobs list on the website. The Quotes list and the Quote screen show them.

Opening a quote job's job page (an old link, Activity) goes to its Quote screen instead.

## Screens (iOS conventions on all four platforms)

### Quotes list
- Large title **Quotes**. In More, right after Invoices (phones and the website's More; the
  desktop's More menu after Invoices).
- Segmented control **Draft | Sent | Accepted | Declined** (`QUOTE_SEGMENTS`), opening on Sent.
  Expired quotes are under Declined, labeled Expired.
- Search field ("Search Quotes"): customer name, quote number, job number (`filterQuotes`).
- **New Quote** button in the navigation bar (a + on phones, labeled "New Quote" for
  accessibility), shown to people who can make jobs (`canMakeJobs`).
- Every quote in the shop (standalone and on jobs), newest first. Row: customer name, then
  `quoteRowDetail` ("Quote #1043 · $1,250.00"), the status pill (`QUOTE_STATUS_LABELS`), and for
  a waiting one `QUOTE_NEEDS_POOL` in secondary text. Tap opens the Quote screen.
- Empty: `QUOTES_EMPTY[segment]`, or `QUOTES_EMPTY_SEARCH` while searching.

### New Quote
- Title **New Quote** (a page on the website, a pushed screen on the phones, like New Job).
- **Customer** section: pick an existing customer (the same picker as New Job) or a new one
  (Name, Phone, Email). Opened from a customer page, that customer is already picked.
- **Pool** section, header "Pool (Optional)": the picked customer's pools to choose from, or a
  new address (Street, City, State, ZIP). Footer: "Leave the address blank to quote without
  one."
- Primary button **Create Quote**. Errors from `validateNewQuote`.
- Saving writes `newQuoteRecords` and opens the Quote screen in place of New Quote.

### Quote screen
- Title `quoteTitle(number)` ("Quote #1043", or "Quote" before the server numbers it).
- A grouped list at the top: **Customer** (name; opens the customer page), **Pool** (address, or
  for a quote job with none, an **Add Pool** row that picks one of the customer's pools or adds
  an address, writing `job.property_id`), and **Job** ("Job #1050", opening the job page) when
  the quote is on an ordinary job or has become the repair job.
- Then the same quote builder and sent-quote card the job page uses (lines, price book,
  discount, totals, Send Quote, customer link, Customer Signs Now, accepted text).
- For a draft standalone quote, **Delete Quote** (destructive, at the bottom) asks "Delete this
  quote?" with Delete / Cancel, then soft-deletes the quote and its quote job and goes back.

### Entry points
- Wherever a **New Job** + is today (website desktop pill and phone +; iPhone's New Job toolbar
  button on Jobs, Schedule, Today; Android's New Job header button on the same screens) it
  becomes a menu with **New Job** and **New Quote** (a menu on iPhone and the desktop website,
  an action sheet on the mobile website and Android). Same visibility rule as New Job.
- The customer page gets a **New Quote** button (a pill under the contact buttons).

### Repair job from a standalone quote
Its job page shows its quote (the quote's `job_id` is the job itself) in the place job pages show
quotes, read-only as for any accepted quote.

## Old app versions
Installed apps that predate this read status `quote` as unknown. They don't show these jobs in
Needs a Time (that takes `unscheduled`), but may list them in the Jobs list's All filter until
updated.
