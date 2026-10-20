// Routes: which weekday each pool customer is serviced on, and by whom (owner, 2026-10-20,
// docs/plans/route-maps.md part 3: "Customers to add", drop a customer on a day, Suggest Days).
// A plan's day is its weekday (or weekdays); changing it re-makes the plan's coming visits
// (app.service_plan_changed). Pure.

import { addDays } from "./office";
import { upcomingVisitDates, planRepeat, type ServicePlan } from "./maintenance";
import type { DriveFn, LatLng, WorkDay } from "./routing";
import { planWeek } from "./week-plan";

type PlanShape = Pick<
  ServicePlan,
  "starts_on" | "interval_weeks" | "weekdays" | "monthly" | "ends_on" | "paused"
>;

const dayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const weekOfMonth = (date: string) => Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;

/** The weekdays a plan is serviced on (0 Sunday to 6 Saturday). */
export function serviceDays(plan: Pick<ServicePlan, "starts_on" | "weekdays">): number[] {
  return plan.weekdays?.length ? [...plan.weekdays].sort() : [dayOf(plan.starts_on)];
}

/**
 * The plan's columns to save to service it on `to` instead of `from` (one of its days), from
 * `today` on. Several days a week: that day swaps. Weekly: the first `to` from today. Every 2
 * weeks and monthly: the nearest `to` around the next visit, on or after today, so every 2
 * weeks keeps its week and monthly keeps its week of the month.
 */
export function moveServiceDay(
  plan: PlanShape,
  from: number,
  to: number,
  today: string,
): Pick<ServicePlan, "starts_on" | "weekdays"> {
  if (planRepeat(plan) === "days") {
    const days = [...new Set(plan.weekdays!.map((d) => (d === from ? to : d)))].sort();
    return { starts_on: plan.starts_on, weekdays: days };
  }
  const firstFrom = (d: string) =>
    Array.from({ length: 7 }, (_, k) => addDays(d, k)).find((x) => dayOf(x) === to)!;
  // Weekly: the first `to` from today, so it's serviced this week.
  if (planRepeat(plan) === "weekly") return { starts_on: firstFrom(today), weekdays: null };
  const base = upcomingVisitDates({ ...plan, paused: false }, today, 1)[0] ?? plan.starts_on;
  if (dayOf(base) === to) return { starts_on: base, weekdays: plan.weekdays ?? null };
  const monthly = planRepeat(plan) === "monthly";
  const candidates: string[] = [];
  for (let k = -6; k <= 6; k++) {
    const d = addDays(base, k);
    if (dayOf(d) !== to || d < today) continue;
    if (monthly && weekOfMonth(d) !== Math.min(4, weekOfMonth(base))) continue;
    candidates.push(d);
  }
  const near = (d: string) => Math.abs(Date.parse(d) - Date.parse(base));
  const pick =
    candidates.sort((a, b) => near(a) - near(b) || a.localeCompare(b))[0] ??
    // Nothing that keeps the week: the first `to` from today.
    firstFrom(today);
  return { starts_on: pick, weekdays: plan.weekdays ?? null };
}

/** A plan as Routes sees it. */
export interface RoutePlan {
  id: string;
  techId: string | null;
  days: number[];
  location: LatLng | null;
  durationMin: number;
}

export interface DaySuggestion {
  id: string;
  techId: string;
  /** 0 Sunday to 6 Saturday. */
  day: number;
}

/**
 * Suggest Days: a service day (and tech, for plans with none) for each plan given, grouping
 * nearby pools on the same day and evening out each tech's days, as Plan Week places jobs.
 * Plans on several days a week, and plans without a map location, are left as they are. The
 * rest of each tech's plans stay on their days and count toward them. Nothing is saved: the
 * owner presses Keep.
 */
export function suggestServiceDays(input: {
  /** Plans to place (Customers to Add, or a whole route to rebuild). */
  place: RoutePlan[];
  /** Plans that stay on their days. */
  keep: RoutePlan[];
  techs: string[];
  workDays: number[];
  depot: LatLng | null;
  day: WorkDay;
  drive: DriveFn;
}): { suggestions: DaySuggestion[]; left: string[] } {
  const days = input.techs.flatMap((techId) =>
    input.workDays.map((d) => ({
      techId,
      date: String(d),
      stays: input.keep
        .filter((p) => p.techId === techId && p.days.includes(d))
        .map((p) => ({ id: p.id, location: p.location, durationMin: p.durationMin })),
    })),
  );
  const movable = input.place.filter((p) => p.days.length <= 1 && p.location);
  const plan = planWeek({
    days,
    jobs: movable.map((p) => ({
      id: p.id,
      location: p.location,
      durationMin: p.durationMin,
      techId: null,
      date: null,
      techs: p.techId && input.techs.includes(p.techId) ? [p.techId] : input.techs,
    })),
    depot: input.depot,
    day: input.day,
    drive: input.drive,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const placed = new Set(plan.placed.map((p) => p.id));
  return {
    suggestions: plan.placed.map((p) => ({ id: p.id, techId: p.techId, day: Number(p.date) })),
    left: input.place.filter((p) => !placed.has(p.id)).map((p) => p.id),
  };
}
