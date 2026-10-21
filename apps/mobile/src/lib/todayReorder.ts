import {
  changeWithUndo,
  moveJobChange,
  stopDone,
  todayMoveIndex,
  todayMoves,
  todayStopLock,
  type DriveFn,
  type JobChange,
  type PlanContext,
  type PlanJob,
  type TodayMove,
  type TodayMoveStop,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md). The rule
// is the shared one in packages/core (todayStopLock, todayMoveIndex, todayMoves,
// changeWithUndo, then the Schedule's moveJobChange), used here as the website's route action
// uses it (apps/web/src/app/actions/routes.ts moveTodayStop). What's left here is the app's:
// who may reorder on screen, a drag's landing place, and saving through the sync layer, so it
// works offline.

/** A stop on Today as the reorder reads it (a job with its property). */
export type ReorderStop = PlanJob & { stop_done_on?: string | null };

/** The day's stops as the shared rule reads them: done, locked (and why), under way. */
export function todayStops(stops: ReorderStop[], day: string, timeZone: string): TodayMoveStop[] {
  return stops.map((j) => {
    const done = stopDone(j, day);
    return {
      id: j.id,
      done,
      lock: todayStopLock(j, timeZone),
      started: !done && j.status === "in_progress",
    };
  });
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
  /** Why it can't move ("Started", "Locked", "Time locked", "Two techs", "Done"), or null. */
  lock: string | null;
  canUp: boolean;
  canDown: boolean;
  /** Do Later: there's a stop still to do after it to go behind. */
  canLater: boolean;
}

/** Each stop's lock and which moves it has (core todayMoves), for the day in route order. */
export function reorderRows(stops: ReorderStop[], day: string, timeZone: string): ReorderRow[] {
  const info = todayStops(stops, day, timeZone);
  const moves = todayMoves(info);
  return info.map((s) => {
    const m = moves.get(s.id)!;
    return {
      id: s.id,
      lock: s.done ? "Done" : s.lock,
      canUp: m.up,
      canDown: m.down,
      canLater: m.later,
    };
  });
}

/**
 * Where a dragged stop lands, as a place among the stops still to do (0 = first): just before
 * `beforeId` (the row under it, done ones included), or last when it's null. Null when that's
 * where it already is.
 */
export function dropPlace(
  stops: ReorderStop[],
  draggedId: string,
  beforeId: string | null,
  day: string,
): number | null {
  const others = stops.filter((s) => s.id !== draggedId);
  const todo = (list: ReorderStop[]) => list.filter((s) => !stopDone(s, day));
  const at = beforeId ? others.findIndex((s) => s.id === beforeId) : -1;
  const place = todo(at >= 0 ? others.slice(0, at) : others).length;
  const now = todo(stops).findIndex((s) => s.id === draggedId);
  return place === now ? null : place;
}

export interface ReorderChange {
  /** The rows to save, trimmed to what changes. */
  updates: JobChange[];
  /** What Undo writes back: the saved values of those same fields. */
  undo: JobChange[];
  message?: string;
  error?: string;
}

/**
 * Move a stop on `techId`'s day: Do Later (after every stop still to do), Move Up, Move Down,
 * or to a place among the stops still to do, with the website's words when it can't.
 */
export function reorderChange(
  ctx: PlanContext,
  input: {
    /** The tech's day, in route order. */
    stops: ReorderStop[];
    jobId: string;
    to: TodayMove;
    techId: string;
    /** Owners and admins: any tech's day. */
    seesAll: boolean;
    userId: string;
  },
  drive: DriveFn,
): ReorderChange {
  const { stops, jobId, techId } = input;
  const fail = (error: string): ReorderChange => ({ updates: [], undo: [], error });
  const job = stops.find((s) => s.id === jobId);
  if (!job) return fail("This stop isn’t on this day anymore.");
  const info = todayStops(stops, ctx.today, ctx.timeZone);
  const self = info.find((s) => s.id === jobId)!;
  if (self.done) return fail("This stop is done, so it stays where it is.");
  if (self.lock) return fail(`${self.lock}, so it stays where it is.`);
  // Stops already done for the day stay as they are: the move plans the rest of the day.
  const planned = stops.filter((s) => !stopDone(s, ctx.today));
  const index = todayMoveIndex(
    info.filter((s) => !s.done),
    jobId,
    input.to,
  );
  if (index === null) return fail("It’s already there.");
  const change = moveJobChange(
    ctx,
    {
      job,
      tech: techId,
      date: ctx.today,
      index,
      targetDay: planned,
      fromDay: planned,
      seesAll: input.seesAll,
      userId: input.userId,
    },
    drive,
  );
  if (change.error) return fail(change.error);
  return { ...changeWithUndo(change.updates, stops), message: change.message };
}

// ---------------------------------------------------------------------------
// Saving, and Undo
// ---------------------------------------------------------------------------

/** What saving needs from the sync service (SyncService has these). */
export interface JobStore {
  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void;
  batch<T>(fn: () => T): T;
}

/**
 * Save job rows through the sync layer (row and outbox together), all or none. Undo is the
 * same call with the change's `undo` rows: the jobs as they were, not a second move.
 */
export function writeJobs(store: JobStore, companyId: string, updates: JobChange[]): void {
  store.batch(() => {
    for (const { id, ...values } of updates)
      store.write("job", id, companyId, values as Record<string, JsonValue>);
  });
}
