import { isDateString, parseDollars, type PlanRepeat } from "@leakbook/core";

// A maintenance plan's form on the phone (New Job's plan and a customer's visit plans), checked
// the same way as the website's (apps/web/src/lib/plan-repeat.ts and app/actions/maintenance.ts).

/** How often a plan repeats, in the website's order and words. */
export const REPEAT_OPTIONS: { value: PlanRepeat; label: string }[] = [
  { value: "days", label: "2+ a Week" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
];

/** The first visit's hint for each repeat. `short`: New Job's wording. */
export function firstVisitHint(repeat: PlanRepeat, short = false): string {
  if (repeat === "days") return "Visits start on or after this date.";
  if (repeat === "monthly")
    return short
      ? "Repeats on this weekday in the same week each month."
      : "Repeats on this weekday in the same week each month, like the 2nd Tuesday.";
  return short ? "Repeats on this weekday." : "Visits repeat on this weekday.";
}

export interface PlanDraft {
  repeat: PlanRepeat;
  /** For Several Days: 0 Sunday to 6 Saturday. */
  days: number[];
  startsOn: string;
  /** "HH:MM", or blank: route planning picks it. */
  time: string;
  minutes: string;
  /** Dollars per month, or blank. */
  price: string;
  endsOn: string;
  /** A member's user id, or blank: nobody yet. */
  tech: string;
  notes: string;
}

export type PlanErrors = Partial<
  Record<"weekdays" | "startsOn" | "time" | "minutes" | "price" | "endsOn", string>
>;

/** The plan's columns, as service_plan and create_service_plan take them. */
export interface PlanValues {
  [key: string]: string | number | boolean | number[] | null;
  assigned_user_id: string | null;
  starts_on: string;
  interval_weeks: number;
  weekdays: number[] | null;
  monthly: boolean;
  visit_time: string | null;
  duration_minutes: number;
  price_cents: number | null;
  ends_on: string | null;
  notes: string | null;
}

/** The plan's values, or the fields to fix. `endsMessage` differs on New Job. */
export function checkPlan(
  d: PlanDraft,
  endsMessage = "End on or after the start.",
): { values: PlanValues; errors: null } | { values: null; errors: PlanErrors } {
  const errors: PlanErrors = {};
  const days = [...new Set(d.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort(
    (a, b) => a - b,
  );
  if (d.repeat === "days" && days.length < 2) errors.weekdays = "Pick two or more days.";
  if (!isDateString(d.startsOn)) errors.startsOn = "Pick the first visit's date.";
  const time = d.time.trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = "Pick a time.";
  const minutes = Number(d.minutes.trim());
  if (!(d.minutes.trim() && Number.isInteger(minutes) && minutes >= 10 && minutes <= 240))
    errors.minutes = "Enter 10 to 240 minutes.";
  const price = d.price.trim() ? parseDollars(d.price) : null;
  if (d.price.trim() && (price === null || price < 0)) errors.price = "Enter a price like 180.";
  const ends = d.endsOn.trim();
  if (ends && (!isDateString(ends) || ends < d.startsOn)) errors.endsOn = endsMessage;
  if (Object.keys(errors).length) return { values: null, errors };
  return {
    errors: null,
    values: {
      assigned_user_id: d.tech || null,
      starts_on: d.startsOn,
      interval_weeks: d.repeat === "biweekly" ? 2 : 1,
      weekdays: d.repeat === "days" ? days : null,
      monthly: d.repeat === "monthly",
      visit_time: time || null,
      duration_minutes: minutes,
      price_cents: price,
      ends_on: ends || null,
      notes: d.notes.trim() || null,
    },
  };
}

/** A network failure from fetch, as opposed to the server saying no. */
export function isNetworkError(message: string): boolean {
  return /network request failed|failed to fetch|load failed|networkerror|fetch failed/i.test(
    message,
  );
}
