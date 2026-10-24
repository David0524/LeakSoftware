// Routes that follow the roads (owner, 2026-10-23: "The route between stops is always a straight
// line and doesn't take roads"). Pure: no network. A day's route is a line through its points in
// order (the start, each stop, back to the start); each drive between two of them is a leg. The
// server saves each leg's road path once (public.route_leg, keyed by legKey), the iPhone gets its
// own from MapKit; every map joins the legs here, drawing a leg with no path as a straight line
// so the map never breaks. Paths are simplified (Douglas–Peucker) so map image addresses stay
// within their limits and saved legs stay small.

import { pointKey, type LatLng } from "./routing";

/** A leg's key: its two points' pointKeys ("33.4152,-111.8315>33.4100,-111.9030"). */
export function legKey(from: LatLng, to: LatLng): string {
  return `${pointKey(from)}>${pointKey(to)}`;
}

export interface RouteLeg {
  from: LatLng;
  to: LatLng;
  key: string;
}

/**
 * The legs of a route through `points` in order. A leg between two points at the same place
 * (the same pointKey: two stops at one pool) is left out: there's nothing to drive.
 */
export function routeLegs(points: LatLng[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    if (pointKey(from) === pointKey(to)) continue;
    legs.push({ from, to, key: legKey(from, to) });
  }
  return legs;
}

/** Most characters a saved leg's encoded path may have (public.route_leg checks 20,000). */
export const LEG_POLYLINE_MAX = 20_000;

/** How closely a saved leg follows the road it came from, in meters (well under a street's width). */
export const LEG_TOLERANCE_M = 3;

// ---------------------------------------------------------------------------
// Google's encoded polyline (Mapbox's path overlays take it; saved legs use it too)
// ---------------------------------------------------------------------------

/** Points as an encoded polyline, at `precision` decimals (5, or 6 for Mapbox's polyline6). */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const f = 10 ** precision;
  let out = "";
  let lastLat = 0;
  let lastLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v * 2) : v * 2;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n = Math.floor(n / 32);
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * f);
    const lng = Math.round(p.lng * f);
    enc(lat - lastLat);
    enc(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

/** An encoded polyline's points, or null when it isn't one (or a point is off the globe). */
export function decodePolyline(value: string, precision = 5): LatLng[] | null {
  const f = 10 ** precision;
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 1;
    for (;;) {
      if (i >= value.length) return null;
      const b = value.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      result += (b & 0x1f) * shift;
      shift *= 32;
      if (b < 0x20) break;
      if (shift > 2 ** 35) return null;
    }
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  };
  while (i < value.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return null;
    lat += dLat;
    lng += dLng;
    const p = { lat: lat / f, lng: lng / f };
    if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Simplifying a path
// ---------------------------------------------------------------------------

const M_PER_DEG = 111_320;

/**
 * The path with points dropped where the line stays within `toleranceM` meters of them
 * (Douglas–Peucker, measured flat around the path's first point, close enough for a day's
 * drive). The first and last points always stay; repeated points go.
 */
export function simplifyPath(points: LatLng[], toleranceM: number): LatLng[] {
  const pts = points.filter(
    (p, i) => i === 0 || p.lat !== points[i - 1]!.lat || p.lng !== points[i - 1]!.lng,
  );
  if (pts.length <= 2 || !(toleranceM > 0)) return pts;
  const k = Math.cos((pts[0]!.lat * Math.PI) / 180);
  const xy = pts.map((p) => [p.lng * M_PER_DEG * k, p.lat * M_PER_DEG] as const);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0 && farD > toleranceM) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * A leg's path as it's saved: simplified to LEG_TOLERANCE_M, and more if it's still longer than
 * LEG_POLYLINE_MAX encoded. Null for a path of fewer than two points.
 */
export function legPolyline(path: LatLng[]): string | null {
  if (path.length < 2) return null;
  for (let tol = LEG_TOLERANCE_M; ; tol *= 2) {
    const s = encodePolyline(simplifyPath(path, tol));
    if (s.length <= LEG_POLYLINE_MAX || tol > 100_000) return s;
  }
}

// ---------------------------------------------------------------------------
// Joining a route's legs
// ---------------------------------------------------------------------------

/**
 * Each leg of the route through `points`, as the line to draw: its road path from `found` (by
 * legKey) with the leg's own two points at its ends, so the line meets every pin; or, with no
 * path, the straight line. `straight` counts the legs drawn straight.
 */
export function routeLegPaths(
  points: LatLng[],
  found: (key: string) => LatLng[] | null | undefined,
): { legs: LatLng[][]; straight: number } {
  let straight = 0;
  const legs = routeLegs(points).map((leg) => {
    const path = found(leg.key);
    if (!path || path.length < 2) {
      straight += 1;
      return [leg.from, leg.to];
    }
    const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
    return [
      ...(same(path[0]!, leg.from) ? [] : [leg.from]),
      ...path,
      ...(same(path[path.length - 1]!, leg.to) ? [] : [leg.to]),
    ];
  });
  return { legs, straight };
}

/** The legs as one line, without the point each leg repeats where it meets the next. */
export function joinLegs(legs: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const leg of legs)
    for (const p of leg) {
      const last = out[out.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) out.push(p);
    }
  return out;
}

/**
 * The legs simplified just enough for `fits` (a map image address within its limit): first to
 * `startM` meters (about half a point of the image), then twice that, and so on up to `maxM`;
 * every leg keeps its ends, so the line still meets every pin. Past `maxM` (no limit by
 * default), straight lines between the points; null when even those don't fit.
 */
export function fitLegs(
  legs: LatLng[][],
  fits: (legs: LatLng[][]) => boolean,
  startM: number,
  maxM = Infinity,
): LatLng[][] | null {
  let tol = Math.max(0.5, startM);
  for (let i = 0; i < 24 && tol <= maxM; i++, tol *= 2) {
    const s = legs.map((l) => simplifyPath(l, tol));
    if (fits(s)) return s;
    if (s.every((l) => l.length <= 2)) return null;
  }
  if (maxM !== Infinity) return null;
  const straight = legs.map((l) => (l.length > 1 ? [l[0]!, l[l.length - 1]!] : l));
  return fits(straight) ? straight : null;
}
