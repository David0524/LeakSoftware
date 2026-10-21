import { describe, expect, it } from "vitest";
import {
  ROUTING_DEFAULTS,
  START_FROM_COPY,
  backLegLabel,
  dayMapPins,
  decodePins,
  encodePins,
  estimateDriveMinutes,
  homeLookupAddress,
  homeMapStatus,
  moveJobChange,
  planDay,
  planWeek,
  routeStart,
  startFor,
  startLegLabel,
  suggestServiceDays,
  suggestTimes,
  timeRoute,
  workDay,
  zonedMinutesToIso,
  type MemberStart,
  type PlanContext,
  type PlanJob,
} from "../src";

const TZ = "America/Phoenix";
const SHOP = { lat: 33.44879, lng: -112.07711 };
const HOME = { lat: 33.62, lng: -112.08 }; // north of the shop
const PTS = {
  a: { lat: 33.45, lng: -111.95 },
  b: { lat: 33.6, lng: -112.08 },
  c: { lat: 33.3, lng: -112.08 },
  d: { lat: 33.45, lng: -112.36 },
};
const DAY = workDay(ROUTING_DEFAULTS);

const start = (o: Partial<MemberStart> = {}): MemberStart => ({
  id: "s1",
  company_id: "c1",
  user_id: "tony",
  start_from: "home",
  home_address: "4 Elm St, Phoenix, AZ",
  home_latitude: HOME.lat,
  home_longitude: HOME.lng,
  home_geocoded_address: "4 Elm St, Phoenix, AZ",
  ...o,
});

describe("routeStart and startFor", () => {
  it("starts at home only when the person chose Home and the address is on the map", () => {
    expect(routeStart(start(), SHOP)).toEqual({ at: HOME, label: "home" });
    expect(routeStart(start({ start_from: "shop" }), SHOP)).toEqual({ at: SHOP, label: "shop" });
    expect(routeStart(null, SHOP)).toEqual({ at: SHOP, label: "shop" });
    expect(routeStart(start({ home_latitude: null, home_longitude: null }), SHOP)).toEqual({
      at: SHOP,
      label: "shop",
    });
    // Coordinates for an older address don't count.
    expect(routeStart(start({ home_geocoded_address: "1 Old Rd" }), SHOP).label).toBe("shop");
    // A deleted row is no start.
    expect(routeStart(start({ deleted_at: "2026-10-21T00:00:00Z" }), SHOP).label).toBe("shop");
    // No shop location: still null at the shop.
    expect(routeStart(null, null)).toEqual({ at: null, label: "shop" });
  });

  it("finds the tech's row", () => {
    const rows = [start(), start({ id: "s2", user_id: "ana", start_from: "shop" })];
    expect(startFor("tony", rows, SHOP).label).toBe("home");
    expect(startFor("ana", rows, SHOP).label).toBe("shop");
    expect(startFor("ben", rows, SHOP)).toEqual({ at: SHOP, label: "shop" });
    expect(startFor(null, rows, SHOP).label).toBe("shop");
    expect(startFor("tony", null, SHOP).label).toBe("shop");
  });

  it("says whether a home start is on the map", () => {
    expect(homeMapStatus(start())).toBe("found");
    expect(homeMapStatus(start({ home_geocoded_address: null }))).toBe("found");
    expect(homeMapStatus(start({ home_address: "  4 Elm St,  Phoenix, AZ " }))).toBe("found");
    expect(homeMapStatus(start({ home_latitude: null, home_longitude: null }))).toBe("missing");
    expect(homeMapStatus(start({ home_address: " " }))).toBe("missing");
    expect(homeMapStatus(start({ start_from: "shop" }))).toBeNull();
    expect(homeMapStatus(null)).toBeNull();
    expect(homeLookupAddress("  4 Elm St,\n Phoenix ")).toBe("4 Elm St, Phoenix");
  });

  it("words the legs", () => {
    expect(startLegLabel("shop")).toBe("from the shop");
    expect(startLegLabel("home")).toBe("from home");
    expect(backLegLabel("shop")).toBe("back to the shop");
    expect(backLegLabel("home")).toBe("back home");
    expect(START_FROM_COPY.pending).toBe(
      "Starting from the shop until the address is found on the map.",
    );
  });
});

describe("routes from home", () => {
  const stops = Object.entries(PTS).map(([id, location]) => ({ id, location, durationMin: 60 }));

  it("changes the first leg and the drive back", () => {
    const shop = timeRoute([stops[1]!], SHOP, DAY, estimateDriveMinutes);
    const home = timeRoute(
      [stops[1]!],
      startFor("tony", [start()], SHOP).at,
      DAY,
      estimateDriveMinutes,
    );
    expect(home.stops[0]!.driveMin).toBeLessThan(shop.stops[0]!.driveMin);
    expect(home.backMin - home.stops[0]!.endMin).toBe(estimateDriveMinutes(PTS.b, HOME));
  });

  const ctx: PlanContext = {
    timeZone: TZ,
    settings: ROUTING_DEFAULTS,
    depot: SHOP,
    today: "2026-10-19",
    nowMin: 7 * 60,
  };
  const jobs: PlanJob[] = Object.entries(PTS).map(([id, p], i) => ({
    id,
    status: "scheduled",
    assigned_user_id: "tony",
    second_tech_id: null,
    scheduled_start: zonedMinutesToIso("2026-10-20", 480 + i * 90, TZ),
    scheduled_end: zonedMinutesToIso("2026-10-20", 540 + i * 90, TZ),
    route_order: i + 1,
    arrival_fixed: false,
    property: { latitude: p.lat, longitude: p.lng },
  }));
  const order = (r: ReturnType<typeof planDay>) =>
    [...r.updates].sort((x, y) => x.route_order! - y.route_order!).map((u) => u.id);

  it("Optimize orders the day from the tech's start", () => {
    expect(order(planDay(ctx, "tony", "2026-10-20", jobs, estimateDriveMinutes))).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
    const home = planDay(
      { ...ctx, starts: [start()] },
      "tony",
      "2026-10-20",
      jobs,
      estimateDriveMinutes,
    );
    expect(order(home)).toEqual(["b", "a", "c", "d"]);
    // Someone else's home start doesn't change this tech's day.
    expect(
      order(
        planDay(
          { ...ctx, starts: [start({ user_id: "ana" })] },
          "tony",
          "2026-10-20",
          jobs,
          estimateDriveMinutes,
        ),
      ),
    ).toEqual(["a", "b", "d", "c"]);
  });

  it("times a moved job from home", () => {
    const input = {
      job: { ...jobs[1]!, scheduled_start: null, scheduled_end: null, assigned_user_id: null },
      tech: "tony",
      date: "2026-10-20",
      index: 0,
      targetDay: [],
      fromDay: [],
      seesAll: true,
      userId: "tony",
    };
    const shop = moveJobChange(ctx, input, estimateDriveMinutes).updates[0]!;
    const home = moveJobChange({ ...ctx, starts: [start()] }, input, estimateDriveMinutes)
      .updates[0]!;
    expect(Date.parse(home.scheduled_start!)).toBeLessThan(Date.parse(shop.scheduled_start!));
  });

  it("Suggest Times counts the drive from home", () => {
    const route = { techId: "tony", techName: "Tony", date: "2026-10-20", jobs: [] };
    const job = { location: PTS.b, durationMin: 60 };
    const shop = suggestTimes(ctx, job, [route], estimateDriveMinutes).suggestions[0]!;
    const home = suggestTimes({ ...ctx, starts: [start()] }, job, [route], estimateDriveMinutes)
      .suggestions[0]!;
    expect(home.driveInMin).toBe(estimateDriveMinutes(HOME, PTS.b));
    expect(home.driveInMin).toBeLessThan(shop.driveInMin);
  });

  it("Plan Week routes each tech's days from their start", () => {
    const week = (homeStart: boolean) =>
      planWeek({
        days: [
          { techId: "tony", date: "2026-10-26", stays: [], start: homeStart ? HOME : undefined },
        ],
        jobs: Object.entries(PTS).map(([id, location]) => ({
          id,
          location,
          durationMin: 60,
          techId: null,
          date: null,
          techs: ["tony"],
        })),
        depot: SHOP,
        day: DAY,
        drive: estimateDriveMinutes,
      });
    const shop = week(false);
    const home = week(true);
    expect(shop.days[0]!.stops.map((s) => s.id)).toEqual(["a", "b", "d", "c"]);
    expect(home.days[0]!.stops.map((s) => s.id)).toEqual(["b", "a", "c", "d"]);
    expect(home.days[0]!.route.stops[0]!.driveMin).toBe(estimateDriveMinutes(HOME, PTS.b));
    // `start: undefined` is the shop, as before.
    expect(shop).toEqual(
      planWeek({
        days: [{ techId: "tony", date: "2026-10-26", stays: [] }],
        jobs: Object.entries(PTS).map(([id, location]) => ({
          id,
          location,
          durationMin: 60,
          techId: null,
          date: null,
          techs: ["tony"],
        })),
        depot: SHOP,
        day: DAY,
        drive: estimateDriveMinutes,
      }),
    );
  });

  it("Suggest Days puts a pool near a tech's home on that tech", () => {
    const input = {
      place: [{ id: "p1", techId: null, days: [], location: PTS.b, durationMin: 60 }],
      keep: [],
      techs: ["ana", "tony"],
      workDays: [1],
      depot: { lat: 33.3, lng: -112.08 },
      day: DAY,
      drive: estimateDriveMinutes,
    };
    expect(suggestServiceDays(input).suggestions[0]!.techId).toBe("ana");
    expect(suggestServiceDays({ ...input, starts: [start()] }).suggestions[0]!.techId).toBe("tony");
  });
});

describe("day map from home", () => {
  it("draws the start as Home and keeps it through the map address", () => {
    const { pins } = dayMapPins({
      stops: [{ id: "a", location: PTS.a, done: false }],
      depot: HOME,
      startLabel: "home",
    });
    expect(pins[0]).toEqual({ label: "", at: HOME, tone: "shop", id: null, home: true });
    const code = encodePins(pins);
    expect(code.startsWith("h:33.62000,-112.08000;")).toBe(true);
    expect(decodePins(code)![0]).toEqual({ label: "", at: HOME, tone: "shop", home: true });
    expect(dayMapPins({ stops: [], depot: SHOP, startLabel: "shop" }).pins[0]).toEqual({
      label: "",
      at: SHOP,
      tone: "shop",
      id: null,
    });
  });
});
