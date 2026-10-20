// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from scratch. Where you
// have jobs for the week and it auto calculates the best way to route them"). Pure: the server
// loads the week, these functions put its movable jobs on days and techs, then order each day.

import {
  optimizeRoute,
  routeCost,
  timeRoute,
  type DriveFn,
  type LatLng,
  type RouteStop,
  type TimedRoute,
  type WorkDay,
} from "./routing";

/** Most jobs one run places (Mapbox's matrix takes 25 points a call; owner, decision 5). */
export const PLAN_WEEK_LIMIT = 150;

/** Minutes of extra driving a day's work counts as, per minute of it (a tie-breaker). */
const BALANCE = 0.02;

/** A tech's day the week may use, with what stays on it. */
export interface WeekDay {
  techId: string;
  date: string;
  /**
   * Stops that stay on this day: started or finished jobs, day locks, two-tech jobs, maintenance
   * visits. Those that also keep their time carry `fixedStartMin`.
   */
  stays: RouteStop[];
  /** Can't start before this (now, on today). */
  earliestMin?: number | null;
}

/** A job the week may move. */
export interface WeekJob {
  id: string;
  location: LatLng | null;
  durationMin: number;
  /** A time lock: it keeps this clock time on whatever day it goes to. */
  timeMin?: number | null;
  /** Where it is now; null for a job in Needs a Time. */
  techId: string | null;
  date: string | null;
  /** Techs it may go to. */
  techs: string[];
}

export interface WeekPlacement {
  id: string;
  techId: string;
  date: string;
}

export interface WeekPlanDay {
  techId: string;
  date: string;
  /** The day's stops in their new order (stays included). */
  stops: RouteStop[];
  route: TimedRoute;
}

export interface WeekPlan {
  placed: WeekPlacement[];
  /** Jobs from Needs a Time no day had room for: they stay there. */
  unplaced: string[];
  /** Jobs past the run's limit, left for the next run. */
  skipped: string[];
  days: WeekPlanDay[];
  /** Driving across the week before and after, minutes. */
  driveBefore: number;
  driveAfter: number;
  /** Jobs that changed day or tech. */
  moved: number;
  /** Each planned tech's share of the movable jobs: how many, and their minutes of work. */
  split: { techId: string; jobs: number; minutes: number }[];
}

const key = (techId: string, date: string) => `${techId}|${date}`;

function asStop(j: WeekJob, earliest: number | null | undefined): RouteStop {
  return {
    id: j.id,
    location: j.location,
    durationMin: j.durationMin,
    fixedStartMin: j.timeMin ?? null,
    earliestMin: j.timeMin == null ? (earliest ?? null) : null,
  };
}

/**
 * Put the week's movable jobs on days for the least driving. Each job, hardest first (time locks,
 * then farthest from the shop), goes where it adds the least driving without running a day late
 * or past its end; a tie keeps it on its own day, then the earlier day. Each day is then ordered
 * as Plan Route orders it. A job no day has room for stays where it was. The same week planned
 * twice gives the same answer.
 *
 * `even` (owner, 2026-10-20: "select multiple techs when planning a week. Then it should split
 * the open jobs up evenly"): a job that may go to several techs goes to one whose share of the
 * week's movable work is within one job of the lightest, then where it adds the least driving.
 * When none of those has room, any tech that does.
 */
export function planWeek(input: {
  days: WeekDay[];
  jobs: WeekJob[];
  depot: LatLng | null;
  day: WorkDay;
  drive: DriveFn;
  limit?: number;
  even?: boolean;
}): WeekPlan {
  const { depot, day, drive } = input;
  const limit = input.limit ?? PLAN_WEEK_LIMIT;
  const days = [...input.days].sort(
    (a, b) => a.date.localeCompare(b.date) || a.techId.localeCompare(b.techId),
  );
  const byKey = new Map(days.map((d) => [key(d.techId, d.date), d]));
  const jobs = [...input.jobs].sort((a, b) => a.id.localeCompare(b.id));
  const considered = jobs.slice(0, limit);
  const skipped = jobs.slice(limit).map((j) => j.id);

  // The week as it is now, for "less driving than before".
  const now = new Map(days.map((d) => [key(d.techId, d.date), [...d.stays]]));
  for (const j of jobs) {
    const k = j.techId && j.date ? key(j.techId, j.date) : null;
    const d = k ? byKey.get(k) : null;
    if (d) now.get(k!)!.push(asStop(j, d.earliestMin));
  }
  const driveOf = (stops: RouteStop[]) => timeRoute(stops, depot, day, drive).driveMin;
  const driveBefore = [...now.values()].filter((s) => s.length).reduce((t, s) => t + driveOf(s), 0);

  // Hardest first: time locks (fewest places fit), then farthest from the shop.
  const away = (j: WeekJob) => (depot && j.location ? drive(depot, j.location) : 0);
  const order = [...considered].sort(
    (a, b) =>
      Number(b.timeMin != null) - Number(a.timeMin != null) ||
      away(b) - away(a) ||
      a.id.localeCompare(b.id),
  );

  /** Where a job adds the least driving, on the days of the techs `ok` allows. */
  function cheapest(j: WeekJob, ok: (techId: string) => boolean) {
    let best: { k: string; at: number; cost: number; home: boolean; i: number } | null = null;
    days.forEach((d, di) => {
      if (!ok(d.techId)) return;
      const k = key(d.techId, d.date);
      const stops = planned.get(k)!;
      const was = timeRoute(stops, depot, day, drive);
      const stop = asStop(j, d.earliestMin);
      for (let at = 0; at <= stops.length; at++) {
        const next = [...stops.slice(0, at), stop, ...stops.slice(at)];
        const r = timeRoute(next, depot, day, drive);
        // Never run a day later or longer than it was.
        if (r.lateMin > was.lateMin || r.overtimeMin > was.overtimeMin) continue;
        // Driving added, plus a little for how full the day already is, so near-ties spread
        // the work across the week instead of filling the first day.
        const cost =
          routeCost(r) -
          routeCost(was) +
          (stops.length ? (was.backMin - day.startMin) * BALANCE : 0);
        const home = j.techId === d.techId && j.date === d.date;
        const better =
          !best ||
          cost < best.cost - 1e-9 ||
          (Math.abs(cost - best.cost) <= 1e-9 && home && !best.home);
        if (better) best = { k, at, cost, home, i: di };
      }
    });
    return best as { k: string; at: number; cost: number; home: boolean; i: number } | null;
  }

  const planned = new Map(days.map((d) => [key(d.techId, d.date), [...d.stays]]));
  const placed: WeekPlacement[] = [];
  const unplaced: string[] = [];
  const techIds = [...new Set(days.map((d) => d.techId))];
  const load = new Map(techIds.map((t) => [t, 0]));
  const count = new Map(techIds.map((t) => [t, 0]));
  for (const j of order) {
    const allowed = j.techs.filter((t) => load.has(t));
    const lightest = Math.min(...allowed.map((t) => load.get(t)!));
    const fair = new Set(
      input.even && allowed.length > 1
        ? allowed.filter((t) => load.get(t)! < lightest + j.durationMin)
        : allowed,
    );
    let best = cheapest(j, (t) => fair.has(t));
    if (!best && fair.size < allowed.length) best = cheapest(j, (t) => allowed.includes(t));
    if (!best) {
      // A scheduled job that fits nowhere stays on its own day, in its cheapest place, so that
      // day's times still count it; one from Needs a Time stays there.
      const home = j.techId && j.date ? byKey.get(key(j.techId, j.date)) : null;
      if (home) {
        const stops = planned.get(key(home.techId, home.date))!;
        const stop = asStop(j, home.earliestMin);
        let at = stops.length;
        let cheapest = Infinity;
        for (let i = 0; i <= stops.length; i++) {
          const c = routeCost(
            timeRoute([...stops.slice(0, i), stop, ...stops.slice(i)], depot, day, drive),
          );
          if (c < cheapest - 1e-9) {
            cheapest = c;
            at = i;
          }
        }
        stops.splice(at, 0, stop);
        placed.push({ id: j.id, techId: home.techId, date: home.date });
        load.set(home.techId, (load.get(home.techId) ?? 0) + j.durationMin);
        count.set(home.techId, (count.get(home.techId) ?? 0) + 1);
      } else unplaced.push(j.id);
      continue;
    }
    const b = best;
    const techId = days[b.i]!.techId;
    planned.get(b.k)!.splice(b.at, 0, asStop(j, days[b.i]!.earliestMin));
    placed.push({ id: j.id, techId, date: days[b.i]!.date });
    load.set(techId, load.get(techId)! + j.durationMin);
    count.set(techId, count.get(techId)! + 1);
  }

  const out: WeekPlanDay[] = [];
  let driveAfter = 0;
  for (const d of days) {
    const stops = planned.get(key(d.techId, d.date))!;
    if (!stops.length) continue;
    const { order: o, route } = optimizeRoute(stops, depot, day, drive);
    driveAfter += route.driveMin;
    out.push({ techId: d.techId, date: d.date, stops: o.map((i) => stops[i]!), route });
  }
  const moved = placed.filter((p) => {
    const j = jobs.find((x) => x.id === p.id)!;
    return j.techId !== p.techId || j.date !== p.date;
  }).length;
  return {
    placed: placed.sort((a, b) => a.id.localeCompare(b.id)),
    unplaced: unplaced.sort(),
    skipped,
    days: out,
    driveBefore,
    driveAfter,
    moved,
    split: techIds.map((t) => ({ techId: t, jobs: count.get(t)!, minutes: load.get(t)! })),
  };
}

/**
 * How Plan Week split the jobs, for the banner's second line when it planned several techs:
 * "Ana 6 jobs · Ben 5 jobs". Empty for one tech.
 */
export function planWeekSplit(
  p: Pick<WeekPlan, "split">,
  name: (techId: string) => string,
): string {
  if (p.split.length < 2) return "";
  return p.split
    .map((s) => `${name(s.techId)} ${s.jobs} ${s.jobs === 1 ? "job" : "jobs"}`)
    .join(" · ");
}

/** "Moved 9 jobs · 3 hr 10 min less driving", or why nothing changed. */
export function planWeekSummary(
  p: Pick<WeekPlan, "moved" | "driveBefore" | "driveAfter" | "unplaced" | "skipped">,
  durationLabel: (min: number) => string,
): string {
  const parts: string[] = [];
  parts.push(
    p.moved === 0 ? "Nothing to move" : `Moved ${p.moved} ${p.moved === 1 ? "job" : "jobs"}`,
  );
  const saved = p.driveBefore - p.driveAfter;
  if (saved > 0) parts.push(`${durationLabel(saved)} less driving`);
  if (p.unplaced.length)
    parts.push(
      `${p.unplaced.length} didn’t fit and ${p.unplaced.length === 1 ? "stays" : "stay"} in Needs a Time`,
    );
  if (p.skipped.length) parts.push(`${p.skipped.length} left for the next run`);
  return parts.join(" · ");
}
