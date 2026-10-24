import {
  crowdedStyleAt,
  dayMapPins,
  mapView,
  unprojectPoint,
  viewPoint,
  viewSpan,
  decodePins,
  encodePins,
  fitZoom,
  imageTier,
  MAP_PIN_LIMIT,
  metersPerPoint,
  pinSizeAt,
  projectPoint,
  ROUTE_STYLE,
  ROUTE_STYLE_SMALL,
  ROUTE_TIER_ZOOM,
  ROUTE_ZOOM,
  routeColor,
  routeStyleAt,
  routeTierStyle,
  SPREAD,
  spreadPins,
  VIEW_MARGIN,
  zoomForSpan,
  type LatLng,
  type MapPin,
  type PinTone,
  type RouteTier,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// day-map.ts (a day's map on Schedule and Today, owner 2026-10-20).

const SHOP = { lat: 33.4152, lng: -111.8315 };
const at = (i: number) => ({ lat: 33.4 + i * 0.01, lng: -111.9 - i * 0.003 });
// A day a few streets across (owner, 2026-10-24), and the same with one stop far out east.
const HOME = { lat: 33.5605, lng: -112.1312 };
const near = (i: number) => ({
  lat: 33.553 + (i % 4) * 0.004,
  lng: -112.142 + Math.floor(i / 4) * 0.006 + (i % 2) * 0.0015,
});
const cluster: { at: LatLng; tone: PinTone }[] = [
  { at: HOME, tone: "shop" },
  ...Array.from({ length: 11 }, (_, i) => ({
    at: near(i),
    tone: (i === 0 ? "current" : "todo") as PinTone,
  })),
];
const spread: { at: LatLng; tone: PinTone }[] = [
  { at: HOME, tone: "shop" },
  { at: near(0), tone: "done" },
  { at: { lat: 33.5, lng: -112.05 }, tone: "current" },
  { at: { lat: 33.53, lng: -111.99 }, tone: "todo" },
];

const DOWNTOWN = { lat: 33.4484, lng: -112.074 };
const glendale: { at: LatLng; tone: PinTone }[] = [
  { at: DOWNTOWN, tone: "shop" },
  ...[
    [33.5412, -112.1869],
    [33.535, -112.1853],
    [33.5343, -112.1865],
    [33.5319, -112.1703],
    [33.5374, -112.1629],
    [33.5377, -112.1575],
    [33.536, -112.1508],
    [33.536, -112.1458],
    [33.5433, -112.1388],
    [33.5291, -112.1388],
    [33.5024, -112.1849],
    [33.491, -111.9959],
  ].map(([lat, lng], i) => ({
    at: { lat: lat!, lng: lng! },
    tone: (i < 9 ? "done" : i === 9 ? "current" : "todo") as PinTone,
  })),
];

const COLUMN = { w: 360, h: 180 };
const glendaleView = mapView(glendale, COLUMN);

export const dayMap: ModuleCases = {
  MAP_PIN_LIMIT: rule(() => MAP_PIN_LIMIT, [[]]),
  ROUTE_STYLE: rule(() => ROUTE_STYLE, [[]]),
  // Smaller zoomed out (owner, 2026-10-23: "thinner lines and smaller dots when zoomed out").
  ROUTE_STYLE_SMALL: rule(() => ROUTE_STYLE_SMALL, [[]]),
  ROUTE_ZOOM: rule(() => ROUTE_ZOOM, [[]]),
  routeStyleAt: rule(
    (zoom: number) => routeStyleAt(zoom),
    [[2], [10], [10.4], [10.9], [11.37], [11.5], [12.1], [12.75], [13], [16.2], [-3]],
  ),
  routeTierStyle: rule(
    (tier: RouteTier) => ({ zoom: ROUTE_TIER_ZOOM[tier], ...routeTierStyle(tier) }),
    [["full"], ["medium"], ["small"]],
  ),
  pinSizeAt: rule(
    (tone: PinTone, zoom: number) => pinSizeAt(tone, routeStyleAt(zoom)),
    [
      ["shop", 13],
      ["current", 11],
      ["done", 10],
      ["todo", 12.5],
    ],
  ),
  imageTier: rule(
    (zoom: number, pins: { x: number; y: number; tone: PinTone }[]) => imageTier(zoom, pins),
    [
      [14, []],
      [
        13,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 100, y: 0, tone: "todo" },
        ],
      ],
      [
        12,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 100, y: 0, tone: "todo" },
        ],
      ],
      [
        11.2,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 100, y: 0, tone: "todo" },
        ],
      ],
      // The nearest tier: full from 12.25, medium from 10.75.
      [12.25, []],
      [12.2, []],
      [10.75, []],
      [10.7, []],
      // Crowded: 30 apart overlaps at full size, not at medium; 20 apart only fits small dots.
      // The start is left out (drawn under the stops), so its neighbor at 30 doesn't count.
      [
        14,
        [
          { x: 0, y: 0, tone: "shop" },
          { x: 30, y: 0, tone: "todo" },
          { x: 200, y: 7, tone: "todo" },
        ],
      ],
      [
        14,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 12, y: 16, tone: "todo" },
        ],
      ],
      [
        14,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 36, y: 0, tone: "current" },
        ],
      ],
      [
        14,
        [
          { x: 0, y: 0, tone: "todo" },
          { x: 0.5, y: 0.5, tone: "done" },
        ],
      ],
    ],
  ),
  projectPoint: rule(
    (p: LatLng, zoom: number) => projectPoint(p, zoom),
    [
      [{ lat: 0, lng: 0 }, 0],
      [SHOP, 13],
      [{ lat: -33.8688, lng: 151.2093 }, 11.25],
      [{ lat: 89, lng: -180 }, 2],
    ],
  ),
  unprojectPoint: rule(
    (p: { x: number; y: number }, zoom: number) => unprojectPoint(p, zoom),
    [
      [{ x: 128, y: 128 }, 0],
      [{ x: 0, y: 64 }, 0],
      [{ x: 1_000_000, y: 1_700_000 }, 13],
    ],
  ),
  mapView: rule(
    (pins: { at: LatLng; tone: PinTone }[], size: { w: number; h: number }, extra?: LatLng[]) =>
      mapView(pins, size, extra),
    [
      [[], { w: 360, h: 180 }],
      [[{ at: SHOP, tone: "todo" }], { w: 360, h: 180 }],
      [cluster, { w: 360, h: 180 }],
      [[...cluster, { at: SHOP, tone: "todo" }], { w: 360, h: 180 }],
      [spread, { w: 360, h: 180 }],
      [spread, { w: 270, h: 180 }, [{ lat: 33.6, lng: -112.2 }]],
      [spread, { w: 390, h: 200 }],
    ],
  ),
  viewPoint: rule(
    (p: LatLng, view: { center: LatLng; zoom: number }, size: { w: number; h: number }) =>
      viewPoint(p, view, size),
    [
      [HOME, { center: HOME, zoom: 13 }, { w: 360, h: 180 }],
      [near(3), { center: HOME, zoom: 13.4 }, { w: 360, h: 180 }],
      [SHOP, { center: HOME, zoom: 10.2 }, { w: 640, h: 427 }],
    ],
  ),
  viewSpan: rule(
    (view: { center: LatLng; zoom: number }, size: { w: number; h: number }) =>
      viewSpan(view, size),
    [
      [
        { center: HOME, zoom: 13 },
        { w: 360, h: 180 },
      ],
      [
        { center: SHOP, zoom: 10.2 },
        { w: 640, h: 427 },
      ],
    ],
  ),
  // Pins too close to read, spread apart (owner, 2026-10-24: "the dots aren't placed great").
  SPREAD: rule(() => SPREAD, [[]]),
  spreadPins: rule(
    (
      pins: { x: number; y: number; tone: PinTone }[],
      tier: RouteTier,
      frame?: { w: number; h: number; margin: number; corner?: number },
    ) => spreadPins(pins, routeTierStyle(tier), frame),
    [
      [[], "small"],
      [
        [
          { x: 50, y: 50, tone: "todo" },
          { x: 100, y: 50, tone: "current" },
        ],
        "full",
      ],
      // A pile, the start among it (it never moves for a stop).
      [
        [
          { x: 100, y: 60, tone: "shop" },
          ...Array.from({ length: 9 }, (_, i) => ({
            x: 100 + (i % 3) * 4,
            y: 60 + Math.floor(i / 3) * 3,
            tone: (i === 4 ? "current" : i < 2 ? "done" : "todo") as PinTone,
          })),
        ],
        "small",
      ],
      // Pins on one spot.
      [Array.from({ length: 4 }, () => ({ x: 80, y: 80, tone: "todo" as PinTone })), "medium"],
      // Inside an image, out of its Enlarge corner.
      [
        [
          { x: 340, y: 20, tone: "todo" },
          { x: 2, y: 178, tone: "todo" },
          { x: 30, y: 170, tone: "current" },
        ],
        "small",
        { w: 360, h: 180, margin: VIEW_MARGIN, corner: SPREAD.corner },
      ],
      // The 12-stop day in Glendale the owner looked at (2026-10-24), as the column image lays it.
      [
        glendale.map((p) => ({ ...viewPoint(p.at, glendaleView, COLUMN), tone: p.tone })),
        "small",
        { ...COLUMN, margin: VIEW_MARGIN, corner: SPREAD.corner },
      ],
    ],
  ),
  crowdedStyleAt: rule(
    (zoom: number, pins: { at: LatLng; tone: PinTone }[]) => crowdedStyleAt(zoom, pins),
    [
      [17, cluster],
      [13, cluster],
      [12, spread],
      [9, cluster],
      [14, []],
    ],
  ),
  zoomForSpan: rule(
    (lngDelta: number, width: number) => zoomForSpan(lngDelta, width),
    [
      [360, 256],
      [0.05, 390],
      [0.4, 361],
      [0, 390],
      [0.05, 0],
    ],
  ),
  fitZoom: rule(
    (points: LatLng[], size: { w: number; h: number }, padding: number, maxZoom?: number) =>
      fitZoom(points, size, padding, maxZoom),
    [
      [[SHOP], { w: 360, h: 180 }, 44],
      [[SHOP, SHOP], { w: 360, h: 180 }, 44, 15],
      [[SHOP, at(1), at(5)], { w: 360, h: 180 }, 44],
      [[SHOP, at(1), at(30)], { w: 640, h: 427 }, 40],
      [[SHOP, { lat: 33.4152, lng: -111.7 }], { w: 300, h: 300 }, 0],
      [[SHOP, at(2)], { w: 50, h: 50 }, 44],
    ],
  ),
  metersPerPoint: rule(
    (lat: number, zoom: number) => metersPerPoint(lat, zoom),
    [
      [0, 0],
      [33.4152, 13],
      [-60, 9.5],
    ],
  ),
  // A route's color (owner, 2026-10-23): the tech's, else water blue.
  routeColor: rule(
    (key: string | null) => routeColor(key),
    [["orange"], ["slate"], ["blue"], [null], [""], ["Orange"], ["mauve"]],
  ),
  dayMapPins: rule(
    (input: Parameters<typeof dayMapPins>[0]) => dayMapPins(input),
    [
      [{ stops: [], depot: null }],
      [{ stops: [], depot: SHOP }],
      // Unlocated stops are counted in the numbers and as missing.
      [
        {
          stops: [
            { id: "a", location: at(1), done: true },
            { id: "b", location: null, done: false },
            { id: "c", location: at(3), done: false },
            { id: "d", location: at(4), done: false },
          ],
          depot: SHOP,
          currentId: "c",
        },
      ],
      // A done stop stays done even when it's the current one; a current id that isn't there.
      [
        {
          stops: [
            { id: "a", location: at(1), done: true },
            { id: "b", location: at(2), done: false },
          ],
          depot: null,
          currentId: "a",
        },
      ],
      [{ stops: [{ id: "a", location: at(1), done: false }], depot: SHOP, currentId: "zz" }],
      [{ stops: [{ id: "a", location: at(1), done: false }], depot: SHOP, currentId: null }],
      // More than the map shows.
      [
        {
          stops: Array.from({ length: 64 }, (_, i) => ({
            id: `s${i}`,
            location: i === 5 ? null : at(i),
            done: i < 10,
          })),
          depot: SHOP,
        },
      ],
    ],
  ),
  encodePins: rule(
    (pins: MapPin[]) => encodePins(pins),
    [
      [[]],
      [
        [
          { label: "", at: SHOP, tone: "shop", id: null },
          { label: "1", at: { lat: 33.123456, lng: -112.000004 }, tone: "done", id: "a" },
          { label: "2", at: { lat: 33.5, lng: -112.1 }, tone: "current", id: "b" },
          { label: "12", at: { lat: -0.000001, lng: 0.000005 }, tone: "todo", id: "c" },
        ],
      ],
    ],
  ),
  decodePins: rule(
    (value: string) => decodePins(value),
    [
      [""],
      ["s:33.41520,-111.83150;d1:33.12346,-112.00000;c2:33.5,-112.1;t12:-0.00000,0.00001"],
      ["t1:33,-112"],
      ["t007:-90,180"],
      ["t1:90.000001,0"],
      ["t1:33.5,-180.5"],
      ["t1:33.5,-112.1;"],
      ["x1:33.5,-112.1"],
      ["t1234:33.5,-112.1"],
      ["t1:33.1234567,-112.1"],
      ["t1:133.5,-112.1"],
      ["t1:33.,-112.1"],
      ["t1: 33.5,-112.1"],
      ["t1:33.5,-112.1\n"],
      ["t١:33.5,-112.1"],
      [Array.from({ length: 60 }, (_, i) => `t${i + 1}:33.5,-112.1`).join(";")],
      [Array.from({ length: 61 }, (_, i) => `t${i + 1}:33.5,-112.1`).join(";")],
      [`t1:33.5,-112.1;${"x".repeat(4000)}`],
    ],
  ),
};
