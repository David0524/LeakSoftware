import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  estimateDriveMinutes,
  pointKey,
  type AddressSuggestion,
  type DriveFn,
  type LatLng,
} from "@leakbook/core";

// Routing (owner request, 2026-10-13; docs/ROUTE_OPTIMIZATION_HANDOFF.md). Every call to a
// routing service goes through this file, so switching from Mapbox to another provider is a
// change here only. Screens and the database never know which one is used. With no key, the
// estimate in packages/core stands in and scheduling still works.

export interface RoutingProvider {
  name: string;
  /** Coordinates for a street address, or null when it can't be found. */
  geocode(address: string): Promise<LatLng | null>;
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
      if (!res.ok) throw new Error(`Mapbox suggestions ${res.status}`);
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

function routingProvider(): RoutingProvider | null {
  const token = process.env.MAPBOX_TOKEN;
  return token ? mapbox(token) : null;
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
): Promise<AddressSuggestion[]> {
  const q = text.trim().slice(0, 120);
  if (!provider || q.length < 4) return [];
  const { data, error } = await db.rpc("routing_use", {
    target_company: companyId,
    use_kind: "suggest",
    how_many: 1,
    day_limit: suggestLimit(),
  });
  if (error || data !== true) return [];
  try {
    return await provider.suggest(q, near);
  } catch {
    return [];
  }
}

/** Find coordinates for an address. Null without a routing key or past the daily limit. */
export async function geocodeAddress(
  db: SupabaseClient,
  companyId: string,
  address: string,
  provider: RoutingProvider | null = routingProvider(),
): Promise<LatLng | null> {
  if (!provider || !address.trim()) return null;
  if (!(await allowed(db, companyId, "geocode", 1))) return null;
  try {
    return await provider.geocode(address);
  } catch {
    return null;
  }
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
    if (await allowed(db, companyId, "matrix", 1)) {
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
