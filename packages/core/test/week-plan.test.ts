import { describe, expect, it } from "vitest";
import {
  estimateDriveMinutes,
  jobLock,
  lockColumns,
  lockReason,
  lockSavedMessage,
  planWeek,
  planWeekSummary,
  durationLabel,
  type WeekDay,
  type WeekJob,
} from "../src";

const day = { startMin: 8 * 60, endMin: 17 * 60 };
const depot = { lat: 33.45, lng: -112.07 };
// Two areas: north (~25 min away) and south (~25 min away the other way).
const north = (i: number) => ({ lat: 33.65 + i * 0.002, lng: -112.07 });
const south = (i: number) => ({ lat: 33.25 - i * 0.002, lng: -112.07 });
const job = (
  id: string,
  loc: { lat: number; lng: number },
  over: Partial<WeekJob> = {},
): WeekJob => ({
  id,
  location: loc,
  durationMin: 30,
  techId: null,
  date: null,
  techs: ["t1"],
  ...over,
});
const days = (dates: string[], stays: Record<string, WeekDay["stays"]> = {}): WeekDay[] =>
  dates.map((date) => ({ techId: "t1", date, stays: stays[date] ?? [] }));

describe("locks", () => {
  it("reads day, time, both, and the old fixed time as both", () => {
    expect(jobLock({})).toBe("none");
    expect(jobLock({ lock_day: true })).toBe("day");
    expect(jobLock({ lock_time: true })).toBe("time");
    expect(jobLock({ lock_day: true, lock_time: true })).toBe("both");
    expect(jobLock({ arrival_fixed: true })).toBe("both");
    expect(lockColumns("time")).toEqual({ lock_day: false, lock_time: true, arrival_fixed: false });
    expect(lockColumns("both")).toEqual({ lock_day: true, lock_time: true, arrival_fixed: true });
  });
  it("says what a lock-only save did", () => {
    expect(lockSavedMessage("day")).toBe("Day locked.");
    expect(lockSavedMessage("time")).toBe("Time locked.");
    expect(lockSavedMessage("both")).toBe("Locked.");
    expect(lockSavedMessage("none")).toBe("Lock removed.");
  });
  it("planning a day keeps time locks, not day locks", () => {
    const base = {
      id: "j",
      status: "scheduled" as const,
      property: null,
      second_tech_id: null,
    };
    expect(lockReason({ ...base, lock_day: true })).toBeNull();
    expect(lockReason({ ...base, lock_time: true })).toBe("time");
    expect(lockReason({ ...base, lock_day: true, lock_time: true })).toBe("fixed");
  });
});

describe("planWeek", () => {
  it("puts each area on its own day when both don't fit in one", () => {
    // Three 2-hour jobs in each area: an area is a day's work.
    const jobs = [0, 1, 2].flatMap((i) => [
      job(`n${i}`, north(i), { durationMin: 120 }),
      job(`s${i}`, south(i), { durationMin: 120 }),
    ]);
    const p = planWeek({
      days: days(["2026-10-26", "2026-10-27"]),
      jobs,
      depot,
      day,
      drive: estimateDriveMinutes,
    });
    const dayOf = (id: string) => p.placed.find((x) => x.id === id)!.date;
    expect(new Set(["n0", "n1", "n2"].map(dayOf)).size).toBe(1);
    expect(new Set(["s0", "s1", "s2"].map(dayOf)).size).toBe(1);
    expect(dayOf("n0")).not.toBe(dayOf("s0"));
    expect(p.unplaced).toEqual([]);
    expect(p.moved).toBe(6);
  });

  it("drives less than the week did, and says so", () => {
    const jobs = [
      job("a", north(0), { techId: "t1", date: "2026-10-26" }),
      job("b", south(0), { techId: "t1", date: "2026-10-26" }),
      job("c", north(1), { techId: "t1", date: "2026-10-27" }),
      job("d", south(1), { techId: "t1", date: "2026-10-27" }),
    ];
    const p = planWeek({
      days: days(["2026-10-26", "2026-10-27"]),
      jobs,
      depot,
      day,
      drive: estimateDriveMinutes,
    });
    expect(p.driveAfter).toBeLessThan(p.driveBefore);
    expect(planWeekSummary(p, durationLabel)).toMatch(/^Moved 2 jobs · .+ less driving$/);
  });

  it("keeps a time lock's clock time on its new day", () => {
    const p = planWeek({
      days: days(["2026-10-26"]),
      jobs: [job("a", north(0), { timeMin: 13 * 60 })],
      depot,
      day,
      drive: estimateDriveMinutes,
    });
    const stop = p.days[0]!.route.stops[0]!;
    expect(stop.startMin).toBe(13 * 60);
  });

  it("goes only to its own techs, and leaves Needs a Time jobs that don't fit", () => {
    const long = (id: string) => job(id, north(0), { durationMin: 300 });
    const p = planWeek({
      days: days(["2026-10-26"]),
      jobs: [long("a"), long("b"), job("x", north(0), { techs: ["t2"] })],
      depot,
      day,
      drive: estimateDriveMinutes,
    });
    expect(p.placed.map((x) => x.id)).toEqual(["a"]);
    expect(p.unplaced).toEqual(["b", "x"]);
    expect(planWeekSummary(p, durationLabel)).toContain("2 didn’t fit and stay in Needs a Time");
  });

  it("keeps a scheduled job that fits nowhere on its own day", () => {
    const p = planWeek({
      days: days(["2026-10-26"], {
        "2026-10-26": [{ id: "big", location: north(0), durationMin: 520, fixedStartMin: 8 * 60 }],
      }),
      jobs: [job("a", south(0), { techId: "t1", date: "2026-10-26" })],
      depot,
      day,
      drive: estimateDriveMinutes,
    });
    expect(p.placed).toEqual([{ id: "a", techId: "t1", date: "2026-10-26" }]);
    expect(p.moved).toBe(0);
    expect(p.days[0]!.stops.map((s) => s.id).sort()).toEqual(["a", "big"]);
  });

  it("plans the first 150 and leaves the rest", () => {
    const jobs = Array.from({ length: 152 }, (_, i) =>
      job(`j${String(i).padStart(3, "0")}`, north(i), { durationMin: 1 }),
    );
    const p = planWeek({ days: days(["2026-10-26"]), jobs, depot, day, drive: () => 0 });
    expect(p.skipped).toEqual(["j150", "j151"]);
  });

  it("gives the same answer twice", () => {
    const input = {
      days: days(["2026-10-26", "2026-10-27", "2026-10-28"]),
      jobs: [north(0), south(0), north(2), south(3), north(4)].map((l, i) => job(`j${i}`, l)),
      depot,
      day,
      drive: estimateDriveMinutes,
    };
    expect(planWeek(input)).toEqual(planWeek(input));
  });
});
