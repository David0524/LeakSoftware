import {
  cadenceLabel,
  maintenanceSettings,
  planRepeat,
  planSummary,
  upcomingVisitDates,
  type ServicePlan,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

type Shape = Pick<
  ServicePlan,
  | "starts_on"
  | "interval_weeks"
  | "weekdays"
  | "monthly"
  | "visit_time"
  | "duration_minutes"
  | "price_cents"
  | "ends_on"
  | "paused"
>;

const plan = (over: Partial<Shape> = {}): Shape => ({
  starts_on: "2026-10-20",
  interval_weeks: 1,
  weekdays: null,
  monthly: false,
  visit_time: null,
  duration_minutes: 30,
  price_cents: null,
  ends_on: null,
  paused: false,
  ...over,
});

// Weekly on a Tuesday, every 2 weeks, several days, monthly in each week of the month (the
// 5th week counts as the 4th), and older plans every 3 or 4 weeks (read as monthly).
const plans: Shape[] = [
  plan(),
  plan({ interval_weeks: 2 }),
  plan({ weekdays: [4, 1] }),
  plan({ weekdays: [5, 1, 3] }),
  plan({ weekdays: [0] }),
  plan({ weekdays: [] }),
  plan({ monthly: true }),
  plan({ monthly: true, starts_on: "2026-10-01" }),
  plan({ monthly: true, starts_on: "2026-10-29" }),
  plan({ monthly: true, starts_on: "2026-10-31" }),
  plan({ interval_weeks: 3 }),
  plan({ interval_weeks: 4, starts_on: "2026-11-15" }),
  plan({ visit_time: "10:00:00", price_cents: 18000 }),
  plan({ visit_time: "07:05", duration_minutes: 45, price_cents: 0 }),
  plan({ visit_time: "", price_cents: 123456 }),
  plan({ visit_time: "13:30:00", weekdays: [2, 6], price_cents: 9950 }),
];

// maintenance.ts: plan settings, how often, the plan in one line, and its next visit dates.
export const maintenance: ModuleCases = {
  maintenanceSettings: rule(
    (settings: unknown) => maintenanceSettings(settings),
    [
      [null],
      [{}],
      [{ maintenance: null }],
      [{ maintenance: { visit_minutes: 45, weeks_ahead: 8 } }],
      [{ maintenance: { visit_minutes: "60", weeks_ahead: "2" } }],
      [{ maintenance: { visit_minutes: 5, weeks_ahead: 13 } }],
      [{ maintenance: { visit_minutes: 240, weeks_ahead: 12 } }],
      [{ maintenance: { visit_minutes: 241, weeks_ahead: 0 } }],
      [{ maintenance: { visit_minutes: 30.5, weeks_ahead: 1.5 } }],
      [{ maintenance: { visit_minutes: true, weeks_ahead: [3] } }],
      [{ maintenance: { visit_minutes: "", weeks_ahead: "abc" } }],
    ],
  ),
  planRepeat: rule(
    (p: Shape) => planRepeat(p),
    plans.map((p) => [p]),
  ),
  cadenceLabel: rule(
    (p: Shape) => cadenceLabel(p),
    plans.map((p) => [p]),
  ),
  planSummary: rule(
    (p: Shape) => planSummary(p),
    plans.map((p) => [p]),
  ),
  upcomingVisitDates: rule(
    (p: Shape, from: string, count?: number) => upcomingVisitDates(p, from, count),
    [
      ...plans.map((p): [Shape, string, number?] => [p, "2026-10-19"]),
      ...plans.map((p): [Shape, string, number?] => [p, "2026-12-30", 6]),
      [plan({ paused: true }), "2026-10-19"],
      [plan({ ends_on: "2026-11-03" }), "2026-10-19"],
      [plan({ ends_on: "2026-10-19" }), "2026-10-01"],
      [plan({ interval_weeks: 2, ends_on: "2027-01-01" }), "2026-11-01", 10],
      [plan({ monthly: true, starts_on: "2026-10-31" }), "2026-10-19", 3],
      [plan({ weekdays: [1, 3, 5] }), "2026-10-19", 0],
      [plan({ starts_on: "2027-02-28" }), "2026-10-19", 3],
      [plan({ starts_on: "2028-02-29", monthly: true }), "2028-01-01", 5],
    ],
  ),
};
