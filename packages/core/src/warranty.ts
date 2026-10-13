// Warranties (M10): one record per repaired line with a warranty term, recorded when the
// repair job is paid. Dates are calendar days in the shop's time zone (YYYY-MM-DD).

export type WarrantyState = "active" | "expiring" | "expired";

/** Warranties ending within this many days show as expiring soon. */
export const WARRANTY_EXPIRING_DAYS = 60;

export const WARRANTY_STATE_LABELS: Record<WarrantyState, string> = {
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function warrantyState(endsOn: string, today: string): WarrantyState {
  const left = daysBetween(today, endsOn);
  if (left < 0) return "expired";
  return left <= WARRANTY_EXPIRING_DAYS ? "expiring" : "active";
}

/** "Ends in 12 days", "Ends today", "Ended 3 days ago". */
export function warrantyEndsText(endsOn: string, today: string): string {
  const left = daysBetween(today, endsOn);
  if (left === 0) return "Ends today";
  if (left > 0) return `Ends in ${left} day${left === 1 ? "" : "s"}`;
  return `Ended ${-left} day${left === -1 ? "" : "s"} ago`;
}
