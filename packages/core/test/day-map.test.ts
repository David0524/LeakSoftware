import { describe, expect, it } from "vitest";
import {
  ROUTE_STYLE,
  ROUTE_STYLE_SMALL,
  ROUTE_ZOOM,
  VIEW_MARGIN,
  crowdedAt,
  crowdedStyleAt,
  dayMapPins,
  mapView,
  pinSizeAt,
  unprojectPoint,
  viewPoint,
  viewSpan,
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
    // The start is drawn under the stops: a stop at its door costs no pin its number.
    expect(imageTier(14, [{ x: 0, y: 0, tone: "shop" }, ...apart(2, 100)])).toBe("full");
    expect(imageTier(14, [{ x: 100, y: 0, tone: "shop" }, ...apart(2, 100)])).toBe("full");
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

// A day like the owner's screenshot (2026-10-24): a start and eleven stops a few streets apart
// in north-west Phoenix, and (Luis) one more stop out east in Mesa.
const HOME = { lat: 33.5605, lng: -112.1312 };
const CLUSTER = Array.from({ length: 11 }, (_, i) => ({
  lat: 33.553 + (i % 4) * 0.004,
  lng: -112.142 + Math.floor(i / 4) * 0.006 + (i % 2) * 0.0015,
}));
const dayPins = (stops: { lat: number; lng: number }[]) => [
  { at: HOME, tone: "shop" as const },
  ...stops.map((at, i) => ({ at, tone: i === 0 ? ("current" as const) : ("todo" as const) })),
];
const COLUMN = { w: 360, h: 180 };

describe("map views (owner, 2026-10-24: every image framed by us, never the service's auto)", () => {
  it("projects a place to its pixel on the image", () => {
    // The world at zoom 0 is 256 points: its left edge, and a quarter way down (66.51326°N,
    // atan(sinh(π/2)) in web Mercator).
    const world = { center: { lat: 0, lng: 0 }, zoom: 0 };
    const top = viewPoint({ lat: 66.51326044, lng: -180 }, world, { w: 256, h: 256 });
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(64, 5);
    expect(viewPoint({ lat: 0, lng: -90 }, world, { w: 256, h: 256 })).toEqual({ x: 64, y: 128 });
    // At zoom 13 one degree of longitude is 256·2¹³/360 points; the center is the middle.
    const v = { center: HOME, zoom: 13 };
    expect(viewPoint(HOME, v, COLUMN)).toEqual({ x: 180, y: 90 });
    const east = viewPoint({ lat: HOME.lat, lng: HOME.lng + 0.01 }, v, COLUMN);
    expect(east.x - 180).toBeCloseTo((0.01 * 256 * 2 ** 13) / 360, 6);
    expect(east.y).toBeCloseTo(90, 6);
    // North is up, and a degree of latitude is longer than one of longitude at 33.5° (Mercator).
    const north = viewPoint({ lat: HOME.lat + 0.01, lng: HOME.lng }, v, COLUMN);
    expect(90 - north.y).toBeCloseTo((east.x - 180) / Math.cos((HOME.lat * Math.PI) / 180), 0);
    const back = unprojectPoint(projectPoint(HOME, 11.3), 11.3);
    expect(back.lat).toBeCloseTo(HOME.lat, 9);
    expect(back.lng).toBeCloseTo(HOME.lng, 9);
  });

  it("gives the span an image covers, the same as its zoom", () => {
    const span = viewSpan({ center: HOME, zoom: 12.4 }, COLUMN);
    expect(zoomForSpan(span.lngDelta, COLUMN.w)).toBeCloseTo(12.4, 9);
    // The top and bottom edges are where the projection puts them.
    const v = { center: HOME, zoom: 12.4 };
    const c = projectPoint(HOME, 12.4);
    const topLat = unprojectPoint({ x: c.x, y: c.y - 90 }, 12.4).lat;
    expect(viewPoint({ lat: topLat, lng: HOME.lng }, v, COLUMN).y).toBeCloseTo(0, 6);
    expect(span.latDelta).toBeGreaterThan(0);
    expect(span.latDelta).toBeLessThan(span.lngDelta);
  });

  it("frames a tight cluster closely, every pin whole inside the image", () => {
    const pins = dayPins(CLUSTER);
    const view = mapView(pins, COLUMN);
    // A few streets across, not the valley (the Mapbox image showed Phoenix to Gilbert, ~zoom 10).
    expect(view.zoom).toBeGreaterThan(12.3);
    const sizes = routeTierStyle(view.tier);
    const xy = pins.map((p) => ({
      ...viewPoint(p.at, view, COLUMN),
      r: pinSizeAt(p.tone, sizes) / 2,
    }));
    for (const p of xy) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(VIEW_MARGIN - 1e-6);
      expect(p.x + p.r).toBeLessThanOrEqual(COLUMN.w - VIEW_MARGIN + 1e-6);
      expect(p.y - p.r).toBeGreaterThanOrEqual(VIEW_MARGIN - 1e-6);
      expect(p.y + p.r).toBeLessThanOrEqual(COLUMN.h - VIEW_MARGIN + 1e-6);
    }
    // Tight: the pins reach the margin on at least one side (no spare zoom left).
    const reach = Math.min(...xy.map((p) => p.y - p.r), ...xy.map((p) => COLUMN.h - p.y - p.r));
    expect(reach).toBeCloseTo(VIEW_MARGIN, 3);
  });

  it("fits a cluster and one far stop, the cluster's pins stepped down so none pile up", () => {
    const pins = dayPins([...CLUSTER, { lat: 33.4152, lng: -111.8315 }]);
    const view = mapView(pins, COLUMN);
    expect(view.zoom).toBeLessThan(11);
    expect(view.zoom).toBeGreaterThan(9.5);
    for (const p of pins) {
      const at = viewPoint(p.at, view, COLUMN);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(COLUMN.w);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(COLUMN.h);
    }
    // Numbered pins would overlap there, so the image draws small dots.
    expect(view.tier).toBe("small");
  });

  it("never draws numbered pins that overlap (a dense day)", () => {
    const dense = Array.from({ length: 12 }, (_, i) => ({
      lat: 33.556 + (i % 3) * 0.0012,
      lng: -112.136 + Math.floor(i / 3) * 0.0016,
    }));
    for (const size of [COLUMN, { w: 270, h: 180 }, { w: 480, h: 160 }, { w: 640, h: 427 }]) {
      const pins = dayPins(dense);
      const view = mapView(pins, size);
      const at = pins.map((p) => ({ ...viewPoint(p.at, view, size), tone: p.tone }));
      if (view.tier !== "small") expect(crowdedAt(at, routeTierStyle(view.tier))).toBe(false);
    }
  });

  it("shows a day at one place at the neighborhood zoom", () => {
    const view = mapView([{ at: HOME, tone: "todo" }], COLUMN);
    expect(view.zoom).toBe(ROUTE_ZOOM.full);
    expect(view.center.lat).toBeCloseTo(HOME.lat, 9);
    expect(view.tier).toBe("full");
  });

  it("makes room for the route's road path", () => {
    const pins = dayPins(CLUSTER.slice(0, 3));
    const detour = [{ lat: 33.6, lng: -112.13 }];
    const view = mapView(pins, COLUMN, detour);
    const at = viewPoint(detour[0]!, view, COLUMN);
    expect(at.y).toBeGreaterThan(0);
    expect(mapView(pins, COLUMN).zoom).toBeGreaterThan(view.zoom);
  });

  it("shrinks a live map's pins while they'd overlap", () => {
    const pins = dayPins(CLUSTER);
    // Far enough in, full size; at a zoom where full pins would touch, smaller ones.
    expect(crowdedStyleAt(17, pins)).toEqual(routeStyleAt(17));
    const s = crowdedStyleAt(13, pins);
    expect(s.pinSize).toBeLessThan(routeStyleAt(13).pinSize);
    // Zoomed out it's already the small dots.
    expect(crowdedStyleAt(9, pins)).toEqual(routeStyleAt(9));
  });
});
