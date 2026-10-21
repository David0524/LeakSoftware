// A day's map on Schedule and Today (owner, 2026-10-20, docs/plans/route-maps.md: "the maps up
// top for route building"): the shop and each stop as a numbered pin, in route order. The
// website and Android draw it as a map image from the server (GET /api/map?pins=…), the iPhone
// with Apple Maps; all three number and color the pins by this rule.

import type { LatLng } from "./routing";
import type { RouteStartLabel } from "./route-start";

export type PinTone = "shop" | "todo" | "current" | "done";

export interface MapPin {
  /** "1", "2", … (the stop's place in the day, unlocated stops counted), or "" for the shop. */
  label: string;
  at: LatLng;
  tone: PinTone;
  /** The stop's job (none for the shop). */
  id: string | null;
  /**
   * On the start pin (tone "shop") of someone who starts from home: drawn as a house labeled
   * "Home" (START_FROM_COPY.homePin), never the street.
   */
  home?: true;
}

/** Most pins one map shows (the map image's address has a length limit). */
export const MAP_PIN_LIMIT = 60;

/**
 * Pins for a day: the start (the shop, or home for someone who starts there), then each located stop numbered by its place in the day (so the
 * numbers match the list), toned done, current (the stop you're on), or still to do. `missing`
 * counts stops with no map location, shown under the map instead of guessed.
 */
export function dayMapPins(input: {
  stops: { id: string; location: LatLng | null; done: boolean }[];
  /** Where the day starts: the tech's start (startFor(…).at), or the shop. */
  depot: LatLng | null;
  /** startFor(…).label: "home" draws the start as Home. */
  startLabel?: RouteStartLabel | null;
  currentId?: string | null;
}): { pins: MapPin[]; missing: number } {
  const pins: MapPin[] = [];
  if (input.depot)
    pins.push(
      input.startLabel === "home"
        ? { label: "", at: input.depot, tone: "shop", id: null, home: true }
        : { label: "", at: input.depot, tone: "shop", id: null },
    );
  let missing = 0;
  input.stops.forEach((s, i) => {
    if (!s.location) {
      missing += 1;
      return;
    }
    pins.push({
      label: String(i + 1),
      at: s.location,
      tone: s.done ? "done" : s.id === input.currentId ? "current" : "todo",
      id: s.id,
    });
  });
  return { pins: pins.slice(0, MAP_PIN_LIMIT), missing };
}

const TONE_CODE: Record<PinTone, string> = { shop: "s", todo: "t", current: "c", done: "d" };
const CODE_TONE = Object.fromEntries(
  Object.entries(TONE_CODE).map(([k, v]) => [v, k as PinTone]),
) as Record<string, PinTone>;

/** A home start pin's code ("h:33.4,-111.8"); it decodes as the start pin with `home`. */
const HOME_CODE = "h";

/** The pins as the map address's `pins` value: "s:33.45,-112.07;t1:33.5,-112.1;…". */
export function encodePins(pins: MapPin[]): string {
  return pins
    .map(
      (p) =>
        `${p.home && p.tone === "shop" ? HOME_CODE : TONE_CODE[p.tone]}${p.label}:${p.at.lat.toFixed(5)},${p.at.lng.toFixed(5)}`,
    )
    .join(";");
}

/** The pins back from the address, or null when it isn't valid. */
export function decodePins(value: string): Omit<MapPin, "id">[] | null {
  if (!value || value.length > 4000) return null;
  const out: Omit<MapPin, "id">[] = [];
  for (const part of value.split(";")) {
    const m = /^([stcdh])(\d{0,3}):(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/.exec(part);
    if (!m) return null;
    const lat = Number(m[3]);
    const lng = Number(m[4]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (m[1] === HOME_CODE && m[2]) return null;
    if (m[1] === HOME_CODE) out.push({ tone: "shop", label: m[2]!, at: { lat, lng }, home: true });
    else out.push({ tone: CODE_TONE[m[1]!]!, label: m[2]!, at: { lat, lng } });
  }
  return out.length && out.length <= MAP_PIN_LIMIT ? out : null;
}
