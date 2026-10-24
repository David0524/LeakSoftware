import "server-only";
import { routeOrder, type MapPin } from "@leakbook/core";
import { appleSnapshot, type AppleKeys } from "./apple-maps";
import { compositePins } from "./map-composite";
import { staticMapUrl } from "./map-image";
import type { PathProvider, RoutePaths } from "./route-paths";
import type { MapBudgetKind } from "./routing";

// Which service draws a day-map image (docs/plans/apple-maps.md): Apple Snapshots on Apple Maps,
// any number of stops (owner, 2026-10-24: "Why some Apple some Mapbox?"; Apple draws the map and
// the route, our pins are drawn onto it, map-composite.tsx); Mapbox Static Images when Apple
// can't (out of its allowance, an error), or when the website is on Mapbox.

export type Drawn =
  | {
      ok: true;
      res: Response;
      by: "apple" | "mapbox";
      /** Every leg of the route is settled (false: a leg is straight for now; ask again soon). */
      complete: boolean;
      /** Why Apple wasn't used, when it wasn't. */
      note?: string;
    }
  | { ok: false; status: 429 | 502; message: string; note?: string };

/**
 * A note safe to send back as a response header: no addresses (a signed Apple Snapshot address
 * is a working credential for that image), no signatures or tokens, at most 200 characters.
 * Error text from fetch or from a service's reply can echo the address it was given.
 */
export function safeMapNote(note: string): string {
  return note
    .replace(/https?:\/\/\S+/gi, "[address]")
    .replace(/\b(signature|token|access_token|key)=[^&\s]*/gi, "$1=[hidden]")
    .replace(/\beyJ[\w-]+\.[\w-]+(\.[\w-]+)?/g, "[token]")
    .slice(0, 200);
}

export async function drawMapImage(input: {
  pins: Omit<MapPin, "id">[];
  size: { w: number; h: number };
  theme: "light" | "dark";
  /** The tech's team color (a palette key), or null: water blue. */
  color?: string | null;
  /** The Apple key when the website is on Apple Maps, else null. */
  apple: AppleKeys | null;
  /** This site's address, for Mapbox to fetch the pin images from. */
  pinBase?: string;
  mapboxToken: string | undefined;
  /** Take from the shared map budget (mapbox_take). */
  take: (kind: MapBudgetKind) => Promise<boolean>;
  /**
   * Each leg's road path from that service (route-paths.ts routePaths, given the route's points
   * in order); without it, or on its error, straight lines.
   */
  paths?: (provider: PathProvider, points: { lat: number; lng: number }[]) => Promise<RoutePaths>;
  fetchImpl?: typeof fetch;
}): Promise<Drawn> {
  const { pins, size, theme, color, apple, pinBase, mapboxToken, take, fetchImpl = fetch } = input;
  const order = routeOrder(pins).map((p) => p.at);
  // Why Apple wasn't used, when it wasn't (sent back as the x-map-note header, no secrets).
  let note = "";
  const legsFor = async (provider: PathProvider): Promise<RoutePaths> => {
    if (!input.paths || order.length < 2) return { legs: [], complete: true };
    return input.paths(provider, order).catch((e: unknown) => {
      console.error(`Map image: route paths ${e instanceof Error ? e.message : String(e)}`);
      return { legs: [], complete: false };
    });
  };
  if (!apple) note = "apple: no keys or provider";
  else if (!pins.length) note = "apple: no pins";
  else if (!(await take("apple_snapshot"))) note = "apple: allowance used";
  else {
    const route = await legsFor("apple");
    const draw = async (legs: RoutePaths["legs"] | null, wholeZoom = false) => {
      const snap = appleSnapshot(pins, size, apple, theme, color, legs, wholeZoom);
      const res = await fetchImpl(snap.url).catch((e: unknown) => {
        note = `apple unreachable: ${e instanceof Error ? e.message : String(e)}`;
        return null;
      });
      if (res && !res.ok)
        note = `apple ${res.status} (z ${new URL(snap.url).searchParams.get("z")}, tier ${snap.view.tier}): ${(
          await res
            .clone()
            .text()
            .catch(() => "")
        ).slice(0, 160)}`;
      if (!res?.ok) return res;
      try {
        return await compositePins({
          image: await res.arrayBuffer(),
          size: snap.size,
          view: snap.view,
          pins,
          color,
          theme,
        });
      } catch (e) {
        note = `pins: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
        console.error(`Map image: drawing the pins ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    };
    const roads = route.legs.length ? route.legs : null;
    let res = await draw(roads);
    // Apple turned down the fractional zoom: a whole one.
    if (res && res.status === 400 && (await take("apple_snapshot"))) res = await draw(roads, true);
    if (res?.ok) note = "";
    // Apple refused the longer address: the straight route, as before.
    if (
      res &&
      !res.ok &&
      route.legs.length &&
      [400, 413, 414].includes(res.status) &&
      (await take("apple_snapshot"))
    ) {
      console.error(`Map image: Apple ${res.status} with the road route; drawing it straight`);
      res = await draw(null, true);
      if (res?.ok) return { ok: true, res, by: "apple", complete: false };
    }
    if (res?.ok) return { ok: true, res, by: "apple", complete: route.complete };
    console.error(`Map image: Apple ${res?.status ?? "unreachable"}`);
  }
  note = safeMapNote(note);
  if (!mapboxToken) return { ok: false, status: 502, message: "The map couldn’t be drawn." };
  // Mapbox's monthly free tier, shared by every shop: never billed.
  if (!(await take("static_image")))
    return { ok: false, status: 429, message: "This month’s maps are used up." };
  const route = await legsFor("mapbox");
  const legs = route.legs.length ? route.legs : null;
  let res = await fetchImpl(
    staticMapUrl(pins, size, mapboxToken, theme, color, pinBase, legs),
  ).catch(() => null);
  // Mapbox couldn't fetch this site's pin images (a preview, or our site down): its own markers.
  if (!res?.ok && pinBase?.startsWith("https://") && (await take("static_image")))
    res = await fetchImpl(
      staticMapUrl(pins, size, mapboxToken, theme, color, undefined, legs),
    ).catch(() => null);
  if (!res?.ok) {
    console.error(`Map image: Mapbox ${res?.status ?? "unreachable"}`);
    return { ok: false, status: 502, message: "The map couldn’t be drawn." };
  }
  return { ok: true, res, by: "mapbox", complete: route.complete, note };
}
