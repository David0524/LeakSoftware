import { describe, expect, it } from "vitest";
import {
  START_FROM_COPY,
  backLegLabel,
  estimateDriveMinutes,
  homeMapStatus,
  routingSettings,
  startFor,
  startLegLabel,
  zonedTimeToIso,
  type MemberStart,
  type PlanContext,
} from "@leakbook/core";
import { HOME_ADDRESS_MAX, startForm, startWrite } from "../src/lib/memberStart";
import { dayMap } from "../src/lib/dayMap";
import { routeDay, type RoutePlanCard } from "../src/lib/serviceRoutes";
import { buildWeekPlan, type WeekPlanJob } from "../src/lib/weekPlan";

// Start the day from home or from the shop on Android (owner, 2026-10-21;
// docs/design/2026-10-21-start-from-home.md): the setting's form and what it writes, and the
// routes that start at the tech's start instead of the shop.

const shop = { lat: 33.45, lng: -112.07 };
const homeAt = { lat: 33.25, lng: -112.07 };

const row = (over: Partial<MemberStart> = {}): MemberStart => ({
  id: "0190a000-0000-7000-8000-000000000001",
  company_id: "c1",
  user_id: "t1",
  start_from: "home",
  home_address: "12 Elm St, Mesa, AZ 85201",
  home_latitude: homeAt.lat,
  home_longitude: homeAt.lng,
  home_geocoded_address: "12 Elm St, Mesa, AZ 85201",
  ...over,
});

describe("Start My Day From: the form", () => {
  it("opens on The Shop with no row, and on the saved choice otherwise", () => {
    expect(startForm(null)).toEqual({ start_from: "shop", home_address: "" });
    expect(startForm(row())).toEqual({
      start_from: "home",
      home_address: "12 Elm St, Mesa, AZ 85201",
    });
    expect(startForm(row({ deleted_at: "2026-10-21T00:00:00Z" })).start_from).toBe("shop");
  });

  it("writes nothing when nothing changed, so saving a profile makes no row", () => {
    expect(startWrite(null, { start_from: "shop", home_address: "  " })).toEqual({
      values: {},
      locate: false,
    });
    expect(startWrite(row(), startForm(row()))).toEqual({ values: {}, locate: false });
  });

  it("switching to Home with an address writes both and asks for a lookup", () => {
    const w = startWrite(null, { start_from: "home", home_address: " 12  Elm St, Mesa " });
    expect(w).toEqual({
      values: {
        start_from: "home",
        home_address: "12 Elm St, Mesa",
        home_latitude: null,
        home_longitude: null,
        home_geocoded_address: null,
      },
      locate: true,
    });
  });

  it("a changed address drops the old coordinates in the same write", () => {
    const w = startWrite(row(), { start_from: "home", home_address: "40 Oak Ave, Mesa, AZ" });
    expect("values" in w && w.values).toMatchObject({
      home_address: "40 Oak Ave, Mesa, AZ",
      home_latitude: null,
      home_longitude: null,
    });
    expect("values" in w && w.values.start_from).toBeUndefined();
    expect("locate" in w && w.locate).toBe(true);
  });

  it("choosing The Shop keeps the home address for later", () => {
    const w = startWrite(row(), { start_from: "shop", home_address: row().home_address! });
    expect(w).toEqual({ values: { start_from: "shop" }, locate: false });
  });

  it("clearing the address doesn't look anything up", () => {
    const w = startWrite(row(), { start_from: "home", home_address: "" });
    expect("values" in w && w.values.home_address).toBeNull();
    expect("locate" in w && w.locate).toBe(false);
  });

  it("refuses an address longer than the database keeps", () => {
    const w = startWrite(null, {
      start_from: "home",
      home_address: "a".repeat(HOME_ADDRESS_MAX + 1),
    });
    expect(w).toEqual({ error: `Enter an address up to ${HOME_ADDRESS_MAX} characters.` });
  });

  it("an address not on the map yet is pending: the day starts at the shop", () => {
    const pending = row({ home_latitude: null, home_longitude: null });
    expect(homeMapStatus(pending)).toBe("missing");
    expect(startFor("t1", [pending], shop)).toEqual({ at: shop, label: "shop" });
    expect(START_FROM_COPY.pending).toBe(
      "Starting from the shop until the address is found on the map.",
    );
  });
});

describe("Routes start at the tech's start", () => {
  it("names the legs from home or from the shop", () => {
    const start = startFor("t1", [row()], shop);
    expect(start).toEqual({ at: homeAt, label: "home" });
    expect(`18 min ${startLegLabel(start.label)}`).toBe("18 min from home");
    expect(`36 min ${backLegLabel(start.label)}`).toBe("36 min back home");
    const other = startFor("t2", [row()], shop);
    expect(`18 min ${startLegLabel(other.label)}`).toBe("18 min from the shop");
    expect(`36 min ${backLegLabel(other.label)}`).toBe("36 min back to the shop");
  });

  it("a day map's start pin is a house labeled Home, never the street", () => {
    const stops = [{ id: "j1", location: { lat: 33.3, lng: -112.0 }, status: "scheduled" }];
    const home = dayMap({ stops, depot: homeAt, startLabel: "home", date: "d", today: "x" });
    expect(home.pins).toMatch(/^h:33\.25000,-112\.07000;/);
    const atShop = dayMap({ stops, depot: shop, date: "d", today: "x" });
    expect(atShop.pins).toMatch(/^s:33\.45000,-112\.07000;/);
  });

  it("a route day's map starts at home too", () => {
    const plan: RoutePlanCard = {
      planId: "p1",
      techId: "t1",
      days: [1],
      location: { lat: 33.3, lng: -112.0 },
      durationMin: 30,
      customer: "Grace Holloway",
      address: "",
    };
    const r = routeDay({
      plans: [plan],
      tech: "t1",
      day: 1,
      depot: homeAt,
      startLabel: "home",
      workDay: { startMin: 480, endMin: 1020 },
    });
    expect(r.pins).toMatch(/^h:/);
  });

  it("Plan Week drives from home for someone who starts there", () => {
    const tz = "America/Phoenix";
    const week = ["2026-10-19", "2026-10-20", "2026-10-21"];
    const base: PlanContext = {
      timeZone: tz,
      settings: routingSettings({}),
      depot: shop,
      today: "2026-10-19",
      nowMin: 7 * 60,
    };
    // Two jobs right by the tech's home, far from the shop.
    const jobs: WeekPlanJob[] = [1, 2].map((i) => ({
      id: `0190000${i}-0000-7000-8000-000000000000`,
      status: "scheduled",
      assigned_user_id: "t1",
      second_tech_id: null,
      scheduled_start: zonedTimeToIso("2026-10-20", `0${8 + i}:00`, tz),
      scheduled_end: zonedTimeToIso("2026-10-20", `0${9 + i}:00`, tz),
      route_order: null,
      property: { latitude: 33.25 + i * 0.002, longitude: -112.07 },
    }));
    const run = (ctx: PlanContext) =>
      buildWeekPlan({
        ctx,
        dates: week,
        techs: ["t1"],
        tray: false,
        team: [{ user_id: "t1", status: "active" }],
        dayJobs: (techId, date) =>
          jobs.filter((j) => j.assigned_user_id === techId && j.scheduled_start?.startsWith(date)),
        waiting: [],
        drive: estimateDriveMinutes,
      });
    const fromShop = run(base);
    const fromHome = run({ ...base, starts: [row()] });
    expect(fromShop.error).toBeUndefined();
    expect(fromHome.error).toBeUndefined();
    // The day's first stop: reached sooner from home, a short drive away, than from the shop.
    const first = (r: typeof fromShop) =>
      r.updates.map((u) => u.scheduled_start ?? "").sort()[0] ?? "";
    expect(first(fromHome)).not.toBe("");
    expect(first(fromHome) < first(fromShop)).toBe(true);
  });
});
