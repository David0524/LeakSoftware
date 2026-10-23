import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appleJwt,
  appleKeys,
  appleSnapshotUrl,
  appleSuggester,
  mapkitToken,
  resetAppleServerToken,
  snapshotFits,
  snapshotSize,
  type AppleKeys,
} from "../src/server/apple-maps";
import { drawMapImage } from "../src/server/map-draw";
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

const SHOP = { tone: "shop" as const, label: "", at: { lat: 33.45, lng: -112.07 } };
const stop = (n: number, tone: "todo" | "done" | "current" = "todo") => ({
  tone,
  label: String(n),
  at: { lat: 33.4 + n / 100, lng: -112 - n / 100 },
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
    const url = appleSnapshotUrl(
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

  it("numbers stops 1–9 in the same colors as the Mapbox image, and draws the route", () => {
    const { keys } = throwaway();
    const q = new URL(
      appleSnapshotUrl(
        [SHOP, stop(1, "done"), stop(2, "current"), stop(3)],
        { w: 360, h: 240 },
        keys,
      ),
    ).searchParams;
    expect(q.get("center")).toBe("auto");
    expect(q.get("size")).toBe("360x240");
    expect(q.get("scale")).toBe("2");
    expect(q.get("colorScheme")).toBe("light");
    expect(q.get("poi")).toBe("0");
    const annotations = JSON.parse(q.get("annotations")!);
    expect(annotations[0]).toEqual({
      point: "33.45000,-112.07000",
      color: "12263a",
      markerStyle: "balloon",
    });
    expect(
      annotations.slice(1).map((a: { glyphText: string; color: string }) => [a.glyphText, a.color]),
    ).toEqual([
      ["1", "8fb7d7"],
      ["2", "1f6fae"],
      ["3", "1f6fae"],
    ]);
    const [casing, line] = JSON.parse(q.get("overlays")!);
    expect(casing).toMatchObject({ strokeColor: "ffffff", lineWidth: 9, strokeOpacity: 1 });
    expect(line).toMatchObject({ strokeColor: "1f6fae", lineWidth: 6, strokeOpacity: 1 });
    // From the shop, through the stops, back to the shop.
    expect(line.points).toHaveLength(5);
    expect(line.points[0]).toBe(line.points[4]);
  });

  it("uses this site's round pins in the tech's color, centered on their places", () => {
    const { keys } = throwaway();
    const q = new URL(
      appleSnapshotUrl(
        [{ ...SHOP, home: true }, stop(1, "done"), stop(2, "current"), stop(3)],
        { w: 640, h: 320 },
        keys,
        "light",
        "https://app.example.com",
        "orange",
      ),
    ).searchParams;
    expect(JSON.parse(q.get("imgs")!)).toEqual(
      [
        ["home", 28],
        ["done-1-orange", 36],
        ["current-2-orange", 42],
        ["todo-3-orange", 36],
      ].map(([n, size]) => ({
        url: `https://app.example.com/api/map/pin/${n}.png`,
        width: size,
        height: size,
      })),
    );
    const annotations = JSON.parse(q.get("annotations")!);
    expect(annotations.map((a: { imgIdx: number }) => a.imgIdx)).toEqual([0, 1, 2, 3]);
    expect(annotations.map((a: { offset: string }) => a.offset)).toEqual([
      "0,-14",
      "0,-18",
      "0,-21",
      "0,-18",
    ]);
    expect(annotations[1]).toEqual({
      point: expect.any(String),
      markerStyle: "img",
      imgIdx: 1,
      offset: "0,-18",
    });
    expect(JSON.parse(q.get("overlays")!)[1].strokeColor).toBe("d07b27");
  });

  it("draws dark pins and line in the tech's dark color", () => {
    const { keys } = throwaway();
    const q = new URL(
      appleSnapshotUrl(
        [SHOP, stop(1)],
        { w: 640, h: 320 },
        keys,
        "dark",
        "https://app.example.com",
        "green",
      ),
    ).searchParams;
    expect(JSON.parse(q.get("imgs")!)[1].url).toBe(
      "https://app.example.com/api/map/pin/todo-1-green-dark.png",
    );
    expect(JSON.parse(q.get("overlays")!)[1].strokeColor).toBe("4cb07a");
  });

  it("draws a home start as a house", () => {
    const { keys } = throwaway();
    const q = new URL(
      appleSnapshotUrl([{ ...SHOP, home: true }, stop(1)], { w: 360, h: 240 }, keys),
    ).searchParams;
    const [start] = JSON.parse(q.get("annotations")!);
    expect(start).toEqual({
      point: "33.45000,-112.07000",
      color: "12263a",
      markerStyle: "balloon",
      glyphText: "⌂",
    });
  });

  it("draws dark for dark mode, centers a single pin, and keeps Apple's size limits", () => {
    const { keys } = throwaway();
    const one = new URL(appleSnapshotUrl([stop(1)], { w: 360, h: 240 }, keys, "dark")).searchParams;
    expect(one.get("colorScheme")).toBe("dark");
    expect(one.get("center")).toBe("33.41000,-112.01000");
    expect(one.get("z")).toBe("13");
    expect(one.get("overlays")).toBeNull();
    expect(snapshotSize({ w: 960, h: 640 })).toEqual({ w: 640, h: 427, scale: 3 });
    expect(snapshotSize({ w: 10, h: 5000 })).toEqual({ w: 50, h: 640, scale: 3 });
  });

  it("can't number a 10th stop, so those days go to Mapbox", () => {
    expect(snapshotFits([SHOP, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => stop(n))])).toBe(true);
    expect(snapshotFits([SHOP, stop(10)])).toBe(false);
    expect(snapshotFits([])).toBe(false);
  });
});

describe("drawing a day-map image", () => {
  const pins = [SHOP, stop(1), stop(2)];
  const png = () => new Response("png", { headers: { "content-type": "image/png" } });

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
    expect(await h.draw()).toMatchObject({ ok: true, by: "apple" });
    expect(h.taken).toEqual(["apple_snapshot"]);
  });

  it("falls back to Mapbox on an Apple error, past Apple's allowance, or with 10 stops", async () => {
    const error = harness({ token: "pk", appleStatus: 429 });
    expect(await error.draw()).toMatchObject({ ok: true, by: "mapbox" });
    expect(error.asked).toEqual(["snapshot.apple-mapkit.com", "api.mapbox.com"]);

    const usedUp = harness({ token: "pk", budget: ["static_image"] });
    expect(await usedUp.draw()).toMatchObject({ ok: true, by: "mapbox" });
    expect(usedUp.asked).toEqual(["api.mapbox.com"]);

    const ten = harness({ token: "pk" });
    expect(await ten.draw([SHOP, stop(10)])).toMatchObject({ ok: true, by: "mapbox" });
    expect(ten.taken).toEqual(["static_image"]);
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
