import "server-only";
import {
  encodePolyline,
  fitLegs,
  joinLegs,
  metersPerPoint,
  routeLegs,
  routeOrder,
  routeTierStyle,
  type LatLng,
  type MapPin,
} from "@leakbook/core";
import { pinHex, pinImageName, routeHex } from "@/components/map-pins";
import { imageRouteTier } from "./apple-maps";

// Day maps (owner, 2026-10-20, docs/plans/route-maps.md): a map image of a day's stops from
// Mapbox Static Images, drawn on the server so the key stays here. Since 2026-10-23 (owner:
// "Bold tech-colored routes") in the tech's color, with the same pins as Apple's image and the
// live maps: this site's own pin images when Mapbox can fetch them (`pinBase`, https), else
// Mapbox's own markers in the same colors.

/** Mapbox's longest address. */
export const MAX_URL = 8192;

const hex = (c: string) => c.replace("#", "").toLowerCase();

/** Points left spare around the pins when Mapbox fits the map ("auto"; the padding we ask for). */
const PADDING = 44;

/**
 * The Mapbox Static Images address for these pins: the start (the shop, or home) as a house,
 * stops numbered in the tech's color (`color`, a palette key; water blue without one), and the
 * route in that color on a white casing in route order (shop, stops, back to the shop). With
 * `pinBase` (this site's https address), the pins are this site's own images, as on Apple's
 * image; without it, or when the address would be too long, Mapbox's markers. Since 2026-10-23
 * the route follows the roads (`legs`: each leg's line from Mapbox's paths, core
 * routeLegPaths), simplified only as much as Mapbox's 8,192-character address needs; and zoomed
 * out, or with pins crowded, the pins and line are drawn smaller (imageRouteTier).
 */
export function staticMapUrl(
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  token: string,
  theme: "light" | "dark" = "light",
  color?: string | null,
  pinBase?: string,
  /** Each leg's line, in route order (core routeLegPaths); straight lines without. */
  legs?: LatLng[][] | null,
): string {
  const w = Math.min(1280, Math.max(120, Math.round(size.w)));
  const h = Math.min(1280, Math.max(80, Math.round(size.h)));
  const order = routeOrder(pins).map((p) => p.at);
  const route = legs ?? routeLegs(order).map((l) => [l.from, l.to]);
  const { tier, zoom } = imageRouteTier(
    pins,
    [...pins.map((p) => p.at), ...route.flat()],
    { w, h },
    PADDING,
  );
  const sizes = routeTierStyle(tier);
  const at = (p: Omit<MapPin, "id">) => `(${p.at.lng.toFixed(5)},${p.at.lat.toFixed(5)})`;
  const markers = pins.map((p) => {
    // Stops large, as the bold route's pins, small zoomed out (no number on the small ones);
    // someone who starts from home a larger house (an image's pin can't carry words; the live
    // maps label it Home). Never the street.
    const small = tier !== "full";
    const marker =
      p.tone === "shop"
        ? "-home"
        : tier === "small"
          ? ""
          : /^\d{1,2}$/.test(p.label)
            ? `-${p.label}`
            : "-circle";
    const pinSize = (p.tone !== "shop" || p.home) && !small ? "l" : "s";
    return `pin-${pinSize}${marker}+${hex(pinHex(p.tone, color, theme))}${at(p)}`;
  });
  // Mapbox doesn't scale its own images' markers for @2x, so ours (drawn at 2x) fit as they are.
  const images = pinBase?.startsWith("https://")
    ? pins.map(
        (p) =>
          `url-${encodeURIComponent(`${pinBase}/api/map/pin/${pinImageName(p, color, theme, tier)}.png`)}${at(p)}`,
      )
    : null;
  // Mapbox takes whole-number widths.
  const casing = Math.max(1, Math.round(sizes.casingWidth));
  const width = Math.max(1, Math.round(sizes.lineWidth));
  const url = (lines: LatLng[][] | null, overlays: string[]) => {
    const line: string[] = [];
    const joined = lines ? joinLegs(lines) : [];
    if (joined.length > 1) {
      const poly = encodeURIComponent(encodePolyline(joined));
      // A white casing under the line, so it reads on any street.
      line.push(
        `path-${casing}+ffffff-1(${poly})`,
        `path-${width}+${hex(routeHex(color, theme))}-1(${poly})`,
      );
    }
    return address([...line, ...overlays], pins, { w, h }, token, theme);
  };
  const half = metersPerPoint(order[0]?.lat ?? 0, zoom) / 2;
  if (images) {
    // This site's pins, unless they'd cost the route more than about 4 points of detail.
    const fitted = route.length
      ? fitLegs(route, (l) => url(l, images).length <= MAX_URL, half, half * 8)
      : null;
    if (fitted || !route.length) {
      const own = url(fitted, images);
      if (own.length <= MAX_URL) return own;
    }
  }
  return url(
    route.length ? fitLegs(route, (l) => url(l, markers).length <= MAX_URL, half) : null,
    markers,
  );
}

function address(
  overlays: string[],
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  token: string,
  theme: "light" | "dark",
): string {
  const view = pins.length === 1 ? `${pins[0]!.at.lng},${pins[0]!.at.lat},13` : "auto";
  // Mapbox's light style (dark in dark mode), as the live Mapbox map: modern and low-clutter,
  // so the bold route reads and a day drawn here (10+ stops) sits beside Apple's images
  // (owner, 2026-10-23: the streets style "looks very old").
  const url = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/${theme === "dark" ? "dark-v11" : "light-v11"}/static/${overlays.join(",")}/${view}/${size.w}x${size.h}@2x`,
  );
  if (view === "auto") url.searchParams.set("padding", String(PADDING));
  url.searchParams.set("access_token", token);
  return url.toString();
}
