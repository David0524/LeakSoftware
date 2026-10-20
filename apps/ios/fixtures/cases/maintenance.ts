import {
  VISIT_REPORT_MODES,
  visitReportMode,
  CLEANING_DUE_SOON_DAYS,
  CLEANING_MONTHS,
  cadenceLabel,
  cleaningCountdown,
  cleaningDueSpoken,
  cleaningShortLabel,
  cleaningCadence,
  cleaningDefaultMonths,
  cleaningKind,
  cleaningMonthsLabel,
  cleaningSummary,
  FILTER_REPLACE_KEY,
  filterAge,
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
const dues = [
  { days: -30, weeks: 0 },
  { days: -1, weeks: 0 },
  { days: 0, weeks: 0 },
  { days: 1, weeks: 0 },
  { days: 3, weeks: 0 },
  { days: 6, weeks: 1 },
  { days: 7, weeks: 1 },
  { days: 10, weeks: 1 },
  { days: 11, weeks: 2 },
  { days: 28, weeks: 4 },
  { days: 365, weeks: 52 },
];

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
  CLEANING_MONTHS: rule(() => CLEANING_MONTHS, [[]]),
  CLEANING_DUE_SOON_DAYS: rule(() => CLEANING_DUE_SOON_DAYS, [[]]),
  cleaningMonthsLabel: rule((m: number) => cleaningMonthsLabel(m), [[1], [2], [3], [6], [12], [4]]),
  // Salt wins over filter; key or name; any case.
  cleaningKind: rule(
    (t: { key?: string | null; name?: string | null }) => cleaningKind(t),
    [
      [{ key: "svc_filter_clean", name: "Clean filter" }],
      [{ key: "svc_salt_clean", name: "Clean salt cell" }],
      [{ key: null, name: "FILTER rinse" }],
      [{ key: "svc_x", name: "Salt and filter check" }],
      [{ key: "svc_brush", name: "Brush walls" }],
      [{}],
      [{ name: null }],
      [{ key: "SALT" }],
      [{ key: "svc_filter_replace", name: "Replace filter" }],
      [{ key: null, name: "New filter (replace)" }],
      [{ key: "svc_x", name: "Replace salt cell filter" }],
      [{ key: "svc_replace", name: "Replace pump" }],
    ],
  ),
  cleaningCadence: rule((m: number) => cleaningCadence(m), [[1], [2], [3], [6], [12]]),
  cleaningSummary: rule(
    (name: string, c: { every_months: number; price_cents: number | null }) =>
      cleaningSummary(name, c),
    [
      ["Clean filter", { every_months: 3, price_cents: 4000 }],
      ["Clean salt cell", { every_months: 6, price_cents: null }],
      ["Replace filter", { every_months: 12, price_cents: 0 }],
      ["Brush", { every_months: 1, price_cents: 12345 }],
    ],
  ),
  FILTER_REPLACE_KEY: rule(() => FILTER_REPLACE_KEY, [[]]),
  cleaningDefaultMonths: rule(
    (settings: unknown, key: string | null) => cleaningDefaultMonths(settings, key),
    [
      [{}, "svc_filter_replace"],
      [{}, "svc_filter_clean"],
      [null, null],
      [{ maintenance: { cleaning_months: { svc_filter_replace: 6 } } }, "svc_filter_replace"],
      [{ maintenance: { cleaning_months: { svc_filter_clean: 2 } } }, "svc_filter_clean"],
      [{ maintenance: { cleaning_months: { svc_filter_clean: "6" } } }, "svc_filter_clean"],
      [{ maintenance: { cleaning_months: { svc_filter_clean: 4 } } }, "svc_filter_clean"],
      [{ maintenance: { cleaning_months: { svc_filter_replace: 4 } } }, "svc_filter_replace"],
      [{ maintenance: { cleaning_months: { svc_filter_clean: 1.5 } } }, "svc_filter_clean"],
      [{ maintenance: { cleaning_months: null } }, "svc_salt_clean"],
      [{ maintenance: { cleaning_months: { svc_salt_clean: 12 } } }, null],
    ],
  ),
  filterAge: rule(
    (last: string | null, today: string) => filterAge(last, today),
    [
      [null, "2026-10-19"],
      ["", "2026-10-19"],
      ["2026-10-20", "2026-10-19"],
      ["2026-10-19", "2026-10-19"],
      ["2026-10-15", "2026-10-19"],
      ["2026-10-12", "2026-10-19"],
      ["2026-09-28", "2026-10-19"],
      ["2026-09-20", "2026-10-19"],
      ["2026-09-19", "2026-10-19"],
      ["2026-09-18", "2026-10-19"],
      ["2026-02-19", "2026-10-19"],
      ["2025-10-20", "2026-10-19"],
      ["2024-10-19", "2026-10-19"],
      ["2024-08-01", "2026-10-19"],
      ["2016-03-31", "2026-10-19"],
      ["2026-01-31", "2026-03-01"],
      ["2028-02-29", "2028-03-28"],
      ["not a date", "2026-10-19"],
    ],
  ),
  // Days and weeks to a due date, across months, years, and a leap day.
  cleaningCountdown: rule(
    (nextDue: string, on: string) => cleaningCountdown(nextDue, on),
    [
      ["2026-10-19", "2026-10-19"],
      ["2026-10-20", "2026-10-19"],
      ["2026-10-24", "2026-10-19"],
      ["2026-10-25", "2026-10-19"],
      ["2026-10-26", "2026-10-19"],
      ["2026-10-29", "2026-10-19"],
      ["2026-10-30", "2026-10-19"],
      ["2026-11-30", "2026-10-19"],
      ["2026-10-18", "2026-10-19"],
      ["2025-10-19", "2026-10-19"],
      ["2027-01-19", "2026-10-19"],
      ["2028-03-01", "2028-02-28"],
      ["2026-11-02", "2026-10-31"],
    ],
  ),
  // Today's few words beside a cleaning's icon, and what VoiceOver reads.
  cleaningShortLabel: rule(
    (due: { days: number; weeks: number }) => cleaningShortLabel(due),
    dues.map((d) => [d]),
  ),
  cleaningDueSpoken: rule(
    (name: string, due: { days: number; weeks: number }) => cleaningDueSpoken(name, due),
    dues.flatMap((d) => [
      ["Clean filter", d] as [string, typeof d],
      ["Clean salt cell", d] as [string, typeof d],
    ]),
  ),
  // Visit reports (owner, 2026-10-20).
  VISIT_REPORT_MODES: rule(() => VISIT_REPORT_MODES, [[]]),
  visitReportMode: rule(
    (settings: unknown) => visitReportMode(settings),
    [
      [null],
      [{}],
      [{ visit_reports: "auto" }],
      [{ visit_reports: "off" }],
      [{ visit_reports: "weekly" }],
    ],
  ),
};
