# Email Customers (mass email)

Owner, 2026-10-22: "send mass email (with some filtering)". A shop's owner or admin sends one
email to many of their customers at once. Same screen, wording and behavior on the desktop
website, the phone website, the iPhone app and the Android app.

## Where

- **Customers** gets an **Email Customers** action, for owners and admins only (techs never see
  it, and the server refuses them):
  - websites: a pill button by the title ("Email Customers"); on phones it sits under the title
    with the page's other controls;
  - iPhone: an envelope button in the navigation bar (named "Email Customers" for VoiceOver);
  - Android: the same envelope in the bar.
- It opens a pushed page, **Email Customers** (large title, back to Customers). Not a sheet:
  it holds a short history too, and composing is more than one quick step (`sheets.md` ›
  Best practices: complex flows deserve their own view).

## The page, top to bottom (inset grouped)

1. **To**
   - **Show**: the Customers page's own Show choices (All Customers; On a Plan and No Plan for
     pool care shops; Homeowners, Pool Companies, Builders, Insurers, Property Managers, Other).
   - **City**: Any City, then each city the shop's pools are in (A to Z).
   - **Last Job**: Any Time | Last 30 Days | Last 90 Days | Last Year (a job at one of their
     pools or billed to them, not canceled, done or scheduled in that window and not in the
     future).
   - Footer, live: "**42 customers with an email.** 5 left out: 3 without an email, 2
     unsubscribed." (Counted by the server, so every platform says the same number.)
2. **Message**
   - **Subject** (one line, up to 150 characters).
   - **Message** (plain text, up to 10,000 characters).
   - Footer: "Write {first name} to use each customer's first name. Every email ends with your
     shop's name, mailing address and an unsubscribe link."
3. **Buttons**: **Send to 42 Customers** (filled blue; "Send" when the count is 0, disabled), and
   **Send Test to Me** (tinted pill) under it.
4. **Sent**: earlier mass emails, newest first: subject, then "Oct 22 · Sent to 40 · 2 didn't
   go". "No emails sent yet." when empty.

Send asks first, as an alert (`alerts.md`: an action that can't be undone gets a Cancel):
"**Send to 42 customers?**" / "“Fall opening special” goes out now from Demo Leak Co. It can't be
unsent." with **Cancel** and **Send**. After: a green notice "Sent to 42 customers." (or "Sent
to 40 customers. 2 didn't go.") and the history row appears. The form clears.

**Send Test to Me** sends the email to the signed-in person's own address, subject prefixed
"Test: ", {first name} filled with their own first name; "Test sent to dana@example.com."

## What stops a send (said plainly, never a silent no-op)

- **No connection** (apps): "Sending needs a connection. Try again when you have signal." The
  form keeps what was typed. On the website the usual offline guard says the same.
- **No mailing address** in Settings › Company: a notice at the top, "Add your shop's mailing
  address in Settings › Company first. The law asks for it in every email like this."; both send
  buttons are disabled.
- **Daily email limit** (`DAILY_LIMIT_EMAIL`, 300 a day per shop, shared with reports and
  invoices): when the list is bigger than what's left today the footer says "Your shop can send
  258 more emails today. Narrow the list or send the rest tomorrow." and Send is disabled.
- **Read-only shop**: the usual "This shop is read-only until its Sundeck Pro subscription is
  paid."
- Empty subject or message: under the field, "Add a subject." / "Write a message."

## The email (CAN-SPAM)

- From "{Shop} via Sundeck Pro" <news@send.sundeckpro.com>; **Reply-To the shop's email**.
- Body: the message, with {first name} filled in (the first word of a homeowner's or "Other"
  customer's name; "there" for pool companies, builders, insurers and property managers, or
  when there's no name), as plain text and simple HTML (paragraphs, links not added).
- Footer on every one: "{Shop} · {street, city, state ZIP}" and "You're getting this because
  you're a customer of {Shop}. Unsubscribe: {link}".
- Headers: `List-Unsubscribe: <https://sundeckpro.com/api/unsubscribe/{token}>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so Gmail and Apple Mail show
  their own one-tap Unsubscribe.

## Unsubscribe

- The link opens `/unsubscribe/{token}` on the public site (always light, no sign-in): "Stop
  emails from Demo Leak Co.?" / "You'll stop getting news and offers, reminders and review
  requests from Demo Leak Co. You'll still get reports, quotes, invoices and receipts." with one
  **Unsubscribe** button. After: "You're unsubscribed. Demo Leak Co. won't send you emails like
  this again." One button rather than unsubscribing on open, so mail scanners that open links
  can't unsubscribe people; the header above is the true one-click.
- It sets the customer's existing `marketing_opt_out` (the one switch that already stops
  reminder and review emails, and that the office can turn back on in the customer's details).
  Unsubscribed customers are left out of every later mass email; reports, quotes, invoices and
  receipts still go.

## Sending (server)

- Everything goes through the website's server: the website's own actions, and the apps' calls to
  `/api/mass-email` (GET: cities, address, allowance and history), `/api/mass-email/count`,
  `/api/mass-email/test` and `/api/mass-email/send`, with the bearer sign-in the apps already
  use (Request a Feature, report sending).
- The send claims the allowance for every recipient, then `start_email_campaign` writes the
  campaign and one row per recipient (each with its own unsubscribe token) in one transaction,
  checked against the count the person confirmed ("The list changed. Check the count and send
  again." if it moved). Email goes through Resend's batch endpoint, 100 per request, about two
  requests a second (Resend's default rate), retrying a 429 once. Each recipient's result is
  recorded; the campaign's sent and failed counts come from them.
- Without `RESEND_API_KEY`, `EMAIL_OUTBOX_DIR` gets one file per email (tests, local).

## Data

Two server-only tables (owners and admins read them; only the server writes; phones never sync
them, they ask the API): `email_campaign` (subject, message, the filter used, who sent it, counts,
status) and `email_campaign_recipient` (customer, address, status, Resend id, error, unsubscribe
token). Migration `20261022001500_mass_email.sql`.

## Open for the owner

- One unsubscribe switch for mass emails, reminders and review requests (reuses
  `marketing_opt_out`), rather than a second one just for mass emails.
- Mass emails share the 300-a-day email allowance with reports and invoices. A shop with 800
  customers can't email them all in one day; raising `DAILY_LIMIT_EMAIL` (or a separate
  allowance for mass email) is a setting, not code.
- No scheduling, pictures, or formatting beyond paragraphs for now.
