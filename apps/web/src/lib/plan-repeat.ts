// How often a maintenance plan repeats, as the plan form and New Job post it (owner,
// 2026-10-18: "multiple times per week (then a day selector), weekly, every two weeks,
// monthly"). The database keeps the plan's shape tidy too (app.plan_shape).

export type RepeatChoice = "days" | "weekly" | "biweekly" | "monthly";

export const REPEAT_OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: "days", label: "Several Days" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
];

export interface PlanShape {
  interval_weeks: number;
  weekdays: number[] | null;
  monthly: boolean;
}

/** The plan's shape from the form, or the field to fix. */
export function parsePlanRepeat(
  form: FormData,
): { shape: PlanShape } | { field: "repeat" | "weekdays"; message: string } {
  const repeat = String(form.get("repeat") ?? "");
  switch (repeat) {
    case "days": {
      const days = [
        ...new Set(
          form
            .getAll("weekdays")
            .map(Number)
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ].sort((a, b) => a - b);
      if (days.length < 2) return { field: "weekdays", message: "Pick two or more days." };
      return { shape: { interval_weeks: 1, weekdays: days, monthly: false } };
    }
    case "weekly":
      return { shape: { interval_weeks: 1, weekdays: null, monthly: false } };
    case "biweekly":
      return { shape: { interval_weeks: 2, weekdays: null, monthly: false } };
    case "monthly":
      return { shape: { interval_weeks: 1, weekdays: null, monthly: true } };
    default:
      return { field: "repeat", message: "Pick how often." };
  }
}
