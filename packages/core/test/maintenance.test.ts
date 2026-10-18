import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_DEFAULTS,
  cadenceLabel,
  cleaningSummary,
  maintenanceSettings,
  planSummary,
  upcomingVisitDates,
  userTransitions,
  verdictLabel,
  verdictOptions,
} from "../src";

describe("maintenance plans", () => {
  it("reads settings with defaults", () => {
    expect(maintenanceSettings({})).toEqual(MAINTENANCE_DEFAULTS);
    expect(maintenanceSettings({ maintenance: { visit_minutes: 20, weeks_ahead: 6 } })).toEqual({
      visitMinutes: 20,
      weeksAhead: 6,
    });
    expect(maintenanceSettings({ maintenance: { visit_minutes: 5, weeks_ahead: 50 } })).toEqual(
      MAINTENANCE_DEFAULTS,
    );
  });

  it("describes a plan in plain words", () => {
    // 2026-10-13 is a Tuesday.
    expect(cadenceLabel({ starts_on: "2026-10-13", interval_weeks: 1 })).toBe("Every Tuesday");
    expect(cadenceLabel({ starts_on: "2026-10-13", interval_weeks: 2 })).toBe(
      "Every 2 weeks on Tuesday",
    );
    expect(
      planSummary({
        starts_on: "2026-10-13",
        interval_weeks: 1,
        visit_time: "10:00:00",
        duration_minutes: 30,
        price_cents: 9500,
      }),
    ).toBe("Every Tuesday · 10:00 AM · 30 min · $95.00 a visit");
    expect(
      planSummary({
        starts_on: "2026-10-13",
        interval_weeks: 2,
        visit_time: null,
        duration_minutes: 20,
        price_cents: null,
      }),
    ).toBe("Every 2 weeks on Tuesday · any time · 20 min");
  });

  it("previews the next visits the way the database makes them", () => {
    const plan = { starts_on: "2026-09-01", interval_weeks: 2, ends_on: null, paused: false };
    // Sept 1 + 2-week steps: Sept 29, Oct 13, Oct 27, ...
    expect(upcomingVisitDates(plan, "2026-10-13")).toEqual([
      "2026-10-13",
      "2026-10-27",
      "2026-11-10",
      "2026-11-24",
    ]);
    expect(upcomingVisitDates(plan, "2026-10-14", 2)).toEqual(["2026-10-27", "2026-11-10"]);
    expect(upcomingVisitDates({ ...plan, ends_on: "2026-10-30" }, "2026-10-13")).toEqual([
      "2026-10-13",
      "2026-10-27",
    ]);
    expect(upcomingVisitDates({ ...plan, paused: true }, "2026-10-13")).toEqual([]);
    expect(upcomingVisitDates({ ...plan, starts_on: "2026-11-03" }, "2026-10-13", 1)).toEqual([
      "2026-11-03",
    ]);
  });

  it("checks service tasks as Done, Needs Attention, or Skipped", () => {
    expect(verdictOptions({ answer: "done" }).map((o) => o.label)).toEqual([
      "Done",
      "Needs Attention",
      "Skipped",
    ]);
    expect(verdictLabel({ status: "inspected", outcome: "ok" }, "done")).toBe("Done");
    expect(verdictLabel({ status: "inspected", outcome: "attention" }, "done")).toBe(
      "Needs attention",
    );
    expect(verdictLabel({ status: "excluded", outcome: null }, "done")).toBe("Skipped");
    expect(userTransitions("in_progress", "maintenance")).toContain("done");
  });
});

describe("scheduled cleanings", () => {
  it("says what, how often, and the price", () => {
    expect(cleaningSummary("Clean filter", { every_months: 3, price_cents: 4000 })).toBe(
      "Clean filter every 3 months · $40.00 each",
    );
    expect(cleaningSummary("Clean salt cell", { every_months: 1, price_cents: null })).toBe(
      "Clean salt cell every month",
    );
  });
});
