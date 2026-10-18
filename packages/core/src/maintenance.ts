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
  /** Several times a week: these days (0 Sunday to 6 Saturday), every week. */
  weekdays?: number[] | null;
  /** Once a month: the first visit's weekday, in the same week of the month. */
  monthly?: boolean;
  /** "10:00:00", or null when route planning picks the time. */
  visit_time?: string | null;
  duration_minutes: number;
  /** The price per month (owner, 2026-10-18), billed on the month's invoice. */
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

/** How often a plan repeats (owner, 2026-10-18). */
export type PlanRepeat = "days" | "weekly" | "biweekly" | "monthly";

export function planRepeat(
  plan: Pick<ServicePlan, "interval_weeks" | "weekdays" | "monthly">,
): PlanRepeat {
  if (plan.weekdays?.length) return "days";
  if (plan.monthly || plan.interval_weeks > 2) return "monthly";
  return plan.interval_weeks === 2 ? "biweekly" : "weekly";
}

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/** The week of the month a date falls in, 1 to 5. */
const weekOfMonth = (date: string) => Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;

/** "Monday and Thursday", "Monday, Wednesday, and Friday". */
function dayList(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => DAYS[d]!);
  return names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/**
 * "Every Tuesday", "Every 2 weeks on Tuesday", "Every Monday and Thursday", "Monthly on the
 * 2nd Tuesday".
 */
export function cadenceLabel(
  plan: Pick<ServicePlan, "starts_on" | "interval_weeks" | "weekdays" | "monthly">,
): string {
  const day = DAYS[dayOf(plan.starts_on)]!;
  switch (planRepeat(plan)) {
    case "days":
      return `Every ${dayList(plan.weekdays!)}`;
    case "monthly":
      return `Monthly on the ${ORDINALS[Math.min(4, weekOfMonth(plan.starts_on)) - 1]} ${day}`;
    case "biweekly":
      return `Every 2 weeks on ${day}`;
    default:
      return `Every ${day}`;
  }
}

/** "Every Tuesday · 10:00 AM · 30 min · $180.00 a month" */
export function planSummary(
  plan: Pick<
    ServicePlan,
    | "starts_on"
    | "interval_weeks"
    | "weekdays"
    | "monthly"
    | "visit_time"
    | "duration_minutes"
    | "price_cents"
  >,
): string {
  return [
    cadenceLabel(plan),
    plan.visit_time ? minutesLabel(clockToMinutes(plan.visit_time.slice(0, 5))) : "any time",
    `${plan.duration_minutes} min`,
    plan.price_cents != null ? `${formatCents(plan.price_cents)} a month` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The plan's next visit dates from `from` on, the same as the database makes them
 * (app.plan_dates in 20261012004800_plan_schedule_and_monthly_price.sql).
 */
export function upcomingVisitDates(
  plan: Pick<
    ServicePlan,
    "starts_on" | "interval_weeks" | "weekdays" | "monthly" | "ends_on" | "paused"
  >,
  from: string,
  count = 4,
): string[] {
  if (plan.paused) return [];
  const repeat = planRepeat(plan);
  const weekday = dayOf(plan.starts_on);
  const week = Math.min(4, weekOfMonth(plan.starts_on));
  const step = 7 * (repeat === "biweekly" ? 2 : 1);
  const out: string[] = [];
  let d = plan.starts_on < from ? from : plan.starts_on;
  // A year and a half of days is enough for any shape.
  for (let i = 0; i < 550 && out.length < count; i++, d = addDays(d, 1)) {
    if (plan.ends_on && d > plan.ends_on) break;
    const dow = dayOf(d);
    const on =
      repeat === "days"
        ? plan.weekdays!.includes(dow)
        : repeat === "monthly"
          ? dow === weekday && weekOfMonth(d) === week
          : Math.round(
              (Date.parse(`${d}T12:00:00Z`) - Date.parse(`${plan.starts_on}T12:00:00Z`)) /
                86_400_000,
            ) %
              step ===
            0;
    if (on) out.push(d);
  }
  return out;
}

/**
 * A plan's cleaning done every few months (owner, 2026-10-18): the database puts it on the
 * first visit on or after next_due and moves next_due on once it's done
 * (20261012004700_scheduled_cleanings.sql).
 */
export interface PlanCleaning {
  id: string;
  company_id: string;
  service_plan_id: string;
  component_type_id: string;
  every_months: number;
  next_due: string;
  last_done_on?: string | null;
  /** Billed per cleaning done; null: included in the visit price. */
  price_cents?: number | null;
  deleted_at?: string | null;
}

/** How often a cleaning can repeat, in months. */
export const CLEANING_MONTHS = [1, 2, 3, 6] as const;

/** "Every 3 months", "Every month". */
export function cleaningCadence(months: number): string {
  return months === 1 ? "Every month" : `Every ${months} months`;
}

/** "Clean filter every 3 months · $40.00 each" */
export function cleaningSummary(
  name: string,
  cleaning: Pick<PlanCleaning, "every_months" | "price_cents">,
): string {
  return [
    `${name} ${cleaningCadence(cleaning.every_months).toLowerCase()}`,
    cleaning.price_cents != null ? `${formatCents(cleaning.price_cents)} each` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
