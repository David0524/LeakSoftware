# Switch sundeckpro.com to Stripe live mode (Claude in Chrome)

Paste everything below the line into Claude in Chrome. Have two tabs signed in first: Stripe
(https://dashboard.stripe.com, the Sundeck Pro account's owner) and Vercel (https://vercel.com,
team **drudd524-4205's projects**). Stay at the computer: Step 5 needs you to copy four secret
values yourself. When it finishes, paste its report back to Claude Code.

Why (2026-11-16): the site has run on the "Sundeck Pro sandbox" since the pilot (DECISIONS,
2026-10-18: live mode waited for the business registration, which is done). Nothing in the code
or the apps changes: prices are built from `packages/core/src/plans.ts`, so there are no price IDs
to recreate, and the iPhone and Android apps hold no Stripe keys. What changes is Stripe's live
account setup, two live webhooks, and four Vercel variables. Afterwards Claude Code clears the
demo shop's sandbox Stripe account from the database (no real shop has one) and checks the site.

---

You're switching my company's website, **Sundeck Pro** (sundeckpro.com), from Stripe's sandbox
to Stripe **live mode**, so real money moves. Shops that use Sundeck Pro pay us a subscription,
and they connect their own Stripe accounts to ours to take payments from their customers. Work
carefully: a mistake here can stop every payment on the site.

## Rules

1. Never reveal, copy, type, roll, or delete a **secret key** (`sk_live_…`, `rk_live_…`) or a
   **signing secret** (`whsec_…`), and never put one in your report. Step 5 is done by me, not
   you: when you get there, stop and tell me exactly which value goes where.
2. Never enter or change personal or business details: identity, tax ID, SSN, bank account,
   address, phone. If Stripe asks for any of them, stop and list what it's asking for.
3. Don't touch the sandbox or test mode, any connected account, payouts, or anything in Vercel
   other than the four variables in Step 5 and the redeploy in Step 6. Don't delete, pause, or
   transfer a project, domain, or webhook.
4. Before each change, copy the current value or list **word for word**. After it, copy the new
   one.
5. If something isn't where these steps say (Stripe and Vercel move things), look nearby, then
   tell me where you found it, or that you couldn't. If a step warns about cost or deleting
   something now, stop and ask me.

## Step 1: Is the live account ready?

In Stripe, switch to **live mode** (account picker at the top; not "Test mode", not "Sundeck Pro
sandbox").

1. Home: does Stripe show a banner asking to **activate payments**, **verify your business**, or
   **add a bank account**? Copy it word for word. If live payments aren't activated, **stop
   here** and report what Stripe still needs. I'll fill it in myself.
2. **Settings › Business › Account details**: copy the legal business name, the public business
   name, and the statement descriptor. Expect "Sundeck Pro, LLC" and "Sundeck Pro". Don't change
   them; tell me if they differ.
3. **Settings › Payouts** (or "Bank accounts and currencies"): say whether a payout bank account
   is listed (just "yes, ending ••••1234", or "no"; nothing more).

## Step 2: Connect in live mode

1. Open **Connect** (left menu, or **More › Connect**). If Stripe shows a setup checklist or a
   "Get started with Connect" screen, copy each item and whether it's done.
2. **Settings › Connect** (or **Connect › Settings**): copy the platform profile's answers if
   they're shown (business model, who pays fees, who covers losses). Sundeck Pro's answers: shops
   get their **own full Stripe Dashboard**, Stripe collects fees from the shop, Stripe covers
   losses (the shop is responsible), and our site creates the accounts (Accounts v2). If an item
   is **not done** and only needs choices like these, make them and copy what you chose. If it
   needs documents, legal review, or anything from Rule 2, stop and list it.
3. Copy the branding Connect shows to shops during onboarding (name, icon, color). Leave it.

## Step 3: Customer portal and payment methods (live)

1. **Settings › Billing › Customer portal**: shops press "Manage Billing" on our site, which opens
   this portal. If there is an **Activate** or **Save** button because it was never saved in live
   mode, set: customers can update payment methods, see invoices, and cancel subscriptions (at the
   end of the period). Turn off "switch plans" (our site sets the price). Save, and copy the
   settings.
2. **Settings › Payment methods** (the platform's own, default configuration): copy which are
   **on**. Make sure **Cards**, **Link**, and **Apple Pay** and **Google Pay** are on. Leave
   everything else as it is.
3. **Settings › Payment methods › Payment method domains**: if `sundeckpro.com` isn't listed,
   **Add a new domain**: `sundeckpro.com`. Copy its status.
4. **Settings › Branding**: copy the icon, logo, and brand color. If they're empty, switch to the
   sandbox in a new tab, copy its colors (not files), and tell me; don't upload anything.

## Step 4: Two live webhooks

**Developers › Webhooks** (or **Workbench › Webhooks** / **Event destinations**), still in live
mode. There should be none yet. Create these two, exactly. Choose the API version
**2026-09-30.endive** if Stripe lets you pick (that's what the sandbox uses); otherwise take the
default and tell me which it is.

1. **Sundeck Pro** (events from **Your account**)
   - Endpoint URL: `https://sundeckpro.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
2. **Sundeck Pro Customers** (events from **Connected accounts**; newer dashboards say
   "Connected and v2 accounts")
   - Endpoint URL: `https://sundeckpro.com/api/stripe/webhook`
   - Events: `account.updated`, `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
     `payment_intent.succeeded`, `payment_intent.payment_failed`

For each, copy its ID (`we_…`), status, API version, and event list. Don't open the signing
secret.

## Step 5: The four keys in Vercel (I do this part)

In Vercel, open the project that serves `sundeckpro.com` › **Settings › Environment Variables**.

1. For each of these four, copy which environments it applies to now (Production, Preview,
   Development) and whether it's one variable or separate ones per environment. **Don't reveal
   the values.**
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_CONNECT_WEBHOOK_SECRET`
2. **Stop and hand over to me.** Tell me, for each variable, what to do: the sandbox values must
   stay on **Preview** and **Development**, and **Production** gets the live value. If a
   variable covers all environments today, the steps are: edit it to untick Production, then
   **Add New** with the same name, Production only, and the live value. The live values, which I
   copy myself:
   - `STRIPE_SECRET_KEY`: Stripe live mode › Developers › API keys › Secret key (`sk_live_…`)
   - `STRIPE_PUBLISHABLE_KEY`: same page, Publishable key (`pk_live_…`)
   - `STRIPE_WEBHOOK_SECRET`: the live **Sundeck Pro** webhook (Your account) › Signing secret
   - `STRIPE_CONNECT_WEBHOOK_SECRET`: the live **Sundeck Pro Customers** webhook › Signing
     secret
3. Wait until I say "done". Then copy, again without values, each variable's environments, so
   the report shows Production now has its own.

## Step 6: Redeploy production

Environment variables only take effect on a new deployment.

1. Vercel › the project › **Deployments**: open the newest deployment marked **Production** and
   **Current**, then **⋯ › Redeploy** (keep "Use existing Build Cache" on). Don't promote or roll
   back anything else.
2. Wait until it shows **Ready** and **Current**. Copy its time and commit message.

## Step 7: Check it worked

1. Open https://sundeckpro.com and say whether the home page loads.
2. In Stripe live mode, open each of the two new webhooks and **Send test event** (or "Test
   webhook" / "Send test webhook"): `checkout.session.completed` for **Sundeck Pro**,
   `account.updated` for **Sundeck Pro Customers**. Copy the response code for each. A **200**
   means the live signing secret in Vercel matches. A 400 means it doesn't. Copy the response body
   (no secrets are in it) and tell me.
3. Don't make a real payment.

## Report

Send back:
- Step 1: activation banners, business names, statement descriptor, payout account yes/no.
- Step 2: the Connect checklist and platform profile, before and after, and anything you
  couldn't complete.
- Step 3: customer portal, payment methods, the domain, and branding, before and after.
- Step 4: both webhooks: ID, status, API version, events.
- Step 5: each variable's environments before and after (no values).
- Step 6: the redeploy's time, commit, and status.
- Step 7: whether the site loads, and the two test events' response codes.
- Anything you skipped or couldn't find, and why.
