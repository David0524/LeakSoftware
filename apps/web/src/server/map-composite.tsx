import "server-only";
import { ImageResponse } from "next/og";
import { viewPoint, type MapPin, type MapView, type PinTone } from "@leakbook/core";
import { pinImageSize } from "@/components/map-pins";
import { pinArtFor, pinBody, pinFonts } from "./pin-art";

// Our pins drawn onto Apple's map image (owner, 2026-10-24: "Why some Apple some Mapbox?").
// Apple's snapshots take at most 10 different pin images, so days of 10 stops or more used to
// go to Mapbox. Now Apple draws only the map and the route, at the exact middle and span we
// framed (core mapView), and the pins are drawn here at the points the same Web Mercator
// projection puts them (core viewPoint), scaled to the image's pixels: any number of stops, and
// every column's image looks the same.

/** The pixel size of a PNG (from its IHDR), or null when it isn't one. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** The order pins are drawn in: the start under everything, the stop you're on on top. */
const LAYER: Record<PinTone, number> = { shop: 0, done: 1, todo: 2, current: 3 };

/**
 * Where each pin goes on an image of `size` points showing `view`, top-left corner and side in
 * points, in drawing order (the shop first, the stop you're on last).
 */
export function pinPlacements(
  pins: Omit<MapPin, "id">[],
  view: MapView,
  size: { w: number; h: number },
): { pin: Omit<MapPin, "id">; x: number; y: number; side: number }[] {
  return pins
    .map((pin, i) => ({ pin, i }))
    .sort((a, b) => LAYER[a.pin.tone] - LAYER[b.pin.tone] || a.i - b.i)
    .map(({ pin }) => {
      const at = viewPoint(pin.at, view, size);
      const side = pinImageSize(pin.tone, view.tier);
      return { pin, x: at.x - side / 2, y: at.y - side / 2, side };
    });
}

/**
 * The map image with the day's pins drawn on it: `image` is Apple's PNG of `size` points at
 * whatever scale it came in. Throws when the image isn't a PNG.
 */
export async function compositePins(input: {
  image: ArrayBuffer;
  size: { w: number; h: number };
  view: MapView;
  pins: Omit<MapPin, "id">[];
  color?: string | null;
  theme: "light" | "dark";
}): Promise<Response> {
  const bytes = new Uint8Array(input.image);
  const px = pngSize(bytes);
  if (!px) throw new Error("The map image isn’t a PNG");
  const k = px.w / input.size.w;
  const ky = px.h / input.size.h;
  const fonts = await pinFonts();
  const src = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  return new ImageResponse(
    <div style={{ display: "flex", position: "relative", width: px.w, height: px.h }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
      <img
        src={src}
        width={px.w}
        height={px.h}
        alt=""
        style={{ position: "absolute", left: 0, top: 0 }}
      />
      {pinPlacements(input.pins, input.view, input.size).map(({ pin, x, y, side }, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            position: "absolute",
            left: x * k,
            top: y * ky,
            width: side * k,
            height: side * k,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {pinBody(pinArtFor(pin, input.color, input.theme, input.view.tier), k)}
        </div>
      ))}
    </div>,
    { width: px.w, height: px.h, ...(fonts.length ? { fonts } : {}) },
  );
}
