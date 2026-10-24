// A day's map on Schedule and Today (owner, 2026-10-20, docs/plans/route-maps.md: "the maps up
// top for route building"): the shop and each stop as a numbered pin, in route order. The
// website and Android draw it as a map image from the server (GET /api/map?pins=…), the iPhone
// with Apple Maps; all three number and color the pins by this rule.

import type { LatLng } from "./routing";
import type { RouteStartLabel } from "./route-start";
import { TECH_COLORS, type TechColor } from "./team";

export type PinTone = "shop" | "todo" | "current" | "done";

export interface MapPin {
  /** "1", "2", … (the stop's place in the day, unlocated stops counted), or "" for the shop. */
  label: string;
  at: LatLng;
  tone: PinTone;
  /** The stop's job (none for the shop). */
  id: string | null;
  /**
   * On the start pin (tone "shop") of someone who starts from home: drawn as a house labeled
   * "Home" (START_FROM_COPY.homePin), never the street.
   */
  home?: true;
}

/** Most pins one map shows (the map image's address has a length limit). */
export const MAP_PIN_LIMIT = 60;

/**
 * Pins for a day: the start (the shop, or home for someone who starts there), then each located stop numbered by its place in the day (so the
 * numbers match the list), toned done, current (the stop you're on), or still to do. `missing`
 * counts stops with no map location, shown under the map instead of guessed.
 */
export function dayMapPins(input: {
  stops: { id: string; location: LatLng | null; done: boolean }[];
  /** Where the day starts: the tech's start (startFor(…).at), or the shop. */
  depot: LatLng | null;
  /** startFor(…).label: "home" draws the start as Home. */
  startLabel?: RouteStartLabel | null;
  currentId?: string | null;
}): { pins: MapPin[]; missing: number } {
  const pins: MapPin[] = [];
  if (input.depot)
    pins.push(
      input.startLabel === "home"
        ? { label: "", at: input.depot, tone: "shop", id: null, home: true }
        : { label: "", at: input.depot, tone: "shop", id: null },
    );
  let missing = 0;
  input.stops.forEach((s, i) => {
    if (!s.location) {
      missing += 1;
      return;
    }
    pins.push({
      label: String(i + 1),
      at: s.location,
      tone: s.done ? "done" : s.id === input.currentId ? "current" : "todo",
      id: s.id,
    });
  });
  return { pins: pins.slice(0, MAP_PIN_LIMIT), missing };
}

/**
 * A route's color on its map (owner, 2026-10-23: "Bold tech-colored routes"): the tech's team
 * color, so each map matches its tech's column; blue (the brand's water blue) when no tech is
 * known (unassigned, or an address without one). Unlike techColor, a missing or unknown key is
 * blue, not slate, so old map addresses keep their look.
 */
export function routeColor(key: unknown): TechColor {
  return typeof key === "string" && TECH_COLORS.some((c) => c.key === key)
    ? (key as TechColor)
    : "blue";
}

/**
 * How a route is drawn, the same on every map (website images and live maps, the iPhone, and
 * Android's images): the line in the tech's color, opaque, on a white casing; stops as filled
 * circles in that color with a white number and edge; a done stop quieter (a light tint of the
 * color with a ring in it and the number in the text color, readable on any map); the stop
 * you're on larger, with a white ring and a navy ring outside it; the start unchanged (navy).
 * Sizes in points. Status is never color alone: each pin is still read aloud as "Stop 2".
 */
export const ROUTE_STYLE = {
  /** A stop's circle, white edge included. */
  pinSize: 34,
  /** The stop you're on, both rings included. */
  currentPinSize: 40,
  /** The white edge of a stop, and the white ring of the stop you're on. */
  pinEdge: 2,
  currentWhiteRing: 3,
  currentNavyRing: 2,
  /** The start (shop or home): unchanged. */
  startPinSize: 28,
  /**
   * A done stop's fill: the route's color at this strength over the surface (white, or the dark
   * surface in dark mode), so its number in the text color stays easy to read.
   */
  doneTint: 0.2,
  /** The line, and the white casing under it. */
  lineWidth: 6,
  casingWidth: 9,
} as const;

/**
 * The route's order on every map: the start (shop or home), each stop in turn, and back to the
 * start. A day with no start is just its stops.
 */
export function routeOrder<P extends { tone: PinTone }>(pins: P[]): P[] {
  const start = pins.find((p) => p.tone === "shop");
  const stops = pins.filter((p) => p.tone !== "shop");
  return [...(start ? [start] : []), ...stops, ...(start && stops.length ? [start] : [])];
}

/**
 * Zoomed out, a route shrinks (owner, 2026-10-23: "thinner lines and smaller dots when zoomed out
 * of the map so it doesn't look like one blob"): at ROUTE_ZOOM.full (a few streets across) and
 * closer, ROUTE_STYLE as it is; at ROUTE_ZOOM.small (a city across) and farther, these small
 * dots without numbers on a thin line; in between, every size steps smoothly from one to the
 * other. The stop you're on stays a little larger, with its rings, so it's easy to find. Zoom is
 * the web map zoom level (256-point tiles; 13 shows about 5 km across a phone).
 */
export const ROUTE_STYLE_SMALL = {
  pinSize: 13,
  currentPinSize: 18,
  pinEdge: 1.5,
  currentWhiteRing: 2,
  currentNavyRing: 1.5,
  startPinSize: 14,
  lineWidth: 2.5,
  casingWidth: 4,
} as const;

export const ROUTE_ZOOM = {
  /** At this zoom and closer: ROUTE_STYLE. */
  full: 13,
  /** At this zoom and farther: ROUTE_STYLE_SMALL. */
  small: 10,
  /** A pin shows its number (and the start its house) from this size, in points. */
  numbersFrom: 20,
} as const;

/** A route's sizes at one zoom (points), and whether its pins show their numbers. */
export interface RouteSizes {
  pinSize: number;
  currentPinSize: number;
  pinEdge: number;
  currentWhiteRing: number;
  currentNavyRing: number;
  startPinSize: number;
  lineWidth: number;
  casingWidth: number;
  numbers: boolean;
}

const SIZE_KEYS = [
  "pinSize",
  "currentPinSize",
  "pinEdge",
  "currentWhiteRing",
  "currentNavyRing",
  "startPinSize",
  "lineWidth",
  "casingWidth",
] as const;

/** The route's sizes at `zoom`, each to the nearest quarter point. */
export function routeStyleAt(zoom: number): RouteSizes {
  const z = Number.isFinite(zoom) ? zoom : ROUTE_ZOOM.full;
  const t = Math.max(0, Math.min(1, (z - ROUTE_ZOOM.small) / (ROUTE_ZOOM.full - ROUTE_ZOOM.small)));
  const out = {} as Record<(typeof SIZE_KEYS)[number], number>;
  for (const k of SIZE_KEYS) {
    const v = ROUTE_STYLE_SMALL[k] + (ROUTE_STYLE[k] - ROUTE_STYLE_SMALL[k]) * t;
    out[k] = Math.round(v * 4) / 4;
  }
  return { ...out, numbers: out.pinSize >= ROUTE_ZOOM.numbersFrom };
}

/**
 * A map image's three sizes (its pins are drawn ahead as small images, so an image uses one of
 * these rather than any size between): full, medium (halfway) and small.
 */
export type RouteTier = "full" | "medium" | "small";

export const ROUTE_TIER_ZOOM: Record<RouteTier, number> = { full: 13, medium: 11.5, small: 10 };

export function routeTierStyle(tier: RouteTier): RouteSizes {
  return routeStyleAt(ROUTE_TIER_ZOOM[tier]);
}

/** A pin's size at `sizes` (the start's, the stop you're on, or any other stop's). */
export function pinSizeAt(tone: PinTone, sizes: RouteSizes): number {
  return tone === "shop"
    ? sizes.startPinSize
    : tone === "current"
      ? sizes.currentPinSize
      : sizes.pinSize;
}

/**
 * The size a map image draws its route at: the tier nearest the live map's size at its zoom
 * (full from zoom 12.25, medium from 10.75, else small), then a smaller one while any two stops
 * would overlap (pins in image points at that zoom; projectPoint).
 */
export function imageTier(
  zoom: number,
  pins: { x: number; y: number; tone: PinTone }[],
): RouteTier {
  const order: RouteTier[] = ["full", "medium", "small"];
  let i = order.findIndex(
    (t, k) =>
      k === order.length - 1 || zoom >= (ROUTE_TIER_ZOOM[t] + ROUTE_TIER_ZOOM[order[k + 1]!]) / 2,
  );
  for (; i < order.length - 1; i++) if (!crowdedAt(pins, routeTierStyle(order[i]!))) break;
  return order[i]!;
}

/**
 * Whether any two stops (in map points) would overlap at `sizes`. The start is left out: it's
 * drawn under the stops, so a stop at the shop's door shouldn't cost every pin its number.
 */
export function crowdedAt(pins: { x: number; y: number; tone: PinTone }[], sizes: RouteSizes) {
  const stops = pins.filter((p) => p.tone !== "shop");
  return stops.some((a, j) =>
    stops.some(
      (b, k) =>
        k > j &&
        Math.hypot(a.x - b.x, a.y - b.y) <
          (pinSizeAt(a.tone, sizes) + pinSizeAt(b.tone, sizes)) / 2,
    ),
  );
}

/**
 * A live map's route sizes at `zoom` (owner, 2026-10-24: "the pins are a pile on top of each
 * other"): routeStyleAt(zoom), or, while any two pins would overlap at those sizes, the medium
 * or small tier's smaller ones, as the map images step down (imageTier). Small dots may still
 * touch; numbered pins never pile up.
 */
export function crowdedStyleAt(zoom: number, pins: { at: LatLng; tone: PinTone }[]): RouteSizes {
  const base = routeStyleAt(zoom);
  const at = pins.map((p) => ({ ...projectPoint(p.at, zoom), tone: p.tone }));
  if (!crowdedAt(at, base)) return base;
  for (const tier of ["medium", "small"] as const) {
    const sizes = routeTierStyle(tier);
    if (sizes.pinSize >= base.pinSize) continue;
    if (tier === "small" || !crowdedAt(at, sizes)) return sizes;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Where a map image ends up (web Mercator, 256-point tiles)
// ---------------------------------------------------------------------------

/** A point in map points at `zoom` (x east, y south), for distances between pins on an image. */
export function projectPoint(p: LatLng, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const lat = Math.max(-85, Math.min(85, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

/** The place at map point `pt` at `zoom` (projectPoint's inverse). */
export function unprojectPoint(pt: { x: number; y: number }, zoom: number): LatLng {
  const scale = 256 * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * pt.y) / scale;
  return {
    lng: (pt.x / scale) * 360 - 180,
    lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
  };
}

/**
 * What a map shows (owner, 2026-10-24: "Mapbox is way too far zoomed out"): its middle, its zoom
 * (256-point tiles, as projectPoint) and the size its route is drawn at. Every map image is
 * drawn at exactly this view (never the service's "auto"), so the pins' sizes are chosen for
 * the zoom the image really has.
 */
export interface MapView {
  center: LatLng;
  zoom: number;
  tier: RouteTier;
}

/** Room between a pin's edge and the map's edge, in points. */
export const VIEW_MARGIN = 8;

/** The closest a map frames a day (a day at one place shows ROUTE_ZOOM.full). */
export const VIEW_MAX_ZOOM = 15;

/**
 * The tightest view of `size` points that shows every pin whole (its circle at the view's tier,
 * plus VIEW_MARGIN) and every `extra` point (the route's road path) with room for the line. The
 * tier is the largest one whose pins fit and don't overlap at that zoom (imageTier): a tight
 * cluster with one far stop gets small dots, never a pile of numbered pins.
 */
export function mapView(
  pins: { at: LatLng; tone: PinTone }[],
  size: { w: number; h: number },
  extra: LatLng[] = [],
): MapView {
  const points = [...pins.map((p) => p.at), ...extra];
  if (!points.length) return { center: { lat: 0, lng: 0 }, zoom: 3, tier: "small" };
  const spread = points.some(
    (p) => Math.abs(p.lat - points[0]!.lat) > 1e-6 || Math.abs(p.lng - points[0]!.lng) > 1e-6,
  );
  const maxZoom = spread ? VIEW_MAX_ZOOM : ROUTE_ZOOM.full;
  const order: RouteTier[] = ["full", "medium", "small"];
  let view: MapView | null = null;
  for (const [i, tier] of order.entries()) {
    const sizes = routeTierStyle(tier);
    const pad = [
      ...pins.map((p) => pinSizeAt(p.tone, sizes) / 2 + VIEW_MARGIN),
      ...extra.map(() => sizes.casingWidth / 2 + VIEW_MARGIN / 2),
    ];
    const box = (z: number) => {
      const at = points.map((p) => projectPoint(p, z));
      const xs0 = at.map((p, k) => p.x - pad[k]!);
      const xs1 = at.map((p, k) => p.x + pad[k]!);
      const ys0 = at.map((p, k) => p.y - pad[k]!);
      const ys1 = at.map((p, k) => p.y + pad[k]!);
      return {
        x0: Math.min(...xs0),
        x1: Math.max(...xs1),
        y0: Math.min(...ys0),
        y1: Math.max(...ys1),
      };
    };
    const fits = (z: number) => {
      const b = box(z);
      return b.x1 - b.x0 <= size.w && b.y1 - b.y0 <= size.h;
    };
    let zoom = maxZoom;
    if (!fits(zoom)) {
      let lo = 2;
      let hi = maxZoom;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      zoom = lo;
    }
    const b = box(zoom);
    const center = unprojectPoint({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, zoom);
    const at = pins.map((p) => ({ ...projectPoint(p.at, zoom), tone: p.tone }));
    view = { center, zoom, tier };
    if (order.indexOf(imageTier(zoom, at)) <= i) break;
  }
  return view!;
}

/** Where `p` lands on a map of `size` points showing `view` (x right, y down, in points). */
export function viewPoint(
  p: LatLng,
  view: { center: LatLng; zoom: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const a = projectPoint(p, view.zoom);
  const c = projectPoint(view.center, view.zoom);
  return { x: a.x - c.x + size.w / 2, y: a.y - c.y + size.h / 2 };
}

/**
 * The degrees a map of `size` points showing `view` spans (for a service that takes a span, as
 * Apple's snapshots and MapKit regions do): across, and from its top edge to its bottom edge.
 */
export function viewSpan(
  view: { center: LatLng; zoom: number },
  size: { w: number; h: number },
): { latDelta: number; lngDelta: number } {
  const c = projectPoint(view.center, view.zoom);
  const top = unprojectPoint({ x: c.x, y: c.y - size.h / 2 }, view.zoom);
  const bottom = unprojectPoint({ x: c.x, y: c.y + size.h / 2 }, view.zoom);
  return { latDelta: top.lat - bottom.lat, lngDelta: (size.w * 360) / (256 * 2 ** view.zoom) };
}

/** The zoom at which a map `width` points wide shows `lngDelta` degrees of longitude across. */
export function zoomForSpan(lngDelta: number, width: number): number {
  if (!(lngDelta > 0) || !(width > 0)) return ROUTE_ZOOM.full;
  return Math.log2((width * 360) / (256 * lngDelta));
}

/**
 * The zoom a map image of `size` points ends up at when it fits `points` with `padding` points
 * spare on each side (as Apple's and Mapbox's "auto" do), at most `maxZoom`. One point: `maxZoom`.
 */
export function fitZoom(
  points: LatLng[],
  size: { w: number; h: number },
  padding: number,
  maxZoom = 16,
): number {
  if (points.length < 2) return maxZoom;
  const at0 = points.map((p) => projectPoint(p, 0));
  const xs = at0.map((p) => p.x);
  const ys = at0.map((p) => p.y);
  const dx = Math.max(...xs) - Math.min(...xs);
  const dy = Math.max(...ys) - Math.min(...ys);
  const w = Math.max(1, size.w - 2 * padding);
  const h = Math.max(1, size.h - 2 * padding);
  const zx = dx > 0 ? Math.log2(w / dx) : Infinity;
  const zy = dy > 0 ? Math.log2(h / dy) : Infinity;
  const z = Math.min(zx, zy, maxZoom);
  return Number.isFinite(z) ? z : maxZoom;
}

/** Meters one map point covers at `lat` and `zoom`. */
export function metersPerPoint(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

const TONE_CODE: Record<PinTone, string> = { shop: "s", todo: "t", current: "c", done: "d" };
const CODE_TONE = Object.fromEntries(
  Object.entries(TONE_CODE).map(([k, v]) => [v, k as PinTone]),
) as Record<string, PinTone>;

/** A home start pin's code ("h:33.4,-111.8"); it decodes as the start pin with `home`. */
const HOME_CODE = "h";

/** The pins as the map address's `pins` value: "s:33.45,-112.07;t1:33.5,-112.1;…". */
export function encodePins(pins: MapPin[]): string {
  return pins
    .map(
      (p) =>
        `${p.home && p.tone === "shop" ? HOME_CODE : TONE_CODE[p.tone]}${p.label}:${p.at.lat.toFixed(5)},${p.at.lng.toFixed(5)}`,
    )
    .join(";");
}

/** The pins back from the address, or null when it isn't valid. */
export function decodePins(value: string): Omit<MapPin, "id">[] | null {
  if (!value || value.length > 4000) return null;
  const out: Omit<MapPin, "id">[] = [];
  for (const part of value.split(";")) {
    const m = /^([stcdh])(\d{0,3}):(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/.exec(part);
    if (!m) return null;
    const lat = Number(m[3]);
    const lng = Number(m[4]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (m[1] === HOME_CODE && m[2]) return null;
    if (m[1] === HOME_CODE) out.push({ tone: "shop", label: m[2]!, at: { lat, lng }, home: true });
    else out.push({ tone: CODE_TONE[m[1]!]!, label: m[2]!, at: { lat, lng } });
  }
  return out.length && out.length <= MAP_PIN_LIMIT ? out : null;
}
