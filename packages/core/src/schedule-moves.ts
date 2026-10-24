// Planning a day, moving a job, and suggesting times, worked out on the phone (spec 5.6 and
// 6.3: the native apps plan from their own database and save through the sync layer). The
// same rules as the website's route actions (apps/web/src/app/actions/routes.ts): promised
// times never move, started jobs stay on the schedule, and stops after a moved job move later
// only when they must. Pure: callers load the jobs and drive times and save the rows.

import { addDays, formatDay } from "./office";
import { dateFormat } from "./intl";
import {
  canMoveJob,
  canUnschedule,
  jobLock,
  jobMinutes,
  localMinutes,
  lockReason,
  LOCK_LABELS,
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
  type RouteStop,
  type SlotSuggestion,
  type TechDay,
  type TimedRoute,
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
  lock_day?: boolean;
  lock_time?: boolean;
}

export interface ScheduleChange {
  updates: JobChange[];
  /** What happened, one short line for the banner ("Moved to 9:15 AM."). */
  message?: string;
  /** What to watch for, a second smaller line (owner, 2026-10-20: the banner at the top). */
  detail?: string;
  error?: string;
  /** Optimize: the order stayed as it was (no Undo). */
  unchanged?: boolean;
  /**
   * A move that also moves a shared job's other tech into a conflict: ask before saving
   * (owner, 2026-10-24). The rows are the same either way; Cancel saves nothing.
   */
  confirm?: MoveConfirm;
}

/** A plain iOS alert: the title, the body, and the button that saves anyway (beside Cancel). */
export interface MoveConfirm {
  title: string;
  message: string;
  action: string;
}

/** Optimize's banner words (owner, 2026-10-22 and 2026-10-24). */
export const OPTIMIZE_WORDS = {
  /** Every stop could move and the order stays. */
  alreadyBest: "Already the best order",
  noChange: "No change",
  optimized: "Optimized",
  rest: "the rest are already in the best order",
} as const;

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

// ---------------------------------------------------------------------------
// Shared jobs (owner, 2026-10-24: Optimize said "Already the best order" on a day whose stops
// were all shared with a second tech, and a drag moved one without a word about that tech)
// ---------------------------------------------------------------------------

/**
 * The other tech's day on shared jobs: their jobs that day in route order, the shared ones
 * among them. Only pass it when you can see that tech's whole day and where it starts (owners
 * and admins); without it, shared jobs keep their times.
 */
export interface PartnerDay {
  techId: string;
  jobs: PlanJob[];
}

/** Who else is on a shared job, from `techId`'s side; null for a job with one tech. */
export function partnerOf(job: PlanJob, techId: string): string | null {
  if (!job.second_tech_id) return null;
  return job.assigned_user_id === techId ? job.second_tech_id : (job.assigned_user_id ?? null);
}

/** A shared job at a new time, as the other tech's day would have it. */
export interface PartnerMove {
  id: string;
  location: LatLng | null;
  startMin: number;
  durationMin: number;
}

/** What a shared job's new time would do to the other tech's day. */
export interface PartnerProblem {
  /** The shared job whose new time causes it. */
  jobId: string;
  /**
   * overlap: it runs into another of their jobs, travel included; early: they can't get there
   * from where their day starts; overtime: their day runs past its end.
   */
  kind: "overlap" | "early" | "overtime";
  /** The other job it runs into, and its time (minutes after midnight). */
  otherId?: string;
  otherMin?: number;
}

const savedMin = (j: PlanJob, timeZone: string) =>
  j.scheduled_start ? localMinutes(j.scheduled_start, timeZone) : null;

const byTime = (a: RouteStop, b: RouteStop) =>
  (a.fixedStartMin ?? Infinity) - (b.fixedStartMin ?? Infinity) || a.id.localeCompare(b.id);

/**
 * Whether shared jobs at new times on `date` still fit the other tech's day: each of their jobs
 * keeps its time, from their own start (home or the shop), and none may start later than it
 * does now (an overlap, travel included), nor their day run longer past its end. The first
 * problem in their day's order, or null. `moves` are the shared jobs with this tech at their
 * new times, checked together.
 */
export function partnerProblem(
  ctx: PlanContext,
  partner: PartnerDay,
  moves: PartnerMove[],
  drive: DriveFn,
): PartnerProblem | null {
  if (!moves.length) return null;
  const moving = new Set(moves.map((m) => m.id));
  const asStop = (j: PlanJob): RouteStop => ({
    id: j.id,
    location: propertyLocation(j.property),
    durationMin: jobMinutes(j, ctx.settings),
    fixedStartMin: savedMin(j, ctx.timeZone),
  });
  const before = partner.jobs.map(asStop).sort(byTime);
  const after = [
    ...partner.jobs.filter((j) => !moving.has(j.id)).map(asStop),
    ...moves.map((m) => ({
      id: m.id,
      location: m.location,
      durationMin: m.durationMin,
      fixedStartMin: m.startMin,
    })),
  ].sort(byTime);
  const start = startOf(ctx, partner.techId);
  const hours = workDay(ctx.settings);
  const was = timeRoute(before, start, hours, drive);
  const now = timeRoute(after, start, hours, drive);
  const lateBefore = new Map(was.stops.map((t) => [t.id, t.lateMin]));
  for (let i = 0; i < after.length; i++) {
    const t = now.stops[i]!;
    if (t.lateMin <= (lateBefore.get(t.id) ?? 0)) continue;
    const s = after[i]!;
    if (moving.has(s.id)) {
      const prev = after[i - 1];
      return prev
        ? {
            jobId: s.id,
            kind: "overlap",
            otherId: prev.id,
            otherMin: prev.fixedStartMin ?? undefined,
          }
        : { jobId: s.id, kind: "early" };
    }
    // An unmoved job runs late: the shared job moved in ahead of it is the cause.
    const cause = after
      .slice(0, i)
      .reverse()
      .find((x) => moving.has(x.id));
    return {
      jobId: cause?.id ?? moves[0]!.id,
      kind: "overlap",
      otherId: s.id,
      otherMin: s.fixedStartMin ?? undefined,
    };
  }
  if (now.overtimeMin > was.overtimeMin) {
    const last = [...after].reverse().find((x) => moving.has(x.id));
    return { jobId: last?.id ?? moves[0]!.id, kind: "overtime" };
  }
  return null;
}

/** Why Optimize kept a stop's time. */
export interface KeptStop {
  id: string;
  /** started, a time promised to the customer (a Time or Both lock), or shared with `techId`. */
  reason: "started" | "time" | "shared";
  techId?: string;
}

/** Optimize's plan for a tech's day, before it's turned into rows and words. */
export interface DayPlan {
  /** The day's stops in their given order. */
  stops: PlannedStop[];
  /** The new order (indexes into `stops`) and its times. */
  order: number[];
  route: TimedRoute;
  /** The day as it is, for "less driving". */
  before: TimedRoute;
  /** Stops kept at their time, in the day's order. */
  kept: KeptStop[];
  /** Shared jobs planning may move (their new times fit the other tech's day). */
  freed: string[];
}

/**
 * Optimize's plan (owner, 2026-10-24): a shared job may move too when its new time also fits
 * the other tech's day (`partners`; partnerProblem). Every shared job that has a partner day is
 * free at first; after each run, one that doesn't fit is put back at its time and the day is
 * planned again, until every moved one fits. Started jobs and times promised to the customer
 * never move. The same day planned twice gives the same answer.
 */
export function planTechDay(
  ctx: PlanContext,
  techId: string,
  date: string,
  jobs: PlanJob[],
  drive: DriveFn,
  partners: readonly PartnerDay[] = [],
): DayPlan {
  const base = dayStops(ctx, techId, date, jobs);
  const hours = workDay(ctx.settings);
  const start = startOf(ctx, techId);
  const days = new Map(partners.map((p) => [p.techId, p]));
  const shared = new Set(
    jobs
      .filter((j) => {
        const partner = partnerOf(j, techId);
        return lockReason(j) === "two_techs" && !!partner && days.has(partner);
      })
      .map((j) => j.id),
  );
  const pinned = new Set<string>();
  const earliest = date === ctx.today ? ctx.nowMin : null;
  let stops = base;
  let plan!: ReturnType<typeof optimizeRoute>;
  // Each run that doesn't fit pins one more shared job, so this ends.
  for (let run = 0; run <= shared.size; run++) {
    stops = base.map((s) =>
      shared.has(s.id) && !pinned.has(s.id)
        ? { ...s, movable: true, fixedStartMin: null, earliestMin: earliest }
        : s,
    );
    plan = optimizeRoute(stops, start, hours, drive);
    // The shared jobs that moved, by the other tech.
    const moves = new Map<string, PartnerMove[]>();
    plan.order.forEach((i, at) => {
      const s = stops[i]!;
      if (!shared.has(s.id) || pinned.has(s.id)) return;
      const t = plan.route.stops[at]!;
      if (savedMin(jobs[i]!, ctx.timeZone) === t.startMin) return;
      const partner = partnerOf(jobs[i]!, techId)!;
      moves.set(partner, [
        ...(moves.get(partner) ?? []),
        { id: s.id, location: s.location, startMin: t.startMin, durationMin: s.durationMin },
      ]);
    });
    let fits = true;
    for (const partner of [...moves.keys()].sort()) {
      const problem = partnerProblem(ctx, days.get(partner)!, moves.get(partner)!, drive);
      if (problem) {
        pinned.add(problem.jobId);
        fits = false;
      }
    }
    if (fits) break;
  }
  const kept: KeptStop[] = [];
  jobs.forEach((j, i) => {
    if (stops[i]!.movable) return;
    const why = lockReason(j);
    if (why === "started") kept.push({ id: j.id, reason: "started" });
    else if (why === "fixed" || why === "time") kept.push({ id: j.id, reason: "time" });
    else if (why === "two_techs")
      kept.push({ id: j.id, reason: "shared", techId: partnerOf(j, techId) ?? undefined });
  });
  return {
    stops,
    order: plan.order,
    route: plan.route,
    before: timeRoute(stops, start, hours, drive),
    kept,
    freed: [...shared].filter((id) => !pinned.has(id)),
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Kept stops by reason, in the order reasons first appear: started, time, then each tech. */
function keptGroups(kept: KeptStop[], names: Record<string, string>) {
  const groups: { key: string; reason: KeptStop["reason"]; name: string; count: number }[] = [];
  const rank = { started: 0, time: 1, shared: 2 } as const;
  for (const k of kept) {
    const key = k.reason === "shared" ? `shared|${k.techId ?? ""}` : k.reason;
    const g = groups.find((x) => x.key === key);
    if (g) g.count++;
    else
      groups.push({
        key,
        reason: k.reason,
        name: (k.techId && names[k.techId]) || "another tech",
        count: 1,
      });
  }
  return groups.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

const keptLabel = (g: { reason: KeptStop["reason"]; name: string }) =>
  g.reason === "started"
    ? "started"
    : g.reason === "time"
      ? "time promised to the customer"
      : `shared with ${g.name}`;

/**
 * Why stops stayed, as a note: "1 stop stayed: shared with Jake Turner", "3 stops stayed: 1
 * started, 2 shared with Jake Turner". Null when every stop could move.
 */
export function keptNote(kept: KeptStop[], names: Record<string, string> = {}): string | null {
  if (!kept.length) return null;
  const groups = keptGroups(kept, names);
  const n = kept.length;
  const why =
    groups.length === 1
      ? keptLabel(groups[0]!)
      : groups.map((g) => `${g.count} ${keptLabel(g)}`).join(", ");
  return `${n} ${plural(n, "stop", "stops")} stayed: ${why}`;
}

/**
 * Optimize's line when no stop could move: "No change: all 3 stops are shared with Jake Turner,
 * so their times stay." For several reasons, each with its count.
 */
export function nothingMoved(kept: KeptStop[], names: Record<string, string> = {}): string {
  const groups = keptGroups(kept, names);
  const n = kept.length;
  if (groups.length > 1) return `${OPTIMIZE_WORDS.noChange}: ${keptNote(kept, names)}.`;
  const g = groups[0]!;
  const one = n === 1;
  const what =
    g.reason === "started"
      ? one
        ? "has started"
        : "have started"
      : g.reason === "time"
        ? one
          ? "has a time promised to the customer"
          : "have times promised to the customer"
        : `${one ? "is" : "are"} shared with ${g.name}`;
  return one
    ? `${OPTIMIZE_WORDS.noChange}: the stop ${what}, so its time stays.`
    : `${OPTIMIZE_WORDS.noChange}: ${n === 2 ? "both" : `all ${n}`} stops ${what}, so their times stay.`;
}

/**
 * Optimize (once Plan Route): order a tech's day (its jobs in route order) for the least
 * driving, keep promised times, and say what changed and what stayed (owner, 2026-10-24:
 * "Already the best order" only when every stop could move). `partners`: the other techs' days
 * on shared jobs (planTechDay); `names`: who they are, by user id.
 */
export function planDay(
  ctx: PlanContext,
  techId: string,
  date: string,
  jobs: PlanJob[],
  drive: DriveFn,
  opts: { partners?: readonly PartnerDay[]; names?: Record<string, string> } = {},
): ScheduleChange {
  if (date < ctx.today) return { updates: [], error: "Past days can’t be planned." };
  if (jobs.length === 0) return { updates: [], error: "Nothing scheduled for this tech that day." };
  const names = opts.names ?? {};
  const plan = planTechDay(ctx, techId, date, jobs, drive, opts.partners ?? []);
  const { stops, order, route, before, kept } = plan;
  const planned = order.map((i) => stops[i]!);
  const updates: JobChange[] = routeUpdates(date, ctx.timeZone, planned, route);
  // A shared job this tech is second on: only its new time (its place is the main tech's).
  const freed = new Set(plan.freed);
  planned.forEach((s, at) => {
    if (s.own || !freed.has(s.id)) return;
    const start = zonedMinutesToIso(date, route.stops[at]!.startMin, ctx.timeZone);
    updates.push({
      id: s.id,
      scheduled_start: start,
      scheduled_end: new Date(Date.parse(start) + s.durationMin * 60_000).toISOString(),
    });
  });
  const unchanged = order.every((i, at) => i === at);
  const saved = before.driveMin - route.driveMin;
  const start = startOf(ctx, techId);
  const notes = [
    stops.some((s) => !s.location) ? "driving to pools not on the map isn’t counted" : null,
    !start ? "the shop has no location (Settings › Scheduling)" : null,
  ];
  const stayed = keptNote(kept, names);
  // One short line for the banner at the top of the screen (owner, 2026-10-20: the note under
  // the button "looks horrible"), and what stayed and what to watch for as a second line.
  let message: string;
  let detail: string | undefined;
  if (!unchanged) {
    message = [
      OPTIMIZE_WORDS.optimized,
      saved > 0
        ? `${durationLabel(saved)} less driving`
        : `${durationLabel(route.driveMin)} driving`,
    ].join(" · ");
    detail = noteSentences([stayed, ...notes]);
  } else if (!kept.length) {
    message = OPTIMIZE_WORDS.alreadyBest;
    detail = noteSentences(notes);
  } else if (kept.length === stops.length) {
    message = nothingMoved(kept, names);
    detail = noteSentences(notes);
  } else {
    message = OPTIMIZE_WORDS.noChange;
    detail = noteSentences([stayed, OPTIMIZE_WORDS.rest, ...notes]);
  }
  return detail ? { updates, message, detail, unchanged } : { updates, message, unchanged };
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
  /**
   * The job's second tech's jobs on the new day, in route order, to check a shared job's new
   * time against (owner, 2026-10-24). Left out when this person can't see that tech's whole
   * day: the move then doesn't ask.
   */
  partnerDay?: PlanJob[] | null;
  /** Names by user id, for "Moved. Jake Turner's visit moved too." */
  names?: Record<string, string>;
}

const firstName = (name: string) => name.split(" ")[0] || name;

/**
 * A shared job moved by hand to `startIso` on `date` (owner, 2026-10-24): it's one job, so its
 * second tech moves too. The banner says so ("Moved. Jake Turner's visit moved too."), and when
 * the new time runs into that tech's day (`partnerDay`, partnerProblem), an alert asks first:
 * "Move Jake Turner's Visit Too?" with Move Anyway and Cancel. Null when the job has no second
 * tech or keeps its day and time.
 */
export function sharedMove(
  ctx: PlanContext,
  input: {
    job: PlanJob;
    /** The tech it's on after the move (its main tech). */
    tech: string;
    date: string;
    startIso: string;
    partnerDay?: PlanJob[] | null;
    names?: Record<string, string>;
  },
  drive: DriveFn,
): { message: string; confirm?: MoveConfirm } | null {
  const { job, date } = input;
  const partner = job.second_tech_id;
  if (!partner || partner === input.tech) return null;
  const was = job.scheduled_start ? Date.parse(job.scheduled_start) : null;
  if (was === Date.parse(input.startIso)) return null;
  const known = input.names?.[partner];
  const message = `Moved. ${known ?? "The second tech"}’s visit moved too.`;
  if (!input.partnerDay) return { message };
  const startMin = localMinutes(input.startIso, ctx.timeZone);
  const problem = partnerProblem(
    ctx,
    { techId: partner, jobs: input.partnerDay },
    [
      {
        id: job.id,
        location: propertyLocation(job.property),
        startMin,
        durationMin: jobMinutes(job, ctx.settings),
      },
    ],
    drive,
  );
  if (!problem) return { message };
  const who = known ?? "the second tech";
  // "Jake’s 4:30 PM job": the first name, or "their" without a name.
  const whose = known ? `${firstName(known)}’s` : "their";
  const sameDay = !!job.scheduled_start && dateIn(job.scheduled_start, ctx.timeZone) === date;
  const when = sameDay ? minutesLabel(startMin) : `${formatDay(date)} at ${minutesLabel(startMin)}`;
  const what =
    problem.kind === "overlap" && problem.otherMin != null
      ? `which overlaps ${whose} ${minutesLabel(problem.otherMin)} job`
      : problem.kind === "overlap"
        ? `which overlaps another of ${whose} jobs`
        : problem.kind === "early"
          ? `earlier than ${known ? firstName(known) : "they"} can get there`
          : `which runs past the end of ${whose} day`;
  return {
    message,
    confirm: {
      title: `Move ${known ?? "the Second Tech"}’s Visit Too?`,
      message: `This also moves ${who} to ${when}, ${what}.`,
      action: "Move Anyway",
    },
  };
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
  // A shared job moves its second tech too: say so, and ask first when it runs into their day.
  const shared = sharedMove(
    ctx,
    {
      job,
      tech,
      date,
      startIso: mine.scheduled_start!,
      partnerDay: input.partnerDay,
      names: input.names,
    },
    drive,
  );
  // No times and no lateness (owner, 2026-10-21: "I don't care about days running late …
  // times are pretty irrelevant in this business").
  const change: ScheduleChange = {
    updates: [mine, ...updates.filter((u) => u !== mine), ...leaving(stayed)],
    message: shared?.message ?? "Moved.",
  };
  if (shared?.confirm) change.confirm = shared.confirm;
  return change;
}

// ---------------------------------------------------------------------------
// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md)
// ---------------------------------------------------------------------------

/** A stop on Today, as the reorder rules see it. */
export interface TodayMoveStop {
  id: string;
  /** Done for the day (folded away): stays where it is, and nothing moves above it. */
  done: boolean;
  /** Why it can't move ("Started", "Locked", "Time locked"), or null. */
  lock: string | null;
  /** In progress: nothing moves above it. */
  started: boolean;
}

/**
 * Why a stop on Today can't move, in Reorder's words, or null when it can: a started job is in
 * progress, a time lock (Time or Both) keeps its clock time, and a two-tech job is in two routes.
 * A day lock alone stays on its day but may change its place in it (owner, 2026-10-20: locks by
 * day, time, or both), so it can move here. The words are the lock icons' ("Locked", "Time
 * locked"), with no clock time (owner, 2026-10-21).
 */
export function todayStopLock(job: PlanJob, _timeZone?: string): string | null {
  const lock = lockReason(job);
  return lock ? LOCK_LABELS[lock] : null;
}

/** Do Later (last of the stops still to do), Move Up, Move Down, or a place (0 = first to do). */
export type TodayMove = "later" | "up" | "down" | number;

/**
 * Where a stop goes in the day for `moveJobChange` (its `index`, among the day's other jobs), or
 * null when it can't go there: it's locked or done, it's already in that place, or the place is
 * above a started stop. Places count the stops still to do; done stops stay where they are.
 */
export function todayMoveIndex(stops: TodayMoveStop[], id: string, to: TodayMove): number | null {
  const self = stops.find((s) => s.id === id);
  if (!self || self.done || self.lock) return null;
  const todo = stops.filter((s) => !s.done);
  const at = todo.indexOf(self);
  const rest = todo.filter((s) => s !== self);
  const others = stops.filter((s) => s !== self);
  // Nothing goes above a stop that's under way.
  const floor = rest.reduce((n, s, i) => (s.started ? i + 1 : n), 0);
  let place: number;
  if (to === "later") place = rest.length;
  else if (to === "down") place = at + 1;
  else if (to === "up") place = at - 1 < floor ? -1 : at - 1;
  else if (Number.isInteger(to)) place = Math.min(Math.max(to, floor), rest.length);
  else return null;
  if (rest.length === 0 || place < 0 || place > rest.length || place === at) return null;
  return place === 0 ? others.indexOf(rest[0]!) : others.indexOf(rest[place - 1]!) + 1;
}

/** What Move Up, Move Down, and Do Later can do for each stop (false when they'd do nothing). */
export function todayMoves(stops: TodayMoveStop[]) {
  return new Map(
    stops.map((s) => [
      s.id,
      {
        up: todayMoveIndex(stops, s.id, "up") !== null,
        down: todayMoveIndex(stops, s.id, "down") !== null,
        later: todayMoveIndex(stops, s.id, "later") !== null,
      },
    ]),
  );
}

/** The fields a job change may set, so Undo can put each back. */
const CHANGE_FIELDS = [
  "route_order",
  "scheduled_start",
  "scheduled_end",
  "status",
  "assigned_user_id",
  "arrival_fixed",
  "lock_day",
  "lock_time",
] as const;

const sameValue = (key: string, a: unknown, b: unknown) =>
  (key === "scheduled_start" || key === "scheduled_end") &&
  typeof a === "string" &&
  typeof b === "string"
    ? Date.parse(a) === Date.parse(b)
    : (a ?? null) === (b ?? null);

/**
 * A change's rows trimmed to what actually changes, and the saved values of those same fields
 * to put them back exactly (Undo after Do Later: owner, 2026-10-20). Rows that change nothing
 * are left out of both.
 */
export function changeWithUndo(
  updates: JobChange[],
  jobs: PlanJob[],
): { updates: JobChange[]; undo: JobChange[] } {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const out: JobChange[] = [];
  const undo: JobChange[] = [];
  for (const u of updates) {
    const was = byId.get(u.id);
    const next: Record<string, unknown> = { id: u.id };
    const back: Record<string, unknown> = { id: u.id };
    for (const key of CHANGE_FIELDS) {
      if (!(key in u)) continue;
      const before = was ? (was[key] ?? null) : null;
      if (was && sameValue(key, u[key], before)) continue;
      next[key] = u[key];
      back[key] = before;
    }
    if (Object.keys(next).length === 1) continue;
    out.push(next as unknown as JobChange);
    undo.push(back as unknown as JobChange);
  }
  return { updates: out, undo };
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
