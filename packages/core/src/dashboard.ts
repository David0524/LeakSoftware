import { dateFormat } from "./intl";
import { formatCents } from "./money";
import { durationLabel } from "./routing";
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

/**
 * One tech over the months shown (owner, 2026-11-24: "Tech specific stats in the dashboard").
 * Each job counts for its assigned tech.
 */
export interface DashboardTech {
  user_id: string;
  name: string;
  /** Their team color (membership.color). */
  color: string | null;
  /** False once turned off (they show while they have numbers in the months shown). */
  active: boolean;
  /** Jobs finished in the months shown. */
  jobs_done: number;
  /** Jobs due by today and not finished, as of now (not a plan's visits ahead). */
  jobs_open: number;
  invoiced_cents: number;
  collected_cents: number;
  thumbs_up: number;
  thumbs_down: number;
  /** Average start to finish on the jobs done; null when there are none. */
  on_site_minutes: number | null;
}

export interface Dashboard {
  statuses: Record<string, number>;
  outstanding_cents: number;
  months: DashboardMonth[];
  /** Missing before the database has it. */
  techs?: DashboardTech[];
}

export const DASHBOARD_TECHS_TITLE = "By tech";
export const DASHBOARD_TECHS_EMPTY = "No techs yet. Add them in Settings › Team.";
export const DASHBOARD_TECH_TURNED_OFF = "Turned off";

/** "14 jobs done · 3 open" */
export function techJobsNote(t: Pick<DashboardTech, "jobs_done" | "jobs_open">): string {
  return `${t.jobs_done} ${t.jobs_done === 1 ? "job" : "jobs"} done · ${t.jobs_open} open`;
}

/** "Invoiced $5,000.00" */
export function techInvoicedNote(t: Pick<DashboardTech, "invoiced_cents">): string {
  return `Invoiced ${formatCents(t.invoiced_cents)}`;
}

/** "9 thumbs up · 1 thumbs down · 1 hr 35 min avg on site", or "No feedback yet". */
export function techFeedbackNote(
  t: Pick<DashboardTech, "thumbs_up" | "thumbs_down" | "on_site_minutes">,
): string {
  const feedback =
    t.thumbs_up + t.thumbs_down === 0
      ? "No feedback yet"
      : `${t.thumbs_up} thumbs up · ${t.thumbs_down} thumbs down`;
  return t.on_site_minutes == null
    ? feedback
    : `${feedback} · ${durationLabel(t.on_site_minutes)} avg on site`;
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
