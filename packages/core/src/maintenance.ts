// Maintenance plans (owner request, 2026-10-13): regular pool cleaning on a weekly cadence.
// The database makes the visits (20261012002400_maintenance.sql); these helpers describe a
// plan and preview its dates the same way. Pure.

import { formatCents } from "./money";
import { minutesLabel, clockToMinutes } from "./routing";

export interface ServicePlan {
  id: string;
  company_id: string;
  customer_id: string;
  property_id: string;
  assigned_user_id?: string | null;
  /** The first visit (YYYY-MM-DD); later ones every interval_weeks on the same weekday. */
  starts_on: string;
  interval_weeks: number;
  /** "10:00:00", or null when route planning picks the time. */
  visit_time?: string | null;
  duration_minutes: number;
  price_cents?: number | null;
  ends_on?: string | null;
  paused: boolean;
  notes?: string | null;
  deleted_at?: string | null;
}

export interface MaintenanceSettings {
  /** A new plan's visit length. */
  visitMinutes: number;
  /** How far ahead visits are put on the schedule. */
  weeksAhead: number;
}

export const MAINTENANCE_DEFAULTS: MaintenanceSettings = { visitMinutes: 30, weeksAhead: 4 };

export function maintenanceSettings(settings: unknown): MaintenanceSettings {
  const raw = ((settings as { maintenance?: Record<string, unknown> } | null)?.maintenance ??
    {}) as Record<string, unknown>;
  const minutes = Number(raw.visit_minutes);
  const weeks = Number(raw.weeks_ahead);
  return {
    visitMinutes:
      Number.isInteger(minutes) && minutes >= 10 && minutes <= 240
        ? minutes
        : MAINTENANCE_DEFAULTS.visitMinutes,
    weeksAhead:
      Number.isInteger(weeks) && weeks >= 1 && weeks <= 12
        ? weeks
        : MAINTENANCE_DEFAULTS.weeksAhead,
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const dayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** "Every Tuesday", "Every 2 weeks on Tuesday". */
export function cadenceLabel(plan: Pick<ServicePlan, "starts_on" | "interval_weeks">): string {
  const day = DAYS[dayOf(plan.starts_on)]!;
  return plan.interval_weeks === 1
    ? `Every ${day}`
    : `Every ${plan.interval_weeks} weeks on ${day}`;
}

/** "Every Tuesday · 10:00 AM · 30 min · $95.00 a visit" */
export function planSummary(
  plan: Pick<
    ServicePlan,
    "starts_on" | "interval_weeks" | "visit_time" | "duration_minutes" | "price_cents"
  >,
): string {
  return [
    cadenceLabel(plan),
    plan.visit_time ? minutesLabel(clockToMinutes(plan.visit_time.slice(0, 5))) : "any time",
    `${plan.duration_minutes} min`,
    plan.price_cents != null ? `${formatCents(plan.price_cents)} a visit` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The plan's next visit dates from `from` on (the database makes them the same way). */
export function upcomingVisitDates(
  plan: Pick<ServicePlan, "starts_on" | "interval_weeks" | "ends_on" | "paused">,
  from: string,
  count = 4,
): string[] {
  if (plan.paused) return [];
  const step = 7 * plan.interval_weeks;
  let d = plan.starts_on;
  if (d < from) {
    const behind = Math.round(
      (Date.parse(`${from}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000,
    );
    d = addDays(d, step * Math.ceil(behind / step));
  }
  const out: string[] = [];
  while (out.length < count && (!plan.ends_on || d <= plan.ends_on)) {
    out.push(d);
    d = addDays(d, step);
  }
  return out;
}
