import { routeTierStyle, type PinTone, type RouteTier } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { donePin, routeHex } from "@/components/map-pins";

// A day map's pin as drawn on the map images (owner, 2026-10-22: the snapshot's own pins "look
// huge and cartoony"; 2026-10-23: "Bold tech-colored routes"): the live map's pin. A stop is a
// circle in the tech's color with a white number and edge; a done stop a light tint of it,
// ringed in it, numbered in the text color; the stop you're on larger, with a white ring and a
// navy ring outside it; the start a navy circle with a house. At each image size tier (core
// routeTierStyle), every one numbered (owner, 2026-10-24: "the stops aren't numbered"). Drawn by next/og (Satori), both as the small
// pin images Mapbox fetches (api/map/pin) and straight onto Apple's snapshots
// (map-composite.tsx), so every image's pins are the same.

const SHADOW = "0 1px 3px rgba(0,0,0,0.35)";

export interface PinArt {
  tone: PinTone;
  label: string;
  /** The route's color as hex (the start is always navy). */
  hex: string;
  dark: boolean;
  tier: RouteTier;
}

/** A pin's art for `pin` on a map in the tech's `color` (a palette key) and `theme`. */
export function pinArtFor(
  pin: { tone: PinTone; label: string },
  color: unknown,
  theme: "light" | "dark",
  tier: RouteTier,
): PinArt {
  return {
    tone: pin.tone,
    label: pin.label,
    hex: pin.tone === "shop" ? tokens.color.brand.navy : routeHex(color, theme),
    dark: theme === "dark",
    tier,
  };
}

/** The pin's circle, `k` pixels a point (2 for a pin image drawn at 2x). */
export function pinBody(pin: PinArt, k: number) {
  const s = routeTierStyle(pin.tier);
  // The numbers (and the start's house) scale with the pin, in the brand's display face, a
  // little larger for its size on the smaller pins so they still read (34 → 34 and 30 px at 2x
  // for one and two digits; the stop you're on 40 → 36 and 32; the smallest, 22, → 27 and 25).
  const num = (size: number, label: string, current = false) =>
    Math.round(
      size *
        k *
        ((label.length > 1 ? (current ? 0.4 : 0.44) : current ? 0.45 : 0.5) +
          Math.max(0, (34 - size) / 100)),
    );
  if (pin.tone === "shop")
    return (
      <div
        style={{
          display: "flex",
          width: (s.startPinSize - 2) * k,
          height: (s.startPinSize - 2) * k,
          borderRadius: 9999,
          border: `${Math.min(2, s.pinEdge + 0.5) * k}px solid #fff`,
          background: pin.hex,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: SHADOW,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={Math.round(s.startPinSize * k * 0.54)}
          height={Math.round(s.startPinSize * k * 0.54)}
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
  if (pin.tone === "current") {
    // A navy ring, then a white ring, then the tech's color.
    const outer = s.currentPinSize * k;
    return (
      <div
        style={{
          display: "flex",
          width: outer,
          height: outer,
          borderRadius: 9999,
          background: tokens.color.brand.navy,
          padding: s.currentNavyRing * k,
          boxShadow: SHADOW,
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            borderRadius: 9999,
            border: `${s.currentWhiteRing * k}px solid #fff`,
            background: pin.hex,
            color: "#fff",
            alignItems: "center",
            justifyContent: "center",
            fontSize: num(s.currentPinSize, pin.label, true),
            fontWeight: 700,
          }}
        >
          {pin.label}
        </div>
      </div>
    );
  }
  const size = s.pinSize * k;
  const done = pin.tone === "done" ? donePin(pin.hex, pin.dark ? "dark" : "light") : null;
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: 9999,
        border: done
          ? `${(s.pinEdge + 1) * k}px solid ${done.ring}`
          : `${s.pinEdge * k}px solid #fff`,
        background: done?.fill ?? pin.hex,
        color: done?.text ?? "#fff",
        alignItems: "center",
        justifyContent: "center",
        fontSize: num(s.pinSize, pin.label),
        fontWeight: 700,
        boxShadow: SHADOW,
      }}
    >
      {pin.label}
    </div>
  );
}

/** The numbers in the brand's display face, bold, as the stop numbers on the page; the default
 * face if the file can't be read (the pin still draws). */
let font: Promise<Buffer | null> | null = null;
export function pinFonts(): Promise<
  { name: string; data: Buffer; weight: 700; style: "normal" }[]
> {
  font ??= import("node:fs/promises")
    .then(({ readFile }) =>
      readFile(`${process.cwd()}/../../brand/fonts/BarlowSemiCondensed-Bold.ttf`),
    )
    .catch(() => null);
  return font.then((data) =>
    data
      ? [{ name: "Barlow Semi Condensed", data, weight: 700 as const, style: "normal" as const }]
      : [],
  );
}
