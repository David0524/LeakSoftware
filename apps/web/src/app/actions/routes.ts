"use server";

import { adminClient } from "@/server/admin";
import { notifyJobChanged } from "@/server/notify-events";
import { revalidatePath } from "next/cache";
import {
  addDays,
  canMoveJob,
  canUnschedule,
  durationLabel,
  formatAddress,
  isDateString,
  jobLock,
  jobMinutes,
  localDate,
  localMinutes,
  minutesLabel,
  optimizeRoute,
  propertyLocation,
  routeUpdates,
  stopFor,
  suggestSlots,
  timeRoute,
  weekday,
  workDay,
  zonedMinutesToIso,
  type JobUpdate,
  type LatLng,
  type PlanJob,
  type PlannedStop,
  type SlotSuggestion,
  type TechDay,
  dateFormat,
  changeWithUndo,
  lockReason,
  moveJobChange,
  stopDone,
  todayMoveIndex,
  todayStopLock,
  type JobChange,
  type TodayMove,
} from "@leakbook/core";
import { getOffice, requireManager, type Office } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  loadRoutes,
  routeContext,
  routeKey,
  techStart,
  type RouteContext,
} from "@/server/route-days";
import { geocodeAddress, routingConfigured } from "@/server/routing";
import type { FormState } from "./auth";

// Planning routes from the schedule (routing, owner request 2026-10-13). Optimize orders
// one tech's day; moving a job puts it on a tech's day at a place in the order; suggestions
// fit a job into routes already planned. Times customers were promised never move.

export interface RouteResult {
  error?: string;
  /** One short line for the banner: "Optimized · 1 hr 6 min less driving · Back by 4:28 PM". */
  message?: string;
  /** What to watch for, as a second, smaller line: "Runs 20 min past the end of the day." */
  detail?: string;
}

/** Optimize's answer: and the saved values of what it changed, for Undo (none when no change). */
export interface OptimizeResult extends RouteResult {
  undo?: JobChange[];
}

/** The banner when Optimize keeps the order (owner, 2026-10-22). */
const ALREADY_BEST = "Already the best order";

/** Notes as sentences: "Runs 20 min late. A fixed time can’t be met." */
function sentences(notes: (string | null)[]): string | undefined {
  const list = notes.filter((n): n is string => !!n);
  return list.length
    ? list.map((n) => `${n.charAt(0).toUpperCase()}${n.slice(1)}.`).join(" ")
    : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = Awaited<ReturnType<typeof createClient>>;

async function save<T extends { id: string }>(db: Db, office: Office, updates: T[]) {
  for (const { id, ...row } of updates) {
    const { error } = await db
      .from("job")
      .update(row as Record<string, unknown>)
      .eq("id", id)
      .eq("company_id", office.company.id);
    if (error) return error.message;
  }
  return null;
}

function refresh() {
  revalidatePath("/schedule");
  revalidatePath("/today");
  revalidatePath("/jobs", "layout");
}

/** Stops for one tech's day, as loaded. On today's route, nothing new starts before now. */
function dayStops(ctx: RouteContext, techId: string, date: string, jobs: PlanJob[]): PlannedStop[] {
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
// Optimize (owner, 2026-10-20: "Change 'plan route' to 'optimize'")
// ---------------------------------------------------------------------------

/** Order a tech's day for the least driving, keep promised times, and save the times. */
export async function planRoute(techId: string, date: string): Promise<OptimizeResult> {
  if (!UUID.test(techId) || !isDateString(date)) return { error: "Pick a tech and a day." };
  const office = await getOffice();
  const ctx = await routeContext(office);
  if (date < ctx.today) return { error: "Past days can’t be planned." };
  const { routes, drive } = await loadRoutes(office, ctx, [date], { live: true });
  const day = routes.get(routeKey(techId, date));
  if (!day || day.jobs.length === 0) return { error: "Nothing scheduled for this tech that day." };

  const stops = dayStops(ctx, techId, date, day.jobs);
  const hours = workDay(ctx.settings);
  // From this tech's start: their home when they start there, else the shop.
  const start = day.start.at;
  const before = timeRoute(stops, start, hours, drive);
  const { order, route } = optimizeRoute(stops, start, hours, drive);
  const planned = order.map((i) => stops[i]!);
  // Only what changes is saved, and its saved values come back for Undo (owner, 2026-10-22:
  // "Make Optimize show the new order at once, with Undo").
  const { updates, undo } = changeWithUndo(
    routeUpdates(date, ctx.timeZone, planned, route),
    day.jobs,
  );
  const error = await saveOrRestore(await createClient(), office, updates, undo);
  if (error) return { error };
  refresh();

  // One short line for the banner at the top of the screen (owner, 2026-10-20: the note under
  // the button "looks horrible"), and what to watch for as a second line. The order as it was:
  // "Already the best order", with no Undo.
  const same = order.every((i, at) => i === at);
  const saved = before.driveMin - route.driveMin;
  const message = same
    ? ALREADY_BEST
    : [
        "Optimized",
        saved > 0
          ? `${durationLabel(saved)} less driving`
          : `${durationLabel(route.driveMin)} driving`,
      ].join(" · ");
  const detail = sentences([
    stops.some((s) => !s.location) ? "driving to pools not on the map isn’t counted" : null,
    !start ? "the shop has no location (Settings › Scheduling)" : null,
  ]);
  return { message, detail, undo: same ? undefined : undo };
}

const OPTIMIZE_UNDO_KEYS = new Set(["id", "route_order", "scheduled_start", "scheduled_end"]);

/**
 * Undo after Optimize: put back the saved values `planRoute` returned, for jobs still on that
 * tech's day. Only the order and the times of stops that may move, on that day.
 */
export async function undoPlanRoute(
  techId: string,
  date: string,
  rows: JobChange[],
): Promise<RouteResult> {
  if (
    !UUID.test(techId) ||
    !isDateString(date) ||
    !Array.isArray(rows) ||
    rows.length === 0 ||
    rows.length > 100
  )
    return { error: "That can’t be undone." };
  const office = await getOffice();
  const ctx = await routeContext(office);
  if (date < ctx.today) return { error: "Past days can’t be planned." };
  const { routes } = await loadRoutes(office, ctx, [date]);
  const day = routes.get(routeKey(techId, date));
  const byId = new Map((day?.jobs ?? []).map((j) => [j.id, j]));
  const onDay = (v: unknown) =>
    typeof v === "string" &&
    !Number.isNaN(Date.parse(v)) &&
    localDate(new Date(v), ctx.timeZone) === date;
  for (const r of rows) {
    const j = r && typeof r === "object" && UUID.test(String(r.id)) ? byId.get(r.id) : undefined;
    if (!j || Object.keys(r).some((k) => !OPTIMIZE_UNDO_KEYS.has(k)))
      return { error: "This stop isn’t on this day anymore. Refresh the page." };
    const movable = lockReason(j) === null;
    const ok =
      (r.route_order == null ||
        (Number.isInteger(r.route_order) && (r.route_order as number) > 0)) &&
      (r.scheduled_start === undefined || (movable && onDay(r.scheduled_start))) &&
      (r.scheduled_end === undefined || (movable && onDay(r.scheduled_end)));
    if (!ok) return { error: "That can’t be undone." };
  }
  const error = await save(await createClient(), office, rows);
  if (error) return { error };
  refresh();
  return { message: "Put back as it was." };
}

// ---------------------------------------------------------------------------
// Moving a job
// ---------------------------------------------------------------------------

interface MovedJob extends PlanJob {
  property: { latitude: number | null; longitude: number | null } | null;
}

async function loadJob(db: Db, office: Office, id: string): Promise<MovedJob | null> {
  // Two reads: foreign keys here are composite (with company_id), so PostgREST can't embed
  // the pool from property_id alone.
  const { data } = await db
    .from("job")
    .select(
      "id, status, property_id, assigned_user_id, second_tech_id, scheduled_start, scheduled_end, route_order, arrival_fixed, lock_day, lock_time",
    )
    .eq("id", id)
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const job = data as Omit<MovedJob, "property"> & { property_id: string };
  const { data: property } = await db
    .from("property")
    .select("latitude, longitude")
    .eq("id", job.property_id)
    .maybeSingle();
  return { ...job, property: (property as MovedJob["property"]) ?? null };
}

export interface MoveInput {
  job: string;
  /** null: nobody assigned. */
  tech: string | null;
  /** null: take the job off the schedule. */
  date: string | null;
  /** Place in the tech's route that day (0 = first). Past the end: last. */
  index: number;
  /**
   * A plan visit's Just This Visit (owner, 2026-10-20): true marks it moved, so remaking the
   * plan's visits leaves it where it is; Undo passes its old value back. Left out: unchanged.
   */
  planMoved?: boolean;
}

/**
 * Put a job on a tech's day at a place in the route, or take it off the schedule. The job
 * gets the time its place allows; stops after it move later only if they must. Times
 * customers were promised stay (a fixed-time job keeps its time on the new day).
 */
export async function moveJob(input: MoveInput): Promise<RouteResult> {
  const { job: jobId, tech, date } = input;
  const marked = typeof input.planMoved === "boolean" ? { plan_moved: input.planMoved } : {};
  if (
    !UUID.test(jobId) ||
    (tech !== null && !UUID.test(tech)) ||
    (date !== null && !isDateString(date))
  )
    return { error: "That move isn’t possible." };
  const office = await getOffice();
  const db = await createClient();
  const job = await loadJob(db, office, jobId);
  if (!job) return { error: "This job is gone. Refresh the page." };
  if (!canMoveJob(job.status))
    return { error: "This job was canceled, so it stays off the schedule." };
  if (!date && !canUnschedule(job.status))
    return {
      error: "This job has started, so it stays on the schedule. Drag it to another day instead.",
    };
  // A started or finished job keeps its status when it moves; others become scheduled.
  const status = canUnschedule(job.status) ? "scheduled" : job.status;
  const ctx = await routeContext(office);
  if (date && date < ctx.today) return { error: "Pick today or a later day." };
  if (!ctx.seesAll && tech !== office.user.id && date)
    return {
      error: "You can schedule only your own jobs. Ask an owner to move it to someone else.",
    };
  if (tech && tech === job.second_tech_id)
    return { error: "This tech is already the second tech on this job." };
  const from = job.scheduled_start
    ? {
        tech: job.assigned_user_id ?? null,
        date: localDate(new Date(job.scheduled_start), ctx.timeZone),
      }
    : null;

  // Off the schedule.
  if (!date) {
    const error = await save(db, office, [
      {
        id: jobId,
        route_order: null,
        status: "unscheduled",
        scheduled_start: null,
        scheduled_end: null,
        arrival_fixed: false,
        ...marked,
      },
    ]);
    if (error) return { error };
    if (from?.tech) await renumber(db, office, ctx, from.tech, from.date, jobId);
    refresh();
    return { message: "Taken off the schedule." };
  }

  const duration = jobMinutes(job, ctx.settings);
  // A time lock keeps its clock time on the new day (owner, 2026-10-20).
  const lock = jobLock(job);
  const fixedMin =
    (lock === "time" || lock === "both") && job.scheduled_start
      ? localMinutes(job.scheduled_start, ctx.timeZone)
      : null;

  // Nobody assigned: the job keeps its time of day (or the start of the day) on that date.
  if (!tech) {
    const startMin = job.scheduled_start
      ? localMinutes(job.scheduled_start, ctx.timeZone)
      : workDay(ctx.settings).startMin;
    const start = zonedMinutesToIso(date, startMin, ctx.timeZone);
    const error = await save(db, office, [
      {
        id: jobId,
        route_order: null,
        assigned_user_id: null,
        status,
        scheduled_start: start,
        scheduled_end: new Date(Date.parse(start) + duration * 60_000).toISOString(),
        ...marked,
      },
    ]);
    if (error) return { error };
    if (from?.tech) await renumber(db, office, ctx, from.tech, from.date, jobId);
    refresh();
    return {
      message: `No tech yet, so it’s in Needs a Time, still booked for ${minutesLabel(startMin)}.`,
    };
  }

  // On a tech's day, at the chosen place.
  const { routes, drive } = await loadRoutes(office, ctx, [date], { live: true });
  const others = (routes.get(routeKey(tech, date))?.jobs ?? []).filter((j) => j.id !== jobId);
  const stops = dayStops(ctx, tech, date, others).map((s, i) => {
    // Stops already on the day keep their times unless the new order pushes them later.
    const start = others[i]!.scheduled_start;
    return s.movable && start
      ? { ...s, earliestMin: Math.max(s.earliestMin ?? 0, localMinutes(start, ctx.timeZone)) }
      : s;
  });
  const moved: PlannedStop = {
    id: jobId,
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
  const route = timeRoute(stops, techStart(ctx, tech).at, workDay(ctx.settings), drive);
  const updates = routeUpdates(date, ctx.timeZone, stops, route);
  const mine: JobUpdate & {
    assigned_user_id?: string;
    status?: string;
    plan_moved?: boolean;
  } = updates.find((u) => u.id === jobId)!;
  mine.assigned_user_id = tech;
  mine.status = status;
  Object.assign(mine, marked);
  if (fixedMin != null) {
    mine.scheduled_start = zonedMinutesToIso(date, fixedMin, ctx.timeZone);
    mine.scheduled_end = new Date(
      Date.parse(mine.scheduled_start) + duration * 60_000,
    ).toISOString();
  }
  // The moved job first, so a failure leaves the others as they were.
  const error = await save(db, office, [mine, ...updates.filter((u) => u !== mine)]);
  if (error) return { error };
  if (from?.tech && (from.tech !== tech || from.date !== date))
    await renumber(db, office, ctx, from.tech, from.date, jobId);
  refresh();
  // The tech hears about a new or moved stop (owner, 2026-10-19).
  if (tech && (from?.tech !== tech || from?.date !== date)) {
    const admin = adminClient();
    if (admin)
      await notifyJobChanged(admin, {
        jobId,
        moved: from?.tech === tech && !!from?.date,
        by: office.user.id,
        timeZone: ctx.timeZone,
      });
  }

  // No times and no lateness (owner, 2026-10-21: "times are pretty irrelevant").
  return { message: "Moved." };
}

/** After a job leaves a day, close up the order numbers (times stay as they are). */
async function renumber(
  db: Db,
  office: Office,
  ctx: RouteContext,
  techId: string,
  date: string,
  leaving: string,
) {
  const { routes } = await loadRoutes(office, ctx, [date]);
  const left = (routes.get(routeKey(techId, date))?.jobs ?? []).filter(
    (j) => j.id !== leaving && j.assigned_user_id === techId,
  );
  await save(
    db,
    office,
    left
      .map((j, i) => ({ id: j.id, route_order: i + 1 }))
      .filter((u, i) => left[i]!.route_order !== u.route_order),
  );
}

// ---------------------------------------------------------------------------
// Today: Do Later, Move Up, Move Down (owner, 2026-10-20; docs/plans/today-reorder.md)
// ---------------------------------------------------------------------------

export interface TodayMoveResult extends RouteResult {
  /** The saved values of every row the move changed, for Undo. */
  undo?: JobChange[];
}

const validMove = (to: unknown): to is TodayMove =>
  to === "later" ||
  to === "up" ||
  to === "down" ||
  (typeof to === "number" && Number.isInteger(to) && to >= 0 && to < 200);

/** Today's route for a tech, when the person may change its order (theirs, or an owner's). */
async function todayRoute(office: Office, tech: string) {
  if (tech !== office.user.id && !office.isManager)
    return { error: "You can change the order of your own day only." } as const;
  const ctx = await routeContext(office);
  const { routes, drive } = await loadRoutes(office, ctx, [ctx.today], { live: true });
  return { ctx, drive, day: routes.get(routeKey(tech, ctx.today))?.jobs ?? [] } as const;
}

/** Writes rows in order; if one fails, the rows already written go back. */
async function saveOrRestore(db: Db, office: Office, updates: JobChange[], undo: JobChange[]) {
  for (let i = 0; i < updates.length; i++) {
    const error = await save(db, office, [updates[i]!]);
    if (error) {
      await save(db, office, undo.slice(0, i));
      return error;
    }
  }
  return null;
}

/**
 * Move a stop on today's route: Do Later (after every stop still to do), Move Up, Move Down, or
 * to a place among the stops still to do. The Schedule's move decides the times
 * (moveJobChange): promised times never move and stops after it move later only when they
 * must. Same tech and day, so nobody is notified: the person moving it already knows.
 */
export async function moveTodayStop(input: {
  job: string;
  tech: string;
  to: TodayMove;
}): Promise<TodayMoveResult> {
  if (!UUID.test(input.job) || !UUID.test(input.tech) || !validMove(input.to))
    return { error: "That move isn’t possible." };
  const office = await getOffice();
  const route = await todayRoute(office, input.tech);
  if ("error" in route) return { error: route.error };
  const { ctx, drive, day } = route;
  const job = day.find((j) => j.id === input.job);
  if (!job) return { error: "This stop isn’t on this day anymore. Refresh the page." };
  const stops = day.map((j) => {
    const done = stopDone(j, ctx.today);
    return {
      id: j.id,
      done,
      lock: todayStopLock(j, ctx.timeZone),
      started: !done && j.status === "in_progress",
    };
  });
  const self = stops.find((s) => s.id === job.id)!;
  if (self.done) return { error: "This stop is done, so it stays where it is." };
  if (self.lock) return { error: `${self.lock}, so it stays where it is.` };
  // Stops already done for the day stay as they are: the move plans the rest of the day.
  const planned = day.filter((j) => !stopDone(j, ctx.today));
  const index = todayMoveIndex(
    stops.filter((s) => !s.done),
    job.id,
    input.to,
  );
  if (index === null) return { error: "It’s already there." };
  const change = moveJobChange(
    ctx,
    {
      job,
      tech: input.tech,
      date: ctx.today,
      index,
      targetDay: planned,
      fromDay: planned,
      seesAll: office.isManager,
      userId: office.user.id,
    },
    drive,
  );
  if (change.error) return { error: change.error };
  const { updates, undo } = changeWithUndo(change.updates, day);
  const error = await saveOrRestore(await createClient(), office, updates, undo);
  if (error) return { error };
  refresh();
  return { message: change.message, undo };
}

const UNDO_KEYS = new Set([
  "id",
  "route_order",
  "scheduled_start",
  "scheduled_end",
  "status",
  "assigned_user_id",
  "arrival_fixed",
  "lock_day",
  "lock_time",
]);

/**
 * Undo after Do Later: put back exactly the saved values `moveTodayStop` returned, for jobs
 * still on that tech's day today. Only a place in the route changes on a stop that can't move.
 */
export async function undoTodayMove(tech: string, rows: JobChange[]): Promise<RouteResult> {
  if (!UUID.test(tech) || !Array.isArray(rows) || rows.length === 0 || rows.length > 100)
    return { error: "That can’t be undone." };
  const office = await getOffice();
  const route = await todayRoute(office, tech);
  if ("error" in route) return { error: route.error };
  const { ctx, day } = route;
  const byId = new Map(day.map((j) => [j.id, j]));
  const onToday = (v: unknown) =>
    typeof v === "string" &&
    !Number.isNaN(Date.parse(v)) &&
    localDate(new Date(v), ctx.timeZone) === ctx.today;
  for (const r of rows) {
    const j = r && typeof r === "object" && UUID.test(String(r.id)) ? byId.get(r.id) : undefined;
    if (!j || Object.keys(r).some((k) => !UNDO_KEYS.has(k)))
      return { error: "This stop isn’t on this day anymore. Refresh the page." };
    const movable = lockReason(j) === null;
    const ok =
      (r.route_order == null ||
        (Number.isInteger(r.route_order) && (r.route_order as number) > 0)) &&
      (r.scheduled_start === undefined || (movable && onToday(r.scheduled_start))) &&
      (r.scheduled_end === undefined || (movable && onToday(r.scheduled_end))) &&
      (r.status === undefined || (movable && r.status === "scheduled")) &&
      (r.assigned_user_id === undefined || (movable && r.assigned_user_id === tech)) &&
      (r.arrival_fixed === undefined || (movable && r.arrival_fixed === false)) &&
      (r.lock_day === undefined || (movable && r.lock_day === false)) &&
      (r.lock_time === undefined || (movable && r.lock_time === false));
    if (!ok) return { error: "That can’t be undone." };
  }
  const error = await save(await createClient(), office, rows);
  if (error) return { error };
  refresh();
  return { message: "Undone." };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface Suggestion extends SlotSuggestion {
  /** "Tue, Oct 14" */
  dayLabel: string;
  timeLabel: string;
}

export interface SuggestResult {
  suggestions?: Suggestion[];
  note?: string;
  error?: string;
}

/**
 * Where a job fits best in the routes already planned for the coming working days: the
 * places that add the least driving without moving anyone else's time or running late.
 */
export async function suggestTimes(target: {
  /** An existing job (its pool and length). */
  job?: string;
  /** Or a pool, for a job not made yet. */
  property?: string;
  hours?: number;
}): Promise<SuggestResult> {
  const jobId = target.job && UUID.test(target.job) ? target.job : null;
  const propertyId = target.property && UUID.test(target.property) ? target.property : null;
  if (!jobId && !propertyId) return { error: "Pick a job or a pool." };
  const office = await getOffice();
  const db = await createClient();
  const ctx = await routeContext(office);
  let location: LatLng | null;
  let durationMin: number;
  if (jobId) {
    const job = await loadJob(db, office, jobId);
    if (!job) return { error: "This job is gone. Refresh the page." };
    location = propertyLocation(job.property);
    durationMin = jobMinutes(job, ctx.settings);
  } else {
    const { data } = await db
      .from("property")
      .select("latitude, longitude")
      .eq("id", propertyId!)
      .eq("company_id", office.company.id)
      .maybeSingle();
    if (!data) return { error: "Pick a pool." };
    location = propertyLocation(data as { latitude: number | null; longitude: number | null });
    durationMin = ctx.settings.jobMinutes;
  }
  if (target.hours && target.hours > 0 && target.hours <= 12)
    durationMin = Math.round(target.hours * 60);
  const hours = workDay(ctx.settings);

  // The next 7 working days, today included while there's time left in it.
  const dates: string[] = [];
  for (let d = ctx.today; dates.length < 7 && d < addDays(ctx.today, 21); d = addDays(d, 1)) {
    if (!ctx.settings.workDays.includes(weekday(d))) continue;
    if (d === ctx.today && ctx.nowMin > hours.endMin - 60) continue;
    dates.push(d);
  }
  if (dates.length === 0) return { error: "No working days are set (Settings › Scheduling)." };

  const [{ routes, drive }, team] = await Promise.all([
    loadRoutes(office, ctx, dates),
    getTeam(office),
  ]);
  // A tech limited to their own jobs gets suggestions on their own route only.
  const techs = team.filter(
    (t) => t.status === "active" && (ctx.seesAll || t.user_id === office.user.id),
  );
  const days: TechDay[] = [];
  for (const date of dates) {
    for (const t of techs) {
      const jobs = (routes.get(routeKey(t.user_id, date))?.jobs ?? []).filter(
        (j) => j.id !== jobId,
      );
      // Everyone already booked keeps their time: suggestions only use the gaps.
      const stops = dayStops(ctx, t.user_id, date, jobs).map((s, i) => {
        const start = jobs[i]!.scheduled_start;
        return start
          ? { ...s, fixedStartMin: localMinutes(start, ctx.timeZone), earliestMin: null }
          : s;
      });
      days.push({
        date,
        techId: t.user_id,
        techName: t.name,
        stops,
        labels: Object.fromEntries(jobs.map((j) => [j.id, j.customer?.name ?? "the job before"])),
        notBeforeMin: date === ctx.today ? ctx.nowMin : null,
        // Each tech's day from their own start (home or the shop).
        start: techStart(ctx, t.user_id).at,
      });
    }
  }
  const found = suggestSlots({ location, durationMin }, days, ctx.depot, hours, drive, 5);
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
    note: !location
      ? "This pool has no location yet, so these don’t count driving to it."
      : found.length === 0
        ? "No gaps in the next working days. Pick a day and time below."
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

const validPoint = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Mark the pool where the phone is (at the pool): free, and exact. */
export async function setPoolLocation(
  propertyId: string,
  lat: number,
  lng: number,
): Promise<RouteResult> {
  if (!UUID.test(propertyId) || !validPoint(lat, lng))
    return { error: "That location isn’t valid." };
  const office = await getOffice();
  const db = await createClient();
  const { data } = await db
    .from("property")
    .select("address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .eq("company_id", office.company.id)
    .maybeSingle();
  if (!data) return { error: "This pool is gone. Refresh the page." };
  const { error } = await db
    .from("property")
    .update({
      latitude: lat,
      longitude: lng,
      geocoded_address: formatAddress(data as Parameters<typeof formatAddress>[0]),
      location_source: "gps",
    })
    .eq("id", propertyId);
  if (error) return { error: error.message };
  revalidatePath("/jobs", "layout");
  refresh();
  return { message: "Pool location saved." };
}

/** Owners: the shop's location, where every route starts and ends, from the phone. */
export async function setShopLocation(lat: number, lng: number): Promise<RouteResult> {
  if (!validPoint(lat, lng)) return { error: "That location isn’t valid." };
  const office = await requireManager();
  const db = await createClient();
  const { data } = await db.from("company").select("*").eq("id", office.company.id).single();
  const { error } = await db
    .from("company")
    .update({
      latitude: lat,
      longitude: lng,
      geocoded_address: formatAddress((data ?? {}) as Parameters<typeof formatAddress>[0]),
    })
    .eq("id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/scheduling");
  refresh();
  return { message: "Shop location saved." };
}

/** Owners: find the shop's location from its address. */
export async function locateShop(): Promise<RouteResult> {
  const office = await requireManager();
  if (!routingConfigured())
    return { error: "Address lookup isn’t set up. Use My Location while at the shop instead." };
  const db = await createClient();
  const { data } = await db.from("company").select("*").eq("id", office.company.id).single();
  const address = formatAddress((data ?? {}) as Parameters<typeof formatAddress>[0]);
  if (!address) return { error: "Add the shop’s address in Settings › Company first." };
  const found = await geocodeAddress(db, office.company.id, address);
  if (!found)
    return { error: "That address wasn’t found. Check it, or use My Location at the shop." };
  const { error } = await db
    .from("company")
    .update({ latitude: found.lat, longitude: found.lng, geocoded_address: address })
    .eq("id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/scheduling");
  refresh();
  return { message: "Shop location found." };
}

/** Owners: look up pools that have no location yet (up to 50 at a time). */
export async function locatePools(): Promise<RouteResult> {
  const office = await requireManager();
  if (!routingConfigured()) return { error: "Address lookup isn’t set up." };
  const db = await createClient();
  const { data } = await db
    .from("property")
    .select("id, address_line1, city, state, postal_code")
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .is("latitude", null)
    .limit(50);
  const pools = (data ?? []) as (Parameters<typeof formatAddress>[0] & { id: string })[];
  let found = 0;
  for (const p of pools) {
    const address = formatAddress(p);
    const at = await geocodeAddress(db, office.company.id, address);
    if (!at) continue;
    const { error } = await db
      .from("property")
      .update({
        latitude: at.lat,
        longitude: at.lng,
        geocoded_address: address,
        location_source: "geocoder",
      })
      .eq("id", p.id);
    if (!error) found++;
  }
  revalidatePath("/settings/scheduling");
  refresh();
  return {
    message:
      pools.length === 0
        ? "Every pool has a location."
        : `Found ${found} of ${pools.length} pool${pools.length === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Settings › Scheduling
// ---------------------------------------------------------------------------

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveScheduling(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const fields: Record<string, string> = {};
  const start = text("day_start");
  const end = text("day_end");
  if (!CLOCK.test(start)) fields.day_start = "Pick a time.";
  if (!CLOCK.test(end)) fields.day_end = "Pick a time.";
  else if (CLOCK.test(start) && end <= start) fields.day_end = "End after the start.";
  const window = Number(text("arrival_window_minutes"));
  if (![0, 60, 120, 240].includes(window)) fields.arrival_window_minutes = "Pick a window.";
  const hours = Number(text("job_hours"));
  if (!(hours >= 0.25 && hours <= 12)) fields.job_hours = "Enter 0.25 to 12 hours.";
  const days = form
    .getAll("work_days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length === 0) fields.work_days = "Pick at least one day.";
  const visitMinutes = Number(text("visit_minutes"));
  if (!(Number.isInteger(visitMinutes) && visitMinutes >= 10 && visitMinutes <= 240))
    fields.visit_minutes = "Enter 10 to 240 minutes.";
  const weeksAhead = Number(text("weeks_ahead"));
  if (!(Number.isInteger(weeksAhead) && weeksAhead >= 1 && weeksAhead <= 12))
    fields.weeks_ahead = "Enter 1 to 12 weeks.";
  if (Object.keys(fields).length) return { fields };
  const db = await createClient();
  const { data } = await db.from("company").select("settings").eq("id", office.company.id).single();
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    routing: {
      day_start: start,
      day_end: end,
      arrival_window_minutes: window,
      job_minutes: Math.round(hours * 60),
      work_days: [...new Set(days)].sort(),
    },
    // Other maintenance settings (the usual cleaning frequencies) stay as they are.
    maintenance: {
      ...((data?.settings as { maintenance?: Record<string, unknown> } | null)?.maintenance ?? {}),
      visit_minutes: visitMinutes,
      weeks_ahead: weeksAhead,
    },
  };
  const { error } = await db.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/scheduling");
  refresh();
  return { message: "Saved." };
}
