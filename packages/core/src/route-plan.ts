// Turning a shop's jobs into routes and back (routing, owner request 2026-10-13). Pure: the
// server loads the jobs and drive times, these functions decide the stops, what planning may
// move, and the rows to save.

import { formatAddress, zonedTimeToIso } from "./forms";
import type { Job, Property } from "./models";
import {
  clockToMinutes,
  minutesToClock,
  type LatLng,
  type RouteStop,
  type TimedRoute,
  type WorkDay,
} from "./routing";
import { dateFormat } from "./intl";

// ---------------------------------------------------------------------------
// Settings › Scheduling
// ---------------------------------------------------------------------------

export interface RoutingSettings {
  /** Techs leave the shop ("08:00"). */
  dayStart: string;
  /** Back at the shop by ("17:00"). */
  dayEnd: string;
  /** Arrival window customers are told, in minutes; 0 = an exact time. */
  windowMin: number;
  /** How long a job takes when it has no end time. */
  jobMinutes: number;
  /** Days suggestions may use (0 = Sunday … 6 = Saturday). */
  workDays: number[];
}

export const ROUTING_DEFAULTS: RoutingSettings = {
  dayStart: "08:00",
  dayEnd: "17:00",
  windowMin: 0,
  jobMinutes: 150,
  workDays: [1, 2, 3, 4, 5],
};

export const ARRIVAL_WINDOWS = [0, 60, 120, 240] as const;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The shop's scheduling settings from company.settings.routing, with defaults filled in. */
export function routingSettings(settings: unknown): RoutingSettings {
  const raw = ((settings as { routing?: Record<string, unknown> } | null)?.routing ?? {}) as Record<
    string,
    unknown
  >;
  const clock = (v: unknown, fallback: string) =>
    typeof v === "string" && CLOCK.test(v) ? v : fallback;
  const dayStart = clock(raw.day_start, ROUTING_DEFAULTS.dayStart);
  let dayEnd = clock(raw.day_end, ROUTING_DEFAULTS.dayEnd);
  if (clockToMinutes(dayEnd) <= clockToMinutes(dayStart)) dayEnd = ROUTING_DEFAULTS.dayEnd;
  const window = Number(raw.arrival_window_minutes);
  const minutes = Number(raw.job_minutes);
  const days = Array.isArray(raw.work_days)
    ? [
        ...new Set(
          raw.work_days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ]
    : null;
  return {
    dayStart,
    dayEnd,
    windowMin: (ARRIVAL_WINDOWS as readonly number[]).includes(window) ? window : 0,
    jobMinutes: Number.isInteger(minutes) && minutes >= 15 && minutes <= 720 ? minutes : 150,
    workDays: days && days.length ? days.sort() : ROUTING_DEFAULTS.workDays,
  };
}

export function workDay(s: RoutingSettings): WorkDay {
  return { startMin: clockToMinutes(s.dayStart), endMin: clockToMinutes(s.dayEnd) };
}

/** Day of the week for "2026-10-13" (0 = Sunday). */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/** Minutes after midnight, in the shop's time zone, of an instant. */
export function localMinutes(iso: string, timeZone: string): number {
  const parts = dateFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

type Located = Pick<Property, "latitude" | "longitude">;

export function propertyLocation(p: Located | null | undefined): LatLng | null {
  return p && p.latitude != null && p.longitude != null
    ? { lat: p.latitude, lng: p.longitude }
    : null;
}

/** An address the routing service suggests as it's typed (Mapbox, temporary). */
export interface AddressSuggestion {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  /** The whole address, for the list ("123 Main St, Phoenix, Arizona 85001"). */
  label: string;
}

/** What the "not on the map" warning says, everywhere it shows (owner, 2026-10-20). */
export const NOT_ON_MAP = {
  title: "Not found on the map",
  detail:
    "Routes and drive times leave this stop out until its address is found. Check the address, pick one of the suggestions as you type it, or mark the spot at the pool.",
  short: "Not on map",
} as const;

/**
 * Whether a pool's address was found on the map (owner, 2026-10-20: "we need an indicator for
 * when address doesn't register"): "found" when it has coordinates for its current address,
 * "missing" when it has an address but no coordinates for it (not found, or changed since),
 * null when there's no address or no routing service to look it up with.
 */
export function mapStatus(
  p:
    | (Pick<Property, "address_line1" | "city" | "state" | "postal_code"> &
        Located & { geocoded_address?: string | null })
    | null
    | undefined,
  routing: boolean,
): "found" | "missing" | null {
  if (!p || !routing) return null;
  const address = formatAddress(p);
  if (!p.address_line1?.trim() || !address) return null;
  const located = propertyLocation(p) !== null;
  // Pools located before lookups were kept with their address count as found.
  if (located && (p.geocoded_address == null || p.geocoded_address === address)) return "found";
  return "missing";
}

// ---------------------------------------------------------------------------
// Jobs as stops
// ---------------------------------------------------------------------------

export type PlanJob = Pick<
  Job,
  | "id"
  | "status"
  | "assigned_user_id"
  | "second_tech_id"
  | "scheduled_start"
  | "scheduled_end"
  | "route_order"
  | "arrival_fixed"
  | "lock_day"
  | "lock_time"
> & { property: Located | null };

export type LockReason = "fixed" | "time" | "started" | "two_techs";

export const LOCK_LABELS: Record<LockReason, string> = {
  fixed: "Locked",
  time: "Time locked",
  started: "Started",
  two_techs: "Two techs",
};

/** A job's locks (owner, 2026-10-20: "locks for jobs whether that's day, time, or both"). */
export type JobLock = "none" | "day" | "time" | "both";

export const JOB_LOCKS: JobLock[] = ["none", "day", "time", "both"];

/** The lock picker's segments, and what a locked card says. */
export const JOB_LOCK_LABELS: Record<JobLock, { segment: string; tag: string | null }> = {
  none: { segment: "None", tag: null },
  day: { segment: "Day", tag: "Day locked" },
  time: { segment: "Time", tag: "Time locked" },
  both: { segment: "Both", tag: "Locked" },
};

/** What each lock keeps, for the picker's footnote. */
export const JOB_LOCK_HELP: Record<JobLock, string> = {
  none: "Planning may move it to another day and time.",
  day: "Stays on its day. Planning may change its time that day.",
  time: "Keeps its time. Planning may move it to another day at that time.",
  both: "Stays on its day and time.",
};

/** Which lock a job has. A job saved before locks with a fixed time is locked both ways. */
export function jobLock(
  job: Partial<Pick<Job, "lock_day" | "lock_time" | "arrival_fixed">>,
): JobLock {
  const day = !!job.lock_day || !!job.arrival_fixed;
  const time = !!job.lock_time || !!job.arrival_fixed;
  return day && time ? "both" : day ? "day" : time ? "time" : "none";
}

/** The columns a lock sets. */
export function lockColumns(lock: JobLock): {
  lock_day: boolean;
  lock_time: boolean;
  arrival_fixed: boolean;
} {
  const lock_day = lock === "day" || lock === "both";
  const lock_time = lock === "time" || lock === "both";
  return { lock_day, lock_time, arrival_fixed: lock_day && lock_time };
}

/**
 * Whether someone may drag this job to another day or tech by hand: any job but a canceled
 * one (owner, 2026-10-18: "Any job with a date already set cannot be dragged around"). Plan
 * Route still leaves started and finished jobs where they are (lockReason).
 */
export function canMoveJob(status: string): boolean {
  return status !== "canceled";
}

/** Whether a job can go back to Needs a Time: only one that hasn't started. */
export function canUnschedule(status: string): boolean {
  return status === "scheduled" || status === "unscheduled";
}

/**
 * Why planning a day keeps this job's time, or null when it may move. A started or finished job
 * has happened; a time lock was promised; a two-tech job is in two routes, so moving it in one
 * moves the other tech too: Optimize moves one only when its new time also fits the other
 * tech's day (planTechDay, owner 2026-10-24), and Plan Week and Today's reorder leave it. A day
 * lock alone doesn't hold a time within the day, so it's not a reason here (Plan Week keeps it
 * on its day).
 */
export function lockReason(job: PlanJob): LockReason | null {
  if (job.status !== "scheduled" && job.status !== "unscheduled") return "started";
  const lock = jobLock(job);
  if (lock === "both") return "fixed";
  if (lock === "time") return "time";
  if (job.second_tech_id) return "two_techs";
  return null;
}

/**
 * A day's jobs in route order. Times decide it (they are what techs and customers see, and
 * someone may have changed one by hand); the saved place breaks ties, and jobs without a
 * time go last.
 */
export function inRouteOrder<T extends PlanJob>(jobs: T[]): T[] {
  return [...jobs].sort(
    (a, b) =>
      (Date.parse(a.scheduled_start ?? "") || Infinity) -
        (Date.parse(b.scheduled_start ?? "") || Infinity) ||
      (a.route_order ?? Infinity) - (b.route_order ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
}

export interface PlannedStop extends RouteStop {
  movable: boolean;
  /** This tech is the job's main tech, so the job's route order is theirs to save. */
  own: boolean;
}

export function jobMinutes(job: PlanJob, settings: RoutingSettings): number {
  if (job.scheduled_start && job.scheduled_end) {
    const m = Math.round(
      (Date.parse(job.scheduled_end) - Date.parse(job.scheduled_start)) / 60_000,
    );
    if (m > 0 && m <= 24 * 60) return m;
  }
  return settings.jobMinutes;
}

/** A job as a stop in `techId`'s route. On today's route nothing moves before `nowMin`. */
export function stopFor(
  job: PlanJob,
  ctx: { timeZone: string; settings: RoutingSettings; techId: string; nowMin?: number | null },
): PlannedStop {
  const movable = lockReason(job) === null;
  return {
    id: job.id,
    location: propertyLocation(job.property),
    durationMin: jobMinutes(job, ctx.settings),
    fixedStartMin:
      !movable && job.scheduled_start ? localMinutes(job.scheduled_start, ctx.timeZone) : null,
    earliestMin: movable ? (ctx.nowMin ?? null) : null,
    movable,
    own: job.assigned_user_id === ctx.techId,
  };
}

export interface JobUpdate {
  id: string;
  route_order: number;
  scheduled_start?: string;
  scheduled_end?: string;
}

/** The instant of `min` minutes after midnight on `date` in the zone (capped at 23:59). */
export function zonedMinutesToIso(date: string, min: number, timeZone: string): string {
  return zonedTimeToIso(date, minutesToClock(Math.min(Math.max(0, min), 24 * 60 - 1)), timeZone);
}

/**
 * Rows to save for a timed route: every stop of this tech's gets its place, and stops that
 * may move get the route's times. Locked stops keep their times.
 */
export function routeUpdates(
  date: string,
  timeZone: string,
  stops: PlannedStop[],
  route: TimedRoute,
): JobUpdate[] {
  const updates: JobUpdate[] = [];
  stops.forEach((s, i) => {
    if (!s.own) return;
    const t = route.stops[i]!;
    const u: JobUpdate = { id: s.id, route_order: i + 1 };
    if (s.movable) {
      u.scheduled_start = zonedMinutesToIso(date, t.startMin, timeZone);
      u.scheduled_end = new Date(
        Date.parse(u.scheduled_start) + s.durationMin * 60_000,
      ).toISOString();
    }
    updates.push(u);
  });
  return updates;
}

// ---------------------------------------------------------------------------
// A saved day, as the schedule shows it
// ---------------------------------------------------------------------------

export interface SavedStop {
  id: string;
  location: LatLng | null;
  /** Saved times, minutes after midnight (null when the job has no time). */
  startMin: number | null;
  endMin: number | null;
}

export interface DaySummary {
  /** Driving into each stop, from the shop or the stop before. */
  legs: number[];
  /** Minutes each stop is short of the drive from the stop before (0 = it fits). */
  short: number[];
  /** Driving for the whole day, back to the shop included. */
  driveMin: number;
  backMin: number | null;
  overtimeMin: number;
  unlocated: number;
}

/**
 * Drive times and problems for a day as saved: the times the techs and customers have, not
 * a re-plan. A stop is short when the job before ends too late to drive there in time.
 */
export function daySummary(
  stops: SavedStop[],
  depot: LatLng | null,
  day: WorkDay,
  drive: (a: LatLng | null, b: LatLng | null) => number,
): DaySummary {
  let at = depot;
  let prevEnd: number | null = null;
  let total = 0;
  const legs: number[] = [];
  const short: number[] = [];
  for (const s of stops) {
    const leg = drive(at, s.location);
    legs.push(leg);
    total += leg;
    short.push(prevEnd != null && s.startMin != null ? Math.max(0, prevEnd + leg - s.startMin) : 0);
    if (s.location) at = s.location;
    if (s.endMin != null) prevEnd = s.endMin;
  }
  const back = stops.length ? drive(at, depot) : 0;
  total += back;
  const backMin = prevEnd != null ? prevEnd + back : null;
  return {
    legs,
    short,
    driveMin: total,
    backMin,
    overtimeMin: backMin != null ? Math.max(0, backMin - day.endMin) : 0,
    unlocated: stops.filter((s) => !s.location).length,
  };
}
