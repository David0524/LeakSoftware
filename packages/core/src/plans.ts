import type { Cents } from "./money";

// Tidemark's two packages and their monthly prices (owner, 2026-10-16: flat tiers by team size,
// unlimited pools, pool maintenance above leak detection; see docs/DECISIONS.md). The website's
// pricing section reads these; billing in Stripe is to be set to match.

export type PlanId = "leak" | "maintenance";

export interface Tier {
  name: string;
  /** People included (owners, office staff, and techs each count). */
  upTo: number;
  priceCents: Cents;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Smallest first. A team past the last tier pays it plus `perExtraCents` per person. */
  tiers: Tier[];
  perExtraCents: Cents;
}

export const PLANS: Record<PlanId, Plan> = {
  maintenance: {
    id: "maintenance",
    name: "Pool Maintenance",
    tiers: [
      { name: "Starter", upTo: 2, priceCents: 7_900 },
      { name: "Team", upTo: 6, priceCents: 14_900 },
      { name: "Fleet", upTo: 12, priceCents: 24_900 },
    ],
    perExtraCents: 1_500,
  },
  leak: {
    id: "leak",
    name: "Leak Detection",
    tiers: [
      { name: "Solo", upTo: 1, priceCents: 4_900 },
      { name: "Team", upTo: 4, priceCents: 9_900 },
    ],
    perExtraCents: 2_500,
  },
};

/** A shop that does both: a Pool Maintenance tier plus this for the leak side. */
export const BOTH_ADDON_CENTS: Cents = 4_900;

const people = (users: number) => Math.max(1, Math.floor(users));

/** The tier a team of `users` people is on (the largest tier past the top one). */
export function planTier(plan: Plan, users: number): Tier {
  return plan.tiers.find((t) => people(users) <= t.upTo) ?? plan.tiers[plan.tiers.length - 1]!;
}

/** People past the largest tier, each paying `perExtraCents`. */
export function extraUsers(plan: Plan, users: number): number {
  return Math.max(0, people(users) - plan.tiers[plan.tiers.length - 1]!.upTo);
}

/** The monthly price for a shop of `users` people. Pools are unlimited. */
export function monthlyPriceCents(plan: Plan, users: number): Cents {
  return planTier(plan, users).priceCents + extraUsers(plan, users) * plan.perExtraCents;
}

// ---------------------------------------------------------------------------
// What pool companies pay elsewhere (the website's comparison, Pool Maintenance only)
// ---------------------------------------------------------------------------

/** When the competitor prices below were last checked against their public pricing. */
export const COMPETITORS_CHECKED = "October 2026";

export interface CompetitorPrice {
  name: string;
  /** How they charge, in words, for the fine print. */
  basis: string;
  monthlyCents: Cents;
}

/**
 * Monthly prices for a pool company of `users` people (one is the office; the rest run routes)
 * and `pools` pools, from public pricing (owner-confirmed for Skimmer): Skimmer $2 a pool with a
 * $98 minimum; Pool Brain $50 plus $65 per field tech; Pool Office Manager $125 for the first
 * user plus $25 for each other user.
 */
export function competitorPrices(users: number, pools: number): CompetitorPrice[] {
  const n = people(users);
  const techs = Math.max(1, n - 1);
  const p = Math.max(0, Math.floor(pools));
  return [
    {
      name: "Skimmer",
      basis: "$2 a pool, $98 minimum",
      monthlyCents: Math.max(9_800, 200 * p),
    },
    {
      name: "Pool Brain",
      basis: "$50 plus $65 per field tech",
      monthlyCents: 5_000 + 6_500 * techs,
    },
    {
      name: "Pool Office Manager",
      basis: "$125 plus $25 per additional user",
      monthlyCents: 12_500 + 2_500 * (n - 1),
    },
  ];
}

/** The plan a shop's services put it on: Both is Pool Maintenance plus `BOTH_ADDON_CENTS`. */
export function planForServices(services: "pool" | "leak" | "both"): Plan {
  return services === "leak" ? PLANS.leak : PLANS.maintenance;
}

/** What a shop pays a month for its services and number of people (Tidemark billing). */
export function servicesPriceCents(services: "pool" | "leak" | "both", users: number): Cents {
  return (
    monthlyPriceCents(planForServices(services), users) +
    (services === "both" ? BOTH_ADDON_CENTS : 0)
  );
}
