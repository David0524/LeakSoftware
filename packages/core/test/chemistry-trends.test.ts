import { describe, expect, it } from "vitest";
import {
  CHEMICAL_KEYS,
  DOSE_LIMITS,
  chemicalCostBars,
  costSummary,
  doseWarning,
  outOfRangeNotification,
  outOfRangeReadings,
  outOfRangeRows,
  readingSeries,
  trendWindow,
  type ChemicalAddition,
  type ChemicalReading,
} from "../src";

const NOW = "2026-11-16T15:00:00Z";

const reading = (o: Partial<ChemicalReading>): ChemicalReading => ({
  id: "r",
  property_id: "p",
  recorded_at: "2026-11-10T14:00:00Z",
  ...o,
});

const add = (o: Partial<ChemicalAddition>): ChemicalAddition => ({
  id: "a",
  job_id: "j",
  property_id: "p",
  price_book_item_id: "cl",
  name: "Liquid chlorine",
  unit: "gal",
  reading_key: null,
  suggested_quantity: null,
  quantity: 1,
  customer_supplied: false,
  note: null,
  unit_price_cents: 800,
  added_at: "2026-10-23T14:00:00Z",
  sort_order: 0,
  ...o,
});

describe("trends", () => {
  it("windows end now and reach back 90 days, six months, a year", () => {
    expect(trendWindow("90d", NOW).from).toBe("2026-08-18T15:00:00.000Z");
    expect(trendWindow("6m", NOW).from).toBe("2026-05-17T15:00:00.000Z");
    expect(trendWindow("1y", NOW).from).toBe("2025-11-16T15:00:00.000Z");
  });

  const log = [
    reading({ id: "b", recorded_at: "2026-10-18T14:00:00Z", fc: 5, ph: 7.7 }),
    reading({ id: "a", recorded_at: "2026-09-20T14:00:00Z", fc: 3.5, ph: 7.5, salt: 3100 }),
    reading({ id: "old", recorded_at: "2026-02-01T14:00:00Z", fc: 9 }),
    reading({ id: "c", recorded_at: "2026-11-10T14:00:00Z", fc: 2.5, goals: { fc: 4 } }),
  ];

  it("makes a line per reading taken, oldest first, with the range to shade", () => {
    const series = readingSeries(log, "90d", NOW);
    expect(series.map((s) => s.key)).toEqual(["fc", "ph", "salt"]);
    const fc = series[0]!;
    expect(fc.points.map((p) => p.value)).toEqual([3.5, 5, 2.5]);
    // The latest reading aimed for 4, so it is judged from 3.5 to 6.
    expect([fc.low, fc.high, fc.status]).toEqual([3.5, 6, "low"]);
    expect(fc.min).toBeLessThanOrEqual(2.5);
    expect(fc.max).toBeGreaterThanOrEqual(6);
    expect(fc.summary).toBe(
      "Free chlorine: 3 readings, from 3.5 to 2.5 (low). Lowest 2.5, highest 5. Aim for 3.5 to 6.",
    );
    expect(series[2]!.summary).toBe("Salt: 1 reading, 3100 (in range). Aim for 2700 to 3400.");
  });

  it("reaches further back with a longer period, and is empty without readings", () => {
    expect(readingSeries(log, "90d", NOW)[0]!.points).toHaveLength(3);
    expect(readingSeries(log, "1y", NOW)[0]!.points).toHaveLength(4);
    expect(readingSeries([], "90d", NOW)).toEqual([]);
  });

  it("totals the chemical cost per month, every month shown, nothing for customer-supplied", () => {
    const bars = chemicalCostBars(
      [
        add({ added_at: "2026-08-20T14:00:00Z", quantity: 2 }),
        add({ added_at: "2026-10-03T14:00:00Z", quantity: 1.5, unit_price_cents: 1500 }),
        add({ added_at: "2026-10-04T14:00:00Z", customer_supplied: true }),
        add({ added_at: "2026-10-05T14:00:00Z", deleted_at: "2026-10-06T00:00:00Z" }),
      ],
      "90d",
      NOW,
      "UTC",
    );
    expect(bars).toEqual([
      { month: "2026-08", label: "Aug", cents: 1600 },
      { month: "2026-09", label: "Sep", cents: 0 },
      { month: "2026-10", label: "Oct", cents: 2250 },
      { month: "2026-11", label: "Nov", cents: 0 },
    ]);
    expect(costSummary(bars)).toBe(
      "Chemicals cost $38.50 in 4 months. Aug $16.00, Sep $0.00, Oct $22.50, Nov $0.00.",
    );
    expect(chemicalCostBars([], "1y", NOW, "UTC")).toHaveLength(13);
  });
});

describe("out of range", () => {
  it("flags a reading only past the margin beyond the range", () => {
    const flagged = (o: Partial<ChemicalReading>) =>
      outOfRangeReadings(reading(o)).map((x) => `${x.key} ${x.direction}`);
    expect(flagged({ ph: 7.8, ta: 60, ch: 150, cya: 20, salt: 2400, fc: 1 })).toEqual([]);
    expect(flagged({ ph: 7.81 })).toEqual(["ph high"]);
    expect(flagged({ ta: 59, salt: 2399 })).toEqual(["ta low", "salt low"]);
    // Free chlorine's range follows the stabilizer: 7.5 to 10.5 at 100.
    expect(flagged({ fc: 4, cya: 100 })).toEqual(["fc low", "cya high"]);
    // The tech's own level moves the range.
    expect(flagged({ fc: 2.5, goals: { fc: 6 } })).toEqual(["fc low"]);
    expect(flagged({})).toEqual([]);
  });

  it("lists the last 30 days newest first, a row per reading", () => {
    const rows = outOfRangeRows(
      [
        reading({ id: "old", recorded_at: "2026-10-01T10:00:00Z", ph: 8.4 }),
        reading({
          id: "a",
          recorded_at: "2026-11-01T10:00:00Z",
          ph: 8.4,
          fc: 0.2,
          recorded_by: "u",
        }),
        reading({ id: "b", recorded_at: "2026-11-12T10:00:00Z", ta: 200 }),
        reading({ id: "future", recorded_at: "2026-11-20T10:00:00Z", ta: 200 }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["b:ta", "a:fc", "a:ph"]);
    expect(rows[1]).toMatchObject({
      readingId: "a",
      recordedBy: "u",
      valueText: "0.2",
      range: "3–6",
    });
    expect(rows[0]!.recordedBy).toBeNull();
  });

  it("words the push", () => {
    const found = outOfRangeReadings(reading({ ph: 8.2 }));
    expect(outOfRangeNotification("Rebecca Soto", found)).toEqual({
      title: "Out-of-range reading",
      body: "Rebecca Soto: pH 8.2 high (aim 7.4–7.6)",
    });
  });
});

describe("dose limits", () => {
  it("has a limit for every chemical", () => {
    expect(Object.keys(DOSE_LIMITS).sort()).toEqual([...CHEMICAL_KEYS].sort());
  });

  it("warns above the limit for the pool's size, never below it", () => {
    const w = (q: number, gallons: number | null, unit = "gal") =>
      doseWarning({ chemical: "liquid_chlorine", unit, quantity: q, gallons });
    expect(w(1, 10_000)).toBeNull();
    expect(w(2, 20_000)).toBeNull();
    expect(w(2.5, 20_000)).toBe(
      "That’s more than the usual 1 gal per 10,000 gal at once. Check the amount.",
    );
    // The limit is shown in the item's unit.
    expect(w(5, 10_000, "qt")).toContain("usual 4 qt per 10,000 gal");
  });

  it("stays quiet when it can't compare", () => {
    const base = { chemical: "liquid_chlorine", unit: "gal", quantity: 9 };
    expect(doseWarning({ ...base, gallons: null })).toBeNull();
    expect(doseWarning({ ...base, gallons: 0 })).toBeNull();
    expect(doseWarning({ ...base, unit: "jug", gallons: 10_000 })).toBeNull();
    expect(doseWarning({ ...base, chemical: null, gallons: 10_000 })).toBeNull();
    expect(doseWarning({ ...base, chemical: "mystery", gallons: 10_000 })).toBeNull();
  });
});
