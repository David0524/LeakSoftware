import { describe, expect, it } from "vitest";
import {
  decodePolyline,
  mapView,
  encodePolyline,
  routeLegPaths,
  routeOrder,
  type LatLng,
} from "@leakbook/core";
import { MAX_URL, mapboxZoom, staticMapUrl } from "../src/server/map-image";

describe("map image", () => {
  it("encodes a polyline as Google's example does", () => {
    expect(
      encodePolyline([
        { lat: 38.5, lng: -120.2 },
        { lat: 40.7, lng: -120.95 },
        { lat: 43.252, lng: -126.453 },
      ]),
    ).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  // A day a few streets across (zoom 13 and closer), so its pins are full size.
  const day = [
    { tone: "shop" as const, label: "", at: { lat: 33.45, lng: -112.07 } },
    { tone: "done" as const, label: "1", at: { lat: 33.455, lng: -112.075 } },
    { tone: "current" as const, label: "2", at: { lat: 33.46, lng: -112.085 } },
  ];

  it("draws the shop, numbered stops and the route in water blue without a tech", () => {
    const url = staticMapUrl(day, { w: 600, h: 300 }, "pk.test");
    // A white casing, then the bold line on it.
    expect(url).toContain("/static/path-9+ffffff-1(");
    expect(url).toContain(",path-6+1f6fae-1(");
    expect(url).toContain(",pin-s-home+12263a(-112.07000,33.45000)");
    // Done is the route's color at reduced strength; the stop you're on is full strength.
    expect(url).toContain(",pin-l-1+8fb7d7(-112.07500,33.45500)");
    expect(url).toContain(",pin-l-2+1f6fae(-112.08500,33.46000)");
    // Framed by us (core mapView), never Mapbox's "auto": its zoom is one less on 512-point tiles.
    const view = mapView(day, { w: 600, h: 300 });
    expect(url).toContain(
      `/${view.center.lng.toFixed(6)},${view.center.lat.toFixed(6)},${mapboxZoom(view)}/600x300@2x?access_token=pk.test`,
    );
    expect(mapboxZoom(view)).toBeCloseTo(view.zoom - 1, 1);
    expect(url).not.toContain("auto");
  });

  it("draws the route and stops in the tech's team color, dark in dark mode", () => {
    const url = staticMapUrl(day, { w: 600, h: 300 }, "pk.test", "light", "orange");
    expect(url).toContain(",path-6+d07b27-1(");
    expect(url).toContain(",pin-l-2+d07b27(");
    expect(url).toContain(",pin-s-home+12263a(");
    const dark = staticMapUrl(day, { w: 600, h: 300 }, "pk.test", "dark", "orange");
    expect(dark).toContain(",path-6+e89a4f-1(");
    // An unknown color is water blue, never an error.
    expect(staticMapUrl(day, { w: 600, h: 300 }, "pk.test", "light", "mauve")).toContain(
      ",path-6+1f6fae-1(",
    );
  });

  it("uses this site's own pins when Mapbox can fetch them, else its own markers", () => {
    const url = staticMapUrl(
      day,
      { w: 600, h: 300 },
      "pk.test",
      "light",
      "green",
      "https://app.example.com",
    );
    expect(url).toContain(
      `,url-${encodeURIComponent("https://app.example.com/api/map/pin/done-1-green.png")}(-112.07500,33.45500)`,
    );
    expect(url).toContain(encodeURIComponent("/api/map/pin/current-2-green.png"));
    expect(url).toContain(encodeURIComponent("/api/map/pin/shop.png"));
    expect(url).not.toContain("pin-l-");
    // Not https (a local server Mapbox can't reach): Mapbox's markers.
    expect(
      staticMapUrl(day, { w: 600, h: 300 }, "pk.test", "light", "green", "http://localhost:3000"),
    ).toContain(",pin-l-2+2e8b57(");
    // Too long an address for Mapbox: its markers.
    const many = Array.from({ length: 60 }, (_, i) => ({
      tone: "todo" as const,
      label: String(i + 1),
      at: { lat: 33 + i / 100, lng: -112 - i / 100 },
    }));
    const long = staticMapUrl(
      many,
      { w: 600, h: 300 },
      "pk",
      "light",
      "green",
      `https://${"a".repeat(80)}.com`,
    );
    expect(long.length).toBeLessThanOrEqual(8192);
    // (60 stops across a county: the small pins, still numbered.)
    expect(long).toMatch(/pin-s-60\+2e8b57\(/);
  });

  it("draws a home start as a larger house, never anything else about it", () => {
    const url = staticMapUrl(
      [
        { tone: "shop", label: "", at: { lat: 33.45, lng: -112.06 }, home: true },
        { tone: "todo", label: "1", at: { lat: 33.455, lng: -112.075 } },
      ],
      { w: 600, h: 300 },
      "pk.test",
    );
    expect(url).toContain(",pin-l-home+12263a(-112.06000,33.45000)");
    expect(url).toContain(",pin-l-1+1f6fae(-112.07500,33.45500)");
  });

  it("centers on a single pin and keeps sizes in range", () => {
    const url = staticMapUrl(
      [{ tone: "todo", label: "1", at: { lat: 33.5, lng: -112.1 } }],
      { w: 5000, h: 10 },
      "pk.test",
    );
    expect(url).toContain("/-112.100000,33.500000,12/1280x80@2x?access_token=");
    expect(url).not.toContain("path-");
  });

  it("draws a dark map for dark mode", () => {
    const pin = [{ tone: "todo" as const, label: "1", at: { lat: 33.5, lng: -112.1 } }];
    expect(staticMapUrl(pin, { w: 600, h: 300 }, "pk.test", "dark")).toContain(
      "/styles/v1/mapbox/dark-v11/static/",
    );
    expect(staticMapUrl(pin, { w: 600, h: 300 }, "pk.test")).toContain("/mapbox/light-v11/");
  });

  // A winding road between two points: `n` points curving `amp` degrees either side, three times.
  const winding = (a: LatLng, b: LatLng, n = 400, amp = 0.0002): LatLng[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const w = Math.sin(t * Math.PI * 3) * amp;
      return { lat: a.lat + (b.lat - a.lat) * t + w, lng: a.lng + (b.lng - a.lng) * t - w };
    });
  const roads = (pins: { tone: string; at: LatLng }[]) =>
    routeLegPaths(
      routeOrder(pins as { tone: "shop" | "todo"; at: LatLng }[]).map((p) => p.at),
      () => null,
    ).legs.map((l) => winding(l[0]!, l.at(-1)!));
  const paths = (url: string) =>
    [...url.matchAll(/path-\d+\+[0-9a-f]{6}-1\(([^)]+)\)/g)].map((m) =>
      decodePolyline(decodeURIComponent(m[1]!))!,
    );

  it("draws the route along the roads, through every pin, within Mapbox's address limit", () => {
    const legs = roads(day);
    const url = staticMapUrl(day, { w: 600, h: 300 }, "pk.test", "light", null, undefined, legs);
    expect(url.length).toBeLessThanOrEqual(MAX_URL);
    const [casing, line] = paths(url);
    expect(casing).toEqual(line);
    // More points than the straight line (only as many as the image shows), every pin on it,
    // starting and ending at the shop.
    expect(line!.length).toBeGreaterThan(8);
    const on = (p: LatLng) => line!.some((q) => q.lat === p.lat && q.lng === p.lng);
    expect(day.every((p) => on(p.at))).toBe(true);
    expect(line![0]).toEqual(day[0]!.at);
    expect(line!.at(-1)).toEqual(day[0]!.at);
  });

  it("simplifies a long day's roads just enough to fit, keeping this site's pins", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      tone: "todo" as const,
      label: String(i + 1),
      at: { lat: 33.4 + (i % 4) * 0.01, lng: -112 - Math.floor(i / 4) * 0.012 },
    }));
    const pins = [{ tone: "shop" as const, label: "", at: { lat: 33.39, lng: -111.99 } }, ...many];
    // Roads that wander a couple of hundred meters, many points each.
    const legs = roads(pins).map((l) => winding(l[0]!, l.at(-1)!, 1500, 0.002));
    const url = staticMapUrl(
      pins,
      { w: 360, h: 180 },
      "pk",
      "light",
      "green",
      "https://app.example.com",
      legs,
    );
    expect(url.length).toBeLessThanOrEqual(MAX_URL);
    expect(url).toContain(encodeURIComponent("https://app.example.com/api/map/pin/"));
    const [line] = paths(url);
    expect(line!.length).toBeGreaterThan(pins.length + 1);
  });

  it("with no paths, the straight route as before", () => {
    const straight = staticMapUrl(day, { w: 600, h: 300 }, "pk.test");
    const [line] = paths(straight);
    expect(line).toHaveLength(4);
  });

  it("draws a spread-out day with small pins and a thin line, and crowded pins smaller", () => {
    // Stops across a city: zoomed out.
    const city = [
      { tone: "shop" as const, label: "", at: { lat: 33.45, lng: -112.07 } },
      { tone: "done" as const, label: "1", at: { lat: 33.6, lng: -111.9 } },
      { tone: "current" as const, label: "2", at: { lat: 33.3, lng: -112.25 } },
    ];
    const small = staticMapUrl(
      city,
      { w: 360, h: 180 },
      "pk",
      "light",
      "green",
      "https://app.example.com",
    );
    expect(small).toContain(encodeURIComponent("/api/map/pin/done-1-green-s.png"));
    expect(small).toContain(encodeURIComponent("/api/map/pin/current-2-green-s.png"));
    expect(small).toContain(encodeURIComponent("/api/map/pin/shop-s.png"));
    expect(small).toContain("/static/path-4+ffffff-1(");
    expect(small).toContain(",path-3+2e8b57-1(");
    // Mapbox's own markers: small, still numbered (owner, 2026-10-24).
    expect(staticMapUrl(city, { w: 360, h: 180 }, "pk", "light", "green")).toContain(
      ",pin-s-2+2e8b57(-112.25000,33.30000)",
    );
    // Close in, but two stops 130 m apart, about 23 points on this image: full-size (34) and
    // medium (28) pins would overlap, so the small ones (22), still numbered.
    const nextDoor = [
      { tone: "shop" as const, label: "", at: { lat: 33.45, lng: -112.07 } },
      { tone: "todo" as const, label: "1", at: { lat: 33.455, lng: -112.075 } },
      { tone: "todo" as const, label: "2", at: { lat: 33.45617, lng: -112.075 } },
    ];
    expect(mapView(nextDoor, { w: 360, h: 180 }).tier).toBe("small");
    const small2 = staticMapUrl(
      nextDoor,
      { w: 360, h: 180 },
      "pk",
      "light",
      "green",
      "https://app.example.com",
    );
    expect(small2).toContain(encodeURIComponent("/api/map/pin/todo-1-green-s.png"));
    expect(small2).toContain(encodeURIComponent("/api/map/pin/todo-2-green-s.png"));
  });
});

describe("crowded pins on Mapbox's image (owner, 2026-10-24: the dots aren't placed great)", () => {
  it("draws a pile apart, each with a leader line and a dot on its true spot", () => {
    const pile = [
      { tone: "shop" as const, label: "", at: { lat: 33.4484, lng: -112.074 } },
      ...Array.from({ length: 6 }, (_, i) => ({
        tone: "todo" as const,
        label: String(i + 1),
        at: { lat: 33.54 + i * 0.0003, lng: -112.18 + (i % 2) * 0.0003 },
      })),
    ];
    const url = staticMapUrl(
      pile,
      { w: 360, h: 180 },
      "pk",
      "light",
      "green",
      "https://app.example.com",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_URL);
    // Leader lines: white under the route's color, and a dot on the stop's spot.
    expect(url).toContain(",path-2+2e8b57-1(");
    expect(url).toContain(encodeURIComponent("/api/map/pin/dot-green.png"));
    for (let n = 1; n <= 6; n++)
      expect(url).toContain(encodeURIComponent(`/api/map/pin/todo-${n}-green-s.png`));
  });
});
