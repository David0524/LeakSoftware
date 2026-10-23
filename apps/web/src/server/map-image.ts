import "server-only";
import { ROUTE_STYLE, type MapPin } from "@leakbook/core";
import { pinHex, pinImageName, routeHex } from "@/components/map-pins";

// Day maps (owner, 2026-10-20, docs/plans/route-maps.md): a map image of a day's stops from
// Mapbox Static Images, drawn on the server so the key stays here. Since 2026-10-23 (owner:
// "Bold tech-colored routes") in the tech's color, with the same pins as Apple's image and the
// live maps: this site's own pin images when Mapbox can fetch them (`pinBase`, https), else
// Mapbox's own markers in the same colors.

/** Mapbox's longest address. */
const MAX_URL = 8192;

const hex = (c: string) => c.replace("#", "").toLowerCase();

/** Google's polyline encoding (Mapbox's path overlay takes it), 5 decimals. */
export function encodePolyline(points: { lat: number; lng: number }[]): string {
  let out = "";
  let lastLat = 0;
  let lastLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    enc(lat - lastLat);
    enc(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

/**
 * The Mapbox Static Images address for these pins: the start (the shop, or home) as a house,
 * stops numbered in the tech's color (`color`, a palette key; water blue without one), and the
 * route in that color on a white casing in route order (shop, stops, back to the shop). With
 * `pinBase` (this site's https address), the pins are this site's own images, as on Apple's
 * image; without it, or when the address would be too long, Mapbox's markers.
 */
export function staticMapUrl(
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  token: string,
  theme: "light" | "dark" = "light",
  color?: string | null,
  pinBase?: string,
): string {
  const at = (p: Omit<MapPin, "id">) => `(${p.at.lng.toFixed(5)},${p.at.lat.toFixed(5)})`;
  const markers = pins.map((p) => {
    const marker = p.tone === "shop" ? "home" : /^\d{1,2}$/.test(p.label) ? p.label : "circle";
    // Stops large, as the bold route's pins; someone who starts from home a larger house (an
    // image's pin can't carry words; the live maps label it Home). Never the street.
    const size = p.tone !== "shop" || p.home ? "l" : "s";
    return `pin-${size}-${marker}+${hex(pinHex(p.tone, color, theme))}${at(p)}`;
  });
  // Mapbox doesn't scale its own images' markers for @2x, so ours (drawn at 2x) fit as they are.
  const images = pinBase?.startsWith("https://")
    ? pins.map(
        (p) =>
          `url-${encodeURIComponent(`${pinBase}/api/map/pin/${pinImageName(p, color, theme)}.png`)}${at(p)}`,
      )
    : null;
  const shop = pins.find((p) => p.tone === "shop");
  const route = [...(shop ? [shop] : []), ...pins.filter((p) => p.tone !== "shop")];
  if (shop && route.length > 1) route.push(shop);
  const line: string[] = [];
  if (route.length > 1) {
    const poly = encodeURIComponent(encodePolyline(route.map((p) => p.at)));
    // A white casing under the line, so it reads on any street.
    line.push(
      `path-${ROUTE_STYLE.casingWidth}+ffffff-1(${poly})`,
      `path-${ROUTE_STYLE.lineWidth}+${hex(routeHex(color, theme))}-1(${poly})`,
    );
  }
  const url = (overlays: string[]) => address([...line, ...overlays], pins, size, token, theme);
  if (images) {
    const own = url(images);
    if (own.length <= MAX_URL) return own;
  }
  return url(markers);
}

function address(
  overlays: string[],
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  token: string,
  theme: "light" | "dark",
): string {
  const w = Math.min(1280, Math.max(120, Math.round(size.w)));
  const h = Math.min(1280, Math.max(80, Math.round(size.h)));
  const view = pins.length === 1 ? `${pins[0]!.at.lng},${pins[0]!.at.lat},13` : "auto";
  // Mapbox's light style (dark in dark mode), as the live Mapbox map: modern and low-clutter,
  // so the bold route reads and a day drawn here (10+ stops) sits beside Apple's images
  // (owner, 2026-10-23: the streets style "looks very old").
  const url = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/${theme === "dark" ? "dark-v11" : "light-v11"}/static/${overlays.join(",")}/${view}/${w}x${h}@2x`,
  );
  if (view === "auto") url.searchParams.set("padding", "44");
  url.searchParams.set("access_token", token);
  return url.toString();
}
