import {
  DOSE_LIMITS,
  OUT_OF_RANGE_MARGIN,
  TREND_PERIODS,
  chemicalCostBars,
  costSummary,
  doseWarning,
  outOfRangeLine,
  outOfRangeNotification,
  outOfRangeReadings,
  outOfRangeRows,
  readingSeries,
  trendWindow,
  type ChemicalAddition,
  type ChemicalReading,
  type TrendPeriod,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// chemistry-trends.ts (docs/design/2026-11-16-chemistry-trends.md): the pool's chart series, the
// out-of-range readings and their alert, and the dose limits.

const NOW = "2026-11-16T15:00:00Z";

const reading = (o: Partial<ChemicalReading>): ChemicalReading => ({
  id: "r",
  property_id: "p",
  job_id: null,
  recorded_at: "2026-11-10T14:00:00Z",
  recorded_by: "u1",
  gallons: 15000,
  fc: null,
  ph: null,
  ta: null,
  ch: null,
  cya: null,
  salt: null,
  chlorine_product: null,
  acid_product: null,
  notes: null,
  goals: null,
  ...o,
});

const log: ChemicalReading[] = [
  reading({ id: "r1", recorded_at: "2026-08-20T14:00:00Z", fc: 1, ph: 7.9, ta: 70, cya: 30 }),
  reading({ id: "r2", recorded_at: "2026-09-20T14:00:00Z", fc: 3.5, ph: 7.5, ta: 90, ch: 250 }),
  reading({
    id: "r3",
    recorded_at: "2026-10-18T14:00:00Z",
    fc: 5,
    ph: 7.7,
    ta: 100,
    cya: 50,
    salt: 3100,
  }),
  reading({ id: "r4", recorded_at: "2026-11-10T14:00:00Z", fc: 2.5, ph: 7.4, goals: { fc: 4 } }),
  reading({ id: "r5", recorded_at: "2025-12-01T14:00:00Z", fc: 9, ph: 8.2, ta: 300 }),
  reading({ id: "r6", recorded_at: "2026-11-30T14:00:00Z", fc: 9 }),
];

const add = (o: Partial<ChemicalAddition>): ChemicalAddition => ({
  id: "a",
  job_id: "j",
  property_id: "p",
  price_book_item_id: "cl",
  name: "Liquid chlorine",
  unit: "gal",
  reading_key: "fc",
  suggested_quantity: 0.5,
  quantity: 0.5,
  customer_supplied: false,
  note: null,
  unit_price_cents: 800,
  taxable: true,
  billed_invoice_id: null,
  added_at: "2026-10-23T14:00:00Z",
  sort_order: 0,
  deleted_at: null,
  ...o,
});

const adds: ChemicalAddition[] = [
  add({ id: "1", added_at: "2026-08-12T14:00:00Z", quantity: 2 }),
  add({ id: "2", added_at: "2026-10-03T14:00:00Z", quantity: 1.5, unit_price_cents: 1500 }),
  add({ id: "3", added_at: "2026-10-23T14:00:00Z", customer_supplied: true }),
  add({ id: "4", added_at: "2026-10-30T14:00:00Z", deleted_at: "2026-10-31T00:00:00Z" }),
  add({ id: "5", added_at: "2026-11-01T03:00:00Z", quantity: 1 }),
  add({ id: "6", added_at: "2025-12-15T14:00:00Z", quantity: 4 }),
];

const periods: TrendPeriod[] = ["90d", "6m", "1y"];

const flagged = outOfRangeReadings(
  reading({ ph: 8.2, fc: 0.5, ta: 85, cya: 40, salt: 2000, ch: 500 }),
);

export const chemistryTrends: ModuleCases = {
  TREND_PERIODS: rule(() => TREND_PERIODS, [[]]),
  OUT_OF_RANGE_MARGIN: rule(() => OUT_OF_RANGE_MARGIN, [[]]),
  DOSE_LIMITS: rule(() => DOSE_LIMITS, [[]]),
  trendWindow: rule(
    (p: TrendPeriod, now: string) => trendWindow(p, now),
    periods.map((p) => [p, NOW] as [TrendPeriod, string]),
  ),
  readingSeries: rule(
    (rows: ChemicalReading[], p: TrendPeriod, now: string) => readingSeries(rows, p, now),
    [
      ...periods.map((p) => [log, p, NOW] as [ChemicalReading[], TrendPeriod, string]),
      [[], "90d", NOW],
      [[log[3]!], "90d", NOW],
    ],
  ),
  chemicalCostBars: rule(
    (rows: ChemicalAddition[], p: TrendPeriod, now: string, tz: string) =>
      chemicalCostBars(rows, p, now, tz),
    [
      ...periods.map(
        (p) =>
          [adds, p, NOW, "America/New_York"] as [ChemicalAddition[], TrendPeriod, string, string],
      ),
      [adds, "6m", NOW, "America/Los_Angeles"],
      [[], "90d", NOW, "UTC"],
    ],
  ),
  costSummary: rule(
    (rows: ChemicalAddition[], p: TrendPeriod, tz: string) =>
      costSummary(chemicalCostBars(rows, p, NOW, tz)),
    [
      [adds, "90d", "America/New_York"],
      [adds, "1y", "UTC"],
      [[], "90d", "UTC"],
    ],
  ),
  outOfRangeReadings: rule(
    (r: ChemicalReading) => outOfRangeReadings(r),
    [
      [reading({ ph: 8.2, fc: 0.5, ta: 85, cya: 40, salt: 2000, ch: 500 })],
      [reading({ ph: 7.7, fc: 4, ta: 125, cya: 90, salt: 3600, ch: 140 })],
      [reading({ ph: 7.8, fc: 1, ta: 59, ch: 149, cya: 19, salt: 2399 })],
      [reading({ ph: 7.81, fc: 0.99, cya: 100 })],
      [reading({ fc: 2.5, goals: { fc: 6 } })],
      [reading({ fc: 7.5, ph: 7.5, goals: { fc: 4, ph: 7.2 } })],
      [reading({})],
      ...log.map((r) => [r] as [ChemicalReading]),
    ],
  ),
  outOfRangeRows: rule(
    (rows: ChemicalReading[], now: string, days: number | null) =>
      outOfRangeRows(rows, now, days ?? undefined),
    [
      [log, NOW, null],
      [log, NOW, 400],
      [[], NOW, null],
    ],
  ),
  outOfRangeLine: rule(
    (i: number) => outOfRangeLine(flagged[i]!),
    flagged.map((_, i) => [i]),
  ),
  outOfRangeNotification: rule(
    (customer: string, n: number) => outOfRangeNotification(customer, flagged.slice(0, n)),
    [
      ["Rebecca Soto", 1],
      ["Rebecca Soto", 3],
      ["The customer", flagged.length],
    ],
  ),
  doseWarning: rule(
    (chemical: string | null, unit: string, quantity: number, gallons: number | null) =>
      doseWarning({ chemical, unit, quantity, gallons }),
    [
      ["liquid_chlorine", "gal", 1, 10000],
      ["liquid_chlorine", "gal", 1.25, 10000],
      ["liquid_chlorine", "gal", 2, 20000],
      ["liquid_chlorine", "gal", 2.5, 20000],
      ["liquid_chlorine", "qt", 5, 10000],
      ["liquid_chlorine", "jug", 50, 10000],
      ["liquid_chlorine", "gal", 5, null],
      ["liquid_chlorine", "gal", 5, 0],
      ["liquid_chlorine", "gal", 0, 10000],
      ["muriatic_acid", "gal", 1, 15000],
      ["muriatic_acid", "gal", 0.75, 15000],
      ["muriatic_acid", "qt", 4, 10000],
      ["stabilizer", "lb", 6, 15000],
      ["stabilizer", "lb", 4.5, 15000],
      ["stabilizer", "oz", 100, 10000],
      ["tabs", "tab", 4, 10000],
      ["tabs", "tab", 12, 30000],
      ["salt", "bag", 5, 10000],
      ["algaecide", "qt", 2, 10000],
      ["clarifier", "gal", 1, 10000],
      ["enzyme", "each", 3, 10000],
      ["soda_ash", "oz", 20, 10000],
      ["something_else", "gal", 50, 10000],
      [null, "gal", 50, 10000],
    ],
  ),
};
