import { describe, expect, it } from "vitest";
import { estimateDriveMinutes, moveServiceDay, serviceDays, suggestServiceDays } from "../src";

const plan = (over: Record<string, unknown>) => ({
  starts_on: "2026-10-05", // a Monday
  interval_weeks: 1,
  weekdays: null,
  monthly: false,
  ends_on: null,
  paused: false,
  ...over,
});

describe("service days", () => {
  it("reads a plan's weekdays", () => {
    expect(serviceDays(plan({}))).toEqual([1]);
    expect(serviceDays(plan({ weekdays: [4, 1] }))).toEqual([1, 4]);
  });

  it("moves a weekly plan to the nearest new day from today", () => {
    // Today Wed Oct 21; next visit Mon Oct 26; Thursday nearest it, on or after today: Oct 22.
    expect(moveServiceDay(plan({}), 1, 4, "2026-10-21")).toEqual({
      starts_on: "2026-10-22",
      weekdays: null,
    });
  });

  it("keeps every 2 weeks on its week", () => {
    // Every other Monday from Oct 5: next is Oct 19 (today), so Tuesday becomes Oct 20.
    expect(moveServiceDay(plan({ interval_weeks: 2 }), 1, 2, "2026-10-19").starts_on).toBe(
      "2026-10-20",
    );
  });

  it("keeps monthly in its week of the month", () => {
    // The 1st Monday (Oct 5); next is Nov 2. Friday in the same week: Nov 6.
    expect(moveServiceDay(plan({ monthly: true }), 1, 5, "2026-10-21").starts_on).toBe(
      "2026-11-06",
    );
  });

  it("swaps one day of a several-days plan", () => {
    expect(moveServiceDay(plan({ weekdays: [1, 4] }), 4, 3, "2026-10-21")).toEqual({
      starts_on: "2026-10-05",
      weekdays: [1, 3],
    });
  });
});

describe("suggestServiceDays", () => {
  const depot = { lat: 33.45, lng: -112.07 };
  const at = (lat: number) => ({ lat, lng: -112.07 });
  it("groups an area on a day and leaves what it can't place", () => {
    const place = [
      ...[0, 1, 2].map((i) => ({
        id: `n${i}`,
        techId: null,
        days: [],
        location: at(33.65 + i / 500),
        durationMin: 120,
      })),
      ...[0, 1, 2].map((i) => ({
        id: `s${i}`,
        techId: null,
        days: [],
        location: at(33.25 - i / 500),
        durationMin: 120,
      })),
      { id: "nomap", techId: null, days: [], location: null, durationMin: 30 },
      { id: "twice", techId: "t1", days: [1, 4], location: at(33.5), durationMin: 30 },
    ];
    const r = suggestServiceDays({
      place,
      keep: [],
      techs: ["t1"],
      workDays: [1, 2],
      depot,
      day: { startMin: 480, endMin: 1020 },
      drive: estimateDriveMinutes,
    });
    const dayOf = (id: string) => r.suggestions.find((s) => s.id === id)!.day;
    expect(new Set(["n0", "n1", "n2"].map(dayOf)).size).toBe(1);
    expect(new Set(["s0", "s1", "s2"].map(dayOf)).size).toBe(1);
    expect(dayOf("n0")).not.toBe(dayOf("s0"));
    expect(r.left.sort()).toEqual(["nomap", "twice"]);
  });
});
