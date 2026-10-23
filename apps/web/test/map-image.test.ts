import { describe, expect, it } from "vitest";
import { encodePolyline, staticMapUrl } from "../src/server/map-image";

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

  const day = [
    { tone: "shop" as const, label: "", at: { lat: 33.45, lng: -112.07 } },
    { tone: "done" as const, label: "1", at: { lat: 33.5, lng: -112.1 } },
    { tone: "current" as const, label: "2", at: { lat: 33.6, lng: -112.2 } },
  ];

  it("draws the shop, numbered stops and the route in water blue without a tech", () => {
    const url = staticMapUrl(day, { w: 600, h: 300 }, "pk.test");
    // A white casing, then the bold line on it.
    expect(url).toContain("/static/path-9+ffffff-1(");
    expect(url).toContain(",path-6+1f6fae-1(");
    expect(url).toContain(",pin-s-home+12263a(-112.07000,33.45000)");
    // Done is the route's color at reduced strength; the stop you're on is full strength.
    expect(url).toContain(",pin-l-1+8fb7d7(-112.10000,33.50000)");
    expect(url).toContain(",pin-l-2+1f6fae(-112.20000,33.60000)");
    expect(url).toContain("/auto/600x300@2x?padding=44&access_token=pk.test");
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
      `,url-${encodeURIComponent("https://app.example.com/api/map/pin/done-1-green.png")}(-112.10000,33.50000)`,
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
    expect(long).toContain("pin-l-60+2e8b57(");
  });

  it("draws a home start as a larger house, never anything else about it", () => {
    const url = staticMapUrl(
      [
        { tone: "shop", label: "", at: { lat: 33.4, lng: -111.8 }, home: true },
        { tone: "todo", label: "1", at: { lat: 33.5, lng: -112.1 } },
      ],
      { w: 600, h: 300 },
      "pk.test",
    );
    expect(url).toContain(",pin-l-home+12263a(-111.80000,33.40000)");
    expect(url).toContain(",pin-l-1+1f6fae(-112.10000,33.50000)");
  });

  it("centers on a single pin and keeps sizes in range", () => {
    const url = staticMapUrl(
      [{ tone: "todo", label: "1", at: { lat: 33.5, lng: -112.1 } }],
      { w: 5000, h: 10 },
      "pk.test",
    );
    expect(url).toContain("/-112.1,33.5,13/1280x80@2x?access_token=");
    expect(url).not.toContain("path-");
  });

  it("draws a dark map for dark mode", () => {
    const pin = [{ tone: "todo" as const, label: "1", at: { lat: 33.5, lng: -112.1 } }];
    expect(staticMapUrl(pin, { w: 600, h: 300 }, "pk.test", "dark")).toContain(
      "/styles/v1/mapbox/dark-v11/static/",
    );
    expect(staticMapUrl(pin, { w: 600, h: 300 }, "pk.test")).toContain("/mapbox/light-v11/");
  });
});
