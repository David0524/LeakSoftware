import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { estimateDriveMinutes } from "@leakbook/core";
import { driveTimes, geocodeAddress, mapbox, type RoutingProvider } from "../src/server/routing";

const SHOP = { lat: 33.44879, lng: -112.07711 };
const ZOO = { lat: 33.44962, lng: -111.94637 };
const TEMPE = { lat: 33.39148, lng: -111.92805 };

/** A fake database: the usage cap and the drive-time cache. */
function fakeDb(cap = 10) {
  let used = 0;
  const cache = new Map<string, number>();
  const calls: string[] = [];
  const db = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push(fn);
      if (fn === "routing_use") {
        const n = args.how_many as number;
        if (used + n > cap) return { data: false, error: null };
        used += n;
        return { data: true, error: null };
      }
      if (fn === "cached_drive_times") {
        const data = [...cache].map(([k, minutes]) => {
          const [from_key, to_key] = k.split(">");
          return { from_key, to_key, minutes };
        });
        return { data, error: null };
      }
      if (fn === "save_drive_times") {
        for (const r of args.rows as { from: string; to: string; minutes: number }[])
          cache.set(`${r.from}>${r.to}`, r.minutes);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls, cache, used: () => used };
}

function fakeProvider(): RoutingProvider & { matrixCalls: number } {
  const p = {
    name: "fake",
    maxPoints: 25,
    matrixCalls: 0,
    async geocode(address: string) {
      return address.includes("Galvin") ? ZOO : null;
    },
    async matrix(points: { lat: number; lng: number }[]) {
      p.matrixCalls++;
      return points.map((_, i) => points.map((_, j) => (i === j ? 0 : 10 + i + j)));
    },
  };
  return p;
}

describe("drive times", () => {
  it("asks the routing service once, then uses the cache", async () => {
    const { db } = fakeDb();
    const provider = fakeProvider();
    const drive = await driveTimes(db, "co", [SHOP, ZOO, TEMPE], { provider });
    expect(drive(SHOP, ZOO)).toBe(11);
    expect(provider.matrixCalls).toBe(1);
    const again = await driveTimes(db, "co", [SHOP, ZOO, TEMPE], { provider });
    expect(again(ZOO, TEMPE)).toBe(13);
    expect(provider.matrixCalls).toBe(1);
  });

  it("uses the estimate without a key, past the daily cap, or when not live", async () => {
    const none = await driveTimes(fakeDb().db, "co", [SHOP, ZOO], { provider: null });
    expect(none(SHOP, ZOO)).toBe(estimateDriveMinutes(SHOP, ZOO));
    const provider = fakeProvider();
    const capped = await driveTimes(fakeDb(0).db, "co", [SHOP, ZOO], { provider });
    expect(capped(SHOP, ZOO)).toBe(estimateDriveMinutes(SHOP, ZOO));
    const notLive = await driveTimes(fakeDb().db, "co", [SHOP, ZOO], { provider, live: false });
    expect(notLive(SHOP, ZOO)).toBe(estimateDriveMinutes(SHOP, ZOO));
    expect(provider.matrixCalls).toBe(0);
  });

  it("counts each call against the shop's daily cap", async () => {
    const f = fakeDb(5);
    await geocodeAddress(f.db, "co", "455 N Galvin Pkwy, Phoenix", fakeProvider());
    await driveTimes(f.db, "co", [SHOP, ZOO], { provider: fakeProvider() });
    expect(f.used()).toBe(2);
    expect(await geocodeAddress(f.db, "co", "nowhere", fakeProvider())).toBeNull();
    expect(await geocodeAddress(f.db, "co", "anything", null)).toBeNull();
  });
});

describe("Mapbox", () => {
  it("geocodes with permanent results and reads the drive-time matrix", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: URL | string) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/geocode/")) {
        return Response.json({ features: [{ geometry: { coordinates: [-111.94637, 33.44962] } }] });
      }
      return Response.json({
        durations: [
          [0, 600],
          [660, 0],
        ],
      });
    }) as typeof fetch;
    const m = mapbox("pk.test", fetchImpl);
    expect(await m.geocode("455 N Galvin Pkwy, Phoenix, AZ")).toEqual(ZOO);
    expect(urls[0]).toContain("permanent=true");
    expect(urls[0]).toContain("access_token=pk.test");
    // 10 and 11 minutes of driving, plus 3 to park.
    expect(await m.matrix([SHOP, ZOO])).toEqual([
      [0, 13],
      [14, 0],
    ]);
    expect(urls[1]).toContain("-112.077110,33.448790;-111.946370,33.449620");
  });

  it("reports a failed request", async () => {
    const m = mapbox(
      "pk.test",
      (async () => new Response("no", { status: 401 })) as unknown as typeof fetch,
    );
    await expect(m.geocode("x")).rejects.toThrow("Mapbox geocoding 401");
  });
});
