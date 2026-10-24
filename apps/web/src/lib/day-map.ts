import {
  JOB_LOCK_LABELS,
  LOCK_LABELS,
  dayMapPins,
  encodePins,
  jobLock,
  routeColor,
  lockReason,
  type LatLng,
  type PlanJob,
  type RouteStartLabel,
} from "@leakbook/core";

// Day maps on Schedule (owner, 2026-10-20, docs/plans/route-maps.md): the map image's address
// and its words, shared by the day columns, the week's row of maps, and Enlarge. Client-safe.

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
  /** Where the day starts: the tech's start (home or the shop). */
  depot: LatLng | null;
  /** "home" draws the start as a house labeled Home. */
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

/** Bumped when map images are drawn differently, so browsers fetch the new drawing. */
export const MAP_IMAGE_VERSION = "2";

/**
 * The map image's address on this site (GET /api/map). `color` is the tech's team color (owner,
 * 2026-10-23: the route and pins in it); left out for water blue, the default.
 */
export function mapSrc(
  company: string,
  pins: string,
  size: { w: number; h: number },
  theme: "light" | "dark" = "light",
  color?: string | null,
): string {
  const q = new URLSearchParams({ company, pins, w: String(size.w), h: String(size.h) });
  // The drawing's version: images kept by browsers from before the 2026-10-24 framing (mixed
  // Apple and Mapbox, zoomed out) aren't reused.
  q.set("v", MAP_IMAGE_VERSION);
  const route = routeColor(color);
  if (route !== "blue") q.set("color", route);
  if (theme === "dark") q.set("theme", "dark");
  return `/api/map?${q.toString()}`;
}

const stopsWord = (n: number) => `${n} ${n === 1 ? "stop" : "stops"}`;

/** "Map of Priya Shah's stops on Monday: 5 stops". */
export function mapAlt(tech: string, day: string, stops: number): string {
  return `Map of ${tech}’s stops on ${day}: ${stopsWord(stops)}`;
}

/** The line under a map when some stops have no map location, else null. */
export function missingNote(missing: number): string | null {
  if (missing <= 0) return null;
  return missing === 1 ? "1 stop isn’t on the map" : `${missing} stops aren’t on the map`;
}

/** "Monday", from "2026-10-19". */
export function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/**
 * What keeps a card's job in place: its lock (shown as an icon, read as "Day locked", "Time
 * locked" or "Locked"), else "Two techs". A started job says nothing here (its status
 * does).
 */
export function lockTag(
  job: PlanJob,
): { label: string; kind: "day" | "time" | "both" | "two_techs" } | null {
  const reason = lockReason(job);
  if (reason === "started") return null;
  const lock = jobLock(job);
  const tag = JOB_LOCK_LABELS[lock].tag;
  if (tag && lock !== "none") return { label: tag, kind: lock };
  if (reason === "two_techs") return { label: LOCK_LABELS.two_techs, kind: "two_techs" };
  return null;
}
