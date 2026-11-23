# Add `invoice.paid` to the live Sundeck Pro webhook (Claude in Chrome)

Paste everything below the line into Claude in Chrome. Have one tab signed in to Stripe first
(https://dashboard.stripe.com, the Sundeck Pro account's owner). It takes a few minutes and needs
no secret values from you. When it finishes, paste its report back to Claude Code.

Why (owner, 2026-11-23): referral codes give the referring shop a free month once the shop it
referred makes its first real payment. The website learns about that payment from Stripe's
`invoice.paid` event on the **Sundeck Pro** webhook (events from Your account). The live webhook
was made before this feature, so it doesn't send that event yet, and referring shops get nothing
until it does. Nothing else changes: same endpoint, same signing secret, no Vercel changes.

---

You're adding one event to an existing webhook in my company's Stripe account, **Sundeck Pro**
(sundeckpro.com). Shops pay us a monthly subscription through this account. Work carefully: this
webhook is how the site learns that shops have subscribed and paid.

## Rules

1. Never reveal, copy, type, roll, or delete a **secret key** (`sk_live_…`, `rk_live_…`) or a
   **signing secret** (`whsec_…`), and never put one in your report. Don't open "Reveal" on
   anything.
2. Change only the event list of the one webhook named below. Don't create, delete, disable,
   or change the URL or API version of any webhook, and don't touch the **Sundeck Pro
   Customers** webhook (events from Connected accounts), the sandbox, test mode, any connected
   account, products, prices, or payouts.
3. Before the change, copy the webhook's event list **word for word**. After it, copy it again.
4. If something isn't where these steps say (Stripe moves things), look nearby, then tell me
   where you found it, or that you couldn't. If Stripe warns about anything other than adding an
   event, stop and ask me.

## Step 1: Find the webhook

1. In Stripe, make sure you're in **live mode** (the account picker at the top says Sundeck Pro,
   not "Sundeck Pro sandbox", and there's no "Test mode" banner).
2. Open **Developers › Webhooks** (newer dashboards: **Workbench › Webhooks** or **Event
   destinations**).
3. Find the destination whose URL is `https://sundeckpro.com/api/stripe/webhook` and that
   listens to events from **Your account** (not Connected accounts). Its name is probably
   **Sundeck Pro**. If there are several matches, or none, stop and tell me what you see.
4. Copy its ID (`we_…`), status, API version, and full event list.

## Step 2: Add `invoice.paid`

1. If `invoice.paid` is already in the list, change nothing and go to the report.
2. Otherwise choose **Edit destination** (or "Update details" / "Select events"), search for
   `invoice.paid`, tick it, and leave every other event ticked as it was. Don't tick anything
   else (not `invoice.payment_succeeded` or other invoice events).
3. Save. Copy the event list again and check it is the old list plus `invoice.paid`, nothing
   more, nothing less.

## Step 3: Check delivery

1. On the same webhook, look at recent deliveries (**Event deliveries** / **Logs**). Note the
   response codes of the last few (200 is good). Don't resend anything and don't send a test
   event.

## Report

Send back:
- The webhook's ID, name, status, API version.
- Its event list before and after.
- The last few deliveries' event types and response codes.
- Anything you skipped or couldn't find, and why.
