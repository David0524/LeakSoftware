import "server-only";
import { tokens } from "@leakbook/tokens";
import type { MapPin, PinTone } from "@leakbook/core";

// Day maps (owner, 2026-10-20, docs/plans/route-maps.md): a map image of a day's stops from
// Mapbox Static Images, drawn on the server so the key stays here.

const TONE_COLOR: Record<PinTone, string> = {
  shop: tokens.color.brand.navy,
  todo: tokens.color.brand.water,
  current: tokens.color.brand.safety,
  done: tokens.color.status.pass,
};

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
 * The Mapbox Static Images address for these pins: the start (the shop, or home) as a house, stops numbered in their
 * colors, and a faint line through them in route order (shop, stops, back to the shop).
 */
export function staticMapUrl(
  pins: Omit<MapPin, "id">[],
  size: { w: number; h: number },
  token: string,
  theme: "light" | "dark" = "light",
): string {
  const overlays = pins.map((p) => {
    const marker = p.tone === "shop" ? "home" : /^\d{1,2}$/.test(p.label) ? p.label : "circle";
    // Someone who starts from home: a larger house (an image's pin can't carry words; the
    // live maps label it Home). Never the street.
    const size = p.tone === "shop" && p.home ? "l" : "s";
    return `pin-${size}-${marker}+${hex(TONE_COLOR[p.tone])}(${p.at.lng.toFixed(5)},${p.at.lat.toFixed(5)})`;
  });
  const shop = pins.find((p) => p.tone === "shop");
  const route = [...(shop ? [shop] : []), ...pins.filter((p) => p.tone !== "shop")];
  if (shop && route.length > 1) route.push(shop);
  if (route.length > 1) {
    overlays.unshift(
      `path-3+${hex(TONE_COLOR.todo)}-0.45(${encodeURIComponent(encodePolyline(route.map((p) => p.at)))})`,
    );
  }
  const w = Math.min(1280, Math.max(120, Math.round(size.w)));
  const h = Math.min(1280, Math.max(80, Math.round(size.h)));
  const view = pins.length === 1 ? `${pins[0]!.at.lng},${pins[0]!.at.lat},13` : "auto";
  const url = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/${theme === "dark" ? "dark-v11" : "streets-v12"}/static/${overlays.join(",")}/${view}/${w}x${h}@2x`,
  );
  if (view === "auto") url.searchParams.set("padding", "36");
  url.searchParams.set("access_token", token);
  return url.toString();
}
