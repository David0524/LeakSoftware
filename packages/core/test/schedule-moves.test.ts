import { describe, expect, it } from "vitest";
import {
  ROUTING_DEFAULTS,
  estimateDriveMinutes,
  localMinutes,
  moveJobChange,
  planDay,
  renumberDay,
  suggestTimes,
  suggestionDates,
  zonedMinutesToIso,
  type PlanContext,
  type PlanJob,
} from "../src";

const TZ = "America/Phoenix"; // UTC-7 all year
const SHOP = { lat: 33.44879, lng: -112.07711 };
const ZOO = { latitude: 33.45006, longitude: -111.94886 };
const GOODYEAR = { latitude: 33.43532, longitude: -112.35818 };
const NEAR = { latitude: 33.4488, longitude: -112.0772 };

// Monday 2026-10-19, 7:00 AM in Phoenix.
const ctx: PlanContext = {
  timeZone: TZ,
  settings: ROUTING_DEFAULTS,
  depot: SHOP,
  today: "2026-10-19",
  nowMin: 7 * 60,
};

const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedMinutesToIso(date, h! * 60 + m!, TZ);
};

const job = (over: Partial<PlanJob> & { id: string }): PlanJob => ({
  status: "scheduled",
  assigned_user_id: "tony",
  second_tech_id: null,
  scheduled_start: null,
  scheduled_end: null,
  route_order: null,
  arrival_fixed: false,
  property: null,
  ...over,
});

describe("planDay", () => {
  it("orders the day for less driving and saves every stop's time and place", () => {
    const jobs = [
      job({ id: "far", property: GOODYEAR, scheduled_start: at("2026-10-20", "08:00") }),
      job({ id: "zoo", property: ZOO, scheduled_start: at("2026-10-20", "11:00") }),
      job({ id: "near", property: NEAR, scheduled_start: at("2026-10-20", "14:00") }),
    ];
    const r = planDay(ctx, "tony", "2026-10-20", jobs, estimateDriveMinutes);
    expect(r.error).toBeUndefined();
    expect(r.updates).toHaveLength(3);
    expect(r.updates.map((u) => u.route_order)).toEqual([1, 2, 3]);
    expect(r.updates.every((u) => u.scheduled_start && u.scheduled_end)).toBe(true);
    expect(r.message).toMatch(/^Planned: .* of driving/);
  });

  it("refuses past days and empty days", () => {
    expect(planDay(ctx, "tony", "2026-10-18", [job({ id: "a" })], estimateDriveMinutes).error).toBe(
      "Past days can’t be planned.",
    );
    expect(planDay(ctx, "tony", "2026-10-20", [], estimateDriveMinutes).error).toMatch(/Nothing/);
  });

  it("keeps a fixed time", () => {
    const fixed = job({
      id: "fixed",
      property: ZOO,
      arrival_fixed: true,
      scheduled_start: at("2026-10-20", "13:00"),
    });
    const r = planDay(ctx, "tony", "2026-10-20", [fixed], estimateDriveMinutes);
    expect(r.updates[0]).toEqual({ id: "fixed", route_order: 1 });
  });
});

describe("moveJobChange", () => {
  const base = { seesAll: true, userId: "owner", fromDay: [], targetDay: [] };

  it("puts a waiting job on a tech's day at the chosen place", () => {
    const first = job({
      id: "first",
      property: NEAR,
      scheduled_start: at("2026-10-20", "08:00"),
      scheduled_end: at("2026-10-20", "09:00"),
      route_order: 1,
    });
    const waiting = job({ id: "w", status: "unscheduled", assigned_user_id: null, property: ZOO });
    const r = moveJobChange(
      ctx,
      { ...base, job: waiting, tech: "tony", date: "2026-10-20", index: 1, targetDay: [first] },
      estimateDriveMinutes,
    );
    expect(r.error).toBeUndefined();
    expect(r.updates[0]).toMatchObject({ id: "w", assigned_user_id: "tony", status: "scheduled" });
    expect(localMinutes(r.updates[0]!.scheduled_start!, TZ)).toBeGreaterThan(9 * 60);
    expect(r.message).toMatch(/^Moved to /);
  });

  it("takes a job off the schedule and closes up the day it left", () => {
    const a = job({ id: "a", scheduled_start: at("2026-10-20", "08:00"), route_order: 1 });
    const b = job({ id: "b", scheduled_start: at("2026-10-20", "10:00"), route_order: 2 });
    const r = moveJobChange(
      ctx,
      { ...base, job: a, tech: null, date: null, index: 0, fromDay: [a, b] },
      estimateDriveMinutes,
    );
    expect(r.updates).toEqual([
      {
        id: "a",
        route_order: null,
        status: "unscheduled",
        scheduled_start: null,
        scheduled_end: null,
        arrival_fixed: false,
      },
      { id: "b", route_order: 1 },
    ]);
    expect(r.message).toBe("Taken off the schedule.");
  });

  it("keeps the time of day when nobody is assigned", () => {
    const a = job({ id: "a", scheduled_start: at("2026-10-20", "10:30") });
    const r = moveJobChange(
      ctx,
      { ...base, job: a, tech: null, date: "2026-10-21", index: 0 },
      estimateDriveMinutes,
    );
    expect(r.updates[0]!.assigned_user_id).toBeNull();
    expect(r.updates[0]!.scheduled_start).toBe(at("2026-10-21", "10:30"));
    expect(r.message).toMatch(/Needs a Time, still booked for 10:30 AM/);
  });

  it("follows the website's rules", () => {
    const started = job({
      id: "s",
      status: "in_progress",
      scheduled_start: at("2026-10-20", "08:00"),
    });
    const move = (over: Partial<Parameters<typeof moveJobChange>[1]>) =>
      moveJobChange(
        ctx,
        { ...base, job: job({ id: "j" }), tech: "tony", date: "2026-10-20", index: 0, ...over },
        estimateDriveMinutes,
      ).error;
    expect(move({ job: job({ id: "c", status: "canceled" }) })).toMatch(/canceled/);
    expect(move({ job: started, date: null })).toMatch(/has started/);
    expect(move({ date: "2026-10-18" })).toBe("Pick today or a later day.");
    expect(move({ seesAll: false, userId: "tech" })).toMatch(/only your own jobs/);
    expect(move({ job: job({ id: "x", second_tech_id: "tony" }) })).toMatch(/second tech/);
  });

  it("a fixed-time job keeps its time on the new day", () => {
    const fixed = job({
      id: "f",
      arrival_fixed: true,
      scheduled_start: at("2026-10-20", "13:00"),
      scheduled_end: at("2026-10-20", "14:00"),
    });
    const r = moveJobChange(
      ctx,
      { ...base, job: fixed, tech: "tony", date: "2026-10-22", index: 0 },
      estimateDriveMinutes,
    );
    expect(r.updates[0]!.scheduled_start).toBe(at("2026-10-22", "13:00"));
  });
});

describe("renumberDay", () => {
  it("renumbers only rows whose place changed", () => {
    const jobs = [
      job({ id: "a", route_order: 1 }),
      job({ id: "b", route_order: 2 }),
      job({ id: "c", route_order: 3 }),
    ];
    expect(renumberDay("tony", jobs, "a")).toEqual([
      { id: "b", route_order: 1 },
      { id: "c", route_order: 2 },
    ]);
  });
});

describe("suggestions", () => {
  it("uses working days from today while there's time left", () => {
    expect(suggestionDates(ctx)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-26",
      "2026-10-27",
    ]);
    expect(suggestionDates({ ...ctx, nowMin: 16 * 60 + 30 })[0]).toBe("2026-10-20");
  });

  it("finds a gap and labels it", () => {
    const r = suggestTimes(
      ctx,
      { location: { lat: ZOO.latitude, lng: ZOO.longitude }, durationMin: 60 },
      [
        {
          techId: "tony",
          techName: "Tony Tech",
          date: "2026-10-20",
          jobs: [
            {
              ...job({
                id: "a",
                property: NEAR,
                scheduled_start: at("2026-10-20", "08:00"),
                scheduled_end: at("2026-10-20", "09:00"),
              }),
              label: "Riley Rivera",
            },
          ],
        },
      ],
      estimateDriveMinutes,
    );
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ techName: "Tony Tech", dayLabel: "Tue, Oct 20" });
    expect(r.suggestions[0]!.timeLabel).toMatch(/AM|PM/);
    expect(r.note).toBeUndefined();
  });

  it("notes a pool with no location", () => {
    const r = suggestTimes(ctx, { location: null, durationMin: 60 }, [], estimateDriveMinutes);
    expect(r.note).toMatch(/no location/);
  });
});
