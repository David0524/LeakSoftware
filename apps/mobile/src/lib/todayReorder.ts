import {
  LOCK_LABELS,
  formatTime,
  moveJobChange,
  stopDone,
  type DriveFn,
  type JobChange,
  type PlanContext,
  type PlanJob,
  type ScheduleChange,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md). Do Later
// and Reorder's Move Up, Move Down and drag are the Schedule's own move (core moveJobChange):
// same tech, same day, a new place in the route. These are the parts with no React; the screen
// saves the rows through the sync layer, so it works offline.

/** A stop on Today as the reorder reads it (a job with its property). */
export type ReorderStop = PlanJob & { stop_done_on?: string | null };

/** Why a stop can't move, if it can't. Done stops are folded away on Today already. */
export type StopLock =
  | { kind: "done"; label: string }
  | { kind: "started"; label: string }
  | { kind: "promised"; label: string }
  | { kind: "second"; label: string };

/**
 * Why a stop on `techId`'s day can't move: done for the day, started, promised for a time
 * ("Promised for 9:00 AM"), or a two-tech job seen from the second tech's day (it moves with
 * the main tech's route). Null when it can move.
 */
export function stopLock(
  job: ReorderStop,
  techId: string,
  day: string,
  timeZone: string,
): StopLock | null {
  if (stopDone(job, day)) return { kind: "done", label: "Done" };
  if (job.status !== "scheduled" && job.status !== "unscheduled")
    return { kind: "started", label: LOCK_LABELS.started };
  if (job.arrival_fixed && job.scheduled_start)
    return {
      kind: "promised",
      label: `Promised for ${formatTime(job.scheduled_start, timeZone)}`,
    };
  if (job.assigned_user_id !== techId) return { kind: "second", label: LOCK_LABELS.two_techs };
  return null;
}

/**
 * Who may reorder the day on screen: techs their own, owners and admins any tech's they're
 * viewing ("Whose day").
 */
export function canReorderDay(input: { manager: boolean; me: string; techId: string }): boolean {
  return input.manager || input.techId === input.me;
}

export type ReorderAction = "later" | "up" | "down";

export interface ReorderRow {
  id: string;
  lock: StopLock | null;
  canUp: boolean;
  canDown: boolean;
  /** Do Later: there's a stop after it to go behind. */
  canLater: boolean;
}

/**
 * The first place a stop can move to: after the last stop that's done or started (a stop
 * put before one of those would still come after it, since nothing starts before now).
 */
function firstOpenPlace(locks: (StopLock | null)[]): number {
  let last = -1;
  locks.forEach((l, i) => {
    if (l && (l.kind === "done" || l.kind === "started")) last = i;
  });
  return last + 1;
}

/** Each stop's lock and which moves it has, for the day in route order. */
export function reorderRows(
  stops: ReorderStop[],
  techId: string,
  day: string,
  timeZone: string,
): ReorderRow[] {
  const locks = stops.map((s) => stopLock(s, techId, day, timeZone));
  const first = firstOpenPlace(locks);
  return stops.map((s, i) => {
    const lock = locks[i]!;
    const down = !lock && i < stops.length - 1;
    return { id: s.id, lock, canUp: !lock && i - 1 >= first, canDown: down, canLater: down };
  });
}

/**
 * The place in the route (among the day's other stops, 0 = first, as moveJobChange reads it)
 * for an action on the stop at `from`: Do Later is past the last stop, Move Up and Move Down
 * one place up or down.
 */
export function actionPlace(count: number, from: number, action: ReorderAction): number {
  const others = count - 1;
  if (action === "later") return others;
  if (action === "up") return Math.max(0, from - 1);
  return Math.min(others, from + 1);
}

/**
 * Where a dragged stop lands, among the day's other stops: just before `beforeId`, or last
 * when it's null. Never ahead of a stop that's done or started.
 */
export function dropPlace(
  stops: ReorderStop[],
  draggedId: string,
  beforeId: string | null,
  techId: string,
  day: string,
  timeZone: string,
): number {
  const others = stops.filter((s) => s.id !== draggedId);
  const at = beforeId ? others.findIndex((s) => s.id === beforeId) : -1;
  const place = at >= 0 ? at : others.length;
  return Math.max(place, firstOpenPlace(others.map((s) => stopLock(s, techId, day, timeZone))));
}

/**
 * The day as the move reads it: a stop done for the day keeps its time and place, the way a
 * started one does (Mark Complete leaves a leak job's status as it was).
 */
function asPlanned(stops: ReorderStop[], day: string): PlanJob[] {
  return stops.map((s) =>
    stopDone(s, day) && (s.status === "scheduled" || s.status === "unscheduled")
      ? { ...s, status: "in_progress" }
      : s,
  );
}

/**
 * The rows to save to put `jobId` at `place` in `techId`'s day (core moveJobChange, its
 * messages as they are). A stop that can't move is refused with its reason.
 */
export function reorderChange(
  ctx: PlanContext,
  input: {
    /** The tech's day, in route order. */
    stops: ReorderStop[];
    jobId: string;
    place: number;
    techId: string;
    /** Owners and admins: any tech's day. */
    seesAll: boolean;
    userId: string;
  },
  drive: DriveFn,
): ScheduleChange {
  const { stops, jobId, techId } = input;
  const job = stops.find((s) => s.id === jobId);
  if (!job) return { updates: [], error: "This stop isn’t on this day any more." };
  const lock = stopLock(job, techId, ctx.today, ctx.timeZone);
  if (lock?.kind === "done") return { updates: [], error: "This stop is done for the day." };
  if (lock?.kind === "started")
    return { updates: [], error: "This job has started, so it stays where it is." };
  if (lock?.kind === "promised")
    return { updates: [], error: `${lock.label}, so it stays where it is.` };
  if (lock?.kind === "second")
    return {
      updates: [],
      error: "This job is on another tech’s route too. Move it on the main tech’s day.",
    };
  const day = asPlanned(stops, ctx.today);
  return moveJobChange(
    ctx,
    {
      job,
      tech: techId,
      date: ctx.today,
      index: input.place,
      targetDay: day,
      fromDay: day,
      seesAll: input.seesAll,
      userId: input.userId,
    },
    drive,
  );
}

// ---------------------------------------------------------------------------
// Saving, and Undo
// ---------------------------------------------------------------------------

/** What the reorder needs from the sync service (SyncService has these). */
export interface JobStore {
  get(table: string, id: string): Record<string, unknown> | undefined;
  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void;
  batch<T>(fn: () => T): T;
}

/**
 * The saved values, before a change, of every field the change writes on every job row it
 * touches. Writing these back is Undo: the jobs as they were, not a second move.
 */
export function snapshotJobs(store: Pick<JobStore, "get">, updates: JobChange[]): JobChange[] {
  return updates.map(({ id, ...values }) => {
    const row = store.get("job", id) ?? {};
    const before: Record<string, unknown> = { id };
    for (const key of Object.keys(values))
      before[key] = row[key] === undefined ? (key === "arrival_fixed" ? false : null) : row[key];
    return before as unknown as JobChange;
  });
}

/** Save job rows through the sync layer, all or none. */
export function writeJobs(store: JobStore, companyId: string, updates: JobChange[]): void {
  store.batch(() => {
    for (const { id, ...values } of updates)
      store.write("job", id, companyId, values as Record<string, JsonValue>);
  });
}

/**
 * Save a move and return what Undo writes back (taken before anything is written). Throws when
 * the save fails, with nothing saved.
 */
export function saveMove(store: JobStore, companyId: string, updates: JobChange[]): JobChange[] {
  const before = snapshotJobs(store, updates);
  writeJobs(store, companyId, updates);
  return before;
}
