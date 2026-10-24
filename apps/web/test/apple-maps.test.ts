import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appleJwt,
  appleKeys,
  appleSnapshot,
  appleSuggester,
  mapkitToken,
  resetAppleServerToken,
  SNAPSHOT_MAX_URL,
  snapshotSize,
  type AppleKeys,
} from "../src/server/apple-maps";
import {
  mapView,
  routeLegs,
  routeOrder,
  routeTierStyle,
  viewPoint,
  viewSpan,
  type LatLng,
} from "@leakbook/core";
import { pinImageSize } from "../src/components/map-pins";
import { drawMapImage } from "../src/server/map-draw";
import { compositePins, pinPlacements, pngSize } from "../src/server/map-composite";
import { solidPng } from "./fixtures/png";
import { suggestAddresses, type RoutingProvider } from "../src/server/routing";
import { appleMapsConfigured, mapsConfigured, resolveMapProvider } from "../src/lib/map-provider";
import { isHandheld, webMapsApp } from "../src/lib/web-maps-app";

// A throwaway P-256 key made for these tests; never a real Apple key.
function throwaway(): { keys: AppleKeys; pem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { keys: { teamId: "TEAM123456", keyId: "KEY7654321", privateKey }, pem, publicKey };
}

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

/** Checks an ES256 JWT's signature with the public key and returns its header and claims. */
function readJwt(jwt: string, publicKey: KeyObject) {
  const [head, body, sig] = jwt.split(".");
  const ok = verify(
    "sha256",
    Buffer.from(`${head}.${body}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(sig!, "base64url"),
  );
  return { ok, header: decode(head!), claims: decode(body!) };
}

// A day a few streets across (zoom 13 and closer), so its pins are full size.
const SHOP = { tone: "shop" as const, label: "", at: { lat: 33.41, lng: -112.0 } };
const stop = (n: number, tone: "todo" | "done" | "current" = "todo") => ({
  tone,
  label: String(n),
  at: { lat: 33.4 + n / 500, lng: -112 - n / 500 },
});

describe("which map service", () => {
  const keys = {
    APPLE_MAPS_TEAM_ID: "T",
    APPLE_MAPS_KEY_ID: "K",
    APPLE_MAPS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  };

  it("is Mapbox without all three Apple settings, even when asked for Apple", () => {
    expect(resolveMapProvider({})).toBe("mapbox");
    expect(resolveMapProvider({ MAP_PROVIDER: "apple" })).toBe("mapbox");
    expect(resolveMapProvider({ ...keys, APPLE_MAPS_KEY_ID: "" })).toBe("mapbox");
    expect(resolveMapProvider({ ...keys, APPLE_MAPS_PRIVATE_KEY: "  " })).toBe("mapbox");
    expect(appleMapsConfigured({ ...keys, APPLE_MAPS_TEAM_ID: undefined })).toBe(false);
  });

  it("is Apple by default with the keys, and Mapbox when MAP_PROVIDER says so", () => {
    expect(resolveMapProvider(keys)).toBe("apple");
    expect(resolveMapProvider({ ...keys, MAP_PROVIDER: "apple" })).toBe("apple");
    expect(resolveMapProvider({ ...keys, MAP_PROVIDER: "mapbox" })).toBe("mapbox");
    expect(resolveMapProvider({ ...keys, MAP_PROVIDER: " Mapbox " })).toBe("mapbox");
  });

  it("draws day maps with either service, and not with neither", () => {
    expect(mapsConfigured({})).toBe(false);
    expect(mapsConfigured({ MAPBOX_TOKEN: "pk" })).toBe(true);
    expect(mapsConfigured(keys)).toBe(true);
    expect(mapsConfigured({ ...keys, MAP_PROVIDER: "mapbox" })).toBe(false);
  });
});

describe("the Apple key", () => {
  it("reads a .p8 kept with \\n for its line breaks", () => {
    const { pem } = throwaway();
    const k = appleKeys({
      APPLE_MAPS_TEAM_ID: "T",
      APPLE_MAPS_KEY_ID: "K",
      APPLE_MAPS_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
    });
    expect(k?.teamId).toBe("T");
    expect(k?.privateKey.asymmetricKeyType).toBe("ec");
  });

  it("is null when missing or unreadable", () => {
    expect(appleKeys({})).toBeNull();
    expect(
      appleKeys({ APPLE_MAPS_TEAM_ID: "T", APPLE_MAPS_KEY_ID: "K", APPLE_MAPS_PRIVATE_KEY: "x" }),
    ).toBeNull();
  });
});

describe("MapKit JS token", () => {
  it("is an ES256 JWT with iss, kid, iat, a 30-minute exp and the site's origin", () => {
    const { keys, publicKey } = throwaway();
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const t = readJwt(mapkitToken(keys, "https://sundeckpro.com", now), publicKey);
    expect(t.ok).toBe(true);
    expect(t.header).toEqual({ alg: "ES256", kid: "KEY7654321", typ: "JWT" });
    expect(t.claims).toEqual({
      iss: "TEAM123456",
      iat: now / 1000,
      exp: now / 1000 + 1800,
      origin: "https://sundeckpro.com",
    });
  });

  it("can't be passed off with another key", () => {
    const a = throwaway();
    const b = throwaway();
    expect(readJwt(appleJwt(a.keys, { iat: 1 }), b.publicKey).ok).toBe(false);
  });
});

describe("Apple Snapshots", () => {
  it("signs the path and query, with teamId and keyId, as the last parameter", () => {
    const { keys, publicKey } = throwaway();
    const { url } = appleSnapshot(
      [SHOP, stop(1, "done"), stop(2, "current")],
      { w: 640, h: 320 },
      keys,
    );
    expect(url.startsWith("https://snapshot.apple-mapkit.com/api/v1/snapshot?")).toBe(true);
    const at = url.lastIndexOf("&signature=");
    const signed = url.slice("https://snapshot.apple-mapkit.com".length, at);
    const signature = url.slice(at + "&signature=".length);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(
      verify(
        "sha256",
        Buffer.from(signed),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const q = new URL(url).searchParams;
    expect([...q.keys()].slice(-3)).toEqual(["teamId", "keyId", "signature"]);
    expect(q.get("teamId")).toBe("TEAM123456");
    expect(q.get("keyId")).toBe("KEY7654321");
  });

  it("asks for the map at our middle and span, with the route and no pins (any number of stops)", () => {
    const { keys } = throwaway();
    const day = [SHOP, ...Array.from({ length: 12 }, (_, i) => stop(i + 1))];
    const snap = appleSnapshot(day, { w: 360, h: 180 }, keys);
    const q = new URL(snap.url).searchParams;
    // Framed by us (core mapView), never Apple's "auto", so the pins drawn on it land right.
    expect(snap.view).toEqual(mapView(day, { w: 360, h: 180 }));
    const span = viewSpan(snap.view, { w: 360, h: 180 });
    expect(q.get("center")).toBe(
      `${snap.view.center.lat.toFixed(6)},${snap.view.center.lng.toFixed(6)}`,
    );
    expect(q.get("spn")).toBe(`${span.latDelta.toFixed(6)},${span.lngDelta.toFixed(6)}`);
    expect(q.get("z")).toBeNull();
    expect(q.get("size")).toBe("360x180");
    expect(q.get("scale")).toBe("2");
    expect(snap.size).toEqual({ w: 360, h: 180, scale: 2 });
    expect(q.get("colorScheme")).toBe("light");
    expect(q.get("poi")).toBe("0");
    expect(q.get("annotations")).toBeNull();
    expect(q.get("imgs")).toBeNull();
    const sizes = routeTierStyle(snap.view.tier);
    const [casing, line] = JSON.parse(q.get("overlays")!);
    expect(casing).toMatchObject({ strokeColor: "ffffff", lineWidth: sizes.casingWidth });
    expect(line).toMatchObject({
      strokeColor: "1f6fae",
      lineWidth: sizes.lineWidth,
      strokeOpacity: 1,
    });
    // From the shop, through the stops, back to the shop.
    expect(line.points).toHaveLength(14);
    expect(line.points[0]).toBe(line.points[13]);
  });

  it("draws the line in the tech's color, dark in dark mode", () => {
    const { keys } = throwaway();
    const color = (theme: "light" | "dark", c: string) =>
      JSON.parse(
        new URL(
          appleSnapshot([SHOP, stop(1)], { w: 640, h: 320 }, keys, theme, c).url,
        ).searchParams.get("overlays")!,
      )[1].strokeColor;
    expect(color("light", "orange")).toBe("d07b27");
    expect(color("dark", "green")).toBe("4cb07a");
    const dark = new URL(appleSnapshot([stop(1)], { w: 360, h: 240 }, keys, "dark").url);
    expect(dark.searchParams.get("colorScheme")).toBe("dark");
  });

  it("shows a day at one place at the neighborhood zoom, and keeps Apple's size limits", () => {
    const { keys } = throwaway();
    const one = appleSnapshot([stop(1)], { w: 360, h: 240 }, keys);
    expect(one.view.zoom).toBe(13);
    expect(new URL(one.url).searchParams.get("center")).toBe("33.402000,-112.002000");
    expect(new URL(one.url).searchParams.get("overlays")).toBeNull();
    expect(snapshotSize({ w: 960, h: 640 })).toEqual({ w: 640, h: 427, scale: 3 });
    expect(snapshotSize({ w: 10, h: 5000 })).toEqual({ w: 50, h: 640, scale: 3 });
  });
});

describe("Apple Snapshots: the route along the roads, smaller zoomed out (owner, 2026-10-23)", () => {
  /** Each leg as a road that curves `amp` degrees either side, `n` points long. */
  const roadLegs = (
    pins: { tone: "shop" | "todo" | "done" | "current"; at: LatLng }[],
    n = 300,
    amp = 0.002,
  ) =>
    routeLegs(routeOrder(pins).map((p) => p.at)).map((l) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n;
        const w = Math.sin(t * Math.PI * 3) * amp;
        return {
          lat: l.from.lat + (l.to.lat - l.from.lat) * t + w,
          lng: l.from.lng + (l.to.lng - l.from.lng) * t - w,
        };
      }),
    );
  const line = (url: string) => JSON.parse(new URL(url).searchParams.get("overlays")!)[1].points;

  it("follows the roads through every pin, within the address length Apple takes", () => {
    const { keys } = throwaway();
    const day = [SHOP, stop(1), stop(2), stop(3)];
    const { url } = appleSnapshot(day, { w: 360, h: 240 }, keys, "light", "blue", roadLegs(day));
    expect(url.length).toBeLessThanOrEqual(SNAPSHOT_MAX_URL);
    const points: string[] = line(url);
    expect(points.length).toBeGreaterThan(5);
    expect(points[0]).toBe(points.at(-1));
  });

  it("a long day's roads are simplified to fit, never left off", () => {
    const { keys } = throwaway();
    const day = [SHOP, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => stop(n))];
    const { url } = appleSnapshot(
      day,
      { w: 360, h: 180 },
      keys,
      "light",
      "blue",
      roadLegs(day, 3000, 0.004),
    );
    expect(url.length).toBeLessThanOrEqual(SNAPSHOT_MAX_URL);
    expect(line(url).length).toBeGreaterThanOrEqual(day.length + 1);
  });

  it("frames the road path too, and draws a spread-out day with a thin line", () => {
    const { keys } = throwaway();
    const city = [
      SHOP,
      { tone: "todo" as const, label: "1", at: { lat: 33.6, lng: -111.9 } },
      { tone: "current" as const, label: "2", at: { lat: 33.3, lng: -112.25 } },
    ];
    const snap = appleSnapshot(city, { w: 360, h: 180 }, keys, "light", "orange");
    expect(snap.view.tier).toBe("small");
    const [casing, stroke] = JSON.parse(new URL(snap.url).searchParams.get("overlays")!);
    expect([casing.lineWidth, stroke.lineWidth]).toEqual([4, 2.5]);
    const roads = roadLegs(city, 50, 0.05);
    expect(
      appleSnapshot(city, { w: 360, h: 180 }, keys, "light", "orange", roads).view.zoom,
    ).toBeLessThan(snap.view.zoom);
  });
});

describe("our pins on Apple's image (owner, 2026-10-24: Apple for every day)", () => {
  const cluster = [
    { tone: "shop" as const, label: "", at: { lat: 33.5605, lng: -112.1312 } },
    ...Array.from({ length: 12 }, (_, i) => ({
      tone: (i === 0 ? "done" : i === 1 ? "current" : "todo") as "done" | "current" | "todo",
      label: String(i + 1),
      at: { lat: 33.553 + (i % 4) * 0.004, lng: -112.142 + Math.floor(i / 4) * 0.006 },
    })),
  ];

  it("reads a PNG's pixel size", () => {
    expect(pngSize(solidPng(720, 360))).toEqual({ w: 720, h: 360 });
    expect(pngSize(new TextEncoder().encode("not a png at all, no"))).toBeNull();
  });

  it("puts each pin centered on its place, the stop you're on drawn last", () => {
    const size = { w: 360, h: 180 };
    const view = mapView(cluster, size);
    const placed = pinPlacements(cluster, view, size);
    expect(placed).toHaveLength(13);
    expect(placed[0]!.pin.tone).toBe("shop");
    expect(placed.at(-1)!.pin.tone).toBe("current");
    for (const p of placed) {
      const at = viewPoint(p.pin.at, view, size);
      expect(p.x + p.side / 2).toBeCloseTo(at.x, 9);
      expect(p.y + p.side / 2).toBeCloseTo(at.y, 9);
      expect(p.side).toBe(pinImageSize(p.pin.tone, view.tier));
      // Every pin whole inside the image.
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x + p.side).toBeLessThan(size.w);
      expect(p.y + p.side).toBeLessThan(size.h);
    }
  });

  it("draws them onto the image at its scale", async () => {
    const view = mapView(cluster, { w: 360, h: 180 });
    const res = await compositePins({
      image: solidPng(720, 360).buffer as ArrayBuffer,
      size: { w: 360, h: 180 },
      view,
      pins: cluster,
      color: "orange",
      theme: "light",
    });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ w: 720, h: 360 });
    await expect(
      compositePins({
        image: new TextEncoder().encode("png").buffer as ArrayBuffer,
        size: { w: 360, h: 180 },
        view,
        pins: cluster,
        theme: "light",
      }),
    ).rejects.toThrow();
  });
});

describe("drawing a day-map image", () => {
  const pins = [SHOP, stop(1), stop(2)];
  const png = () => new Response(solidPng(720, 480), { headers: { "content-type": "image/png" } });

  function harness(opts: {
    apple?: boolean;
    appleStatus?: number;
    budget?: string[];
    token?: string;
  }) {
    const { keys } = throwaway();
    const asked: string[] = [];
    const taken: string[] = [];
    return {
      asked,
      taken,
      draw: (p = pins) =>
        drawMapImage({
          pins: p,
          size: { w: 360, h: 240 },
          theme: "light",
          apple: opts.apple === false ? null : keys,
          mapboxToken: opts.token,
          take: async (kind) => {
            taken.push(kind);
            return (opts.budget ?? ["apple_snapshot", "static_image"]).includes(kind);
          },
          fetchImpl: (async (url: string) => {
            asked.push(new URL(url).host);
            if (url.includes("apple-mapkit"))
              return opts.appleStatus === undefined
                ? png()
                : new Response("no", { status: opts.appleStatus });
            return png();
          }) as unknown as typeof fetch,
        }),
    };
  }

  it("uses Apple when it can", async () => {
    const h = harness({ token: "pk" });
    expect(await h.draw()).toMatchObject({ ok: true, by: "apple", complete: true });
    expect(h.taken).toEqual(["apple_snapshot"]);
  });

  it("asks for the road route from the service that draws the image", async () => {
    const providers: string[] = [];
    const draw = (apple: boolean, complete = true) => {
      const asked: string[] = [];
      return {
        asked,
        drawn: drawMapImage({
          pins,
          size: { w: 360, h: 240 },
          theme: "light",
          apple: apple ? throwaway().keys : null,
          mapboxToken: "pk",
          take: async () => true,
          paths: async (provider, points) => {
            providers.push(provider);
            // The route's points in order: from the shop, through the stops, back.
            expect(points).toEqual([SHOP.at, stop(1).at, stop(2).at, SHOP.at]);
            return {
              legs: routeLegs(points).map((l) => [
                l.from,
                { lat: l.from.lat, lng: l.to.lng },
                l.to,
              ]),
              complete,
            };
          },
          fetchImpl: (async (url: string) => {
            asked.push(url);
            return png();
          }) as unknown as typeof fetch,
        }),
      };
    };
    const a = draw(true);
    expect(await a.drawn).toMatchObject({ ok: true, by: "apple", complete: true });
    expect(providers).toEqual(["apple"]);
    // The bend at each leg's corner is on the line.
    expect(decodeURIComponent(a.asked[0]!)).toContain('"33.41000,-112.00200"');

    const m = draw(false, false);
    expect(await m.drawn).toMatchObject({ ok: true, by: "mapbox", complete: false });
    expect(providers).toEqual(["apple", "mapbox"]);
  });

  it("draws the straight route when Apple refuses the longer address", async () => {
    const asked: string[] = [];
    const drawn = await drawMapImage({
      pins,
      size: { w: 360, h: 240 },
      theme: "light",
      apple: throwaway().keys,
      mapboxToken: "pk",
      take: async () => true,
      paths: async (_provider, points) => ({
        legs: routeLegs(points).map((l) => [l.from, { lat: l.from.lat, lng: l.to.lng }, l.to]),
        complete: true,
      }),
      fetchImpl: (async (url: string) => {
        asked.push(url);
        return JSON.parse(new URL(url).searchParams.get("overlays") ?? "[]")[0]?.points.length > 4
          ? new Response("too long", { status: 413 })
          : png();
      }) as unknown as typeof fetch,
    });
    expect(drawn).toMatchObject({ ok: true, by: "apple", complete: false });
    expect(asked).toHaveLength(2);
  });

  it("falls back to Mapbox on an Apple error or past Apple's allowance, never for 10 stops", async () => {
    const error = harness({ token: "pk", appleStatus: 429 });
    expect(await error.draw()).toMatchObject({ ok: true, by: "mapbox" });
    expect(error.asked).toEqual(["snapshot.apple-mapkit.com", "api.mapbox.com"]);

    const usedUp = harness({ token: "pk", budget: ["static_image"] });
    expect(await usedUp.draw()).toMatchObject({ ok: true, by: "mapbox" });
    expect(usedUp.asked).toEqual(["api.mapbox.com"]);

    // Any number of stops on Apple (owner, 2026-10-24: "Why some Apple some Mapbox?").
    const twelve = harness({ token: "pk" });
    const day = [SHOP, ...Array.from({ length: 12 }, (_, i) => stop(i + 1))];
    expect(await twelve.draw(day)).toMatchObject({ ok: true, by: "apple" });
    expect(twelve.taken).toEqual(["apple_snapshot"]);
  });

  it("on Mapbox, tries this site's pins, then Mapbox's own markers if it can't fetch them", async () => {
    const asked: string[] = [];
    const taken: string[] = [];
    const drawn = await drawMapImage({
      pins,
      size: { w: 360, h: 240 },
      theme: "light",
      color: "orange",
      apple: null,
      pinBase: "https://app.example.com",
      mapboxToken: "pk",
      take: async (kind) => {
        taken.push(kind);
        return true;
      },
      fetchImpl: (async (url: string) => {
        asked.push(url);
        return url.includes("url-")
          ? new Response("no", { status: 422 })
          : new Response("png", { headers: { "content-type": "image/png" } });
      }) as unknown as typeof fetch,
    });
    expect(drawn).toMatchObject({ ok: true, by: "mapbox" });
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain(encodeURIComponent("/api/map/pin/todo-1-orange.png"));
    expect(asked[1]).toContain("pin-l-1+d07b27(");
    expect(taken).toEqual(["static_image", "static_image"]);
  });

  it("uses only Mapbox on MAP_PROVIDER=mapbox, and says so when nothing can draw it", async () => {
    const mapbox = harness({ apple: false, token: "pk" });
    expect(await mapbox.draw()).toMatchObject({ ok: true, by: "mapbox" });
    expect(mapbox.taken).toEqual(["static_image"]);

    const neither = harness({ token: undefined, appleStatus: 500 });
    expect(await neither.draw()).toEqual({
      ok: false,
      status: 502,
      message: "The map couldn’t be drawn.",
    });

    const allUsed = harness({ token: "pk", budget: [] });
    expect(await allUsed.draw()).toMatchObject({ ok: false, status: 429 });
  });
});

describe("Apple address suggestions", () => {
  beforeEach(() => resetAppleServerToken());

  const apple = {
    results: [
      {
        displayLines: ["455 N Galvin Pkwy", "Phoenix, AZ 85008, United States"],
        structuredAddress: {
          fullThoroughfare: "455 N Galvin Pkwy",
          locality: "Phoenix",
          administrativeAreaCode: "AZ",
          postCode: "85008",
        },
      },
    ],
  };

  it("swaps a signed JWT for an access token once, then asks for addresses near the shop", async () => {
    const { keys, publicKey } = throwaway();
    const calls: { url: string; auth: string }[] = [];
    let counted = 0;
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      calls.push({ url: String(url), auth });
      if (String(url).endsWith("/v1/token"))
        return Response.json({ accessToken: "access-1", expiresInSeconds: 1800 });
      return Response.json(apple);
    }) as unknown as typeof fetch;
    const suggest = appleSuggester(keys, fetchImpl, async () => (++counted, true));
    expect(await suggest("455 N Galv", { lat: 33.4, lng: -112 })).toEqual([
      {
        line1: "455 N Galvin Pkwy",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85008",
        label: "455 N Galvin Pkwy, Phoenix, AZ 85008, United States",
      },
    ]);
    await suggest("455 N Galvi", null);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/v1/token",
      "/v1/searchAutocomplete",
      "/v1/searchAutocomplete",
    ]);
    expect(readJwt(calls[0]!.auth.replace("Bearer ", ""), publicKey).claims.iss).toBe("TEAM123456");
    expect(calls[1]!.auth).toBe("Bearer access-1");
    const q = new URL(calls[1]!.url).searchParams;
    expect(q.get("searchLocation")).toBe("33.4,-112");
    expect(q.get("resultTypeFilter")).toBe("Address");
    // The token's call and both lookups are in the budget.
    expect(counted).toBe(3);
  });

  /** Database calls: the shop's daily allowance and the shared budget, both with room. */
  const db = {
    async rpc() {
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  const mapboxProvider = {
    suggest: async () => [
      { line1: "From Mapbox", city: "", state: "", postal_code: "", label: "From Mapbox" },
    ],
  } as unknown as RoutingProvider;

  it("tries Apple first, and Mapbox when Apple fails or is used up", async () => {
    const fromApple = await suggestAddresses(
      db,
      "c",
      "455 N Galv",
      null,
      mapboxProvider,
      () => {},
      async () => [
        { line1: "From Apple", city: "", state: "", postal_code: "", label: "From Apple" },
      ],
    );
    expect(fromApple[0]!.line1).toBe("From Apple");
    const fellBack = await suggestAddresses(
      db,
      "c",
      "455 N Galv",
      null,
      mapboxProvider,
      () => {},
      async () => {
        throw new Error("This month's free Apple lookups are used");
      },
    );
    expect(fellBack[0]!.line1).toBe("From Mapbox");
    let problem = "";
    expect(
      await suggestAddresses(
        db,
        "c",
        "455 N Galv",
        null,
        null,
        (p) => (problem = p),
        async () => {
          throw new Error("Apple suggestions 503");
        },
      ),
    ).toEqual([]);
    expect(problem).toBe("Apple suggestions 503");
  });
});

describe("directions links on the website", () => {
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148";
  const ANDROID = "Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/141.0 Mobile Safari/537.36";

  it("opens Apple Maps on every computer once the site is on Apple Maps", () => {
    expect(webMapsApp(WINDOWS, null, "apple")).toBe("apple");
    expect(webMapsApp(MAC, "auto", "apple")).toBe("apple");
  });

  it("leaves phones, saved choices and the Mapbox site as they were", () => {
    expect(isHandheld(IPHONE) && isHandheld(ANDROID) && !isHandheld(WINDOWS)).toBe(true);
    expect(webMapsApp(ANDROID, null, "apple")).toBe("google");
    expect(webMapsApp(IPHONE, null, "apple")).toBe("apple");
    expect(webMapsApp(WINDOWS, "google", "apple")).toBe("google");
    expect(webMapsApp(WINDOWS, null, "mapbox")).toBe("google");
    expect(webMapsApp(MAC, null, "mapbox")).toBe("apple");
  });
});
