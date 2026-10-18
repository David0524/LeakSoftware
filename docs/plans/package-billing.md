# Charging per package and tier (plan, 2026-10-16)

**Built on 2026-10-16** (DECISIONS), with one change from this plan: no Stripe prices at all.
Checkout and later changes send the amount (`price_data`), so the owner creates nothing in
Stripe. Decisions 1 to 4 below were taken as proposed.

Originally for the owner to approve before anything is built. Today every shop's subscription is one
Stripe price (`STRIPE_BILLING_PRICE_ID`), whatever its package or size. The prices the website
shows are in `packages/core/src/plans.ts` (owner, 2026-10-16; see DECISIONS):

| Package | Tiers, per month | Each person past the top tier |
|---|---|---|
| Pool Maintenance (unlimited pools) | Starter $79 (up to 2 people), Team $149 (up to 6), Fleet $249 (up to 12) | $15 |
| Leak Detection | Solo $49 (1 person), Team $99 (up to 4) | $25 |
| Both | the Pool Maintenance tier plus $49 | $15 |

## Decisions needed

1. **Who counts as a person.** `plans.ts` says owners, office staff, and techs each count.
   Proposed: active members only (turned-off teammates don't count) and pending invites don't
   count until accepted.
2. **When a change in people shows on the bill.** Proposed: Stripe's default, prorated on the
   next invoice, so moving up a tier mid-month costs only the rest of the month. No charge at the
   moment of inviting.
3. **Moving down a tier.** Proposed: automatic at the next invoice when the team gets smaller.
4. **Changing package** (Settings › Company › Services). Proposed: allowed any time; the price
   changes from that moment, prorated. During the free trial it only changes what the shop will
   be charged.

## How it would work (Stripe Billing)

- **Prices in Stripe:** for each package, one "volume" price whose quantity is the number of
  people, with flat amounts per tier (e.g. Pool Maintenance: 1–2 → $79, 3–6 → $149, 7–12 → $249,
  13+ → $249 flat plus $15 per unit past 12, set as a graduated price). Both adds a $49 item.
  Price ids in the environment (`STRIPE_PRICE_POOL`, `STRIPE_PRICE_LEAK`, `STRIPE_PRICE_BOTH_ADDON`),
  replacing `STRIPE_BILLING_PRICE_ID`.
- **Checkout** (`apps/web/src/server/billing.ts`) creates the subscription with the package's
  price (quantity = people now), plus the add-on for Both. The trial carries over as it does today.
- **Keeping the count right:** when a member is added, turned off, or removed, and when the
  package changes, the server updates the subscription's quantity (`stripe.subscriptions.update`,
  proration on). A daily check (the existing daily cron) corrects any drift.
- **The website** shows the shop's current tier and price on Settings › Sundeck Pro Billing, worked
  out with `monthlyPriceCents` so it always matches the home page.
- **Existing shops:** none pay yet (all trials), so no migration of live subscriptions.

## Tests

- Core: the price for each package and size (exists in `plans.test.ts`) and the Both rule.
- Server: Checkout builds the right items; adding or removing a member updates the quantity;
  changing package swaps the price.
- End to end in Stripe test mode: a shop of 2 on Pool Maintenance is charged $79; adding a third
  person moves it to Team and prorates the $70 difference on the next invoice.

## Size

About a day of work plus Stripe dashboard setup (three prices) by the owner. Not needed for a
first group of clients on free trials; needed before the first trial ends (30 days after sign-up).
