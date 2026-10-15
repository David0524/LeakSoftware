import { dateFormat } from "./intl";
// Owner dashboard (M10): what the database adds up (public.owner_dashboard), put into words.

export interface DashboardMonth {
  /** YYYY-MM in the shop's time zone */
  month: string;
  quotes_sent: number;
  quotes_accepted: number;
  invoiced_cents: number;
  outstanding_cents: number;
  collected_cents: number;
}

export interface Dashboard {
  statuses: Record<string, number>;
  outstanding_cents: number;
  months: DashboardMonth[];
}

/** "Oct 2026", or "October 2026" with `long`. */
export function monthLabel(month: string, long = false): string {
  return dateFormat("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));
}

/** Share of quotes accepted, as "67%", or "–" when none were sent. */
export function acceptanceRate(sent: number, accepted: number): string {
  return sent > 0 ? `${Math.round((accepted / sent) * 100)}%` : "–";
}

/** Totals over the months shown. */
export function dashboardTotals(months: DashboardMonth[]) {
  const sum = (k: keyof Omit<DashboardMonth, "month">) => months.reduce((s, m) => s + m[k], 0);
  return {
    quotes_sent: sum("quotes_sent"),
    quotes_accepted: sum("quotes_accepted"),
    invoiced_cents: sum("invoiced_cents"),
    collected_cents: sum("collected_cents"),
  };
}
