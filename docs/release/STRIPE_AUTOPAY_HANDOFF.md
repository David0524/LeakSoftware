# Stripe: two webhook events for autopay (Claude in Chrome)

Paste everything below the line into Claude in Chrome while you're signed in to Stripe
(https://dashboard.stripe.com) as the Sundeck Pro platform account's owner. When it finishes,
paste its report back to Claude Code.

Why (2026-11-16): autopay charges a customer's saved card or bank account by itself. A card
payment answers at once, but a bank (ACH) payment takes a few business days, and Stripe tells the
website how it ended only through the `payment_intent.succeeded` and
`payment_intent.payment_failed` events. The website already handles both
(`apps/web/src/server/autopay.ts`, `autopayEvents`); Stripe just isn't sending them yet. Until it
does, a bank autopay stays "processing" forever. Cards work either way.

---

You're adding two events to a webhook in Stripe for my company, **Sundeck Pro**
(sundeckpro.com). Shops that use Sundeck Pro connect their own Stripe accounts to ours, and
Stripe sends what happens on those accounts to our website. The goal is to make Stripe also send
two payment events. Nothing else about payments should change.

## Rules

1. Only add events. Don't remove an event, delete or disable a webhook (Stripe may call it an
   "event destination"), change its URL, or create a new one unless Step 2 says so.
2. Never reveal, copy, roll, or regenerate a **signing secret** (`whsec_…`), API key, or
   password. If a page shows one, don't copy it into your report. If anything asks you to roll
   a secret, stop and ask me: rolling it would break every payment on the site.
3. Don't change payouts, bank accounts, payment methods, branding, Connect settings, or anything
   on a connected account.
4. Before each change, copy the current list of events **word for word**. After it, copy the new
   list.
5. If a page isn't where these steps say (Stripe moves things), look nearby, then tell me where
   you found it, or that you couldn't.

## Step 1: Find the webhooks

1. Make sure you're in **live mode**, not test mode or a sandbox (the switch or account picker
   is at the top of the dashboard). Do Steps 1 to 3 in live mode first.
2. Open **Developers › Webhooks** (newer dashboards: **Workbench › Webhooks**, or **Event
   destinations**).
3. List every webhook endpoint. For each one, give:
   - its URL,
   - whether it listens to **Your account** or **Connected accounts** (Stripe may say "Events
     from: Your account / Connected and v2 accounts"),
   - its status (enabled or disabled),
   - its API version, if shown,
   - every event it listens to, word for word.

We expect two endpoints, both pointing at `https://sundeckpro.com/api/stripe/webhook`: one for
**Your account** (our own subscriptions) and one for **Connected accounts** (the shops' customer
payments). The second one is the one to change.

## Step 2: Add the events to the Connected accounts endpoint

On the endpoint that listens to **Connected accounts** and points at
`https://sundeckpro.com/api/stripe/webhook`:

1. Open it and choose **Update details** / **Edit destination** / **Select events** (whichever
   the page offers).
2. Make sure all six of these are selected. Add any that are missing; leave the ones already
   there, and leave every other event as it is:
   - `payment_intent.succeeded` (new for autopay)
   - `payment_intent.payment_failed` (new for autopay)
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `account.updated`
3. Save.

If there is **no** Connected accounts endpoint, or it points at a different URL, don't create or
change anything: stop and tell me what you see.

## Step 3: Check it took

1. Open the endpoint again and copy its full event list.
2. If the page shows recent deliveries, copy the last five: the event type, when, and the
   response code (we expect 200s). Don't open or copy any event's contents.

## Step 4: Test mode (only if it exists)

Switch to **test mode** (or the sandbox the account uses). If it has a webhook for **Connected
accounts** pointing at `https://sundeckpro.com/api/stripe/webhook` or a `vercel.app` address,
repeat Steps 2 and 3 there. If it has none, don't create one; just say so.

## Report

Send back:
- Every endpoint from Step 1: URL, Your account or Connected accounts, status, API version, and
  its events (live mode, then test mode).
- For each endpoint you changed: the event list before and after, word for word.
- The recent deliveries from Step 3.
- Anything you couldn't find or didn't change, and why.
