import { tokens } from "@leakbook/tokens";
import {
  ROUTE_STYLE,
  ROUTE_ZOOM,
  START_FROM_COPY,
  TECH_COLORS,
  decodePolyline,
  encodePins,
  joinLegs,
  pinSizeAt,
  routeColor,
  routeOrder,
  routeStyleAt,
  routeTierStyle,
  zoomForSpan,
  type LatLng,
  type PinTone,
  type RouteSizes,
  type RouteTier,
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

/**
 * A live map's pin; `color` is the route's hex (routeHex), `sizes` the route's sizes at the map's
 * zoom (core routeStyleAt; ROUTE_STYLE's when left out). stylePin redraws it as the map zooms.
 */
export function pinElement(
  pin: LivePin,
  color: string,
  onSelect: () => void,
  sizes: RouteSizes = routeStyleAt(ROUTE_ZOOM.full),
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.label = pin.label;
  el.dataset.tone = pin.tone;
  el.dataset.ring = color;
  if (pin.home) el.dataset.home = "";
  el.setAttribute(
    "aria-label",
    pin.tone === "shop" ? (pin.home ? START_FROM_COPY.homePin : "The shop") : `Stop ${pin.label}`,
  );
  // 44 pt to tap at every zoom; the visible dot inside is 34 zoomed in (40 for the stop you're
  // on, 28 for the start), down to small dots zoomed out.
  el.style.cssText =
    "position:relative;width:44px;height:44px;display:grid;place-items:center;background:none;border:0;padding:0;cursor:pointer";
  el.appendChild(document.createElement("span"));
  if (pin.tone === "shop" && pin.home) {
    // "Home" under the house (the button's label already says it to screen readers).
    const tag = document.createElement("span");
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = START_FROM_COPY.homePin;
    tag.style.cssText = `position:absolute;top:38px;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:9999px;background:#fff;color:${NAVY};font:600 11px/1.3 system-ui,-apple-system,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgb(0 0 0/.3);pointer-events:none`;
    el.appendChild(tag);
  }
  stylePin(el, sizes);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect();
  });
  return el;
}

/**
 * Draws a live pin at the route's sizes for the map's zoom (owner, 2026-10-23: smaller dots when
 * zoomed out): its number only while it's large enough to read, the stop you're on still larger
 * and ringed. Keeps the selection's ring.
 */
export function stylePin(el: HTMLElement, sizes: RouteSizes) {
  const dot = el.firstElementChild as HTMLElement | null;
  if (!dot) return;
  const tone = el.dataset.tone as PinTone;
  const color = el.dataset.ring ?? NAVY;
  const s = sizes;
  const key = `${s.pinSize}/${s.currentPinSize}/${s.startPinSize}`;
  if (dot.dataset.sizes === key) return;
  dot.dataset.sizes = key;
  const keep = {
    transform: dot.style.transform,
    outline: dot.style.outline,
    offset: dot.style.outlineOffset,
  };
  const shadow = s.numbers ? "0 1px 4px rgb(0 0 0/.35)" : "0 1px 2px rgb(0 0 0/.35)";
  const base =
    "border-radius:9999px;display:grid;place-items:center;box-sizing:border-box;color:#fff;transition:transform .15s ease;";
  const font = (px: number) =>
    `font:700 ${Math.round(px * 0.44 * 10) / 10}px/1 system-ui,-apple-system,sans-serif`;
  if (tone === "shop")
    dot.style.cssText = `${base}width:${s.startPinSize}px;height:${s.startPinSize}px;background:${NAVY};border:${s.numbers ? 2 : s.pinEdge}px solid #fff;box-shadow:${shadow}`;
  else if (tone === "current") {
    // Larger, with a white ring and a navy ring outside it, so it stays distinct.
    const inner = s.currentPinSize - 2 * s.currentNavyRing;
    dot.style.cssText = `${base}width:${inner}px;height:${inner}px;background:${color};border:${s.currentWhiteRing}px solid #fff;box-shadow:0 0 0 ${s.currentNavyRing}px ${NAVY},${shadow};${font(s.currentPinSize)}`;
  } else if (tone === "done") {
    // Quieter: a light tint ringed in the route's color, the number in the text color.
    const done = donePin(color, pageTheme());
    dot.style.cssText = `${base}width:${s.pinSize}px;height:${s.pinSize}px;background:${done.fill};color:${done.text};border:${s.pinEdge + 1}px solid ${done.ring};box-shadow:${shadow};${font(s.pinSize)}`;
  } else
    dot.style.cssText = `${base}width:${s.pinSize}px;height:${s.pinSize}px;background:${color};border:${s.pinEdge}px solid #fff;box-shadow:${shadow};${font(s.pinSize)}`;
  if (tone === "shop") dot.innerHTML = s.numbers ? HOUSE : "";
  else dot.textContent = s.numbers ? (el.dataset.label ?? "") : "";
  dot.style.transform = keep.transform;
  dot.style.outline = keep.outline;
  dot.style.outlineOffset = keep.offset;
  // The Home tag sits just under the house at every size.
  const tag = el.children[1] as HTMLElement | undefined;
  if (tag) tag.style.top = `${22 + s.startPinSize / 2 + 2}px`;
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

/** The route's line: the shop, the stops in order, and back to the shop (core routeOrder). */
export function routeLine(pins: LivePin[]): LivePin[] {
  return routeOrder(pins);
}

// ---------------------------------------------------------------------------
// Pin images (GET /api/map/pin/<name>.png), for the map images Apple and Mapbox draw
// ---------------------------------------------------------------------------

/**
 * The pin images' canvas, in points (drawn at 2x): the circle with room for its shadow, at the
 * image's size tier (owner, 2026-10-23: smaller when zoomed out; core imageTier).
 */
export function pinImageSize(tone: PinTone, tier: RouteTier = "full"): number {
  const size = pinSizeAt(tone, routeTierStyle(tier));
  return Math.ceil(tone === "shop" ? size : size + 2);
}

const TIER_CODE: Record<RouteTier, string> = { full: "", medium: "-m", small: "-s" };

/**
 * A pin image's name: "shop", "home", or "<tone>-<label>-<color>" with "-dark" in dark mode
 * ("todo-3-orange", "done-1-blue-dark"), then "-m" at the medium size; at the small size a dot
 * with no number, so no label ("todo-orange-s", "shop-s"). Names from before tech colors
 * ("todo-3") still draw, in water blue.
 */
export function pinImageName(
  pin: { tone: PinTone; label: string; home?: true },
  color: unknown,
  theme: "light" | "dark" = "light",
  tier: RouteTier = "full",
): string {
  if (pin.tone === "shop") return `${pin.home ? "home" : "shop"}${TIER_CODE[tier]}`;
  const label = tier === "small" ? "" : `-${pin.label}`;
  return `${pin.tone}${label}-${routeColor(color)}${theme === "dark" ? "-dark" : ""}${TIER_CODE[tier]}`;
}

const PIN_NAME = new RegExp(
  `^(?:(todo|current|done)(?:-([1-9]\\d?))?(?:-(${TECH_COLORS.map((c) => c.key).join("|")}))?(-dark)?|(shop|home))(-m|-s)?\\.png$`,
);

/** A pin image's file name read back ("todo-3-orange.png"), or null when it isn't one. */
export function parsePinImageName(file: string): {
  tone: PinTone;
  label: string;
  home: boolean;
  hex: string;
  dark: boolean;
  tier: RouteTier;
} | null {
  const m = PIN_NAME.exec(file);
  if (!m) return null;
  const tier: RouteTier = m[6] === "-s" ? "small" : m[6] === "-m" ? "medium" : "full";
  if (m[5]) return { tone: "shop", label: "", home: m[5] === "home", hex: NAVY, dark: false, tier };
  // A number on every size but the small dot, which has none.
  if (tier === "small" ? m[2] : !m[2]) return null;
  return {
    tone: m[1] as PinTone,
    label: m[2] ?? "",
    home: false,
    hex: routeHex(m[3], m[4] ? "dark" : "light"),
    dark: !!m[4],
    tier,
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

// ---------------------------------------------------------------------------
// The route along the roads, for the live maps (owner, 2026-10-23)
// ---------------------------------------------------------------------------

/**
 * The day's route along the roads from this site (GET /api/map/path): each leg's road path from
 * `provider` (Apple's paths on MapKit JS, Mapbox's on Mapbox GL), or straight where there's none
 * yet. Null when it can't be had: the live map keeps its straight line.
 */
export async function fetchRoutePath(
  company: string,
  pins: LivePin[],
  provider: "apple" | "mapbox",
  signal?: AbortSignal,
): Promise<LatLng[] | null> {
  try {
    const q = new URLSearchParams({
      company,
      pins: encodePins(pins.map((p) => ({ ...p, id: null }))),
      provider,
    });
    const res = await fetch(`/api/map/path?${q.toString()}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { legs?: unknown };
    if (!Array.isArray(body.legs)) return null;
    const legs = body.legs.map((l) => (typeof l === "string" ? decodePolyline(l) : null));
    if (legs.some((l) => !l)) return null;
    const line = joinLegs(legs as LatLng[][]);
    return line.length > 1 ? line : null;
  } catch {
    return null;
  }
}

/** The route's sizes at a live map's zoom: its span across (degrees) on `width` points. */
export function liveRouteSizes(lngDelta: number, width: number): RouteSizes {
  return routeStyleAt(zoomForSpan(lngDelta, width));
}
