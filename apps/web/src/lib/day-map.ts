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

/** The map image's address on this site (GET /api/map). */
export function mapSrc(
  company: string,
  pins: string,
  size: { w: number; h: number },
  theme: "light" | "dark" = "light",
): string {
  const q = new URLSearchParams({ company, pins, w: String(size.w), h: String(size.h) });
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
