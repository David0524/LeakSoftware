import { describe, expect, it } from "vitest";
import {
  LEG_POLYLINE_MAX,
  decodePolyline,
  encodePolyline,
  fitLegs,
  haversineMeters,
  joinLegs,
  legKey,
  legPolyline,
  routeLegPaths,
  routeLegs,
  simplifyPath,
  type LatLng,
} from "../src";

const A = { lat: 33.4152, lng: -111.8315 };
const B = { lat: 33.41, lng: -111.903 };
const C = { lat: 33.45, lng: -111.95 };

/** A wiggly road from a to b: `n` points on a zigzag `amp` degrees either side of the line. */
function road(a: LatLng, b: LatLng, n: number, amp = 0.0004): LatLng[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const w = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amp;
    return { lat: a.lat + (b.lat - a.lat) * t + w, lng: a.lng + (b.lng - a.lng) * t + w };
  });
}

describe("legs", () => {
  it("keys a leg by its two points' pointKeys", () => {
    expect(legKey(A, B)).toBe("33.4152,-111.8315>33.4100,-111.9030");
    expect(legKey(B, A)).not.toBe(legKey(A, B));
  });

  it("makes a leg between each two points in order, leaving out legs that go nowhere", () => {
    const legs = routeLegs([A, B, { lat: 33.41001, lng: -111.90302 }, C, A]);
    expect(legs.map((l) => l.key)).toEqual([legKey(A, B), legKey(B, C), legKey(C, A)]);
    expect(routeLegs([A])).toEqual([]);
  });

  it("a stop's coordinates changing gives its legs new keys (so they're fetched again)", () => {
    const moved = { lat: 33.4112, lng: -111.903 };
    expect(legKey(A, moved)).not.toBe(legKey(A, B));
  });
});

describe("encoded polylines", () => {
  it("matches Google's documented example", () => {
    const pts = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(pts)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(pts);
  });

  it("round-trips at 6 decimals (Mapbox's polyline6)", () => {
    const pts = [A, B, { lat: -33.123456, lng: 151.654321 }];
    expect(decodePolyline(encodePolyline(pts, 6), 6)).toEqual(pts);
  });

  it("refuses what isn't a polyline", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline("_p~iF")).toBeNull(); // a latitude with no longitude
    expect(decodePolyline("_p~iF~ps|U\u0001")).toBeNull();
    expect(decodePolyline("~~~~~~~~~~~~~~~~")).toBeNull();
    // Off the globe.
    expect(decodePolyline(encodePolyline([{ lat: 95, lng: 0 }]))).toBeNull();
  });
});

describe("simplifyPath", () => {
  it("keeps the ends and drops points within the tolerance", () => {
    const line = road(A, B, 50, 0);
    expect(simplifyPath(line, 1)).toEqual([line[0], line[50]]);
  });

  it("keeps the corners of a road", () => {
    const corner = { lat: A.lat, lng: B.lng };
    const path = [...road(A, corner, 20, 0), ...road(corner, B, 20, 0).slice(1)];
    expect(simplifyPath(path, 5)).toEqual([A, corner, B]);
  });

  it("follows the road within the tolerance (every dropped point stays near the line)", () => {
    const path = road(A, B, 200, 0.0003);
    const s = simplifyPath(path, 40);
    expect(s.length).toBeLessThan(path.length);
    expect(s[0]).toEqual(path[0]);
    expect(s.at(-1)).toEqual(path.at(-1));
    // Each original point is within the tolerance of its simplified segment (with a little slack
    // for the flat measure).
    for (const p of path) {
      const d = Math.min(...s.slice(1).map((b, i) => distanceToSegment(p, s[i]!, b)));
      expect(d).toBeLessThan(45);
    }
  });

  it("drops repeated points; no tolerance keeps the rest", () => {
    expect(simplifyPath([A, A, B, B, C], 0)).toEqual([A, B, C]);
    expect(simplifyPath([A], 10)).toEqual([A]);
  });
});

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  // Close enough at these distances: the smallest of the distance to a, to b, and to points along.
  let best = Infinity;
  for (let t = 0; t <= 1; t += 0.001)
    best = Math.min(
      best,
      haversineMeters(p, { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }),
    );
  return best;
}

describe("saved legs", () => {
  it("are simplified to a few meters and fit the column", () => {
    const path = road(A, B, 3000, 0.00001);
    const s = legPolyline(path)!;
    expect(s.length).toBeLessThanOrEqual(LEG_POLYLINE_MAX);
    const back = decodePolyline(s)!;
    expect(back[0]).toEqual(A);
    expect(back.at(-1)).toEqual(B);
    expect(back.length).toBeLessThan(path.length);
  });

  it("a very long winding path is simplified further to fit", () => {
    const path = road(A, { lat: 36.1, lng: -115.1 }, 2000, 0.002);
    const s = legPolyline(path)!;
    expect(s.length).toBeLessThanOrEqual(LEG_POLYLINE_MAX);
  });

  it("a path of one point isn't a leg", () => {
    expect(legPolyline([A])).toBeNull();
  });
});

describe("routeLegPaths", () => {
  it("uses each leg's road path, with the pins at its ends", () => {
    const ab = road({ lat: 33.4151, lng: -111.832 }, { lat: 33.4101, lng: -111.9025 }, 10);
    const { legs, straight } = routeLegPaths([A, B, A], (k) => (k === legKey(A, B) ? ab : null));
    expect(straight).toBe(1);
    expect(legs[0]![0]).toEqual(A);
    expect(legs[0]!.at(-1)).toEqual(B);
    expect(legs[0]!.slice(1, -1)).toEqual(ab);
    // No path: straight, so the map never breaks.
    expect(legs[1]).toEqual([B, A]);
  });

  it("doesn't repeat a pin a path already starts or ends on", () => {
    const ab = road(A, B, 4);
    const { legs } = routeLegPaths([A, B], () => ab);
    expect(legs[0]).toEqual(ab);
  });

  it("a path of fewer than two points is drawn straight", () => {
    const { legs, straight } = routeLegPaths([A, B], () => [A]);
    expect(straight).toBe(1);
    expect(legs[0]).toEqual([A, B]);
  });

  it("joins the legs into one line without doubled points", () => {
    expect(
      joinLegs([
        [A, B],
        [B, C],
        [C, A],
      ]),
    ).toEqual([A, B, C, A]);
    expect(joinLegs([])).toEqual([]);
  });
});

describe("fitLegs", () => {
  const legs = [road(A, B, 400), road(B, C, 400), road(C, A, 400)];

  it("simplifies only as much as the limit needs", () => {
    const loose = fitLegs(legs, () => true, 5)!;
    const tight = fitLegs(legs, (l) => encodePolyline(joinLegs(l)).length < 300, 5)!;
    expect(joinLegs(tight).length).toBeLessThan(joinLegs(loose).length);
    expect(encodePolyline(joinLegs(tight)).length).toBeLessThan(300);
  });

  it("every leg keeps its ends, so the line meets every pin", () => {
    const tight = fitLegs(legs, (l) => encodePolyline(joinLegs(l)).length < 120, 5)!;
    expect(tight.map((l) => [l[0], l.at(-1)])).toEqual(legs.map((l) => [l[0], l.at(-1)]));
  });

  it("at worst, straight lines between the points, or null when even those don't fit", () => {
    const straight = legs.map((l) => [l[0], l.at(-1)]);
    expect(fitLegs(legs, (l) => l.every((x) => x.length === 2), 5)).toEqual(straight);
    expect(fitLegs(legs, () => false, 5)).toBeNull();
  });

  it("stops at maxM: a looser fit isn't worth it", () => {
    expect(fitLegs(legs, (l) => encodePolyline(joinLegs(l)).length < 60, 5, 20)).toBeNull();
    expect(fitLegs(legs, () => true, 5, 20)).not.toBeNull();
  });
});
