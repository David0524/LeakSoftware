import {
  canUnschedule,
  durationLabel,
  jobLock,
  jobMinutes,
  localDate,
  localMinutes,
  planWeek,
  planWeekSplit,
  planWeekSummary,
  startFor,
  propertyLocation,
  stopFor,
  weekday,
  workDay,
  zonedMinutesToIso,
  type DriveFn,
  type JobChange,
  type PlanContext,
  type PlanJob,
  type PlannedStop,
  type WeekDay,
  type WeekJob,
} from "@leakbook/core";

// Plan Week on the phone (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from
// scratch"), the website's app/actions/week-plan.ts worked out from the phone's own jobs: the
// week's movable jobs go on days and techs for the least driving (core planWeek), each day then
// ordered as Optimize orders it. The changes and the rows Undo writes back are saved through
// the sync layer by the screen. Pure, so it's tested without a phone.

/** Everyone, in the "Plan for" list. */
export const EVERYONE = "all";

export const PLAN_WEEK_HELP =
  "Puts this week’s movable jobs on days for the least driving. Started, locked, two-tech and maintenance jobs stay where they are.";

export const PLAN_WEEK_UNDONE = "Put back as it was.";

/** A job as Plan Week reads it: a maintenance visit carries its plan. */
export type WeekPlanJob = PlanJob & { service_plan_id?: string | null };

/** What Plan Week may change on a job, as it was (Undo writes it back). */
type Row = Required<Pick<JobChange, "status" | "assigned_user_id" | "route_order">> & {
  scheduled_start: string | null;
  scheduled_end: string | null;
};

export interface WeekPlanOutcome {
  error?: string;
  message?: string;
  /** How the jobs were split between several techs ("Ana 6 jobs · Ben 5 jobs"), for the banner's
   *  second line. */
  detail?: string;
  /** The rows to save (only what changed). */
  updates: JobChange[];
  /** The same jobs as they were, for Undo. */
  undo: JobChange[];
}

/** The days Plan Week may plan: today or later, on the shop's working days. */
export function planDates(ctx: PlanContext, days: string[]): string[] {
  return [...new Set(days)]
    .filter((d) => d >= ctx.today && ctx.settings.workDays.includes(weekday(d)))
    .sort();
}

/**
 * Jobs in Needs a Time with nobody on them that Plan Week may place on these days (the switch's
 * "{n} waiting"), as the website's schedule page counts them.
 */
export function planWaitingCount(
  waiting: Pick<PlanJob, "assigned_user_id" | "scheduled_start">[],
  dates: string[],
  timeZone: string,
): number {
  return waiting.filter(
    (j) =>
      !j.assigned_user_id &&
      (!j.scheduled_start || dates.includes(localDate(new Date(j.scheduled_start), timeZone))),
  ).length;
}

/**
 * Plan these days for the techs picked (owner, 2026-10-20: "select multiple techs when planning a
 * week. Then it should split the open jobs up evenly"); EVERYONE among them means every active
 * tech. With two or more, the open jobs are split evenly by minutes of work (core planWeek
 * `even`). Started and finished jobs, day
 * locks, two-tech jobs and maintenance visits stay on their days; time locks keep their clock
 * time. A job given to a tech stays that tech's. `tray`: also place the jobs in Needs a Time
 * that nobody has yet; off, only the planned techs' own jobs move.
 */
export function buildWeekPlan(input: {
  ctx: PlanContext;
  /** The week on screen. */
  dates: string[];
  /** The techs picked; EVERYONE means every active tech. */
  techs: string[];
  tray: boolean;
  /** A tech's name, for the split line. */
  name?: (techId: string) => string;
  team: { user_id: string; status: string }[];
  /** A tech's day in route order (their own jobs and those they're second tech on). */
  dayJobs: (techId: string, date: string) => WeekPlanJob[];
  /** Needs a Time (the screen's needsATime): no time yet, then booked with nobody on them. */
  waiting: WeekPlanJob[];
  drive: DriveFn;
}): WeekPlanOutcome {
  const { ctx, tray, drive } = input;
  const none = (error: string): WeekPlanOutcome => ({ error, updates: [], undo: [] });
  const dates = planDates(ctx, input.dates);
  if (!dates.length) return none("No working days left this week to plan.");
  const techs = planTechs(input.techs, input.team);
  if (!techs.length) return none("Pick a week and a tech.");
  // Several techs: a job may go to any of them, split evenly.
  const several = techs.length > 1;

  const before = new Map<string, Row>();
  const remember = (j: WeekPlanJob) =>
    before.set(j.id, {
      status: j.status,
      assigned_user_id: j.assigned_user_id ?? null,
      scheduled_start: j.scheduled_start ?? null,
      scheduled_end: j.scheduled_end ?? null,
      route_order: j.route_order ?? null,
    });

  // Each tech's days: what stays, and what may move.
  const days: WeekDay[] = [];
  const stays = new Map<string, PlannedStop>();
  const jobs: WeekJob[] = [];
  const durations = new Map<string, number>();
  for (const techId of techs) {
    for (const date of dates) {
      const here: WeekDay = {
        techId,
        date,
        stays: [],
        earliestMin: date === ctx.today ? ctx.nowMin : null,
        // Their day starts and ends at home when they start there (owner, 2026-10-21).
        start: startFor(techId, ctx.starts, ctx.depot).at,
      };
      for (const j of input.dayJobs(techId, date)) {
        const own = j.assigned_user_id === techId;
        const lock = jobLock(j);
        const movesDay =
          own &&
          canUnschedule(j.status) &&
          !j.second_tech_id &&
          !j.service_plan_id &&
          lock !== "day" &&
          lock !== "both" &&
          !!propertyLocation(j.property);
        if (movesDay) {
          remember(j);
          durations.set(j.id, jobMinutes(j, ctx.settings));
          jobs.push({
            id: j.id,
            location: propertyLocation(j.property),
            durationMin: jobMinutes(j, ctx.settings),
            timeMin:
              lock === "time" && j.scheduled_start
                ? localMinutes(j.scheduled_start, ctx.timeZone)
                : null,
            techId,
            date,
            techs: several ? techs : [techId],
          });
          continue;
        }
        const stop = stopFor(j, {
          timeZone: ctx.timeZone,
          settings: ctx.settings,
          techId,
          nowMin: here.earliestMin,
        });
        if (own) remember(j);
        stays.set(`${techId}|${j.id}`, stop);
        here.stays.push(stop);
      }
      days.push(here);
    }
  }
  // Needs a Time: a job given to a tech is that tech's (planned only when they are); one with
  // nobody on it is placed only when the office asked for Needs a Time too.
  const considered = input.waiting.filter((j) =>
    j.assigned_user_id ? techs.includes(j.assigned_user_id) : tray,
  );
  for (const j of considered) {
    const date = j.scheduled_start ? localDate(new Date(j.scheduled_start), ctx.timeZone) : null;
    if (date && !dates.includes(date)) continue;
    if (!canUnschedule(j.status) || j.second_tech_id || !propertyLocation(j.property)) continue;
    const lock = jobLock(j);
    remember(j);
    durations.set(j.id, jobMinutes(j, ctx.settings));
    jobs.push({
      id: j.id,
      location: propertyLocation(j.property),
      durationMin: jobMinutes(j, ctx.settings),
      timeMin:
        (lock === "time" || lock === "both") && j.scheduled_start
          ? localMinutes(j.scheduled_start, ctx.timeZone)
          : null,
      techId: null,
      date: null,
      techs: j.assigned_user_id ? [j.assigned_user_id] : techs,
    });
  }
  if (!jobs.length) return none("Nothing to plan: every job this week is locked or started.");
  // Past the run's limit, the week's own jobs go first, then the jobs waiting longest (ids are
  // UUIDv7, so they sort by when they were made).
  jobs.sort(
    (a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date ? 0 : a.id.localeCompare(b.id)),
  );

  const plan = planWeek({
    days,
    jobs,
    depot: ctx.depot,
    day: workDay(ctx.settings),
    drive,
    even: several,
  });
  const moving = new Set(jobs.map((j) => j.id));
  const updates: JobChange[] = [];
  const undo: JobChange[] = [];
  for (const d of plan.days) {
    d.stops.forEach((s, i) => {
      const t = d.route.stops[i]!;
      const stay = stays.get(`${d.techId}|${s.id}`);
      if (stay && !stay.own) return;
      const row: JobChange = { id: s.id, route_order: i + 1 };
      const retime = moving.has(s.id) ? s.fixedStartMin == null : !!stay?.movable;
      const startMin = retime ? t.startMin : moving.has(s.id) ? s.fixedStartMin : null;
      if (startMin != null) {
        const start = zonedMinutesToIso(d.date, startMin, ctx.timeZone);
        row.scheduled_start = start;
        row.scheduled_end = new Date(
          Date.parse(start) + (durations.get(s.id) ?? s.durationMin) * 60_000,
        ).toISOString();
      }
      if (moving.has(s.id)) {
        row.assigned_user_id = d.techId;
        row.status = "scheduled";
      }
      const was = before.get(s.id);
      const { id: _id, ...values } = row;
      if (was && Object.entries(values).every(([k, v]) => same(was[k as keyof Row], v as unknown)))
        return;
      updates.push(row);
      if (was) undo.push({ id: s.id, ...was });
    });
  }
  const unlocated = considered.filter((j) => !propertyLocation(j.property)).length;
  return {
    message:
      planWeekSummary(plan, durationLabel) +
      (unlocated ? ` · ${unlocated} without a map location left in Needs a Time` : ""),
    ...(several ? { detail: planWeekSplit(plan, input.name ?? ((id) => id)) || undefined } : null),
    updates,
    undo,
  };
}

/**
 * The techs a plan covers, in the team's order: every active tech for EVERYONE, else the picked
 * ones on the team (never twice).
 */
export function planTechs(
  picked: readonly string[],
  team: readonly { user_id: string; status: string }[],
): string[] {
  if (picked.includes(EVERYONE))
    return team.filter((t) => t.status === "active").map((t) => t.user_id);
  const want = new Set(picked);
  return team.filter((t) => want.has(t.user_id)).map((t) => t.user_id);
}

/**
 * What Plan Week's "Plan for" row reads closed: "Everyone" when every tech is picked, the
 * tech's name for one, else "2 Techs". Empty when none is picked.
 */
export function planForLabel(
  picked: readonly string[],
  techs: readonly { id: string; name: string }[],
): string {
  const chosen = techs.filter((t) => picked.includes(EVERYONE) || picked.includes(t.id));
  if (!chosen.length) return "";
  if (chosen.length === techs.length && techs.length > 1) return "Everyone";
  if (chosen.length === 1) return chosen[0]!.name;
  return `${chosen.length} Techs`;
}

/**
 * Tapping a row of the "Plan for" checklist: Everyone selects every tech, or clears them all
 * when all are on; a tech's row turns that tech on or off. The picked list never holds EVERYONE.
 */
export function togglePlanTech(
  picked: readonly string[],
  value: string,
  techs: readonly { id: string }[],
): string[] {
  const ids = techs.map((t) => t.id);
  const now = picked.includes(EVERYONE) ? ids : picked.filter((id) => ids.includes(id));
  if (value === EVERYONE) return now.length === ids.length ? [] : ids;
  return now.includes(value)
    ? now.filter((id) => id !== value)
    : ids.filter((id) => id === value || now.includes(id));
}

/** Equal values, times compared as instants (the database writes them its own way). */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string" && a.includes("T") && b.includes("T"))
    return Date.parse(a) === Date.parse(b);
  return a === b;
}
