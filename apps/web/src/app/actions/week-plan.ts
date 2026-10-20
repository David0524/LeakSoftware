"use server";

import { revalidatePath } from "next/cache";
import {
  canUnschedule,
  durationLabel,
  isDateString,
  jobLock,
  jobMinutes,
  localDate,
  localMinutes,
  planWeek as planTheWeek,
  planWeekSummary,
  propertyLocation,
  stopFor,
  weekday,
  workDay,
  zonedMinutesToIso,
  type PlannedStop,
  type WeekDay,
  type WeekJob,
} from "@leakbook/core";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadRoutes, needsScheduling, routeContext, routeKey } from "@/server/route-days";

// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md): a week's movable jobs on days and
// techs for the least driving, each day then ordered as Optimize orders it, with one Undo.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a job was before Plan Week changed it, for Undo. */
export interface WeekUndoRow {
  id: string;
  status: string;
  assigned_user_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  route_order: number | null;
}

export interface WeekPlanResult {
  error?: string;
  message?: string;
  undo?: WeekUndoRow[];
}

type Row = Omit<WeekUndoRow, "id">;

/**
 * Plan these days (the week on screen) for one tech or every tech. Started and finished jobs,
 * day locks, two-tech jobs and maintenance visits stay on their days; time locks keep their
 * clock time. A job given to a tech stays that tech's. `tray` (default on): also place the
 * jobs in Needs a Time that nobody has yet; off, only the planned techs' own jobs move.
 * Owners and admins.
 */
export async function planWeek(input: {
  dates: string[];
  tech: string;
  tray?: boolean;
}): Promise<WeekPlanResult> {
  const tray = input.tray !== false;
  const all = input.tech === "all";
  if ((!all && !UUID.test(input.tech)) || !Array.isArray(input.dates) || input.dates.length > 7)
    return { error: "Pick a week and a tech." };
  if (!input.dates.every(isDateString)) return { error: "Pick a week and a tech." };
  const office = await requireManager();
  const ctx = await routeContext(office);
  const dates = [...new Set(input.dates)]
    .filter((d) => d >= ctx.today && ctx.settings.workDays.includes(weekday(d)))
    .sort();
  if (!dates.length) return { error: "No working days left this week to plan." };

  const [{ routes, team, drive }, waiting] = await Promise.all([
    loadRoutes(office, ctx, dates),
    needsScheduling(office),
  ]);
  const techs = all
    ? team.filter((t) => t.status === "active").map((t) => t.user_id)
    : team.some((t) => t.user_id === input.tech)
      ? [input.tech]
      : [];
  if (!techs.length) return { error: "Pick a week and a tech." };

  const before = new Map<string, Row>();
  const remember = (j: {
    id: string;
    status: string;
    assigned_user_id?: string | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    route_order?: number | null;
  }) =>
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
      const day = routes.get(routeKey(techId, date));
      const here: WeekDay = {
        techId,
        date,
        stays: [],
        earliestMin: date === ctx.today ? ctx.nowMin : null,
      };
      for (const j of day?.jobs ?? []) {
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
            techs: all ? techs : [techId],
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
  // Needs a Time: jobs without a time, and booked jobs with nobody on them this week. A job
  // given to a tech is that tech's (planned only when they are); one with nobody on it is
  // placed only when the office asked for Needs a Time too.
  const considered = waiting.filter((j) =>
    j.assigned_user_id ? techs.includes(j.assigned_user_id) : tray,
  );
  for (const j of considered) {
    const date = j.scheduled_start ? localDate(new Date(j.scheduled_start), ctx.timeZone) : null;
    if (date && !dates.includes(date)) continue;
    if (!canUnschedule(j.status) || j.second_tech_id || !propertyLocation(j.property)) continue;
    const allowed = j.assigned_user_id ? [j.assigned_user_id] : techs;
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
      techs: allowed,
    });
  }
  if (!jobs.length) return { error: "Nothing to plan: every job this week is locked or started." };
  // Past the run's limit, the week's own jobs go first, then the jobs waiting longest (ids are
  // UUIDv7, so they sort by when they were made).
  jobs.sort(
    (a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date ? 0 : a.id.localeCompare(b.id)),
  );

  const plan = planTheWeek({ days, jobs, depot: ctx.depot, day: workDay(ctx.settings), drive });
  const moving = new Set(jobs.map((j) => j.id));
  const updates: (Partial<Row> & { id: string })[] = [];
  for (const d of plan.days) {
    d.stops.forEach((s, i) => {
      const t = d.route.stops[i]!;
      const stay = stays.get(`${d.techId}|${s.id}`);
      if (stay && !stay.own) return;
      const row: Partial<Row> & { id: string } = { id: s.id, route_order: i + 1 };
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
      updates.push(row);
    });
  }

  const db = await createClient();
  const changed: WeekUndoRow[] = [];
  for (const { id, ...row } of updates) {
    const was = before.get(id);
    if (was && Object.entries(row).every(([k, v]) => same(was[k as keyof Row], v))) continue;
    const { error } = await db
      .from("job")
      .update(row)
      .eq("id", id)
      .eq("company_id", office.company.id);
    if (error) {
      // Put back what changed so far, so a failure leaves the week as it was.
      await restore(db, office.company.id, changed);
      return { error: error.message };
    }
    if (was) changed.push({ id, ...was });
  }
  refresh();
  const unlocated = considered.filter((j) => !propertyLocation(j.property)).length;
  return {
    message:
      planWeekSummary(plan, durationLabel) +
      (unlocated ? ` · ${unlocated} without a map location left in Needs a Time` : ""),
    undo: changed,
  };
}

/** Undo Plan Week: put each job back as it was. */
export async function undoPlanWeek(rows: WeekUndoRow[]): Promise<WeekPlanResult> {
  if (!Array.isArray(rows) || rows.length > 400 || !rows.every((r) => UUID.test(r?.id ?? "")))
    return { error: "That can’t be undone." };
  const office = await requireManager();
  const db = await createClient();
  const error = await restore(db, office.company.id, rows);
  if (error) return { error };
  refresh();
  return { message: "Put back as it was." };
}

async function restore(
  db: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  rows: WeekUndoRow[],
): Promise<string | null> {
  for (const r of rows) {
    const { error } = await db
      .from("job")
      .update({
        status: r.status,
        assigned_user_id: r.assigned_user_id,
        scheduled_start: r.scheduled_start,
        scheduled_end: r.scheduled_end,
        route_order: r.route_order,
      })
      .eq("id", r.id)
      .eq("company_id", companyId);
    if (error) return error.message;
  }
  return null;
}

/** Equal values, times compared as instants (the database writes them its own way). */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string" && a.includes("T") && b.includes("T"))
    return Date.parse(a) === Date.parse(b);
  return a === b;
}

function refresh() {
  revalidatePath("/schedule");
  revalidatePath("/today");
  revalidatePath("/jobs", "layout");
}
