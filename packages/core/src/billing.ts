// Tidemark billing (M10): the shop's subscription state, as public.company_access returns
// it, put into words for the banner and the Billing page.

export interface CompanyAccess {
  status: "trialing" | "active" | "past_due" | "canceled";
  plan: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscribed: boolean;
  locked: boolean;
}

/** Days of grace after a failed renewal before the shop becomes read-only. */
export const PAST_DUE_GRACE_DAYS = 7;

const daysUntil = (iso: string, now: Date) =>
  Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export interface AccessNotice {
  tone: "warning" | "error";
  text: string;
}

/** The banner every member sees, or null when there's nothing to say. */
export function accessNotice(a: CompanyAccess, now: Date = new Date()): AccessNotice | null {
  if (a.locked) {
    return {
      tone: "error",
      text: "Read-only: this shop’s Tidemark subscription isn’t paid. Everything is still here; an owner can subscribe in Settings › Billing.",
    };
  }
  if (a.status === "past_due" && a.current_period_end) {
    const graceEnds = new Date(Date.parse(a.current_period_end) + PAST_DUE_GRACE_DAYS * 86_400_000);
    return {
      tone: "warning",
      text: `The last Tidemark payment didn’t go through. Update the card in Settings › Billing within ${plural(daysUntil(graceEnds.toISOString(), now), "day")} to keep working.`,
    };
  }
  if (a.status === "trialing" && !a.subscribed && a.trial_ends_at) {
    const left = daysUntil(a.trial_ends_at, now);
    if (left <= 7) {
      return {
        tone: "warning",
        text:
          left === 0
            ? "The free trial ends today. Subscribe in Settings › Billing to keep working."
            : `The free trial ends in ${plural(left, "day")}. Subscribe in Settings › Billing to keep working.`,
      };
    }
  }
  return null;
}

/** One line for the Billing page: where the subscription stands. */
export function billingSummary(a: CompanyAccess, now: Date = new Date()): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(iso));
  if (a.plan === "demo") return "Demo shop: no subscription needed.";
  if (a.locked) return "Read-only until the subscription is paid. Nothing has been deleted.";
  switch (a.status) {
    case "trialing":
      if (a.subscribed && a.trial_ends_at)
        return `Subscribed. Billing starts when the free trial ends on ${day(a.trial_ends_at)}.`;
      return a.trial_ends_at
        ? `Free trial: ${plural(daysUntil(a.trial_ends_at, now), "day")} left (ends ${day(a.trial_ends_at)}).`
        : "Free trial.";
    case "active":
      return a.current_period_end ? `Active. Renews on ${day(a.current_period_end)}.` : "Active.";
    case "past_due":
      return "Payment past due. Update the card to keep working.";
    default:
      return "Canceled.";
  }
}
