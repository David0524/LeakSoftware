import { ImageResponse } from "next/og";
import { SPREAD } from "@leakbook/core";
import { parseLeaderDotName, parsePinImageName, pinImageSize } from "@/components/map-pins";
import { pinBody, pinFonts } from "@/server/pin-art";

// A map pin as a small PNG for the Mapbox map images (owner, 2026-10-22: the snapshot's own pins
// "look huge and cartoony"; 2026-10-23: "Bold tech-colored routes"): the live map's pin
// (server/pin-art.tsx), drawn at 2x for sharp edges. Mapbox fetches these while it draws an
// image, so they're public and kept for a year; they show nothing about a job. Apple's
// snapshots get the same pins drawn straight onto the image (server/map-composite.tsx).
// Names (components/map-pins.ts pinImageName): "todo-3-orange", "done-1-blue-dark",
// "current-2-green", "shop", "home"; older names without a color ("todo-3") are water blue.
// Each also comes smaller for zoomed-out or crowded images, still numbered (owner, 2026-10-24):
// "-m" (medium) and "-s" (small: "todo-3-orange-s", "shop-s"), at core routeTierStyle's sizes.
// "dot-orange" (and "-dark") is the small dot a moved pin's leader line ends at (core SPREAD).

const KEEP = { "cache-control": "public, max-age=31536000, immutable" };

export async function GET(_req: Request, ctx: { params: Promise<{ pin: string }> }) {
  const name = (await ctx.params).pin;
  const dot = parseLeaderDotName(name);
  if (dot) {
    const px = SPREAD.leaderDot * 2 + 2;
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
        <div
          style={{
            display: "flex",
            width: SPREAD.leaderDot * 2,
            height: SPREAD.leaderDot * 2,
            borderRadius: 9999,
            background: dot.hex,
            border: "2px solid #fff",
          }}
        />
      </div>,
      { width: px, height: px, headers: KEEP },
    );
  }
  const pin = parsePinImageName(name);
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
      headers: KEEP,
    },
  );
}
