import { describe, expect, it } from "vitest";
import {
  arrivalText,
  arrivalWindow,
  clockToMinutes,
  durationLabel,
  estimateDriveMinutes,
  haversineMeters,
  dayDirections,
  directionsHref,
  mapsAppFor,
  mapsLinks,
  nativeMapsUrl,
  minutesLabel,
  minutesToClock,
  onMyWayText,
  optimizeRoute,
  pointKey,
  routeLink,
  suggestSlots,
  timeRoute,
  type DriveFn,
  type LatLng,
  type RouteStop,
  type TechDay,
} from "../src";

// Real places around Phoenix (the demo data's addresses).
const SHOP: LatLng = { lat: 33.44879, lng: -112.07711 }; // Phoenix City Hall
const ART_MUSEUM: LatLng = { lat: 33.46674, lng: -112.0721 }; // 1.5 km north of the shop
const ZOO: LatLng = { lat: 33.44962, lng: -111.94637 };
const SCOTTSDALE: LatLng = { lat: 33.48861, lng: -111.9202 };
const GOODYEAR: LatLng = { lat: 33.46719, lng: -112.38532 };
const TEMPE: LatLng = { lat: 33.39148, lng: -111.92805 };

const DAY = { startMin: 8 * 60, endMin: 17 * 60 };
const est: DriveFn = estimateDriveMinutes;
const stop = (
  id: string,
  location: LatLng | null,
  durationMin = 60,
  extra: Partial<RouteStop> = {},
) => ({ id, location, durationMin, ...extra }) satisfies RouteStop;

describe("drive estimates", () => {
  it("measures straight-line distance", () => {
    expect(Math.round(haversineMeters(SHOP, ART_MUSEUM))).toBeGreaterThan(1900);
    expect(Math.round(haversineMeters(SHOP, ART_MUSEUM))).toBeLessThan(2100);
    expect(haversineMeters(SHOP, SHOP)).toBe(0);
  });

  it("estimates city and freeway driving, with time to park", () => {
    expect(estimateDriveMinutes(SHOP, SHOP)).toBe(0);
    expect(estimateDriveMinutes(SHOP, ART_MUSEUM)).toBe(7); // ~2.7 km of streets + 3
    const goodyear = estimateDriveMinutes(SHOP, GOODYEAR); // ~39 km of road
    expect(goodyear).toBeGreaterThan(30);
    expect(goodyear).toBeLessThan(45);
    expect(estimateDriveMinutes(null, ZOO)).toBe(0);
  });

  it("keys points to about 11 m for the drive-time cache", () => {
    expect(pointKey({ lat: 33.448791, lng: -112.077114 })).toBe("33.4488,-112.0771");
  });
});

describe("timing a route", () => {
  it("drives from the shop, works each job, and drives back", () => {
    const r = timeRoute([stop("a", ART_MUSEUM, 90), stop("b", ZOO, 60)], SHOP, DAY, est);
    const [a, b] = r.stops;
    expect(a!.arriveMin).toBe(480 + est(SHOP, ART_MUSEUM));
    expect(a!.endMin).toBe(a!.startMin + 90);
    expect(b!.driveMin).toBe(est(ART_MUSEUM, ZOO));
    expect(b!.startMin).toBe(a!.endMin + b!.driveMin);
    expect(r.backMin).toBe(b!.endMin + est(ZOO, SHOP));
    expect(r.driveMin).toBe(est(SHOP, ART_MUSEUM) + est(ART_MUSEUM, ZOO) + est(ZOO, SHOP));
    expect(r.overtimeMin).toBe(0);
  });

  it("waits for a fixed appointment and counts being late for one", () => {
    const early = timeRoute([stop("a", ART_MUSEUM, 30, { fixedStartMin: 600 })], SHOP, DAY, est);
    expect(early.stops[0]!.startMin).toBe(600);
    expect(early.lateMin).toBe(0);
    const late = timeRoute(
      [stop("a", GOODYEAR, 240), stop("b", TEMPE, 30, { fixedStartMin: 9 * 60 })],
      SHOP,
      DAY,
      est,
    );
    expect(late.lateMin).toBeGreaterThan(200);
  });

  it("flags stops without a location and keeps going", () => {
    const r = timeRoute([stop("a", null, 30), stop("b", ZOO, 30)], SHOP, DAY, est);
    expect(r.stops[0]!.unlocated).toBe(true);
    expect(r.stops[0]!.driveMin).toBe(0);
    expect(r.stops[1]!.driveMin).toBe(est(SHOP, ZOO));
  });

  it("counts time past the end of the day", () => {
    const r = timeRoute([stop("a", GOODYEAR, 9 * 60)], SHOP, DAY, est);
    expect(r.overtimeMin).toBe(r.backMin - DAY.endMin);
    expect(r.overtimeMin).toBeGreaterThan(0);
  });
});

describe("ordering a day", () => {
  it("visits stops in the order that drives least", () => {
    // West, then east, then west again is wasteful.
    const stops = [stop("goodyear", GOODYEAR), stop("tempe", TEMPE), stop("museum", ART_MUSEUM)];
    const before = timeRoute(stops, SHOP, DAY, est);
    const { order, route } = optimizeRoute(stops, SHOP, DAY, est);
    expect(route.driveMin).toBeLessThan(before.driveMin);
    // No other order drives less (checked against all six).
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const least = Math.min(
      ...orders.map(
        (o) =>
          timeRoute(
            o.map((i) => stops[i]!),
            SHOP,
            DAY,
            est,
          ).driveMin,
      ),
    );
    expect(route.driveMin).toBe(least);
    expect(new Set(order).size).toBe(3);
  });

  it("keeps a fixed appointment on time even when it costs driving", () => {
    const stops = [
      stop("tempe", TEMPE, 60),
      stop("zoo", ZOO, 60),
      stop("goodyear", GOODYEAR, 60, { fixedStartMin: 8 * 60 + 45 }),
    ];
    const { order, route } = optimizeRoute(stops, SHOP, DAY, est);
    expect(stops[order[0]!]!.id).toBe("goodyear");
    expect(route.lateMin).toBe(0);
  });

  it("gives the same answer when planned twice", () => {
    const stops = [stop("a", ZOO), stop("b", SCOTTSDALE), stop("c", TEMPE)];
    const first = optimizeRoute(stops, SHOP, DAY, est);
    const again = optimizeRoute(
      first.order.map((i) => stops[i]!),
      SHOP,
      DAY,
      est,
    );
    expect(again.order).toEqual([0, 1, 2]);
    expect(again.route.driveMin).toBe(first.route.driveMin);
  });

  it("handles long days (more than 8 stops) without trying every order", () => {
    const places = [ZOO, SCOTTSDALE, TEMPE, GOODYEAR, ART_MUSEUM];
    const stops = Array.from({ length: 11 }, (_, i) =>
      stop(`s${i}`, { lat: places[i % 5]!.lat + i * 0.001, lng: places[i % 5]!.lng }, 20),
    );
    const before = timeRoute(stops, SHOP, DAY, est);
    const { order, route } = optimizeRoute(stops, SHOP, DAY, est);
    expect(new Set(order).size).toBe(11);
    expect(route.driveMin).toBeLessThan(before.driveMin);
  });

  it("returns an empty plan for an empty day", () => {
    const { order, route } = optimizeRoute([], SHOP, DAY, est);
    expect(order).toEqual([]);
    expect(route.driveMin).toBe(0);
  });
});

describe("suggesting a slot", () => {
  const days: TechDay[] = [
    {
      date: "2026-10-14",
      techId: "luis",
      techName: "Luis Ramirez",
      stops: [stop("g", GOODYEAR, 120, { fixedStartMin: 9 * 60 })],
      labels: { g: "Sofia Martinez" },
    },
    {
      date: "2026-10-14",
      techId: "priya",
      techName: "Priya Shah",
      stops: [stop("z", ZOO, 90), stop("t", TEMPE, 90)],
      labels: { z: "Victor Ruiz", t: "Harold Kim" },
    },
    {
      date: "2026-10-15",
      techId: "jake",
      techName: "Jake Turner",
      stops: [],
    },
  ];

  it("puts a job near the route already going that way", () => {
    // Scottsdale is by the zoo: Priya's east-side day adds the least driving (going there
    // first, on the way to the zoo).
    const s = suggestSlots({ location: SCOTTSDALE, durationMin: 90 }, days, SHOP, DAY, est);
    expect(s[0]).toMatchObject({ techId: "priya", date: "2026-10-14", near: "first stop" });
    expect(s[0]!.addedDriveMin).toBeLessThan(s.find((x) => x.techId === "luis")!.addedDriveMin);
    expect(s.map((x) => x.techId)).toContain("jake");
  });

  it("never suggests a slot that makes a fixed appointment late or the day run over", () => {
    const busy = [
      {
        date: "2026-10-14",
        techId: "luis",
        techName: "Luis Ramirez",
        stops: [stop("g", GOODYEAR, 7 * 60, { fixedStartMin: 9 * 60 })],
      },
    ];
    expect(suggestSlots({ location: TEMPE, durationMin: 120 }, busy, SHOP, DAY, est)).toEqual([]);
  });

  it("starts no earlier than now on today's route", () => {
    const today = [
      { date: "2026-10-13", techId: "jake", techName: "Jake", stops: [], notBeforeMin: 14 * 60 },
    ];
    const [s] = suggestSlots({ location: ZOO, durationMin: 60 }, today, SHOP, DAY, est);
    expect(s!.startMin).toBe(14 * 60);
    expect(s!.near).toBe("only job that day");
  });
});

describe("times and words", () => {
  it("converts clock times", () => {
    expect(clockToMinutes("08:30")).toBe(510);
    expect(minutesToClock(510)).toBe("08:30");
    expect(minutesLabel(510)).toBe("8:30 AM");
    expect(minutesLabel(12 * 60 + 5)).toBe("12:05 PM");
    expect(minutesLabel(0)).toBe("12:00 AM");
    expect(durationLabel(25)).toBe("25 min");
    expect(durationLabel(65)).toBe("1 hr 5 min");
    expect(durationLabel(120)).toBe("2 hr");
  });

  it("gives customers a window when the shop uses them", () => {
    expect(arrivalWindow(10 * 60 + 40, 120)).toEqual({ from: 630, to: 750 });
    expect(arrivalText(10 * 60 + 40, 120)).toBe("between 10:30 AM and 12:30 PM");
    expect(arrivalText(10 * 60 + 40, 0)).toBe("at 10:40 AM");
  });

  it("writes the On My Way text", () => {
    expect(
      onMyWayText({
        customer: "Grace Holloway",
        tech: "Tony Tech",
        shop: "Demo Leak Co.",
        arriveMin: 640,
      }),
    ).toBe(
      "Hi Grace, this is Tony from Demo Leak Co. I’m on my way and should be there about 10:40 AM.",
    );
  });
});

describe("maps", () => {
  it("links to directions in Apple Maps and Google Maps", () => {
    const l = mapsLinks({ address: "455 N Galvin Pkwy, Phoenix, AZ 85008", location: ZOO });
    expect(l.apple).toBe(
      "https://maps.apple.com/?daddr=33.44962%2C-111.94637&q=455%20N%20Galvin%20Pkwy%2C%20Phoenix%2C%20AZ%2085008&dirflg=d",
    );
    expect(l.google).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=33.44962%2C-111.94637&travelmode=driving",
    );
    expect(mapsLinks({ address: "1 E Main St, Mesa" }).google).toContain(
      "destination=1%20E%20Main%20St%2C%20Mesa",
    );
  });

  it("picks the maps app from the saved choice, then the device", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131";
    expect(mapsAppFor(iphone)).toBe("apple");
    expect(mapsAppFor(mac, "auto")).toBe("apple");
    expect(mapsAppFor(android)).toBe("google");
    expect(mapsAppFor(iphone, "google")).toBe("google");
    expect(mapsAppFor(android, "apple")).toBe("apple");
    expect(mapsAppFor(android, "waze")).toBe("google");
  });

  it("links addresses through /maps, with the spot when known", () => {
    expect(directionsHref({ address: "455 N Galvin Pkwy, Phoenix", location: ZOO })).toBe(
      "/maps?to=455+N+Galvin+Pkwy%2C+Phoenix&lat=33.44962&lng=-111.94637",
    );
    expect(directionsHref({ address: "1 E Main St, Mesa" })).toBe("/maps?to=1+E+Main+St%2C+Mesa");
  });

  it("opens the phone's own maps app", () => {
    const pool = { address: "455 N Galvin Pkwy, Phoenix, AZ 85008", location: ZOO };
    expect(nativeMapsUrl(pool, "ios")).toBe(mapsLinks(pool).apple);
    expect(nativeMapsUrl(pool, "android")).toBe(
      `geo:0,0?q=${encodeURIComponent("33.44962,-111.94637(455 N Galvin Pkwy, Phoenix, AZ 85008)")}`,
    );
    expect(nativeMapsUrl({ address: "1 E Main St, Mesa" }, "android")).toBe(
      "geo:0,0?q=1%20E%20Main%20St%2C%20Mesa",
    );
    expect(nativeMapsUrl(pool, "web")).toBe(mapsLinks(pool).google);
  });

  it("gives a day's directions in the chosen app", () => {
    const shop = { address: "Shop", location: SHOP };
    const stops = [
      { address: "Zoo", location: ZOO, done: true },
      { address: "Tempe", location: TEMPE },
    ];
    expect(dayDirections("google", shop, stops)).toEqual({
      app: "google",
      href: routeLink(shop, stops),
    });
    // Apple Maps: the next stop not done yet.
    expect(dayDirections("apple", shop, stops)).toEqual({
      app: "apple",
      href: mapsLinks({ address: "Tempe", location: TEMPE }).apple,
    });
    expect(dayDirections("apple", shop, [{ ...stops[0]! }])).toBeNull();
    expect(dayDirections("google", shop, [])).toBeNull();
  });

  it("links a whole day, from the shop and back", () => {
    const link = routeLink({ address: "Shop", location: SHOP }, [
      { address: "Zoo", location: ZOO },
      { address: "Tempe", location: TEMPE },
    ])!;
    const params = new URL(link).searchParams;
    expect(params.get("origin")).toBe("33.44879,-112.07711");
    expect(params.get("destination")).toBe("33.44879,-112.07711");
    expect(params.get("waypoints")).toBe("33.44962,-111.94637|33.39148,-111.92805");
    expect(routeLink(null, [])).toBeNull();
  });
});
