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
    ).toBe("Every Tuesday · 10:00 AM · 30 min · $95.00 a month");
    expect(cadenceLabel({ starts_on: "2026-10-13", interval_weeks: 1, weekdays: [4, 1] })).toBe(
      "Every Monday and Thursday",
    );
    expect(cadenceLabel({ starts_on: "2026-10-13", interval_weeks: 1, weekdays: [1, 3, 5] })).toBe(
      "Every Monday, Wednesday, and Friday",
    );
    expect(cadenceLabel({ starts_on: "2026-10-13", interval_weeks: 1, monthly: true })).toBe(
      "Monthly on the 2nd Tuesday",
    );
    // An older every-4-weeks plan reads as monthly; a 5th weekday repeats on the 4th.
    expect(cadenceLabel({ starts_on: "2026-12-29", interval_weeks: 4 })).toBe(
      "Monthly on the 4th Tuesday",
    );
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

  it("previews several days a week and monthly plans (same cases as 420_plan_schedule)", () => {
    const base = { interval_weeks: 1, ends_on: null, paused: false };
    // 2026-11-02 is a Monday.
    expect(
      upcomingVisitDates({ ...base, starts_on: "2026-11-02", weekdays: [1, 4] }, "2026-11-01"),
    ).toEqual(["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"]);
    expect(
      upcomingVisitDates({ ...base, starts_on: "2026-11-10", monthly: true }, "2026-11-01", 3),
    ).toEqual(["2026-11-10", "2026-12-08", "2027-01-12"]);
    expect(
      upcomingVisitDates({ ...base, starts_on: "2026-12-29", monthly: true }, "2026-12-01", 2),
    ).toEqual(["2027-01-26", "2027-02-23"]);
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

describe("cleanings due (owner, 2026-10-19)", () => {
  it("counts down in days within a week, then weeks", async () => {
    const { cleaningCountdown } = await import("../src/maintenance");
    expect(cleaningCountdown("2026-10-19", "2026-10-19")).toMatchObject({
      days: 0,
      soon: true,
      label: "Due today",
    });
    expect(cleaningCountdown("2026-10-24", "2026-10-19").label).toBe("Due in 5 days");
    expect(cleaningCountdown("2026-10-20", "2026-10-19").label).toBe("Due in 1 day");
    expect(cleaningCountdown("2026-10-26", "2026-10-19")).toMatchObject({ soon: true });
    expect(cleaningCountdown("2026-11-30", "2026-10-19")).toMatchObject({
      weeks: 6,
      soon: false,
      label: "In 6 weeks",
    });
    expect(cleaningCountdown("2026-10-10", "2026-10-19").label).toBe("Overdue");
  });

  it("tells filters from salt cells, and reads the shop's usual frequency", async () => {
    const { cleaningKind, cleaningDefaultMonths, cleaningMonthsLabel } =
      await import("../src/maintenance");
    expect(cleaningKind({ key: "svc_filter_clean", name: "Clean filter" })).toBe("filter");
    expect(cleaningKind({ key: "svc_salt_clean", name: "Clean salt cell" })).toBe("salt_cell");
    expect(cleaningKind({ key: "x", name: "Acid wash" })).toBe("other");
    const settings = {
      maintenance: { cleaning_months: { svc_salt_clean: 6, svc_filter_clean: 5 } },
    };
    expect(cleaningDefaultMonths(settings, "svc_salt_clean")).toBe(6);
    expect(cleaningDefaultMonths(settings, "svc_filter_clean")).toBe(3);
    expect(cleaningDefaultMonths(null, "svc_filter_clean")).toBe(3);
    expect(cleaningMonthsLabel(12)).toBe("Yearly");
  });
});

describe("cleaningShortLabel", () => {
  it("says only how far off it is", async () => {
    const { cleaningCountdown, cleaningShortLabel, cleaningDueSpoken } =
      await import("../src/maintenance");
    const on = (due: string) => cleaningCountdown(due, "2026-10-19");
    expect(cleaningShortLabel(on("2026-10-18"))).toBe("Overdue");
    expect(cleaningShortLabel(on("2026-10-19"))).toBe("Today");
    expect(cleaningShortLabel(on("2026-10-20"))).toBe("1 day");
    expect(cleaningShortLabel(on("2026-10-22"))).toBe("3 days");
    expect(cleaningShortLabel(on("2026-10-26"))).toBe("1 week");
    expect(cleaningShortLabel(on("2026-11-16"))).toBe("4 weeks");
    expect(cleaningDueSpoken("Clean filter", on("2026-10-22"))).toBe("Clean filter due in 3 days");
    expect(cleaningDueSpoken("Clean salt cell", on("2026-10-19"))).toBe(
      "Clean salt cell due today",
    );
    expect(cleaningDueSpoken("Clean filter", on("2026-10-01"))).toBe("Clean filter overdue");
  });
});

describe("Replace filter", () => {
  it("is its own kind, a year apart by default, with the filter's age", async () => {
    const { cleaningKind, cleaningDefaultMonths, filterAge } = await import("../src/maintenance");
    expect(cleaningKind({ key: "svc_filter_replace", name: "Replace filter" })).toBe(
      "filter_replace",
    );
    expect(cleaningKind({ key: "svc_filter_clean", name: "Clean filter" })).toBe("filter");
    expect(cleaningDefaultMonths({}, "svc_filter_replace")).toBe(12);
    expect(cleaningDefaultMonths({}, "svc_filter_clean")).toBe(3);
    expect(
      cleaningDefaultMonths(
        { maintenance: { cleaning_months: { svc_filter_replace: 6 } } },
        "svc_filter_replace",
      ),
    ).toBe(6);
    expect(filterAge(null, "2026-10-19")).toBeNull();
    expect(filterAge("2026-10-20", "2026-10-19")).toBeNull();
    expect(filterAge("2026-10-15", "2026-10-19")).toBe("New filter");
    expect(filterAge("2026-10-12", "2026-10-19")).toBe("Filter 1 week old");
    expect(filterAge("2026-09-28", "2026-10-19")).toBe("Filter 3 weeks old");
    expect(filterAge("2026-09-18", "2026-10-19")).toBe("Filter 1 month old");
    expect(filterAge("2026-02-19", "2026-10-19")).toBe("Filter 8 months old");
    expect(filterAge("2024-08-01", "2026-10-19")).toBe("Filter 2 years old");
  });
});
