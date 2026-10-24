import {
  decodePolyline,
  encodePolyline,
  joinLegs,
  legKey,
  legPolyline,
  LEG_POLYLINE_MAX,
  LEG_TOLERANCE_M,
  routeLegPaths,
  routeLegs,
  simplifyPath,
  type LatLng,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// route-path.ts (routes that follow the roads, owner 2026-10-23).

const SHOP = { lat: 33.4152, lng: -111.8315 };
const A = { lat: 33.41, lng: -111.903 };
const B = { lat: 33.45, lng: -111.95 };

/** A road from a to b: `n` points curving `amp` degrees either side, three times. */
const road = (a: LatLng, b: LatLng, n: number, amp: number): LatLng[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const w = Math.round(Math.sin(t * Math.PI * 3) * amp * 1e6) / 1e6;
    return {
      lat: Math.round((a.lat + (b.lat - a.lat) * t + w) * 1e6) / 1e6,
      lng: Math.round((a.lng + (b.lng - a.lng) * t - w) * 1e6) / 1e6,
    };
  });

export const routePath: ModuleCases = {
  LEG_POLYLINE_MAX: rule(() => LEG_POLYLINE_MAX, [[]]),
  LEG_TOLERANCE_M: rule(() => LEG_TOLERANCE_M, [[]]),
  legKey: rule(
    (a: LatLng, b: LatLng) => legKey(a, b),
    [
      [SHOP, A],
      [A, SHOP],
      [
        { lat: -0.00004, lng: 0.00005 },
        { lat: 89.99999, lng: -179.99995 },
      ],
    ],
  ),
  routeLegs: rule(
    (points: LatLng[]) => routeLegs(points),
    [[[]], [[SHOP]], [[SHOP, A, B, SHOP]], [[SHOP, A, { lat: 33.41001, lng: -111.90302 }, B]]],
  ),
  encodePolyline: rule(
    (points: LatLng[], precision?: number) => encodePolyline(points, precision),
    [
      [[]],
      [
        [
          { lat: 38.5, lng: -120.2 },
          { lat: 40.7, lng: -120.95 },
          { lat: 43.252, lng: -126.453 },
        ],
      ],
      [[SHOP, A, B], 6],
      [
        [
          { lat: -0.000005, lng: 0.000005 },
          { lat: 0.000015, lng: -179.999995 },
        ],
      ],
      [road(SHOP, A, 20, 0.003)],
    ],
  ),
  decodePolyline: rule(
    (value: string, precision?: number) => decodePolyline(value, precision),
    [
      [""],
      ["_p~iF~ps|U_ulLnnqC_mqNvxq`@"],
      [encodePolyline([SHOP, A, B], 6), 6],
      ["_p~iF"],
      ["_p~iF~ps|U\u0001"],
      ["~~~~~~~~~~~~~~~~"],
      [encodePolyline([{ lat: 95, lng: 0 }])],
      [encodePolyline(road(SHOP, B, 30, 0.002))],
    ],
  ),
  simplifyPath: rule(
    (points: LatLng[], tol: number) => simplifyPath(points, tol),
    [
      [[], 5],
      [[SHOP, SHOP, A, A, B], 0],
      [[SHOP, A], 5],
      [road(SHOP, A, 60, 0), 1],
      [road(SHOP, A, 120, 0.003), 3],
      [road(SHOP, A, 120, 0.003), 40],
      [road(A, B, 200, 0.001), 15],
      [[SHOP, { lat: 33.4152, lng: -111.9 }, A, { lat: 33.4152, lng: -111.9 }, SHOP], 10],
    ],
  ),
  legPolyline: rule(
    (path: LatLng[]) => legPolyline(path),
    [[[]], [[SHOP]], [[SHOP, A]], [road(SHOP, A, 300, 0.003)]],
  ),
  routeLegPaths: rule(
    (points: LatLng[], found: Record<string, LatLng[] | null>) =>
      routeLegPaths(points, (k) => found[k]),
    [
      [[SHOP, A, B, SHOP], {}],
      [
        [SHOP, A, B, SHOP],
        {
          [legKey(SHOP, A)]: road(
            { lat: 33.4151, lng: -111.832 },
            { lat: 33.4101, lng: -111.9025 },
            6,
            0.001,
          ),
          [legKey(A, B)]: road(A, B, 4, 0),
          [legKey(B, SHOP)]: [B],
        },
      ],
      [[SHOP], {}],
    ],
  ),
  joinLegs: rule(
    (legs: LatLng[][]) => joinLegs(legs),
    [
      [[]],
      [
        [
          [SHOP, A],
          [A, B],
          [B, SHOP],
        ],
      ],
      [[[SHOP, A], [], [A, A, B]]],
    ],
  ),
};
