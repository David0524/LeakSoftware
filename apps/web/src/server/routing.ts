import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  estimateDriveMinutes,
  pointKey,
  type AddressSuggestion,
  type DriveFn,
  type LatLng,
} from "@leakbook/core";
import { resolveMapProvider } from "@/lib/map-provider";
import { appleKeys, appleSuggester } from "./apple-maps";

// Routing (owner request, 2026-10-13; docs/ROUTE_OPTIMIZATION_HANDOFF.md). Every call to a
// routing service goes through this file, so switching from Mapbox to another provider is a
// change here only. Screens and the database never know which one is used. With no key, the
// estimate in packages/core stands in and scheduling still works.

export interface RoutingProvider {
  name: string;
  /** Coordinates for a street address, or null when it can't be found. */
  geocode(address: string): Promise<LatLng | null>;
  /** A paid lookup for what `geocode` missed (Mapbox's permanent geocoding), when there is one. */
  paidGeocode?(address: string): Promise<LatLng | null>;
  /** Real addresses that start with what's typed, nearest `near` first (temporary results). */
  suggest(text: string, near: LatLng | null): Promise<AddressSuggestion[]>;
  /** Minutes of driving between every pair of points (rows: from, columns: to). */
  matrix(points: LatLng[]): Promise<number[][]>;
  /** Most points one matrix call takes. */
  maxPoints: number;
}

/** Mapbox: Geocoding v6 (permanent, so we may store results) and the Matrix API. */
export function mapbox(token: string, fetchImpl: typeof fetch = fetch): RoutingProvider {
  return {
    name: "mapbox",
    maxPoints: 25,
    async geocode(address) {
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", address);
      url.searchParams.set("country", "us");
      url.searchParams.set("limit", "1");
      url.searchParams.set("permanent", "true");
      url.searchParams.set("access_token", token);
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Mapbox geocoding ${res.status}`);
      const body = (await res.json()) as {
        features?: {
          geometry?: { coordinates?: [number, number] };
          properties?: { feature_type?: string };
        }[];
      };
      const f = body.features?.[0];
      // Only a match to the address or its street counts. A town or ZIP code's middle would put
      // the pool somewhere it isn't, so it reads as not found (owner, 2026-10-20).
      if (!f || !ADDRESS_MATCHES.has(f.properties?.feature_type ?? "")) return null;
      const c = f.geometry?.coordinates;
      return c ? { lat: c[1], lng: c[0] } : null;
    },
    async suggest(text, near) {
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", text);
      url.searchParams.set("country", "us");
      url.searchParams.set("types", "address");
      url.searchParams.set("autocomplete", "true");
      url.searchParams.set("limit", "5");
      if (near) url.searchParams.set("proximity", `${near.lng},${near.lat}`);
      url.searchParams.set("access_token", token);
      const res = await fetchImpl(url);
      if (!res.ok)
        throw new Error(
          `Mapbox suggestions ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
        );
      const body = (await res.json()) as { features?: { properties?: MapboxProperties }[] };
      return (body.features ?? []).flatMap((f) => {
        const p = f.properties;
        const line1 = p?.context?.address?.name ?? p?.name;
        if (!p || !line1) return [];
        return [
          {
            line1,
            city: p.context?.place?.name ?? p.context?.locality?.name ?? "",
            state: p.context?.region?.region_code ?? "",
            postal_code: p.context?.postcode?.name ?? "",
            label: p.full_address ?? [line1, p.place_formatted].filter(Boolean).join(", "),
          },
        ];
      });
    },
    async matrix(points) {
      const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
      const url = new URL(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}`);
      url.searchParams.set("annotations", "duration");
      url.searchParams.set("access_token", token);
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Mapbox matrix ${res.status}`);
      const body = (await res.json()) as { durations?: (number | null)[][] };
      if (!body.durations) throw new Error("Mapbox matrix: no durations");
      // Seconds to whole minutes, plus 3 minutes to park (as the estimate does).
      return body.durations.map((row, i) =>
        row.map((s, j) =>
          i === j
            ? 0
            : s == null
              ? estimateDriveMinutes(points[i]!, points[j]!)
              : Math.round(s / 60) + 3,
        ),
      );
    },
  };
}

/** Geocoding v6 feature types that are the address itself (not a town or a ZIP code). */
const ADDRESS_MATCHES = new Set(["address", "secondary_address", "street"]);

interface MapboxProperties {
  name?: string;
  full_address?: string;
  place_formatted?: string;
  context?: {
    address?: { name?: string };
    place?: { name?: string };
    locality?: { name?: string };
    region?: { region_code?: string };
    postcode?: { name?: string };
  };
}

const DIRECTION: Record<string, string> = {
  N: "N",
  NORTH: "N",
  S: "S",
  SOUTH: "S",
  E: "E",
  EAST: "E",
  W: "W",
  WEST: "W",
  NE: "NE",
  NORTHEAST: "NE",
  NW: "NW",
  NORTHWEST: "NW",
  SE: "SE",
  SOUTHEAST: "SE",
  SW: "SW",
  SOUTHWEST: "SW",
};

/** The house number and street direction an address starts with ("455", "N"). */
export function addressKey(address: string): { number: string | null; direction: string | null } {
  const words = address.toUpperCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  const number = /^\d+[A-Z]?$/.test(words[0] ?? "") ? words[0]! : null;
  const direction = number ? (DIRECTION[words[1] ?? ""] ?? null) : null;
  return { number, direction };
}

/** Whether a match is the address typed: the same house number, and direction if one was given. */
function sameAddress(typed: string, matched: string): boolean {
  const a = addressKey(typed);
  const b = addressKey(matched);
  if (!a.number || a.number !== b.number) return false;
  return !a.direction || a.direction === b.direction;
}

/**
 * The US Census Bureau's geocoder (free, no key, public domain, results ours to keep). Pools are
 * looked up with it, not Mapbox: Mapbox's permanent geocoding, the kind that may be stored, has
 * no free tier (owner, 2026-10-20: "ensure I do not surpass the free tier"). A match must be the
 * house typed: Census sometimes offers 1000 E for 1000 W.
 */
export function census(fetchImpl: typeof fetch = fetch): Pick<RoutingProvider, "geocode"> {
  return {
    async geocode(address) {
      const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
      url.searchParams.set("address", address);
      url.searchParams.set("benchmark", "Public_AR_Current");
      url.searchParams.set("format", "json");
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
      const body = (await res.json()) as {
        result?: {
          addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[];
        };
      };
      const m = (body.result?.addressMatches ?? []).find((x) =>
        sameAddress(address, x.matchedAddress ?? ""),
      );
      const c = m?.coordinates;
      return c && typeof c.x === "number" && typeof c.y === "number"
        ? { lat: c.y, lng: c.x }
        : null;
    },
  };
}

let osmNext = 0;

/**
 * OpenStreetMap's Nominatim, when Census has no match (free; results may be kept, ODbL). Its
 * usage policy asks for at most one request a second and an identifying User-Agent. Only a
 * match to the house itself counts, never a street's or a town's middle.
 */
export function nominatim(fetchImpl: typeof fetch = fetch): Pick<RoutingProvider, "geocode"> {
  return {
    async geocode(address) {
      const wait = Math.max(0, osmNext - Date.now());
      osmNext = Date.now() + wait + 1100;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", address);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "3");
      url.searchParams.set("countrycodes", "us");
      url.searchParams.set("addressdetails", "1");
      const res = await fetchImpl(url, {
        headers: { "user-agent": "SundeckPro/1.0 (+https://sundeckpro.com)" },
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const found = (await res.json()) as {
        lat?: string;
        lon?: string;
        address?: { house_number?: string; road?: string };
      }[];
      const m = found.find(
        (f) =>
          f.address?.house_number &&
          sameAddress(address, `${f.address.house_number} ${f.address.road ?? ""}`),
      );
      return m?.lat && m.lon ? { lat: Number(m.lat), lng: Number(m.lon) } : null;
    },
  };
}

/** Free lookups for pools: Census, then OpenStreetMap. */
export function freeGeocoder(fetchImpl: typeof fetch = fetch): Pick<RoutingProvider, "geocode"> {
  const a = census(fetchImpl);
  const b = nominatim(fetchImpl);
  return {
    async geocode(address) {
      const first = await a.geocode(address).catch(() => null);
      return first ?? b.geocode(address);
    },
  };
}

/** Mapbox for suggestions and drive times; pools are looked up for free (freeGeocoder). */
function routingProvider(): RoutingProvider | null {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const m = mapbox(token);
  return { ...m, geocode: freeGeocoder().geocode, paidGeocode: m.geocode };
}

/** The kinds in app.mapbox_budget: Mapbox's, and Apple's (docs/plans/apple-maps.md). */
export type MapBudgetKind =
  | "static_image"
  | "geocode_temp"
  | "matrix_element"
  | "map_load"
  | "geocode_paid"
  | "apple_snapshot"
  | "apple_service"
  | "apple_map_view";

/** Apple's address autocomplete as a suggester, when the website is on Apple Maps. */
export type AppleSuggest = (text: string, near: LatLng | null) => Promise<AddressSuggestion[]>;

function appleSuggestFor(db: SupabaseClient, companyId: string): AppleSuggest | null {
  const keys = resolveMapProvider() === "apple" ? appleKeys() : null;
  if (!keys) return null;
  // Every call to Apple (its access token included) is one service call in the budget.
  return appleSuggester(keys, fetch, () => mapboxBudget(db, companyId, "apple_service", 1));
}

/**
 * Take from Mapbox's monthly free tier, shared by every shop (app.mapbox_budget): false past
 * about 90% of it, so the account is never billed. Callers fall back as they do with no key.
 */
export async function mapboxBudget(
  db: SupabaseClient,
  companyId: string,
  api: MapBudgetKind,
  units: number,
): Promise<boolean> {
  const { data, error } = await db.rpc("mapbox_take", {
    target_company: companyId,
    api_kind: api,
    how_many: units,
  });
  return !error && data === true;
}

export function routingConfigured(): boolean {
  return Boolean(process.env.MAPBOX_TOKEN);
}

/** Calls to the routing service each shop may make per day (ROUTING_DAILY_LIMIT, default 300). */
function dailyLimit(): number {
  const n = Number(process.env.ROUTING_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

async function allowed(db: SupabaseClient, companyId: string, kind: string, calls: number) {
  const { data, error } = await db.rpc("routing_use", {
    target_company: companyId,
    use_kind: kind,
    how_many: calls,
    day_limit: dailyLimit(),
  });
  return !error && data === true;
}

/** Suggestions each shop may ask for per day (ADDRESS_SUGGEST_DAILY_LIMIT, default 2000). */
function suggestLimit(): number {
  const n = Number(process.env.ADDRESS_SUGGEST_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

/**
 * Real addresses for what's typed (owner, 2026-10-20: "an auto complete or something for the
 * mapping"), nearest the shop first. Empty without a routing key, past the day's allowance, or
 * for fewer than 4 characters. Temporary results: only the address chosen is kept, and its
 * coordinates come from the usual lookup.
 */
export async function suggestAddresses(
  db: SupabaseClient,
  companyId: string,
  text: string,
  near: LatLng | null,
  provider: RoutingProvider | null = routingProvider(),
  /** Told why nothing came back: no key, the day's allowance, or the service's error. */
  onProblem: (problem: string) => void = () => {},
  /** Apple's autocomplete, tried first on Apple Maps (docs/plans/apple-maps.md). */
  apple: AppleSuggest | null = appleSuggestFor(db, companyId),
): Promise<AddressSuggestion[]> {
  const q = text.trim().slice(0, 120);
  if (q.length < 4) return [];
  if (!provider && !apple) {
    onProblem("No routing key");
    return [];
  }
  const { data, error } = await db.rpc("routing_use", {
    target_company: companyId,
    use_kind: "suggest",
    how_many: 1,
    day_limit: suggestLimit(),
  });
  if (error || data !== true) {
    onProblem(error ? `Allowance check: ${error.message}` : "Day's allowance used");
    return [];
  }
  if (apple) {
    // Apple first; past its free allowance or on its error, Mapbox's suggestions as before.
    try {
      return await apple(q, near);
    } catch (e) {
      const problem = e instanceof Error ? e.message : String(e);
      console.error(`Address suggestions (Apple): ${problem}`);
      if (!provider) {
        onProblem(problem);
        return [];
      }
    }
  }
  if (!provider) return [];
  if (!(await mapboxBudget(db, companyId, "geocode_temp", 1))) {
    onProblem("This month's free suggestions are used");
    return [];
  }
  try {
    return await provider.suggest(q, near);
  } catch (e) {
    const problem = e instanceof Error ? e.message : String(e);
    console.error(`Address suggestions: ${problem}`);
    onProblem(problem);
    return [];
  }
}

/**
 * Find coordinates for an address, or null without a routing key or a match. The free lookups
 * (Census, OpenStreetMap) come first and aren't counted; an address they miss gets one try with
 * Mapbox's paid permanent geocoding, at most 100 a month for every shop (owner, 2026-10-20).
 */
export async function geocodeAddress(
  db: SupabaseClient,
  companyId: string,
  address: string,
  provider: RoutingProvider | null = routingProvider(),
): Promise<LatLng | null> {
  if (!provider || !address.trim()) return null;
  // The free lookups don't use the shop's daily Mapbox allowance: a busy day of drive times
  // never leaves a pool unfound.
  const free = await provider.geocode(address).catch(() => null);
  if (free || !provider.paidGeocode) return free;
  if (!(await mapboxBudget(db, companyId, "geocode_paid", 1))) return null;
  return provider.paidGeocode(address).catch(() => null);
}

/**
 * Drive times between these points: from the shop's cache (a day old at most), then from
 * the routing service for what's missing (when `live` and allowed), then the estimate.
 */
export async function driveTimes(
  db: SupabaseClient,
  companyId: string,
  points: LatLng[],
  {
    live = true,
    provider = routingProvider(),
  }: { live?: boolean; provider?: RoutingProvider | null } = {},
): Promise<DriveFn> {
  const unique = [...new Map(points.map((p) => [pointKey(p), p])).values()];
  const known = new Map<string, number>();
  const keys = unique.map(pointKey);
  if (keys.length > 1) {
    const { data } = await db.rpc("cached_drive_times", {
      target_company: companyId,
      from_keys: keys,
      to_keys: keys,
    });
    for (const r of (data ?? []) as { from_key: string; to_key: string; minutes: number }[])
      known.set(`${r.from_key}>${r.to_key}`, r.minutes);
  }
  const missing = unique.some((a) =>
    unique.some((b) => a !== b && !known.has(`${pointKey(a)}>${pointKey(b)}`)),
  );
  if (live && provider && missing && unique.length > 1 && unique.length <= provider.maxPoints) {
    // Mapbox bills drive times by element: every origin times every destination.
    if (
      (await allowed(db, companyId, "matrix", 1)) &&
      (await mapboxBudget(db, companyId, "matrix_element", unique.length * unique.length))
    ) {
      try {
        const m = await provider.matrix(unique);
        const rows: { from: string; to: string; minutes: number }[] = [];
        unique.forEach((a, i) =>
          unique.forEach((b, j) => {
            if (i === j) return;
            known.set(`${keys[i]}>${keys[j]}`, m[i]![j]!);
            rows.push({ from: keys[i]!, to: keys[j]!, minutes: m[i]![j]! });
          }),
        );
        await db.rpc("save_drive_times", { target_company: companyId, rows });
      } catch {
        // The estimate below fills in; planning still works.
      }
    }
  }
  return (a, b) => {
    if (!a || !b) return 0;
    return known.get(`${pointKey(a)}>${pointKey(b)}`) ?? estimateDriveMinutes(a, b);
  };
}
