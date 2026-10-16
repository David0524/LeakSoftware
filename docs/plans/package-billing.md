# Charging per package and per person (plan, 2026-10-16)

For the owner to approve before anything is built. Today every shop's subscription is one
Stripe price (`STRIPE_BILLING_PRICE_ID`), whatever its package or size. The prices the website
shows are in `packages/core/src/plans.ts`:

| Package | Base, per month | Includes | Each extra person |
|---|---|---|---|
| Pool Maintenance | $69 | 2 people | $20 |
| Leak Detection | $100 | 2 people | $25 |
| Both | **not decided** | | |

## Decisions needed

1. **What Both costs.** Options: the two bases added ($169, 2 people, extra people at $25), or a
   bundle price. Both is mainly for demos and the rare shop that does both.
2. **Who counts as a person.** `plans.ts` says owners, office staff, and techs each count.
   Proposed: active members only (turned-off teammates don't count) and pending invites don't
   count until accepted.
3. **When a change in people shows on the bill.** Proposed: Stripe's default, prorated on the
   next invoice, so adding a tech mid-month costs only the rest of the month. No charge at the
   moment of inviting.
4. **Changing package** (Settings › Company › Services). Proposed: allowed any time; the price
   changes from that moment, prorated. During the free trial it only changes what the shop will
   be charged.

## How it would work (Stripe Billing)

- **Prices in Stripe:** for each package, a monthly base price and a per-person price. The
  per-person price is "graduated" with the first 2 at $0, so the quantity is simply the number of
  people, and Stripe works out the extras. Four price ids in the environment
  (`STRIPE_PRICE_POOL_BASE`, `STRIPE_PRICE_POOL_PERSON`, `STRIPE_PRICE_LEAK_BASE`,
  `STRIPE_PRICE_LEAK_PERSON`), replacing `STRIPE_BILLING_PRICE_ID`; Both uses whatever decision 1
  picks.
- **Checkout** (`apps/web/src/server/billing.ts`) creates the subscription with two items: the
  package's base (quantity 1) and its per-person price (quantity = people now). The trial carries
  over as it does today.
- **Keeping the count right:** when a member is added, turned off, or removed, and when the
  package changes, the server updates the subscription's items (`stripe.subscriptions.update`,
  proration on). A daily check (the existing daily cron) corrects any drift.
- **The website** shows the shop's current price on Settings › Tidemark Billing, worked out with
  `monthlyPriceCents` so it always matches the home page.
- **Existing shops:** none pay yet (all trials), so no migration of live subscriptions.

## Tests

- Core: the price for each package and size (exists in `plans.test.ts`) and the Both rule.
- Server: Checkout builds the right two items; adding or removing a member updates the quantity;
  changing package swaps both items.
- End to end in Stripe test mode: a shop of 3 on Pool Maintenance is charged $89; adding a fourth
  person prorates $20 on the next invoice.

## Size

About a day of work plus Stripe dashboard setup (four prices) by the owner. Not needed for a
first group of clients on free trials; needed before the first trial ends (30 days after sign-up).
