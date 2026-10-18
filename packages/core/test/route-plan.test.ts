import { describe, expect, it } from "vitest";
import {
  canMoveJob,
  canUnschedule,
  ROUTING_DEFAULTS,
  daySummary,
  estimateDriveMinutes,
  inRouteOrder,
  localMinutes,
  lockReason,
  optimizeRoute,
  routeUpdates,
  canMakeJobs,
  seesAllJobs,
  routingSettings,
  stopFor,
  timeRoute,
  weekday,
  workDay,
  zonedMinutesToIso,
  type PlanJob,
} from "../src";

const TZ = "America/Phoenix"; // UTC-7 all year
const SHOP = { lat: 33.44879, lng: -112.07711 };
const ZOO = { latitude: 33.45006, longitude: -111.94886 };
const SCOTTSDALE = { latitude: 33.48861, longitude: -111.9202 };
const GOODYEAR = { latitude: 33.43532, longitude: -112.35818 };

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

describe("who sees which jobs", () => {
  it("owners always; techs unless the owner turned it off", () => {
    expect(seesAllJobs("owner", { techs_see_all_jobs: false })).toBe(true);
    expect(seesAllJobs("tech", {})).toBe(true);
    expect(seesAllJobs("tech", null)).toBe(true);
    expect(seesAllJobs("tech", { techs_see_all_jobs: false })).toBe(false);
  });
});

describe("who makes jobs", () => {
  it("owners always; techs unless the owner turned it off", () => {
    expect(canMakeJobs("owner", { techs_make_jobs: false })).toBe(true);
    expect(canMakeJobs("tech", {})).toBe(true);
    expect(canMakeJobs("tech", { techs_make_jobs: false })).toBe(false);
  });
});

describe("routing settings", () => {
  it("fills in defaults and rejects bad values", () => {
    expect(routingSettings({})).toEqual(ROUTING_DEFAULTS);
    expect(routingSettings(null)).toEqual(ROUTING_DEFAULTS);
    expect(
      routingSettings({
        routing: {
          day_start: "07:30",
          day_end: "16:00",
          arrival_window_minutes: 120,
          job_minutes: 90,
          work_days: [6, 1, 1, 2],
        },
      }),
    ).toEqual({
      dayStart: "07:30",
      dayEnd: "16:00",
      windowMin: 120,
      jobMinutes: 90,
      workDays: [1, 2, 6],
    });
    const bad = routingSettings({
      routing: {
        day_start: "9am",
        day_end: "06:00",
        arrival_window_minutes: 45,
        job_minutes: 5,
        work_days: [9],
      },
    });
    expect(bad).toEqual(ROUTING_DEFAULTS);
    expect(workDay(ROUTING_DEFAULTS)).toEqual({ startMin: 480, endMin: 1020 });
  });

  it("knows the day of the week", () => {
    expect(weekday("2026-10-13")).toBe(2); // a Tuesday
    expect(weekday("2026-10-18")).toBe(0);
  });
});

describe("places and times", () => {
  it("converts between instants and minutes in the shop's zone", () => {
    expect(localMinutes("2026-10-13T15:30:00Z", TZ)).toBe(8 * 60 + 30);
    expect(zonedMinutesToIso("2026-10-13", 510, TZ)).toBe("2026-10-13T15:30:00.000Z");
    // Past midnight stays on the day.
    expect(zonedMinutesToIso("2026-10-13", 1500, TZ)).toBe("2026-10-14T06:59:00.000Z");
  });
});

describe("jobs as stops", () => {
  it("locks started, fixed, and two-tech jobs", () => {
    expect(lockReason(job({ id: "a" }))).toBeNull();
    expect(lockReason(job({ id: "a", status: "unscheduled" }))).toBeNull();
    expect(lockReason(job({ id: "a", status: "in_progress" }))).toBe("started");
    expect(lockReason(job({ id: "a", status: "report_sent" }))).toBe("started");
    expect(lockReason(job({ id: "a", arrival_fixed: true }))).toBe("fixed");
    expect(lockReason(job({ id: "a", second_tech_id: "priya" }))).toBe("two_techs");
  });

  it("orders a day by time, then saved place, untimed last", () => {
    const list = inRouteOrder([
      job({ id: "c", scheduled_start: "2026-10-13T15:00:00Z" }),
      job({ id: "b", route_order: 2 }),
      job({ id: "a", route_order: 1, scheduled_start: "2026-10-13T20:00:00Z" }),
      job({ id: "d", scheduled_start: "2026-10-13T14:00:00Z" }),
    ]);
    expect(list.map((j) => j.id)).toEqual(["d", "c", "a", "b"]);
    const tie = inRouteOrder([
      job({ id: "x", route_order: 2, scheduled_start: "2026-10-13T15:00:00Z" }),
      job({ id: "y", route_order: 1, scheduled_start: "2026-10-13T15:00:00Z" }),
    ]);
    expect(tie.map((j) => j.id)).toEqual(["y", "x"]);
  });

  it("makes stops with durations, fixed times, and today's earliest start", () => {
    const ctx = { timeZone: TZ, settings: ROUTING_DEFAULTS, techId: "tony", nowMin: 600 };
    const free = stopFor(
      job({
        id: "a",
        scheduled_start: "2026-10-13T15:00:00Z",
        scheduled_end: "2026-10-13T16:30:00Z",
        property: ZOO,
      }),
      ctx,
    );
    expect(free).toMatchObject({
      durationMin: 90,
      fixedStartMin: null,
      earliestMin: 600,
      movable: true,
      own: true,
    });
    expect(free.location).toEqual({ lat: ZOO.latitude, lng: ZOO.longitude });
    const fixed = stopFor(
      job({ id: "b", arrival_fixed: true, scheduled_start: "2026-10-13T17:00:00Z" }),
      ctx,
    );
    expect(fixed).toMatchObject({
      durationMin: 150,
      fixedStartMin: 600,
      earliestMin: null,
      movable: false,
    });
    expect(fixed.location).toBeNull();
    // On the second tech's route, the job is theirs to visit but not theirs to number.
    expect(
      stopFor(job({ id: "c", second_tech_id: "priya" }), { ...ctx, techId: "priya" }).own,
    ).toBe(false);
  });
});

describe("saving a planned day", () => {
  it("plans a day, keeping the fixed appointment, and writes the rows", () => {
    const ctx = { timeZone: TZ, settings: ROUTING_DEFAULTS, techId: "tony" };
    // Saved in a poor order: Goodyear (far west) between two east-side stops.
    const jobs = [
      job({ id: "zoo", route_order: 1, property: ZOO, scheduled_start: "2026-10-13T15:00:00Z" }),
      job({
        id: "goodyear",
        route_order: 2,
        property: GOODYEAR,
        scheduled_start: "2026-10-13T18:00:00Z",
      }),
      job({
        id: "scottsdale",
        route_order: 3,
        property: SCOTTSDALE,
        arrival_fixed: true,
        scheduled_start: "2026-10-13T21:00:00Z",
        scheduled_end: "2026-10-13T22:00:00Z",
      }),
    ];
    const stops = inRouteOrder(jobs).map((j) => stopFor(j, ctx));
    const before = timeRoute(stops, SHOP, workDay(ROUTING_DEFAULTS), estimateDriveMinutes);
    const { order, route } = optimizeRoute(
      stops,
      SHOP,
      workDay(ROUTING_DEFAULTS),
      estimateDriveMinutes,
    );
    expect(route.driveMin).toBeLessThan(before.driveMin);
    expect(route.lateMin).toBe(0);
    const planned = order.map((i) => stops[i]!);
    const updates = routeUpdates("2026-10-13", TZ, planned, route);
    expect(updates.map((u) => u.route_order)).toEqual([1, 2, 3]);
    const fixed = updates.find((u) => u.id === "scottsdale")!;
    // The promised 2:00 PM stays; only its place changes.
    expect(fixed.scheduled_start).toBeUndefined();
    for (const u of updates.filter((u) => u.id !== "scottsdale")) {
      expect(u.scheduled_start).toMatch(/^2026-10-13T/);
      expect(Date.parse(u.scheduled_end!) - Date.parse(u.scheduled_start!)).toBe(150 * 60_000);
    }
    // Times follow the order.
    const starts = updates.filter((u) => u.scheduled_start).map((u) => u.scheduled_start!);
    expect([...starts].sort()).toEqual(starts);
  });

  it("leaves another tech's job numbering alone", () => {
    const ctx = { timeZone: TZ, settings: ROUTING_DEFAULTS, techId: "priya" };
    const stops = [
      stopFor(job({ id: "mine", assigned_user_id: "priya", property: ZOO }), ctx),
      stopFor(
        job({
          id: "shared",
          second_tech_id: "priya",
          property: SCOTTSDALE,
          scheduled_start: "2026-10-13T20:00:00Z",
        }),
        ctx,
      ),
    ];
    const route = timeRoute(stops, SHOP, workDay(ROUTING_DEFAULTS), estimateDriveMinutes);
    expect(routeUpdates("2026-10-13", TZ, stops, route).map((u) => u.id)).toEqual(["mine"]);
  });
});

describe("a saved day", () => {
  it("shows drive legs, a stop that can't be reached in time, and overtime", () => {
    const zoo = { lat: ZOO.latitude, lng: ZOO.longitude };
    const goodyear = { lat: GOODYEAR.latitude, lng: GOODYEAR.longitude };
    const s = daySummary(
      [
        { id: "a", location: zoo, startMin: 480, endMin: 630 },
        // 10 minutes after the zoo job ends, but Goodyear is 40+ minutes away.
        { id: "b", location: goodyear, startMin: 640, endMin: 790 },
        { id: "c", location: null, startMin: 900, endMin: 1020 },
      ],
      SHOP,
      workDay(ROUTING_DEFAULTS),
      estimateDriveMinutes,
    );
    expect(s.legs[0]).toBe(estimateDriveMinutes(SHOP, zoo));
    expect(s.short[0]).toBe(0);
    expect(s.short[1]).toBe(estimateDriveMinutes(zoo, goodyear) - 10);
    expect(s.short[2]).toBe(0);
    expect(s.unlocated).toBe(1);
    expect(s.backMin).toBe(1020 + estimateDriveMinutes(goodyear, SHOP));
    expect(s.overtimeMin).toBe(estimateDriveMinutes(goodyear, SHOP));
    expect(s.driveMin).toBe(
      s.legs.reduce((a, b) => a + b, 0) + estimateDriveMinutes(goodyear, SHOP),
    );
    expect(daySummary([], SHOP, workDay(ROUTING_DEFAULTS), estimateDriveMinutes)).toMatchObject({
      driveMin: 0,
      backMin: null,
      overtimeMin: 0,
    });
  });
});

describe("moving jobs by hand", () => {
  it("moves any job but a canceled one", () => {
    expect(canMoveJob("scheduled")).toBe(true);
    expect(canMoveJob("invoiced")).toBe(true);
    expect(canMoveJob("in_progress")).toBe(true);
    expect(canMoveJob("canceled")).toBe(false);
  });
  it("sends only jobs that haven't started back to Needs a Time", () => {
    expect(canUnschedule("scheduled")).toBe(true);
    expect(canUnschedule("unscheduled")).toBe(true);
    expect(canUnschedule("invoiced")).toBe(false);
  });
});
