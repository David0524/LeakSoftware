import type { CodeOffer } from "./codes";
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

/** The free trial's length in words, for the trial page. */
export interface TrialTerms {
  /** The button: "Start 30-Day Free Trial". */
  button: string;
  /** Above the card: "30 days free". */
  heading: string;
  /** When there's no date yet: "30 days from today". */
  fromToday: string;
}

/**
 * A new shop's trial: 3 months for shops from the 6 x 9 mailer (owner, 2026-11-16), whose
 * answer to "How did you hear about us?" is Mailer; 30 days for everyone else. The database's
 * create_company sets the same end date. A code changes it (owner, 2026-11-23): a promo
 * code's free months are the trial's length from sign-up when longer ("3 months free"), and a
 * referral code adds a month to it, counting 30 days as one ("2 months free").
 */
export function trialTerms(
  heardFrom: string | null | undefined,
  code: Pick<CodeOffer, "kind" | "freeMonths"> | null = null,
): TrialTerms {
  const base = heardFrom === "mailer" ? 3 : 1;
  const free = Math.max(0, Math.floor(code?.freeMonths ?? 0));
  const total = !free ? base : code?.kind === "referral" ? base + free : Math.max(base, free);
  if (total === 1) {
    return {
      button: "Start 30-Day Free Trial",
      heading: "30 days free",
      fromToday: "30 days from today",
    };
  }
  return {
    button: `Start ${total}-Month Free Trial`,
    heading: `${total} months free`,
    fromToday: `${total} months from today`,
  };
}
