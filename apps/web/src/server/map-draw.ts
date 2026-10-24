import "server-only";
import { routeOrder, type MapPin } from "@leakbook/core";
import { appleSnapshotUrl, snapshotFits, type AppleKeys } from "./apple-maps";
import { staticMapUrl } from "./map-image";
import type { PathProvider, RoutePaths } from "./route-paths";
import type { MapBudgetKind } from "./routing";

// Which service draws a day-map image (docs/plans/apple-maps.md): Apple Snapshots on Apple Maps,
// Mapbox Static Images when Apple can't (out of its allowance, an error, or 10 stops or more),
// or when the website is on Mapbox.

export type Drawn =
  | {
      ok: true;
      res: Response;
      by: "apple" | "mapbox";
      /** Every leg of the route is settled (false: a leg is straight for now; ask again soon). */
      complete: boolean;
    }
  | { ok: false; status: 429 | 502; message: string };

export async function drawMapImage(input: {
  pins: Omit<MapPin, "id">[];
  size: { w: number; h: number };
  theme: "light" | "dark";
  /** The tech's team color (a palette key), or null: water blue. */
  color?: string | null;
  /** The Apple key when the website is on Apple Maps, else null. */
  apple: AppleKeys | null;
  /** This site's address, for Apple to fetch the pin images from. */
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
  const legsFor = async (provider: PathProvider): Promise<RoutePaths> => {
    if (!input.paths || order.length < 2) return { legs: [], complete: true };
    return input.paths(provider, order).catch((e: unknown) => {
      console.error(`Map image: route paths ${e instanceof Error ? e.message : String(e)}`);
      return { legs: [], complete: false };
    });
  };
  if (apple && snapshotFits(pins) && (await take("apple_snapshot"))) {
    const route = await legsFor("apple");
    const draw = (legs: RoutePaths["legs"] | null) =>
      fetchImpl(appleSnapshotUrl(pins, size, apple, theme, pinBase, color, legs)).catch(() => null);
    let res = await draw(route.legs.length ? route.legs : null);
    // Apple refused the longer address: the straight route, as before.
    if (
      res &&
      !res.ok &&
      route.legs.length &&
      [400, 413, 414].includes(res.status) &&
      (await take("apple_snapshot"))
    ) {
      console.error(`Map image: Apple ${res.status} with the road route; drawing it straight`);
      res = await draw(null);
      if (res?.ok) return { ok: true, res, by: "apple", complete: false };
    }
    if (res?.ok) return { ok: true, res, by: "apple", complete: route.complete };
    console.error(`Map image: Apple ${res?.status ?? "unreachable"}`);
  }
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
  return { ok: true, res, by: "mapbox", complete: route.complete };
}
