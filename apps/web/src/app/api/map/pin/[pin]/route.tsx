import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ROUTE_STYLE } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { donePin, parsePinImageName, pinImageSize } from "@/components/map-pins";

// A map pin as a small PNG for the map images (owner, 2026-10-22: the snapshot's own pins "look
// huge and cartoony"; 2026-10-23: "Bold tech-colored routes"): the live map's pin, drawn at 2x
// for sharp edges. A stop is a 34 pt circle in the tech's color with a white number and edge; a
// done stop a light tint of it, ringed in it, numbered in the text color; the stop you're on 40 pt, with a white ring and a navy
// ring outside it; the start a 28 pt navy circle with a house. Apple and Mapbox fetch these while
// they draw an image, so they're public and kept for a year; they show nothing about a job.
// Names (components/map-pins.ts pinImageName): "todo-3-orange", "done-1-blue-dark",
// "current-2-green", "shop", "home"; older names without a color ("todo-3") are water blue.

const SHADOW = "0 1px 3px rgba(0,0,0,0.35)";

/** The numbers in the brand's display face, bold, as the stop numbers on the page; the default
 * face if the file can't be read (the pin still draws). */
const display = readFile(
  join(process.cwd(), "../../brand/fonts/BarlowSemiCondensed-Bold.ttf"),
).catch(() => null);

export async function GET(_req: Request, ctx: { params: Promise<{ pin: string }> }) {
  const pin = parsePinImageName((await ctx.params).pin);
  if (!pin) return new Response("Not found", { status: 404 });
  const px = pinImageSize(pin.tone) * 2;
  const s = ROUTE_STYLE;
  let body;
  if (pin.tone === "shop") {
    body = (
      <div
        style={{
          display: "flex",
          width: px - 4,
          height: px - 4,
          borderRadius: 9999,
          border: "4px solid #fff",
          background: pin.hex,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: SHADOW,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 11l8-7 8 7" />
          <path d="M6 10v10h12V10" />
        </svg>
      </div>
    );
  } else if (pin.tone === "current") {
    // A navy ring, then a white ring, then the tech's color.
    const outer = s.currentPinSize * 2;
    body = (
      <div
        style={{
          display: "flex",
          width: outer,
          height: outer,
          borderRadius: 9999,
          background: tokens.color.brand.navy,
          padding: s.currentNavyRing * 2,
          boxShadow: SHADOW,
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            borderRadius: 9999,
            border: `${s.currentWhiteRing * 2}px solid #fff`,
            background: pin.hex,
            color: "#fff",
            alignItems: "center",
            justifyContent: "center",
            fontSize: pin.label.length > 1 ? 32 : 36,
            fontWeight: 700,
          }}
        >
          {pin.label}
        </div>
      </div>
    );
  } else {
    const size = s.pinSize * 2;
    const done = pin.tone === "done" ? donePin(pin.hex, pin.dark ? "dark" : "light") : null;
    body = (
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          borderRadius: 9999,
          border: done
            ? `${(s.pinEdge + 1) * 2}px solid ${done.ring}`
            : `${s.pinEdge * 2}px solid #fff`,
          background: done?.fill ?? pin.hex,
          color: done?.text ?? "#fff",
          alignItems: "center",
          justifyContent: "center",
          fontSize: pin.label.length > 1 ? 30 : 34,
          fontWeight: 700,
          boxShadow: SHADOW,
        }}
      >
        {pin.label}
      </div>
    );
  }
  const font = await display;
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
      {body}
    </div>,
    {
      width: px,
      height: px,
      ...(font
        ? { fonts: [{ name: "Barlow Semi Condensed", data: font, weight: 700 as const }] }
        : {}),
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  );
}
