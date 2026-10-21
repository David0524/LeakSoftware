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

  it("draws the shop, numbered stops in their colors, and the route", () => {
    const url = staticMapUrl(
      [
        { tone: "shop", label: "", at: { lat: 33.45, lng: -112.07 } },
        { tone: "done", label: "1", at: { lat: 33.5, lng: -112.1 } },
        { tone: "current", label: "2", at: { lat: 33.6, lng: -112.2 } },
      ],
      { w: 600, h: 300 },
      "pk.test",
    );
    expect(url).toContain("/static/path-3+1f6fae-0.45(");
    expect(url).toContain(",pin-s-home+12263a(-112.07000,33.45000)");
    expect(url).toContain(",pin-s-1+1b7d45(-112.10000,33.50000)");
    expect(url).toContain(",pin-s-2+ee6a1f(-112.20000,33.60000)");
    expect(url).toContain("/auto/600x300@2x?padding=36&access_token=pk.test");
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
    expect(staticMapUrl(pin, { w: 600, h: 300 }, "pk.test")).toContain("/mapbox/streets-v12/");
  });
});
