import "server-only";
import type { MapPin } from "@leakbook/core";
import { appleSnapshotUrl, snapshotFits, type AppleKeys } from "./apple-maps";
import { staticMapUrl } from "./map-image";
import type { MapBudgetKind } from "./routing";

// Which service draws a day-map image (docs/plans/apple-maps.md): Apple Snapshots on Apple Maps,
// Mapbox Static Images when Apple can't (out of its allowance, an error, or 10 stops or more),
// or when the website is on Mapbox.

export type Drawn =
  | { ok: true; res: Response; by: "apple" | "mapbox" }
  | { ok: false; status: 429 | 502; message: string };

export async function drawMapImage(input: {
  pins: Omit<MapPin, "id">[];
  size: { w: number; h: number };
  theme: "light" | "dark";
  /** The Apple key when the website is on Apple Maps, else null. */
  apple: AppleKeys | null;
  /** This site's address, for Apple to fetch the pin images from. */
  pinBase?: string;
  mapboxToken: string | undefined;
  /** Take from the shared map budget (mapbox_take). */
  take: (kind: MapBudgetKind) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}): Promise<Drawn> {
  const { pins, size, theme, apple, pinBase, mapboxToken, take, fetchImpl = fetch } = input;
  if (apple && snapshotFits(pins) && (await take("apple_snapshot"))) {
    const res = await fetchImpl(appleSnapshotUrl(pins, size, apple, theme, pinBase)).catch(
      () => null,
    );
    if (res?.ok) return { ok: true, res, by: "apple" };
    console.error(`Map image: Apple ${res?.status ?? "unreachable"}`);
  }
  if (!mapboxToken) return { ok: false, status: 502, message: "The map couldn’t be drawn." };
  // Mapbox's monthly free tier, shared by every shop: never billed.
  if (!(await take("static_image")))
    return { ok: false, status: 429, message: "This month’s maps are used up." };
  const res = await fetchImpl(staticMapUrl(pins, size, mapboxToken, theme)).catch(() => null);
  if (!res?.ok) {
    console.error(`Map image: Mapbox ${res?.status ?? "unreachable"}`);
    return { ok: false, status: 502, message: "The map couldn’t be drawn." };
  }
  return { ok: true, res, by: "mapbox" };
}
