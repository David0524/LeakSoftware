import { tokens } from "@leakbook/tokens";
import {
  ROUTE_STYLE,
  START_FROM_COPY,
  TECH_COLORS,
  routeColor,
  type LatLng,
  type PinTone,
} from "@leakbook/core";

// The live maps' pins, the same on Apple (MapKit JS) and Mapbox GL, and the colors the map
// images use (owner, 2026-10-23: "Bold tech-colored routes"): every stop in the tech's team
// color (core ROUTE_STYLE), done stops fainter, the stop you're on ringed in white and navy, the
// start as a navy house (labeled Home for someone who starts there), 44 pt to tap, and a ring on
// the selected stop. Client-safe.

/**
 * A route's color as hex: the tech's team color (brand/tokens.json › color.tech, the dark value
 * in dark mode), or water blue when no tech is known (core routeColor).
 */
export function routeHex(color: unknown, theme: "light" | "dark" = "light"): string {
  return tokens.color.tech[theme][routeColor(color)];
}

export interface LivePin {
  label: string;
  at: LatLng;
  tone: PinTone;
  /** The start pin of someone who starts from home: a house labeled "Home", never the street. */
  home?: true;
}

const NAVY = tokens.color.brand.navy;

const HOUSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>';

/**
 * A done stop's colors (core ROUTE_STYLE.doneTint): a light tint of the route's color (the dark
 * surface's in dark mode) ringed in that color, its number in the text color.
 */
export function donePin(
  route: string,
  theme: "light" | "dark" = "light",
): { fill: string; ring: string; text: string } {
  const role = tokens.color.role[theme];
  return { fill: mixHex(route, role.surface, ROUTE_STYLE.doneTint), ring: route, text: role.text };
}

/** The current page's appearance, for a live map's colors. */
export function pageTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** A live map's pin; `color` is the route's hex (routeHex). */
export function pinElement(pin: LivePin, color: string, onSelect: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.label = pin.label;
  el.dataset.tone = pin.tone;
  el.dataset.ring = color;
  el.setAttribute(
    "aria-label",
    pin.tone === "shop" ? (pin.home ? START_FROM_COPY.homePin : "The shop") : `Stop ${pin.label}`,
  );
  // 44 pt to tap; the visible dot inside is 34 (40 for the stop you're on, 28 for the start).
  el.style.cssText =
    "position:relative;width:44px;height:44px;display:grid;place-items:center;background:none;border:0;padding:0;cursor:pointer";
  const dot = document.createElement("span");
  const s = ROUTE_STYLE;
  const shadow = "0 1px 4px rgb(0 0 0/.35)";
  const base =
    "border-radius:9999px;display:grid;place-items:center;box-sizing:border-box;color:#fff;transition:transform .15s ease;";
  if (pin.tone === "shop")
    dot.style.cssText = `${base}width:${s.startPinSize}px;height:${s.startPinSize}px;background:${NAVY};border:2px solid #fff;box-shadow:${shadow}`;
  else if (pin.tone === "current") {
    // Larger, with a white ring and a navy ring outside it, so it stays distinct.
    const inner = s.currentPinSize - 2 * s.currentNavyRing;
    dot.style.cssText = `${base}width:${inner}px;height:${inner}px;background:${color};border:${s.currentWhiteRing}px solid #fff;box-shadow:0 0 0 ${s.currentNavyRing}px ${NAVY},${shadow};font:700 16px/1 system-ui,-apple-system,sans-serif`;
  } else if (pin.tone === "done") {
    // Quieter: a light tint ringed in the route's color, the number in the text color.
    const done = donePin(color, pageTheme());
    dot.style.cssText = `${base}width:${s.pinSize}px;height:${s.pinSize}px;background:${done.fill};color:${done.text};border:${s.pinEdge + 1}px solid ${done.ring};box-shadow:${shadow};font:700 15px/1 system-ui,-apple-system,sans-serif`;
  } else
    dot.style.cssText = `${base}width:${s.pinSize}px;height:${s.pinSize}px;background:${color};border:${s.pinEdge}px solid #fff;box-shadow:${shadow};font:700 15px/1 system-ui,-apple-system,sans-serif`;
  if (pin.tone === "shop") dot.innerHTML = HOUSE;
  else dot.textContent = pin.label;
  el.appendChild(dot);
  if (pin.tone === "shop" && pin.home) {
    // "Home" under the house (the button's label already says it to screen readers).
    const tag = document.createElement("span");
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = START_FROM_COPY.homePin;
    tag.style.cssText = `position:absolute;top:38px;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:9999px;background:#fff;color:${NAVY};font:600 11px/1.3 system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgb(0 0 0/.3);pointer-events:none`;
    el.appendChild(tag);
  }
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect();
  });
  return el;
}

/** Marks the selected stop's pin: larger, with a ring in the route's color. */
export function markSelected(pins: HTMLElement[], selected: string | null) {
  for (const el of pins) {
    const dot = el.firstElementChild as HTMLElement | null;
    const on = el.dataset.label === selected && selected !== "";
    el.setAttribute("aria-pressed", String(on));
    if (dot) {
      dot.style.transform = on ? "scale(1.2)" : "";
      dot.style.outline = on ? `3px solid ${el.dataset.ring ?? NAVY}` : "";
      dot.style.outlineOffset = on ? "2px" : "";
    }
    el.style.zIndex = on ? "2" : "";
  }
}

/** The route's line: the shop, the stops in order, and back to the shop. */
export function routeLine(pins: LivePin[]): LivePin[] {
  const shop = pins.find((p) => p.tone === "shop");
  const stops = pins.filter((p) => p.tone !== "shop");
  return [...(shop ? [shop] : []), ...stops, ...(shop && stops.length ? [shop] : [])];
}

// ---------------------------------------------------------------------------
// Pin images (GET /api/map/pin/<name>.png), for the map images Apple and Mapbox draw
// ---------------------------------------------------------------------------

/** The pin images' canvas, in points (drawn at 2x): the circle with room for its shadow. */
export function pinImageSize(tone: PinTone): number {
  if (tone === "shop") return ROUTE_STYLE.startPinSize;
  return (tone === "current" ? ROUTE_STYLE.currentPinSize : ROUTE_STYLE.pinSize) + 2;
}

/**
 * A pin image's name: "shop", "home", or "<tone>-<label>-<color>" with "-dark" in dark mode
 * ("todo-3-orange", "done-1-blue-dark"). Names from before tech colors ("todo-3") still draw,
 * in water blue.
 */
export function pinImageName(
  pin: { tone: PinTone; label: string; home?: true },
  color: unknown,
  theme: "light" | "dark" = "light",
): string {
  if (pin.tone === "shop") return pin.home ? "home" : "shop";
  return `${pin.tone}-${pin.label}-${routeColor(color)}${theme === "dark" ? "-dark" : ""}`;
}

const PIN_NAME = new RegExp(
  `^(?:(todo|current|done)-([1-9]\\d?)(?:-(${TECH_COLORS.map((c) => c.key).join("|")}))?(-dark)?|(shop|home))\\.png$`,
);

/** A pin image's file name read back ("todo-3-orange.png"), or null when it isn't one. */
export function parsePinImageName(file: string): {
  tone: PinTone;
  label: string;
  home: boolean;
  hex: string;
  dark: boolean;
} | null {
  const m = PIN_NAME.exec(file);
  if (!m) return null;
  if (m[5]) return { tone: "shop", label: "", home: m[5] === "home", hex: NAVY, dark: false };
  return {
    tone: m[1] as PinTone,
    label: m[2]!,
    home: false,
    hex: routeHex(m[3], m[4] ? "dark" : "light"),
    dark: !!m[4],
  };
}

/** `hex` at `strength` over `under` (both "#RRGGBB"). */
export function mixHex(hex: string, under: string, strength: number): string {
  const rgb = (h: string) => {
    const n = parseInt(h.replace("#", "").slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [a, b] = [rgb(hex), rgb(under)];
  const out = a.map((c, i) => Math.round(c * strength + b[i]! * (1 - strength)));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** A done stop's color on a plain marker (Mapbox's own markers, Apple's balloons), whose white
 * number needs a stronger color than the done pin's tint. */
const MARKER_DONE = 0.5;

/**
 * A pin's color where the pin is a plain balloon or marker (no image of our own): the start in
 * navy, stops in the route's color, done stops fainter (the color mixed with the surface).
 */
export function pinHex(tone: PinTone, color: unknown, theme: "light" | "dark" = "light"): string {
  if (tone === "shop") return NAVY;
  const route = routeHex(color, theme);
  return tone === "done" ? mixHex(route, tokens.color.role[theme].surface, MARKER_DONE) : route;
}
