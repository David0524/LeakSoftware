import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decodePolyline,
  encodePolyline,
  legKey,
  routeLegs,
  type LatLng,
  type RouteLeg,
} from "@leakbook/core";
import { resetAppleServerToken } from "../src/server/apple-maps";
import {
  appleDirections,
  appleDirectionsUrl,
  legRuns,
  mapboxDirections,
  mapboxDirectionsUrl,
  parseAppleDirections,
  parseMapboxDirections,
  routePaths,
  type LegFetcher,
} from "../src/server/route-paths";

// Routes along the roads (owner, 2026-10-23). There are no Apple or Mapbox keys in tests: the
// services' answers are Apple's documented example (fixtures/apple-directions-sample.json, from
// developer.apple.com/documentation/applemapsserverapi/-v1-directions) and Mapbox's documented
// shape (docs.mapbox.com/api/navigation/directions: routes[].legs[].steps[].geometry).

const apple = JSON.parse(
  readFileSync(new URL("./fixtures/apple-directions-sample.json", import.meta.url), "utf8"),
);

const SHOP = { lat: 33.4152, lng: -111.8315 };
const A = { lat: 33.41, lng: -111.903 };
const B = { lat: 33.45, lng: -111.95 };

function keys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { teamId: "TEAM123456", keyId: "KEY7654321", privateKey };
}

/** A road from a to b with a bend in the middle (6 decimals, as Mapbox's polyline6). */
const road = (a: LatLng, b: LatLng): LatLng[] => {
  const mid = Math.round(((a.lng + b.lng) / 2) * 1e6) / 1e6;
  return [a, { lat: a.lat, lng: mid }, { lat: b.lat, lng: mid }, b];
};

describe("Apple's directions", () => {
  beforeEach(() => resetAppleServerToken());

  it("reads the first route's path from Apple's documented example, steps joined", () => {
    const path = parseAppleDirections(apple)!;
    // Its 8 steps' paths, each starting where the last ended, joined once.
    expect(path[0]).toEqual({ lat: 37.7856, lng: -122.401214 });
    expect(path.at(-1)).toEqual({ lat: 37.775503, lng: -122.393056 });
    expect(path.length).toBeGreaterThan(20);
    expect(
      path.every((p, i) => i === 0 || p.lat !== path[i - 1]!.lat || p.lng !== path[i - 1]!.lng),
    ).toBe(true);
  });

  it("no route is null", () => {
    expect(parseAppleDirections({ routes: [], steps: [], stepPaths: [] })).toBeNull();
    expect(parseAppleDirections(null)).toBeNull();
    expect(parseAppleDirections({ routes: [{ stepIndexes: [0] }] })).toBeNull();
  });

  it("asks for driving between the stored coordinates, never an address", () => {
    const url = new URL(appleDirectionsUrl(routeLegs([SHOP, A])[0]!));
    expect(url.origin + url.pathname).toBe("https://maps-api.apple.com/v1/directions");
    expect(url.searchParams.get("origin")).toBe("33.415200,-111.831500");
    expect(url.searchParams.get("destination")).toBe("33.410000,-111.903000");
    expect(url.searchParams.get("transportType")).toBe("Automobile");
  });

  it("gets the access token once, counts every call, and keeps errors apart from no route", async () => {
    const calls: string[] = [];
    let counted = 0;
    const answers = [apple, { routes: [], steps: [], stepPaths: [] }, null];
    let n = 0;
    const fetchImpl = (async (url: string) => {
      calls.push(new URL(url).pathname);
      if (String(url).endsWith("/v1/token"))
        return Response.json({ accessToken: "t", expiresInSeconds: 1800 });
      const body = answers[n++];
      return body ? Response.json(body) : new Response("busy", { status: 429 });
    }) as unknown as typeof fetch;
    const f = appleDirections(keys(), fetchImpl, async () => (++counted, true));
    const legs = routeLegs([SHOP, A, B, SHOP]);
    // One at a time, so the answers line up with the legs.
    const got = [];
    for (const leg of legs) got.push(...(await f.fetch([leg])));
    expect(got[0]!.length).toBeGreaterThan(20);
    expect(got[1]).toBeNull(); // no route: saved, drawn straight
    expect(got[2]).toBeUndefined(); // an error: not saved, asked again
    expect(calls.filter((c) => c === "/v1/token")).toHaveLength(1);
    expect(counted).toBe(4); // the token and three legs
  });

  it("asks nothing past the budget", async () => {
    let asked = 0;
    const fetchImpl = (async () => {
      asked += 1;
      return Response.json({ accessToken: "t" });
    }) as unknown as typeof fetch;
    const f = appleDirections(keys(), fetchImpl, async () => false);
    expect(await f.fetch(routeLegs([SHOP, A, B]))).toEqual([undefined, undefined]);
    expect(asked).toBe(0);
  });
});

describe("Mapbox's directions", () => {
  const legs = routeLegs([SHOP, A, B, SHOP]);

  it("asks for a day's legs in as few requests as it can", () => {
    expect(legRuns(legs).map((r) => r.length)).toEqual([3]);
    // Legs that don't follow one another go apart; at most 24 legs (25 points) a request.
    expect(legRuns([legs[0]!, legs[2]!]).map((r) => r.length)).toEqual([1, 1]);
    const long = routeLegs(
      Array.from({ length: 30 }, (_, i) => ({ lat: 33 + i / 100, lng: -112 })),
    );
    expect(legRuns(long).map((r) => r.length)).toEqual([24, 5]);
  });

  it("asks for driving with each step's geometry, at 6 decimals", () => {
    const url = new URL(mapboxDirectionsUrl(legs, "pk.test"));
    expect(url.pathname).toBe(
      "/directions/v5/mapbox/driving/-111.831500,33.415200;-111.903000,33.410000;-111.950000,33.450000;-111.831500,33.415200",
    );
    expect(url.searchParams.get("geometries")).toBe("polyline6");
    expect(url.searchParams.get("steps")).toBe("true");
    expect(url.searchParams.get("overview")).toBe("false");
  });

  const answer = (paths: LatLng[][]) => ({
    code: "Ok",
    routes: [
      {
        legs: paths.map((p) => ({
          // Two steps per leg, the second starting where the first ended.
          steps: [
            { geometry: encodePolyline(p.slice(0, 2), 6) },
            { geometry: encodePolyline(p.slice(1), 6) },
          ],
        })),
      },
    ],
  });

  it("reads each leg's path from its steps", () => {
    const paths = [road(SHOP, A), road(A, B), road(B, SHOP)];
    expect(parseMapboxDirections(answer(paths), 3)).toEqual(paths);
    expect(parseMapboxDirections({ code: "NoRoute" }, 2)).toEqual([null, null]);
    expect(parseMapboxDirections({ code: "InvalidInput" }, 2)).toEqual([undefined, undefined]);
    expect(parseMapboxDirections({ code: "Ok", routes: [{ legs: [] }] }, 1)).toEqual([undefined]);
  });

  it("one request a run, counted; an error leaves the run unasked", async () => {
    const asked: string[] = [];
    let counted = 0;
    const ok = mapboxDirections(
      "pk",
      (async (url: string) => {
        asked.push(url);
        return Response.json(answer([road(SHOP, A), road(A, B), road(B, SHOP)]));
      }) as unknown as typeof fetch,
      async () => (++counted, true),
    );
    expect((await ok.fetch(legs)).map((p) => p?.length)).toEqual([4, 4, 4]);
    expect(asked).toHaveLength(1);
    expect(counted).toBe(1);

    const down = mapboxDirections(
      "pk",
      (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    );
    expect(await down.fetch(legs)).toEqual([undefined, undefined, undefined]);
  });
});

describe("saved legs", () => {
  /** The shop's saved legs and allowance, as the database keeps them. */
  function fakeDb(opts: { allowance?: boolean; rows?: Record<string, unknown>[] } = {}) {
    const rows = [...(opts.rows ?? [])];
    const saved: {
      provider: string;
      rows: { from: string; to: string; polyline: string | null }[];
    }[] = [];
    const used: number[] = [];
    const query = {
      eq: () => query,
      is: () => query,
      in: async () => ({ data: rows, error: null }),
      select: () => query,
    };
    const db = {
      from: () => query,
      async rpc(fn: string, args: Record<string, unknown>) {
        if (fn === "routing_use") {
          used.push(args.how_many as number);
          return { data: opts.allowance ?? true, error: null };
        }
        if (fn === "save_route_legs") {
          saved.push({
            provider: args.leg_provider as string,
            rows: args.rows as { from: string; to: string; polyline: string | null }[],
          });
          return { data: null, error: null };
        }
        throw new Error(fn);
      },
    };
    return { db: db as unknown as SupabaseClient, saved, used };
  }

  function fetcher(answer: (leg: RouteLeg) => LatLng[] | null | undefined) {
    const asked: string[] = [];
    const f: LegFetcher = {
      provider: "apple",
      async fetch(legs) {
        asked.push(...legs.map((l) => l.key));
        return legs.map(answer);
      },
    };
    return { f, asked };
  }

  const day = [SHOP, A, B, SHOP];
  const row = (from: LatLng, to: LatLng, path: LatLng[] | null, fetchedAt = new Date()) => {
    const [f, t] = legKey(from, to).split(">");
    return {
      from_key: f,
      to_key: t,
      polyline: path ? encodePolyline(path) : null,
      fetched_at: fetchedAt.toISOString(),
    };
  };

  it("asks once per leg and saves it; next time it's read, not asked", async () => {
    const first = fakeDb();
    const svc = fetcher((leg) => road(leg.from, leg.to));
    const r1 = await routePaths(first.db, "co", "apple", day, svc.f);
    expect(svc.asked).toHaveLength(3);
    expect(first.used).toEqual([3]);
    expect(first.saved[0]!.provider).toBe("apple");
    expect(first.saved[0]!.rows.map((r) => `${r.from}>${r.to}`)).toEqual(
      routeLegs(day).map((l) => l.key),
    );
    expect(r1.complete).toBe(true);
    expect(r1.legs.map((l) => l.length)).toEqual([4, 4, 4]);

    const again = fakeDb({
      rows: first.saved[0]!.rows.map((r) => ({
        from_key: r.from,
        to_key: r.to,
        polyline: r.polyline,
        fetched_at: new Date().toISOString(),
      })),
    });
    const svc2 = fetcher(() => {
      throw new Error("asked again");
    });
    const r2 = await routePaths(again.db, "co", "apple", day, svc2.f);
    expect(svc2.asked).toEqual([]);
    expect(again.used).toEqual([]);
    expect(r2).toEqual(r1);
  });

  it("asks only for the legs a moved stop changed", async () => {
    const moved = { lat: 33.4112, lng: -111.903 };
    const f = fakeDb({
      rows: [row(SHOP, A, road(SHOP, A)), row(A, B, road(A, B)), row(B, SHOP, road(B, SHOP))],
    });
    const svc = fetcher((leg) => road(leg.from, leg.to));
    await routePaths(f.db, "co", "apple", [SHOP, moved, B, SHOP], svc.f);
    expect(svc.asked).toEqual([legKey(SHOP, moved), legKey(moved, B)]);
  });

  it("draws a leg straight on an error, a used-up allowance or no key, and says it isn't done", async () => {
    const error = await routePaths(
      fakeDb().db,
      "co",
      "apple",
      day,
      fetcher((leg) => (leg.from === A ? undefined : road(leg.from, leg.to))).f,
    );
    expect(error.legs[1]).toEqual([A, B]);
    expect(error.complete).toBe(false);

    const allowance = fakeDb({ allowance: false });
    const svc = fetcher((leg) => road(leg.from, leg.to));
    const usedUp = await routePaths(allowance.db, "co", "apple", day, svc.f);
    expect(svc.asked).toEqual([]);
    expect(usedUp.legs).toEqual([
      [SHOP, A],
      [A, B],
      [B, SHOP],
    ]);
    expect(usedUp.complete).toBe(false);

    const noKey = await routePaths(fakeDb().db, "co", "apple", day, null);
    expect(noKey.legs).toEqual(usedUp.legs);
  });

  it("saves no road route, draws it straight, and asks again after a week", async () => {
    const f = fakeDb();
    const r = await routePaths(f.db, "co", "apple", [SHOP, A], fetcher(() => null).f);
    expect(f.saved[0]!.rows).toEqual(
      [{ ...row(SHOP, A, null), fetched_at: undefined }].map(({ from_key, to_key }) => ({
        from: from_key,
        to: to_key,
        polyline: null,
      })),
    );
    expect(r).toEqual({ legs: [[SHOP, A]], complete: true });

    const recent = fetcher(() => road(SHOP, A));
    await routePaths(fakeDb({ rows: [row(SHOP, A, null)] }).db, "co", "apple", [SHOP, A], recent.f);
    expect(recent.asked).toEqual([]);
    const old = fetcher(() => road(SHOP, A));
    const weekAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    await routePaths(
      fakeDb({ rows: [row(SHOP, A, null, weekAgo)] }).db,
      "co",
      "apple",
      [SHOP, A],
      old.f,
    );
    expect(old.asked).toEqual([legKey(SHOP, A)]);
  });

  it("saves each path simplified, and the line still meets every pin", async () => {
    // A long road with a point every ~1 m along a straight stretch: a few points are enough.
    const long = Array.from({ length: 2001 }, (_, i) => ({
      lat: SHOP.lat,
      lng: SHOP.lng - (i / 2000) * 0.0715,
    }));
    const f = fakeDb();
    const r = await routePaths(f.db, "co", "apple", [SHOP, A], fetcher(() => long).f);
    const saved = decodePolyline(f.saved[0]!.rows[0]!.polyline!)!;
    expect(saved.length).toBeLessThan(10);
    expect(r.legs[0]![0]).toEqual(SHOP);
    expect(r.legs[0]!.at(-1)).toEqual(A);
  });
});
