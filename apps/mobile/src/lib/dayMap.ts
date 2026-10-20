import {
  JOB_LOCK_LABELS,
  LOCK_LABELS,
  dayMapPins,
  encodePins,
  jobLock,
  lockReason,
  type LatLng,
  type PlanJob,
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
  depot: LatLng | null;
  date: string;
  today: string;
}): { pins: string | null; located: number; missing: number } {
  const stops = input.stops.map((s) => ({
    id: s.id,
    location: s.location,
    done: !OPEN.has(s.status),
  }));
  const currentId = input.date === input.today ? (stops.find((s) => !s.done)?.id ?? null) : null;
  const { pins, missing } = dayMapPins({ stops, depot: input.depot, currentId });
  const located = pins.filter((p) => p.tone !== "shop").length;
  return { pins: located ? encodePins(pins) : null, located, missing };
}

/**
 * The map image's address on the website (GET /api/map), or null without a website. Dark
 * appearance asks for Mapbox's dark map (one image, never both), as the website's mapSrc.
 */
export function mapUrl(
  api: string | null,
  company: string,
  pins: string,
  size: { w: number; h: number },
  theme: "light" | "dark" = "light",
): string | null {
  if (!api) return null;
  const q = [
    `company=${encodeURIComponent(company)}`,
    `pins=${encodeURIComponent(pins)}`,
    `w=${size.w}`,
    `h=${size.h}`,
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

/**
 * What a card says about what keeps it in place: its lock ("Day locked", "Time locked",
 * "Locked", with a padlock), else "Two techs". A started job says nothing here (its status
 * does).
 */
export function lockTag(job: PlanJob): { label: string; icon: boolean } | null {
  const reason = lockReason(job);
  if (reason === "started") return null;
  const tag = JOB_LOCK_LABELS[jobLock(job)].tag;
  if (tag) return { label: tag, icon: true };
  if (reason === "two_techs") return { label: LOCK_LABELS.two_techs, icon: false };
  return null;
}
