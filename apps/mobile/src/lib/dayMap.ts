import {
  JOB_LOCK_LABELS,
  LOCK_LABELS,
  dayMapPins,
  encodePins,
  jobLock,
  lockReason,
  routeColor,
  type LatLng,
  type PlanJob,
  type RouteStartLabel,
} from "@leakbook/core";

// Day maps on Schedule (owner, 2026-10-20, docs/plans/route-maps.md), the website's
// lib/day-map.ts on the phone: the map image's address and its words. The image comes from the
// website's GET /api/map (never from Mapbox directly: the shop's allowance lives on the server).
// Pure, so it's tested without a phone.

/** Statuses still to do on the day (a stop is done once its report, quote or invoice is). */
const OPEN = new Set(["unscheduled", "scheduled", "in_progress"]);

export interface MapStop {
  id: string;
  location: LatLng | null;
  status: string;
}

/**
 * A day's map: the encoded pins (null when no stop has a map location) and how many stops
 * aren't on it. On today, the first stop not done is the one you're on.
 */
export function dayMap(input: {
  stops: MapStop[];
  /** Where the day starts: the tech's start (startFor(…).at), or the shop. */
  depot: LatLng | null;
  /** "home" draws the start pin as a house labeled Home (never the street). */
  startLabel?: RouteStartLabel | null;
  date: string;
  today: string;
}): { pins: string | null; located: number; missing: number } {
  const stops = input.stops.map((s) => ({
    id: s.id,
    location: s.location,
    done: !OPEN.has(s.status),
  }));
  const currentId = input.date === input.today ? (stops.find((s) => !s.done)?.id ?? null) : null;
  const { pins, missing } = dayMapPins({
    stops,
    depot: input.depot,
    startLabel: input.startLabel,
    currentId,
  });
  const located = pins.filter((p) => p.tone !== "shop").length;
  return { pins: located ? encodePins(pins) : null, located, missing };
}

/**
 * The map image's address on the website (GET /api/map), or null without a website. Dark
 * appearance asks for Mapbox's dark map (one image, never both), as the website's mapSrc.
 * `color` is the tech's team color (owner, 2026-10-23: the route and pins in it); left out for
 * water blue, the default.
 */
export function mapUrl(
  api: string | null,
  company: string,
  pins: string,
  size: { w: number; h: number },
  theme: "light" | "dark" = "light",
  color?: string | null,
): string | null {
  if (!api) return null;
  const route = routeColor(color);
  const q = [
    `company=${encodeURIComponent(company)}`,
    `pins=${encodeURIComponent(pins)}`,
    `w=${size.w}`,
    `h=${size.h}`,
    // The drawing's version, as the website's mapSrc (2026-10-24: framed by us, Apple for every
    // day; 3: every stop numbered, crowded pins spread apart), so images kept from before
    // aren't reused.
    "v=3",
    ...(route !== "blue" ? [`color=${route}`] : []),
    ...(theme === "dark" ? ["theme=dark"] : []),
  ].join("&");
  return `${api}/api/map?${q}`;
}

const stopsWord = (n: number) => `${n} ${n === 1 ? "stop" : "stops"}`;

/** "Map of Priya Shah’s stops on Monday: 5 stops". */
export function mapAlt(tech: string, day: string, stops: number): string {
  return `Map of ${tech}’s stops on ${day}: ${stopsWord(stops)}`;
}

/** The Map row's detail when the map is folded away: "5 stops". */
export function stopsLabel(n: number): string {
  return stopsWord(n);
}

/** The line under a map when some stops have no map location, else null. */
export function missingNote(missing: number): string | null {
  if (missing <= 0) return null;
  return missing === 1 ? "1 stop isn’t on the map" : `${missing} stops aren’t on the map`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday", from "2026-10-19". */
export function weekdayName(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "";
}

/** What keeps a stop in place, as its card shows it. */
export type LockTagKind = "day" | "time" | "both" | "two_techs";

/**
 * What a card shows about what keeps it in place (the website's day-map.ts): its lock as an
 * icon read aloud as "Day locked", "Time locked" or "Locked", else the words "Two techs". A
 * started job says nothing here (its status does).
 */
export function lockTag(job: PlanJob): { label: string; kind: LockTagKind } | null {
  const reason = lockReason(job);
  if (reason === "started") return null;
  const lock = jobLock(job);
  const tag = JOB_LOCK_LABELS[lock].tag;
  if (tag && lock !== "none") return { label: tag, kind: lock };
  if (reason === "two_techs") return { label: LOCK_LABELS.two_techs, kind: "two_techs" };
  return null;
}
