import type { Services } from "./models";

// The trial page a new shop's owner sees after sign-up (/welcome): the price and what's
// included, then the card for the 30-day free trial (owner, 2026-10-16). The questionnaire
// that used to come first was removed (owner, 2026-10-24): sign-up goes straight here, and
// what it used to ask has defaults the owner changes in Settings. Pool Maintenance and Both
// share one offer; Leak Detection has its own. No testimonials or invented statistics.

export type TrialPackage = "maintenance" | "leak";

export const trialPackage = (services: Services): TrialPackage =>
  services === "leak" ? "leak" : "maintenance";

export interface TrialOffer {
  /** The page's headline. */
  promise: string;
  included: string[];
}

export const TRIAL_OFFER: Record<TrialPackage, TrialOffer> = {
  maintenance: {
    promise: "Your route, sorted with Sundeck Pro.",
    included: [
      "Unlimited pools: adding to your route never costs more",
      "Checklist, photos, and a summary on every visit",
      "Monthly invoices drafted for you",
      "Chemical calculator on every visit",
    ],
  },
  leak: {
    promise: "Reports that sell the repair, starting today.",
    included: [
      "Inspection checklists and pressure and dye tests",
      "Homeowner reports with a diagram and photos",
      "Quotes accepted online, with a deposit",
      "Works with no signal",
    ],
  },
};
