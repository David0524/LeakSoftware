# M10 checklist: reminders, reviews, warranties, dashboard, billing

Playwright covers the done-when (`apps/web/e2e/new-shop.spec.ts`: a new shop signs up and runs
the whole loop, subscribes, turns read-only when canceled, and unlocks when paid) and the
pieces (`followups.spec.ts`, `invoices.spec.ts`). Stripe and email are simulated there. These
steps need the real services, once the keys are set in Vercel.

## Setup (owner, once)
1. Vercel: set `CRON_SECRET` (any long random string). Vercel Cron then calls
   `/api/cron/daily` every morning (`apps/web/vercel.json`).
2. Stripe (platform account, test mode first): nothing to create. Since 2026-10-16 the price
   comes from `packages/core/src/plans.ts` (package and people), sent with each Checkout, so
   `STRIPE_SECRET_KEY` is enough. With it set, new shops must add a card in onboarding.
3. Stripe webhook endpoint `https://<site>/api/stripe/webhook` (the same one as payments): add
   the events `customer.subscription.created`, `customer.subscription.updated`, and
   `customer.subscription.deleted` (`checkout.session.completed` is already there).
4. Stripe Billing settings: turn on the customer portal (cancel, update card, invoices).
5. Apply the database migrations: `pnpm db:deploy`.

## Check
1. **Reminders:** send a quote to your own email. Change the shop's quote reminders to `1`
   day, wait a day (or run the cron URL with the secret), and check the email arrives, its link
   opens the quote, and "Stop reminder and review emails" works.
2. **Review request:** add a review link in Settings › Company, get an invoice paid; the next
   morning the customer gets "How did we do?" with the link.
3. **Warranties:** a repair with a 12-month line, paid: it shows under Warranties as Active.
4. **Dashboard:** the payment shows under Collected for this month.
5. **Billing:** sign up a new shop, open Settings › Tidemark Billing, Subscribe with Stripe's
   test card `4242 4242 4242 4242`. The page says "Subscribed. Billing starts when the free
   trial ends". Manage Billing opens Stripe's portal; cancel there, and after Stripe's event
   the shop shows the read-only banner. Subscribe again to unlock.
6. **Phone while read-only:** change something in the app; the sync bar says the changes are
   kept on the phone. After paying, they go up.
