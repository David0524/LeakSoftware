import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decodePolyline,
  legPolyline,
  routeLegPaths,
  routeLegs,
  type LatLng,
  type RouteLeg,
} from "@leakbook/core";
import { appleAccessToken, appleKeys, resetAppleServerToken, type AppleKeys } from "./apple-maps";
import { mapboxBudget } from "./routing";

// Routes that follow the roads (owner, 2026-10-23: "The route between stops is always a straight
// line and doesn't take roads"). Each leg of a day's route (one drive between two of its points)
// is asked of a directions service once and saved (public.route_leg), so a map shown again never
// asks again; a stop whose coordinates change gives its legs new keys, and only those are asked.
// Apple's paths are drawn only on Apple's maps and Mapbox's only on Mapbox's, as each service's
// terms ask, so each provider has its own legs. Coordinates are only ever the ones already
// stored: nothing here looks up an address. A leg with no path (an error, the day's allowance,
// no road route) is drawn straight, so the map never breaks.

export type PathProvider = "apple" | "mapbox";

/**
 * A directions service: each leg's road path, in order; null when the service says there's no
 * road route, undefined when it couldn't be asked (an error, quota). Never throws.
 */
export interface LegFetcher {
  provider: PathProvider;
  fetch(legs: RouteLeg[]): Promise<(LatLng[] | null | undefined)[]>;
}

/** Legs asked at once (Apple: one call each). */
const PARALLEL = 4;

/** Most new legs one map asks for; the rest are drawn straight and asked next time. */
const MAX_NEW_LEGS = 60;

// ---------------------------------------------------------------------------
// Apple Maps Server API: GET /v1/directions (one leg a call)
// ---------------------------------------------------------------------------

interface AppleDirections {
  routes?: { stepIndexes?: number[] }[];
  steps?: { stepPathIndex?: number }[];
  stepPaths?: { latitude?: number; longitude?: number }[][];
}

/**
 * The first route's path from Apple's DirectionsResponse: its steps' paths in order, joined (a
 * step's path starts where the last one ended). Null when there's no route.
 */
export function parseAppleDirections(body: unknown): LatLng[] | null {
  const b = body as AppleDirections | null;
  const route = b?.routes?.[0];
  if (!route?.stepIndexes?.length) return null;
  const out: LatLng[] = [];
  for (const si of route.stepIndexes) {
    const path = b?.stepPaths?.[b.steps?.[si]?.stepPathIndex ?? -1] ?? [];
    for (const p of path) {
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") continue;
      const last = out[out.length - 1];
      if (last && last.lat === p.latitude && last.lng === p.longitude) continue;
      out.push({ lat: p.latitude, lng: p.longitude });
    }
  }
  return out.length > 1 ? out : null;
}

/** The directions address for one leg: driving, from and to coordinates (never an address). */
export function appleDirectionsUrl(leg: RouteLeg): string {
  const url = new URL("https://maps-api.apple.com/v1/directions");
  url.searchParams.set("origin", `${leg.from.lat.toFixed(6)},${leg.from.lng.toFixed(6)}`);
  url.searchParams.set("destination", `${leg.to.lat.toFixed(6)},${leg.to.lng.toFixed(6)}`);
  url.searchParams.set("transportType", "Automobile");
  url.searchParams.set("lang", "en-US");
  return url.toString();
}

/**
 * Apple's directions (free within the Apple Developer membership's daily service calls, shared
 * with address search). `count` takes one call from the budget before each one, the access
 * token's too.
 */
export function appleDirections(
  keys: AppleKeys,
  fetchImpl: typeof fetch = fetch,
  count: () => Promise<boolean> = async () => true,
): LegFetcher {
  async function one(leg: RouteLeg): Promise<LatLng[] | null | undefined> {
    try {
      const token = await appleAccessToken(keys, fetchImpl, count);
      if (!(await count())) return undefined;
      const res = await fetchImpl(appleDirectionsUrl(leg), {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) resetAppleServerToken();
      // Apple documents no answer for "no road route"; an empty route list (or a 404) is taken
      // as one. Anything else isn't saved and is asked again next time.
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error(`Route paths: Apple ${res.status}`);
        return undefined;
      }
      return parseAppleDirections(await res.json());
    } catch (e) {
      console.error(`Route paths: Apple ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }
  return {
    provider: "apple",
    async fetch(legs) {
      const out: (LatLng[] | null | undefined)[] = new Array(legs.length).fill(undefined);
      // The access token once, before the legs ask in parallel.
      try {
        await appleAccessToken(keys, fetchImpl, count);
      } catch (e) {
        console.error(`Route paths: Apple ${e instanceof Error ? e.message : String(e)}`);
        return out;
      }
      let next = 0;
      const worker = async () => {
        while (next < legs.length) {
          const i = next++;
          out[i] = await one(legs[i]!);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, legs.length) }, worker));
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Mapbox Directions: GET /directions/v5/mapbox/driving (up to 25 points, one request)
// ---------------------------------------------------------------------------

/** Most points one Mapbox Directions request takes (driving). */
const MAPBOX_POINTS = 25;

/**
 * Legs that follow one another (each starting where the last ended) as runs of at most `max`
 * legs, so a day's legs go in as few requests as possible.
 */
export function legRuns(legs: RouteLeg[], max = MAPBOX_POINTS - 1): RouteLeg[][] {
  const runs: RouteLeg[][] = [];
  for (const leg of legs) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (
      run &&
      last &&
      run.length < max &&
      last.to.lat === leg.from.lat &&
      last.to.lng === leg.from.lng
    )
      run.push(leg);
    else runs.push([leg]);
  }
  return runs;
}

export function mapboxDirectionsUrl(run: RouteLeg[], token: string): string {
  const points = [run[0]!.from, ...run.map((l) => l.to)];
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`);
  url.searchParams.set("geometries", "polyline6");
  url.searchParams.set("overview", "false");
  url.searchParams.set("steps", "true");
  url.searchParams.set("access_token", token);
  return url.toString();
}

interface MapboxDirections {
  code?: string;
  routes?: { legs?: { steps?: { geometry?: string }[] }[] }[];
}

/**
 * Each leg's path from a Mapbox Directions answer for `count` legs: its steps' geometries
 * (polyline6) joined. All null when Mapbox finds no route; undefined for a leg it left out.
 */
export function parseMapboxDirections(
  body: unknown,
  count: number,
): (LatLng[] | null | undefined)[] {
  const b = body as MapboxDirections | null;
  if (b?.code === "NoRoute" || b?.code === "NoSegment") return new Array(count).fill(null);
  const legs = b?.code === "Ok" ? (b.routes?.[0]?.legs ?? []) : [];
  return Array.from({ length: count }, (_, i) => {
    const steps = legs[i]?.steps;
    if (!steps) return undefined;
    const out: LatLng[] = [];
    for (const s of steps) {
      const pts = s.geometry ? decodePolyline(s.geometry, 6) : null;
      if (!pts) return undefined;
      for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || last.lat !== p.lat || last.lng !== p.lng) out.push(p);
      }
    }
    return out.length > 1 ? out : null;
  });
}

/**
 * Mapbox Directions (100,000 requests a month free; a request with many points counts once).
 * `count` takes one request from the monthly budget before each one.
 */
export function mapboxDirections(
  token: string,
  fetchImpl: typeof fetch = fetch,
  count: () => Promise<boolean> = async () => true,
): LegFetcher {
  return {
    provider: "mapbox",
    async fetch(legs) {
      const out: (LatLng[] | null | undefined)[] = [];
      for (const run of legRuns(legs)) {
        let got: (LatLng[] | null | undefined)[] = new Array(run.length).fill(undefined);
        try {
          if (await count()) {
            const res = await fetchImpl(mapboxDirectionsUrl(run, token));
            // 422 is a request Mapbox can't route (NoRoute and the like come with it).
            if (res.ok || res.status === 422)
              got = parseMapboxDirections(await res.json(), run.length);
            else console.error(`Route paths: Mapbox ${res.status}`);
          }
        } catch (e) {
          console.error(`Route paths: Mapbox ${e instanceof Error ? e.message : String(e)}`);
        }
        out.push(...got);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Saved legs
// ---------------------------------------------------------------------------

/** How long a "no road route" answer stands (app.route_leg_retry_after). */
const RETRY_NO_ROUTE_MS = 7 * 24 * 3600 * 1000;

/**
 * How long a saved road path is used before it's asked for again (owner, 2026-10-24): Apple's
 * developer terms let us keep its map data only temporarily, so every path is re-checked monthly.
 * Until the new answer arrives the old path is still drawn.
 */
const KEEP_PATH_MS = 30 * 24 * 3600 * 1000;

/** New legs each shop may ask for per day (ROUTE_LEG_DAILY_LIMIT, default 1000). */
function legDailyLimit(): number {
  const n = Number(process.env.ROUTE_LEG_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export interface RoutePaths {
  /** Each leg's line, in route order (core routeLegPaths): its road path, or straight. */
  legs: LatLng[][];
  /** Every leg is settled (a saved path, or a saved "no road route"): nothing to ask again. */
  complete: boolean;
}

/**
 * The route through `points` (route order) with each leg's road path from `provider`: saved
 * legs first, then the rest from `fetcher` (when there is one and the shop's daily allowance
 * has room), saved for next time. Missing legs are drawn straight.
 */
export async function routePaths(
  db: SupabaseClient,
  companyId: string,
  provider: PathProvider,
  points: LatLng[],
  fetcher: LegFetcher | null,
  now = Date.now(),
): Promise<RoutePaths> {
  const legs = routeLegs(points);
  const found = new Map<string, LatLng[] | null>();
  const stale = new Set<string>();
  if (legs.length) {
    const fromKeys = [...new Set(legs.map((l) => l.key.split(">")[0]!))];
    const { data } = await db
      .from("route_leg")
      .select("from_key, to_key, polyline, fetched_at")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .is("deleted_at", null)
      .in("from_key", fromKeys);
    const wanted = new Set(legs.map((l) => l.key));
    for (const r of (data ?? []) as {
      from_key: string;
      to_key: string;
      polyline: string | null;
      fetched_at: string;
    }[]) {
      const key = `${r.from_key}>${r.to_key}`;
      if (!wanted.has(key)) continue;
      if (r.polyline) {
        const path = decodePolyline(r.polyline);
        if (path && path.length > 1) {
          found.set(key, path);
          if (now - Date.parse(r.fetched_at) >= KEEP_PATH_MS) stale.add(key);
        }
      } else if (now - Date.parse(r.fetched_at) < RETRY_NO_ROUTE_MS) found.set(key, null);
    }
  }
  const missing = [
    ...new Map(
      legs.filter((l) => !found.has(l.key) || stale.has(l.key)).map((l) => [l.key, l]),
    ).values(),
  ];
  const ask = missing.slice(0, MAX_NEW_LEGS);
  if (fetcher && ask.length) {
    const { data: ok, error } = await db.rpc("routing_use", {
      target_company: companyId,
      use_kind: "directions",
      how_many: ask.length,
      day_limit: legDailyLimit(),
    });
    if (!error && ok === true) {
      const got = await fetcher.fetch(ask);
      const rows: { from: string; to: string; polyline: string | null }[] = [];
      ask.forEach((leg, i) => {
        const path = got[i];
        if (path === undefined) return;
        const [from, to] = leg.key.split(">") as [string, string];
        const polyline = path ? legPolyline(path) : null;
        rows.push({ from, to, polyline });
        found.set(leg.key, polyline ? decodePolyline(polyline) : null);
        stale.delete(leg.key);
      });
      if (rows.length) {
        const { error: saveError } = await db.rpc("save_route_legs", {
          target_company: companyId,
          leg_provider: provider,
          rows,
        });
        if (saveError) console.error(`Route paths: saving ${saveError.message}`);
      }
    }
  }
  const { legs: lines } = routeLegPaths(points, (k) => found.get(k));
  return { legs: lines, complete: legs.every((l) => found.has(l.key) && !stale.has(l.key)) };
}

/**
 * The directions service for `provider`'s paths with this server's keys, each call taken from
 * the shared monthly budget (app.mapbox_budget); null without the key.
 */
export function legFetcher(
  db: SupabaseClient,
  companyId: string,
  provider: PathProvider,
  env: Record<string, string | undefined> = process.env,
): LegFetcher | null {
  if (provider === "apple") {
    const keys = appleKeys(env);
    return keys
      ? appleDirections(keys, fetch, () => mapboxBudget(db, companyId, "apple_service", 1))
      : null;
  }
  const token = env.MAPBOX_TOKEN;
  return token
    ? mapboxDirections(token, fetch, () => mapboxBudget(db, companyId, "directions", 1))
    : null;
}
