import type { Cents } from "./money";

// Tidemark's two packages and their monthly prices (owner, 2026-10-15). The website's pricing
// section reads these; billing in Stripe is to be set to match.

export type PlanId = "leak" | "maintenance";

export interface Plan {
  id: PlanId;
  name: string;
  /** The monthly price, which covers `includedUsers` people. */
  baseCents: Cents;
  includedUsers: number;
  /** Each person past the included ones, per month. */
  perUserCents: Cents;
}

export const PLANS: Record<PlanId, Plan> = {
  leak: {
    id: "leak",
    name: "Leak Detection",
    baseCents: 10_000,
    includedUsers: 2,
    perUserCents: 2_500,
  },
  maintenance: {
    id: "maintenance",
    name: "Pool Maintenance",
    baseCents: 6_900,
    includedUsers: 2,
    perUserCents: 2_000,
  },
};

/** People past the plan's included ones (a shop always has at least one person). */
export function extraUsers(plan: Plan, users: number): number {
  return Math.max(0, Math.max(1, Math.floor(users)) - plan.includedUsers);
}

/** The monthly price for a shop of `users` people. */
export function monthlyPriceCents(plan: Plan, users: number): Cents {
  return plan.baseCents + extraUsers(plan, users) * plan.perUserCents;
}
