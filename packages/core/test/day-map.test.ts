import { describe, expect, it } from "vitest";
import {
  ROUTE_STYLE,
  ROUTE_STYLE_SMALL,
  ROUTE_ZOOM,
  dayMapPins,
  decodePins,
  encodePins,
  fitZoom,
  imageTier,
  metersPerPoint,
  projectPoint,
  routeColor,
  routeOrder,
  routeStyleAt,
  routeTierStyle,
  zoomForSpan,
} from "../src";

describe("dayMapPins", () => {
  const depot = { lat: 33.45, lng: -112.07 };
  it("numbers stops by their place in the day and tones them", () => {
    const { pins, missing } = dayMapPins({
      depot,
      currentId: "b",
      stops: [
        { id: "a", location: { lat: 33.5, lng: -112.1 }, done: true },
        { id: "x", location: null, done: false },
        { id: "b", location: { lat: 33.6, lng: -112.2 }, done: false },
        { id: "c", location: { lat: 33.7, lng: -112.3 }, done: false },
      ],
    });
    expect(missing).toBe(1);
    expect(pins.map((p) => [p.label, p.tone])).toEqual([
      ["", "shop"],
      ["1", "done"],
      ["3", "current"],
      ["4", "todo"],
    ]);
  });
  it("encodes and decodes the map address", () => {
    const { pins } = dayMapPins({
      depot,
      stops: [{ id: "a", location: { lat: 33.512345, lng: -112.1 }, done: false }],
    });
    const v = encodePins(pins);
    expect(v).toBe("s:33.45000,-112.07000;t1:33.51235,-112.10000");
    expect(decodePins(v)).toEqual([
      { tone: "shop", label: "", at: { lat: 33.45, lng: -112.07 } },
      { tone: "todo", label: "1", at: { lat: 33.51235, lng: -112.1 } },
    ]);
  });
  it("refuses anything else", () => {
    expect(decodePins("")).toBeNull();
    expect(decodePins("x1:1,2")).toBeNull();
    expect(decodePins("t1:91,0")).toBeNull();
    expect(decodePins("t1:1,2;<script>")).toBeNull();
  });
});

describe("routeColor", () => {
  it("is the tech's team color, else water blue", () => {
    expect(routeColor("orange")).toBe("orange");
    expect(routeColor("slate")).toBe("slate");
    expect(routeColor(null)).toBe("blue");
    expect(routeColor(undefined)).toBe("blue");
    expect(routeColor("mauve")).toBe("blue");
    expect(routeColor(3)).toBe("blue");
  });
  it("draws bolder than before: thicker line, bigger pins", () => {
    expect(ROUTE_STYLE.lineWidth).toBeGreaterThanOrEqual(6);
    expect(ROUTE_STYLE.casingWidth).toBeGreaterThan(ROUTE_STYLE.lineWidth);
    expect(ROUTE_STYLE.currentPinSize).toBeGreaterThan(ROUTE_STYLE.pinSize);
    expect(ROUTE_STYLE.startPinSize).toBe(28);
    expect(ROUTE_STYLE.doneTint).toBeLessThan(0.5);
  });
});

describe("route sizes by zoom (owner, 2026-10-23: smaller when zoomed out)", () => {
  it("is ROUTE_STYLE zoomed in and the small style zoomed out", () => {
    const full = routeStyleAt(15);
    expect(full).toMatchObject({
      pinSize: ROUTE_STYLE.pinSize,
      currentPinSize: ROUTE_STYLE.currentPinSize,
      lineWidth: ROUTE_STYLE.lineWidth,
      casingWidth: ROUTE_STYLE.casingWidth,
      numbers: true,
    });
    expect(routeStyleAt(ROUTE_ZOOM.full)).toEqual(full);
    expect(routeStyleAt(6)).toMatchObject({ ...ROUTE_STYLE_SMALL, numbers: false });
    expect(routeStyleAt(ROUTE_ZOOM.small)).toEqual(routeStyleAt(6));
  });

  it("steps smoothly in between, and the stop you're on stays larger", () => {
    let last = routeStyleAt(ROUTE_ZOOM.small);
    for (let z = ROUTE_ZOOM.small + 0.25; z <= ROUTE_ZOOM.full; z += 0.25) {
      const s = routeStyleAt(z);
      expect(s.pinSize).toBeGreaterThanOrEqual(last.pinSize);
      expect(s.pinSize - last.pinSize).toBeLessThanOrEqual(2);
      expect(s.currentPinSize).toBeGreaterThan(s.pinSize);
      expect(s.casingWidth).toBeGreaterThan(s.lineWidth);
      last = s;
    }
    expect(routeStyleAt(11.5)).toMatchObject({ pinSize: 23.5, lineWidth: 4.25, numbers: true });
    expect(routeStyleAt(Number.NaN)).toEqual(routeStyleAt(ROUTE_ZOOM.full));
  });

  it("numbers show only on pins big enough to read them", () => {
    expect(routeStyleAt(10.5).numbers).toBe(false);
    expect(routeStyleAt(11.5).numbers).toBe(true);
    expect(routeTierStyle("small").numbers).toBe(false);
    expect(routeTierStyle("medium").numbers).toBe(true);
  });
});

describe("imageTier", () => {
  const apart = (n: number, gap: number) =>
    Array.from({ length: n }, (_, i) => ({ x: i * gap, y: 0, tone: "todo" as const }));

  it("picks the tier nearest the zoom the image ends up at", () => {
    expect(imageTier(14, apart(3, 100))).toBe("full");
    expect(imageTier(12.25, apart(3, 100))).toBe("full");
    expect(imageTier(12.2, apart(3, 100))).toBe("medium");
    expect(imageTier(11, apart(3, 100))).toBe("medium");
    expect(imageTier(10.75, apart(3, 100))).toBe("medium");
    expect(imageTier(10.7, apart(3, 100))).toBe("small");
    expect(imageTier(8, [])).toBe("small");
  });

  it("goes smaller when two pins would overlap", () => {
    // 30 points apart: 34-point pins overlap, 23.5-point pins don't.
    expect(imageTier(14, apart(3, 30))).toBe("medium");
    // 20 apart: only the small dots fit.
    expect(imageTier(14, apart(3, 20))).toBe("small");
    // The stop you're on is larger, so it needs more room.
    expect(
      imageTier(14, [
        { x: 0, y: 0, tone: "todo" },
        { x: 36, y: 0, tone: "current" },
      ]),
    ).toBe("medium");
    // Small is as small as it gets, crowded or not.
    expect(imageTier(14, apart(3, 1))).toBe("small");
  });
});

describe("map image geometry", () => {
  it("fits points like the services' auto view", () => {
    const pts = [
      { lat: 33.4, lng: -112.0 },
      { lat: 33.5, lng: -111.9 },
    ];
    const z = fitZoom(pts, { w: 360, h: 180 }, 44);
    const a = projectPoint(pts[0]!, z);
    const b = projectPoint(pts[1]!, z);
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(360 - 88 + 1e-6);
    expect(Math.abs(a.y - b.y)).toBeCloseTo(180 - 88, 6);
    expect(fitZoom([pts[0]!], { w: 360, h: 180 }, 44)).toBe(16);
    expect(fitZoom([pts[0]!, pts[0]!], { w: 360, h: 180 }, 44, 15)).toBe(15);
  });

  it("converts a span to a zoom and back", () => {
    expect(zoomForSpan(360, 256)).toBeCloseTo(0, 9);
    expect(zoomForSpan(0.05, 390)).toBeCloseTo(Math.log2((390 * 360) / (256 * 0.05)), 9);
    expect(zoomForSpan(0, 390)).toBe(ROUTE_ZOOM.full);
    expect(metersPerPoint(0, 0)).toBeCloseTo(156543.03, 1);
  });

  it("orders a route from the start, through the stops, and back", () => {
    const pins = [
      { tone: "todo" as const, n: 1 },
      { tone: "shop" as const, n: 0 },
      { tone: "done" as const, n: 2 },
    ];
    expect(routeOrder(pins).map((p) => p.n)).toEqual([0, 1, 2, 0]);
    expect(routeOrder(pins.filter((p) => p.tone !== "shop")).map((p) => p.n)).toEqual([1, 2]);
    expect(routeOrder([{ tone: "shop" as const, n: 0 }]).map((p) => p.n)).toEqual([0]);
  });
});
