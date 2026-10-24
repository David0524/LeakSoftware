import { ImageResponse } from "next/og";
import { parsePinImageName, pinImageSize } from "@/components/map-pins";
import { pinBody, pinFonts } from "@/server/pin-art";

// A map pin as a small PNG for the Mapbox map images (owner, 2026-10-22: the snapshot's own pins
// "look huge and cartoony"; 2026-10-23: "Bold tech-colored routes"): the live map's pin
// (server/pin-art.tsx), drawn at 2x for sharp edges. Mapbox fetches these while it draws an
// image, so they're public and kept for a year; they show nothing about a job. Apple's
// snapshots get the same pins drawn straight onto the image (server/map-composite.tsx).
// Names (components/map-pins.ts pinImageName): "todo-3-orange", "done-1-blue-dark",
// "current-2-green", "shop", "home"; older names without a color ("todo-3") are water blue.
// Each also comes smaller for zoomed-out or crowded images: "-m" (medium, still numbered) and
// "-s" (a small dot with no number: "todo-orange-s", "shop-s"), at core routeTierStyle's sizes.

export async function GET(_req: Request, ctx: { params: Promise<{ pin: string }> }) {
  const pin = parsePinImageName((await ctx.params).pin);
  if (!pin) return new Response("Not found", { status: 404 });
  const px = pinImageSize(pin.tone, pin.tier) * 2;
  const fonts = await pinFonts();
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: px,
        height: px,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {pinBody(pin, 2)}
    </div>,
    {
      width: px,
      height: px,
      ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  );
}
