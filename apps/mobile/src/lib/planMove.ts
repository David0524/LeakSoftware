import { asksPlanMove, localDate, type JobChange, type VisitSlot } from "@leakbook/core";
import { WEEKDAY_NAMES, moveWrite, undoRow, type PlanRow, type PlanUndo } from "./serviceRoutes";

// Moving a weekly maintenance visit (owner, 2026-10-20; docs/design/2026-10-20-team-week.md
// section 5): a plan's visits keep its weekday and tech, so moving one asks "Move <Customer>'s
// visits?" with Change Schedule (the plan moves, core moveServiceDay, and the server re-makes
// its coming visits when the change syncs) or Just This Visit (this visit moves and is marked
// `plan_moved`, so remaking the plan's visits leaves it where it is). Both have Undo. Pure, so
// it's tested without a phone; the screens hand the writes to the sync layer.

/** A job as a move reads it. */
export interface VisitJob {
  id: string;
  status: string;
  service_plan_id?: string | null;
  plan_moved?: boolean | null;
  scheduled_start?: string | null;
  assigned_user_id?: string | null;
}

/** Where the visit is now (null: not on the schedule). */
export function visitSlot(job: VisitJob, timeZone: string): VisitSlot | null {
  if (!job.scheduled_start || job.status === "unscheduled") return null;
  return {
    date: localDate(new Date(job.scheduled_start), timeZone),
    techId: job.assigned_user_id ?? null,
  };
}

/**
 * Whether this move asks first: a plan's scheduled visit going to another day or tech (core
 * asksPlanMove). Off the schedule or to nobody yet never asks: see takesOffPlan.
 */
export function moveAsks(
  job: VisitJob,
  to: { tech: string | null; date: string | null },
  timeZone: string,
): { from: VisitSlot; to: VisitSlot } | null {
  const from = visitSlot(job, timeZone);
  if (!from || !to.date) return null;
  const slot = { from, to: { date: to.date, techId: to.tech } };
  return asksPlanMove(job, slot) ? slot : null;
}

/**
 * Taking a plan's visit off the schedule (Needs a Time, Take Off Schedule) or giving it to
 * nobody yet (the Move sheet's "Nobody yet") is always a one-off (owner, 2026-10-20): no question, but the visit is marked `plan_moved` with the move, so
 * remaking the plan's visits never puts it back. Undo restores both.
 */
export function takesOffPlan(
  job: VisitJob,
  to: { tech: string | null; date: string | null },
  timeZone: string,
): boolean {
  return Boolean(job.service_plan_id) && (!to.date || !to.tech) && visitSlot(job, timeZone) != null;
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * Change Schedule: the plan's columns to save so its coming visits fall on the new weekday with
 * the new tech (the old one when the move keeps it), and the row to put it back.
 */
export function changeSchedule(
  plan: PlanRow,
  move: { from: VisitSlot; to: VisitSlot },
  today: string,
): { write: PlanUndo; undo: PlanUndo; weekday: string } {
  const to = weekday(move.to.date);
  const write = moveWrite(
    plan,
    {
      from: weekday(move.from.date),
      to,
      tech: move.to.techId ?? plan.assigned_user_id ?? "",
    },
    today,
  );
  return {
    write: { ...write, assigned_user_id: move.to.techId ?? plan.assigned_user_id ?? null },
    undo: undoRow(plan),
    weekday: WEEKDAY_NAMES[to],
  };
}

/** A job change with the visit's own mark (synced as a job column). */
export type VisitChange = JobChange & { plan_moved?: boolean };

/** Just This Visit: the move's job changes with the moved visit marked `plan_moved`. */
export function justThisVisit(updates: JobChange[], jobId: string): VisitChange[] {
  const marked = updates.map((u) => (u.id === jobId ? { ...u, plan_moved: true } : u));
  return marked.some((u) => u.id === jobId) ? marked : [...marked, { id: jobId, plan_moved: true }];
}

/**
 * Undo for a set of job changes: each changed job's columns as they were before, so Undo puts
 * the move (and the stops it renumbered) back, `plan_moved` included.
 */
export function undoChanges(
  updates: VisitChange[],
  before: (id: string) => Record<string, unknown> | undefined,
): VisitChange[] {
  const out: VisitChange[] = [];
  for (const u of updates) {
    const was = before(u.id);
    if (!was) continue;
    const row: Record<string, unknown> = { id: u.id };
    for (const k of Object.keys(u)) {
      if (k === "id") continue;
      row[k] = k === "plan_moved" ? Boolean(was[k]) : (was[k] ?? null);
    }
    out.push(row as unknown as VisitChange);
  }
  return out;
}
