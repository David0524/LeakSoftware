// Planning a day, moving a job, and suggesting times, worked out on the phone (spec 5.6 and
// 6.3: the native apps plan from their own database and save through the sync layer). The
// same rules as the website's route actions (apps/web/src/app/actions/routes.ts): promised
// times never move, started jobs stay on the schedule, and stops after a moved job move later
// only when they must. Pure: callers load the jobs and drive times and save the rows.

import { addDays } from "./office";
import { dateFormat } from "./intl";
import {
  canMoveJob,
  canUnschedule,
  jobLock,
  jobMinutes,
  localMinutes,
  propertyLocation,
  routeUpdates,
  stopFor,
  weekday,
  workDay,
  zonedMinutesToIso,
  type PlanJob,
  type PlannedStop,
  type RoutingSettings,
} from "./route-plan";
import {
  durationLabel,
  minutesLabel,
  optimizeRoute,
  suggestSlots,
  timeRoute,
  type DriveFn,
  type LatLng,
  type SlotSuggestion,
  type TechDay,
} from "./routing";
import { startFor, type MemberStartFields } from "./route-start";

/** Where this tech's routes start and end in this context. */
const startOf = (ctx: PlanContext, techId: string | null | undefined) =>
  startFor(techId, ctx.starts, ctx.depot).at;

export interface PlanContext {
  timeZone: string;
  settings: RoutingSettings;
  /** The shop, where routes start and end unless a tech starts from home (`starts`). */
  depot: LatLng | null;
  /**
   * The shop's member_start rows this person can read (their own, or everyone's for owners and
   * admins). Each tech's day starts and ends at startFor(techId, starts, depot).
   */
  starts?: readonly (MemberStartFields & { user_id: string })[] | null;
  /** The shop's today ("2026-10-19") and minutes after midnight now. */
  today: string;
  nowMin: number;
}

/** A row to save on a job (only the fields that change). */
export interface JobChange {
  id: string;
  route_order?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: string;
  assigned_user_id?: string | null;
  arrival_fixed?: boolean;
}

export interface ScheduleChange {
  updates: JobChange[];
  /** What happened, one short line for the banner ("Moved to 9:15 AM."). */
  message?: string;
  /** What to watch for, a second smaller line (owner, 2026-10-20: the banner at the top). */
  detail?: string;
  error?: string;
}

/** "Driving to pools not on the map isn’t counted." from notes, or undefined. */
export function noteSentences(notes: (string | null | false | undefined)[]): string | undefined {
  const list = notes.filter((n): n is string => !!n);
  return list.length
    ? list.map((n) => `${n.charAt(0).toUpperCase()}${n.slice(1)}.`).join(" ")
    : undefined;
}

function dayStops(ctx: PlanContext, techId: string, date: string, jobs: PlanJob[]) {
  return jobs.map((j) =>
    stopFor(j, {
      timeZone: ctx.timeZone,
      settings: ctx.settings,
      techId,
      nowMin: date === ctx.today ? ctx.nowMin : null,
    }),
  );
}

/**
 * Optimize (once Plan Route): order a tech's day (its jobs in route order) for the least driving, keep
 * promised times, and say what changed.
 */
export function planDay(
  ctx: PlanContext,
  techId: string,
  date: string,
  jobs: PlanJob[],
  drive: DriveFn,
): ScheduleChange {
  if (date < ctx.today) return { updates: [], error: "Past days can’t be planned." };
  if (jobs.length === 0) return { updates: [], error: "Nothing scheduled for this tech that day." };
  const stops = dayStops(ctx, techId, date, jobs);
  const hours = workDay(ctx.settings);
  const start = startOf(ctx, techId);
  const before = timeRoute(stops, start, hours, drive);
  const { order, route } = optimizeRoute(stops, start, hours, drive);
  const planned = order.map((i) => stops[i]!);
  const updates = routeUpdates(date, ctx.timeZone, planned, route);
  const saved = before.driveMin - route.driveMin;
  // One short line for the banner at the top of the screen (owner, 2026-10-20: the note under
  // the button "looks horrible"), and what to watch for as a second line, as the website says.
  const message = [
    "Optimized",
    saved > 0 ? `${durationLabel(saved)} less driving` : `${durationLabel(route.driveMin)} driving`,
  ].join(" · ");
  const detail = noteSentences([
    stops.some((s) => !s.location) ? "driving to pools not on the map isn’t counted" : null,
    !start ? "the shop has no location (Settings › Scheduling)" : null,
  ]);
  return detail ? { updates, message, detail } : { updates, message };
}

/** Close up the order numbers of the day a job left (times stay as they are). */
export function renumberDay(techId: string, jobs: PlanJob[], leaving: string): JobChange[] {
  const left = jobs.filter((j) => j.id !== leaving && j.assigned_user_id === techId);
  return left
    .map((j, i) => ({ id: j.id, route_order: i + 1 }))
    .filter((u, i) => left[i]!.route_order !== u.route_order);
}

export interface MoveInput {
  job: PlanJob;
  /** null: nobody assigned (waits in Needs a Time). */
  tech: string | null;
  /** null: take the job off the schedule. */
  date: string | null;
  /** Place in the tech's route that day (0 = first). Past the end: last. */
  index: number;
  /** The target tech's jobs that day, in route order (the moved job may be among them). */
  targetDay: PlanJob[];
  /** The tech's day the job is leaving, in route order, for renumbering. */
  fromDay: PlanJob[];
  /** False for a tech the owner limits to their own jobs. */
  seesAll: boolean;
  /** The person moving it. */
  userId: string;
}

/**
 * Move…: put a job on a tech's day at a place in the route, with nobody, or off the
 * schedule. Returns the rows to save, the moved job first.
 */
export function moveJobChange(ctx: PlanContext, input: MoveInput, drive: DriveFn): ScheduleChange {
  const { job, tech, date } = input;
  const fail = (error: string): ScheduleChange => ({ updates: [], error });
  if (!canMoveJob(job.status)) return fail("This job was canceled, so it stays off the schedule.");
  if (!date && !canUnschedule(job.status))
    return fail(
      "This job has started, so it stays on the schedule. Move it to another day instead.",
    );
  if (date && date < ctx.today) return fail("Pick today or a later day.");
  if (!input.seesAll && tech !== input.userId && date)
    return fail("You can schedule only your own jobs. Ask an owner to move it to someone else.");
  if (tech && tech === job.second_tech_id)
    return fail("This tech is already the second tech on this job.");
  const status = canUnschedule(job.status) ? "scheduled" : job.status;
  const from = job.scheduled_start
    ? {
        tech: job.assigned_user_id ?? null,
        date: dateIn(job.scheduled_start, ctx.timeZone),
      }
    : null;
  const leaving = (stayed: boolean) =>
    from?.tech && !stayed ? renumberDay(from.tech, input.fromDay, job.id) : [];

  if (!date) {
    return {
      updates: [
        {
          id: job.id,
          route_order: null,
          status: "unscheduled",
          scheduled_start: null,
          scheduled_end: null,
          arrival_fixed: false,
        },
        ...leaving(false),
      ],
      message: "Taken off the schedule.",
    };
  }

  const duration = jobMinutes(job, ctx.settings);
  // A time lock keeps its clock time on the new day (owner, 2026-10-20), as moveJob on the
  // website does.
  const lock = jobLock(job);
  const fixedMin =
    (lock === "time" || lock === "both") && job.scheduled_start
      ? localMinutes(job.scheduled_start, ctx.timeZone)
      : null;

  if (!tech) {
    const startMin = job.scheduled_start
      ? localMinutes(job.scheduled_start, ctx.timeZone)
      : workDay(ctx.settings).startMin;
    const start = zonedMinutesToIso(date, startMin, ctx.timeZone);
    return {
      updates: [
        {
          id: job.id,
          route_order: null,
          assigned_user_id: null,
          status,
          scheduled_start: start,
          scheduled_end: new Date(Date.parse(start) + duration * 60_000).toISOString(),
        },
        ...leaving(false),
      ],
      message: `No tech yet, so it’s in Needs a Time, still booked for ${minutesLabel(startMin)}.`,
    };
  }

  const others = input.targetDay.filter((j) => j.id !== job.id);
  const stops = dayStops(ctx, tech, date, others).map((s, i) => {
    // Stops already on the day keep their times unless the new order pushes them later.
    const start = others[i]!.scheduled_start;
    return s.movable && start
      ? { ...s, earliestMin: Math.max(s.earliestMin ?? 0, localMinutes(start, ctx.timeZone)) }
      : s;
  });
  const moved: PlannedStop = {
    id: job.id,
    location: propertyLocation(job.property),
    durationMin: duration,
    fixedStartMin: fixedMin,
    earliestMin: date === ctx.today ? ctx.nowMin : null,
    movable: fixedMin == null,
    own: true,
  };
  const index = Math.max(
    0,
    Math.min(Number.isInteger(input.index) ? input.index : others.length, others.length),
  );
  stops.splice(index, 0, moved);
  const route = timeRoute(stops, startOf(ctx, tech), workDay(ctx.settings), drive);
  const updates: JobChange[] = routeUpdates(date, ctx.timeZone, stops, route);
  const mine = updates.find((u) => u.id === job.id)!;
  mine.assigned_user_id = tech;
  mine.status = status;
  if (fixedMin != null) {
    mine.scheduled_start = zonedMinutesToIso(date, fixedMin, ctx.timeZone);
    mine.scheduled_end = new Date(
      Date.parse(mine.scheduled_start) + duration * 60_000,
    ).toISOString();
  }
  const stayed = from?.tech === tech && from?.date === date;
  // No times and no lateness (owner, 2026-10-21: "I don't care about days running late …
  // times are pretty irrelevant in this business").
  return {
    updates: [mine, ...updates.filter((u) => u !== mine), ...leaving(stayed)],
    message: "Moved.",
  };
}

/** The shop's date of an instant ("2026-10-19"). */
function dateIn(iso: string, timeZone: string): string {
  const parts = dateFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The next 7 working days for suggestions, today included while there's time left in it. */
export function suggestionDates(ctx: PlanContext): string[] {
  const hours = workDay(ctx.settings);
  const dates: string[] = [];
  for (let d = ctx.today; dates.length < 7 && d < addDays(ctx.today, 21); d = addDays(d, 1)) {
    if (!ctx.settings.workDays.includes(weekday(d))) continue;
    if (d === ctx.today && ctx.nowMin > hours.endMin - 60) continue;
    dates.push(d);
  }
  return dates;
}

export interface SuggestedTime extends SlotSuggestion {
  /** "Today", "Tue, Oct 20" */
  dayLabel: string;
  /** "9:00 AM" */
  timeLabel: string;
}

export interface SuggestRoute {
  techId: string;
  techName: string;
  date: string;
  /** In route order, each with its customer's name for "after …". */
  jobs: (PlanJob & { label?: string })[];
}

/**
 * Suggest Times: the places a job fits best in the routes already planned on `dates`, without
 * moving anyone's time or running late. `job` is left out of the routes it's already on.
 */
export function suggestTimes(
  ctx: PlanContext,
  job: { id?: string; location: LatLng | null; durationMin: number },
  routes: SuggestRoute[],
  drive: DriveFn,
  limit = 5,
): { suggestions: SuggestedTime[]; note?: string } {
  const days: TechDay[] = routes.map((r) => {
    const jobs = r.jobs.filter((j) => j.id !== job.id);
    const stops = dayStops(ctx, r.techId, r.date, jobs).map((s, i) => {
      const start = jobs[i]!.scheduled_start;
      return start
        ? { ...s, fixedStartMin: localMinutes(start, ctx.timeZone), earliestMin: null }
        : s;
    });
    return {
      date: r.date,
      techId: r.techId,
      techName: r.techName,
      stops,
      labels: Object.fromEntries(jobs.map((j) => [j.id, j.label ?? "the job before"])),
      notBeforeMin: r.date === ctx.today ? ctx.nowMin : null,
      start: startOf(ctx, r.techId),
    };
  });
  const found = suggestSlots(
    { location: job.location, durationMin: job.durationMin },
    days,
    ctx.depot,
    workDay(ctx.settings),
    drive,
    limit,
  );
  const fmt = dateFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    suggestions: found.map((s) => ({
      ...s,
      dayLabel: s.date === ctx.today ? "Today" : fmt.format(new Date(`${s.date}T12:00:00Z`)),
      timeLabel: minutesLabel(s.startMin),
    })),
    note: !job.location
      ? "This pool has no location yet, so these don’t count driving to it."
      : found.length === 0
        ? "No gaps in the next working days. Use Move… to pick a day."
        : undefined,
  };
}
