import "server-only";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import {
  fitLegs,
  fitZoom,
  imageTier,
  joinLegs,
  metersPerPoint,
  projectPoint,
  routeLegs,
  routeOrder,
  routeTierStyle,
  type AddressSuggestion,
  type LatLng,
  type MapPin,
  type RouteTier,
} from "@leakbook/core";
import { pinHex, pinImageName, pinImageSize, routeHex } from "@/components/map-pins";

// Apple Maps for the website (owner, 2026-10-20, docs/plans/apple-maps.md): the MapKit JS token,
// signed Snapshot addresses for the day-map images, and the Maps Server API's autocomplete. The
// key (a .p8 from the Apple Developer account) stays on the server; only short-lived tokens and
// signed image addresses leave it.

export interface AppleKeys {
  teamId: string;
  keyId: string;
  privateKey: KeyObject;
}

let cached: { pem: string; key: KeyObject } | null = null;

/** The Apple Maps key from the environment, or null when any part is missing or unreadable. */
export function appleKeys(env: Record<string, string | undefined> = process.env): AppleKeys | null {
  const teamId = env.APPLE_MAPS_TEAM_ID?.trim();
  const keyId = env.APPLE_MAPS_KEY_ID?.trim();
  // Hosting settings often keep a .p8's line breaks as "\n".
  const pem = env.APPLE_MAPS_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!teamId || !keyId || !pem) return null;
  try {
    if (cached?.pem !== pem) cached = { pem, key: createPrivateKey(pem) };
    return { teamId, keyId, privateKey: cached.key };
  } catch {
    console.error("Apple Maps: APPLE_MAPS_PRIVATE_KEY isn’t a readable private key");
    return null;
  }
}

export const base64url = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b) : b).toString("base64url");

/** ES256: SHA-256 with the P-256 key, as the raw 64-byte r‖s JOSE and Apple expect. */
export function es256(data: string, key: KeyObject): Buffer {
  return sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
}

/** A JWT signed with the Apple Maps key: header alg/kid/typ, `iss` the team, then `claims`. */
export function appleJwt(keys: AppleKeys, claims: Record<string, string | number>): string {
  const head = base64url(JSON.stringify({ alg: "ES256", kid: keys.keyId, typ: "JWT" }));
  const body = base64url(JSON.stringify({ iss: keys.teamId, ...claims }));
  return `${head}.${body}.${base64url(es256(`${head}.${body}`, keys.privateKey))}`;
}

/** How long a MapKit JS token lasts: 30 minutes. */
export const MAPKIT_TOKEN_SECONDS = 30 * 60;

/** The browser's MapKit JS token, good only on this site's own origin. */
export function mapkitToken(keys: AppleKeys, origin: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  return appleJwt(keys, { iat, exp: iat + MAPKIT_TOKEN_SECONDS, origin });
}

// ---------------------------------------------------------------------------
// Snapshots (map images)
// ---------------------------------------------------------------------------

const hex = (c: string) => c.replace("#", "").toLowerCase();
const point = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/**
 * Whether Apple can draw these pins: an annotation's glyph is one character, so only stops
 * numbered 1 to 9. A day with a 10th stop gets its image from Mapbox.
 */
export function snapshotFits(pins: Omit<MapPin, "id">[]): boolean {
  return pins.length > 0 && pins.every((p) => p.tone === "shop" || /^[1-9]$/.test(p.label));
}

/**
 * Apple's size (each side 50–640 points) and scale (1–3) for an image of `size` at 2x: larger
 * images are drawn at fewer points and a higher scale, so the pixels stay the same or close.
 */
export function snapshotSize(size: { w: number; h: number }): {
  w: number;
  h: number;
  scale: number;
} {
  const w = Math.max(50, Math.round(size.w));
  const h = Math.max(50, Math.round(size.h));
  const f = Math.min(1, 640 / Math.max(w, h));
  return {
    w: Math.min(640, Math.max(50, Math.round(w * f))),
    h: Math.min(640, Math.max(50, Math.round(h * f))),
    scale: f < 1 ? Math.min(3, Math.ceil(2 / f - 1e-9)) : 2,
  };
}

/**
 * Apple doesn't publish a Snapshot address's longest length; developers report failures from
 * about 5,000 characters (developer.apple.com/forums/thread/732615), so the route is simplified
 * to keep the whole signed address within this.
 */
export const SNAPSHOT_MAX_URL = 4000;

/** Points left spare around the pins when Apple fits the map ("auto"), for the zoom estimate. */
const SNAPSHOT_PADDING = 40;

/**
 * The size tier an image's route is drawn at (owner, 2026-10-23: "thinner lines and smaller dots
 * when zoomed out"): from the zoom the image ends up at (fitting `points` in `size` points with
 * `padding` spare) and how crowded its pins are there (core imageTier). One pin: zoom 13, full.
 */
export function imageRouteTier(
  pins: Omit<MapPin, "id">[],
  points: LatLng[],
  size: { w: number; h: number },
  padding: number,
): { tier: RouteTier; zoom: number } {
  const zoom = pins.length === 1 ? 13 : fitZoom(points, size, padding);
  const at = pins.map((p) => ({ ...projectPoint(p.at, zoom), tone: p.tone }));
  return { tier: imageTier(zoom, at), zoom };
}

/**
 * The signed Apple Snapshots address for these pins (owner, 2026-10-23: "Bold tech-colored
 * routes"): stops numbered in the tech's color (`color`, a palette key; water blue without
 * one), the shop in navy, and the route in that color on a white casing in route order (shop,
 * stops, back to the shop), the same as the Mapbox image. Since 2026-10-23 the route follows the
 * roads: `legs` is each leg's line (core routeLegPaths, Apple's paths; straight without one),
 * simplified only as much as the address's length needs; and zoomed out, or with pins crowded,
 * the pins and line are drawn smaller (imageRouteTier). Signed per Apple's documentation: ES256
 * over the path and query (teamId and keyId included), Base64URL, added as the last parameter.
 */
export function appleSnapshotUrl(
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  keys: AppleKeys,
  theme: "light" | "dark" = "light",
  /** This site's address: the pins are its own small circles (api/map/pin), as on the live
   * map. Without it (tests), Apple's balloon pins. */
  pinBase?: string,
  /** The tech's team color (a palette key); missing or unknown is water blue. */
  color?: string | null,
  /** Each leg's line, in route order (core routeLegPaths); straight lines without. */
  legs?: LatLng[][] | null,
): string {
  const { w, h, scale } = snapshotSize(size);
  const order = routeOrder(pins).map((p) => p.at);
  const route = legs ?? routeLegs(order).map((l) => [l.from, l.to]);
  const { tier, zoom } = imageRouteTier(
    pins,
    [...pins.map((p) => p.at), ...route.flat()],
    { w, h },
    SNAPSHOT_PADDING,
  );
  const sizes = routeTierStyle(tier);
  const q = new URLSearchParams();
  if (pins.length === 1) {
    q.set("center", point(pins[0]!.at));
    q.set("z", "13");
  } else {
    q.set("center", "auto");
  }
  q.set("size", `${w}x${h}`);
  q.set("scale", String(scale));
  q.set("colorScheme", theme);
  q.set("poi", "0");
  if (pinBase) {
    // Each pin is a circle, its middle on the place. Apple anchors an image's bottom middle,
    // and a negative y moves it down (owner, 2026-10-22: Apple's own pins "look huge and
    // cartoony"). At most 10 different images (Apple's limit): stops 1 to 9 and the start (one
    // color a map), fewer for small dots, which have no numbers.
    const names = pins.map((p) => pinImageName(p, color, theme, tier));
    const unique = [...new Set(names)];
    const sizeOf = unique.map((_, n) => pinImageSize(pins[names.indexOf(unique[n]!)]!.tone, tier));
    q.set(
      "imgs",
      JSON.stringify(
        unique.map((n, i) => ({
          url: `${pinBase}/api/map/pin/${n}.png`,
          width: sizeOf[i],
          height: sizeOf[i],
        })),
      ),
    );
    q.set(
      "annotations",
      JSON.stringify(
        pins.map((p, i) => {
          const idx = unique.indexOf(names[i]!);
          return {
            point: point(p.at),
            markerStyle: "img",
            imgIdx: idx,
            offset: `0,-${sizeOf[idx]! / 2}`,
          };
        }),
      ),
    );
  } else {
    q.set(
      "annotations",
      JSON.stringify(
        pins.map((p) => ({
          point: point(p.at),
          color: hex(pinHex(p.tone, color, theme)),
          markerStyle: "balloon",
          // The shop's pin is plain; someone's home is a house (⌂), never its street.
          ...(p.tone === "shop" ? (p.home ? { glyphText: "\u2302" } : {}) : { glyphText: p.label }),
        })),
      ),
    );
  }
  const unsigned = (lines: LatLng[][] | null) => {
    const out = new URLSearchParams(q);
    const line = lines ? joinLegs(lines) : [];
    // Route points to 4 decimals (about 11 m) when a point of the image covers more than that.
    const fine = metersPerPoint(order[0]?.lat ?? 0, zoom) < 11;
    const at = (p: LatLng) => (fine ? point(p) : `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`);
    if (line.length > 1)
      out.set(
        "overlays",
        JSON.stringify(
          // A white casing under the line, so it reads on any street.
          [
            { strokeColor: "ffffff", lineWidth: sizes.casingWidth },
            { strokeColor: hex(routeHex(color, theme)), lineWidth: sizes.lineWidth },
          ].map((style) => ({ points: line.map(at), ...style, strokeOpacity: 1 })),
        ),
      );
    out.set("teamId", keys.teamId);
    out.set("keyId", keys.keyId);
    return `/api/v1/snapshot?${out.toString()}`;
  };
  // The signature adds "&signature=" and 86 characters.
  const fits = (lines: LatLng[][]) =>
    `https://snapshot.apple-mapkit.com${unsigned(lines)}`.length + 100 <= SNAPSHOT_MAX_URL;
  const half = metersPerPoint(order[0]?.lat ?? 0, zoom) / 2;
  const path = unsigned(route.length ? fitLegs(route, fits, half) : null);
  return `https://snapshot.apple-mapkit.com${path}&signature=${base64url(es256(path, keys.privateKey))}`;
}

// ---------------------------------------------------------------------------
// Address search (Maps Server API)
// ---------------------------------------------------------------------------

let serverToken: { token: string; until: number } | null = null;

/** Forget the Maps Server access token (tests). */
export function resetAppleServerToken() {
  serverToken = null;
}

/**
 * The Maps Server API's access token, got with a signed JWT; it lasts 30 minutes and is kept
 * here until a minute before. `count` is told about the call to Apple, so it's in the budget.
 */
export async function appleAccessToken(
  keys: AppleKeys,
  fetchImpl: typeof fetch = fetch,
  count: () => Promise<boolean> = async () => true,
): Promise<string> {
  if (serverToken && serverToken.until > Date.now()) return serverToken.token;
  if (!(await count())) throw new Error("This month's free Apple lookups are used");
  const iat = Math.floor(Date.now() / 1000);
  const res = await fetchImpl("https://maps-api.apple.com/v1/token", {
    headers: { authorization: `Bearer ${appleJwt(keys, { iat, exp: iat + 1800 })}` },
  });
  if (!res.ok) throw new Error(`Apple Maps token ${res.status}`);
  const body = (await res.json()) as { accessToken?: string; expiresInSeconds?: number };
  if (!body.accessToken) throw new Error("Apple Maps token: none given");
  serverToken = {
    token: body.accessToken,
    until: Date.now() + Math.max(0, (body.expiresInSeconds ?? 1800) - 60) * 1000,
  };
  return body.accessToken;
}

/**
 * Apple's address autocomplete, nearest `near` first. `count` is told about each call to Apple
 * (the token's too), so every one is in the budget.
 */
export function appleSuggester(
  keys: AppleKeys,
  fetchImpl: typeof fetch = fetch,
  count: () => Promise<boolean> = async () => true,
) {
  const access = () => appleAccessToken(keys, fetchImpl, count);

  return async function suggest(text: string, near: LatLng | null): Promise<AddressSuggestion[]> {
    const token = await access();
    if (!(await count())) throw new Error("This month's free Apple lookups are used");
    const url = new URL("https://maps-api.apple.com/v1/searchAutocomplete");
    url.searchParams.set("q", text);
    url.searchParams.set("resultTypeFilter", "Address");
    url.searchParams.set("limitToCountries", "US");
    url.searchParams.set("lang", "en-US");
    if (near) url.searchParams.set("searchLocation", `${near.lat},${near.lng}`);
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) serverToken = null;
    if (!res.ok)
      throw new Error(
        `Apple suggestions ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
      );
    const body = (await res.json()) as { results?: AppleAutocompleteResult[] };
    return (body.results ?? []).slice(0, 5).flatMap((r) => {
      const a = r.structuredAddress;
      const line1 =
        a?.fullThoroughfare ??
        ([a?.subThoroughfare, a?.thoroughfare].filter(Boolean).join(" ") || r.displayLines?.[0]);
      if (!line1) return [];
      return [
        {
          line1,
          city: a?.locality ?? "",
          state: a?.administrativeAreaCode ?? "",
          postal_code: a?.postCode ?? "",
          label: (r.displayLines ?? [line1]).join(", "),
        },
      ];
    });
  };
}

interface AppleAutocompleteResult {
  displayLines?: string[];
  structuredAddress?: {
    fullThoroughfare?: string;
    subThoroughfare?: string;
    thoroughfare?: string;
    locality?: string;
    administrativeAreaCode?: string;
    postCode?: string;
  };
}
