import { changeWithUndo, type JobChange, type PlanJob, type ScheduleChange } from "@leakbook/core";

// Optimize with Undo (owner, 2026-10-22: "Make Optimize show the new order at once, with Undo";
// docs/design/2026-10-22-schedule-hold-drag.md), as the website and the iPhone app say it. The
// phone works the order out and saves it through the sync layer at once, so the stops slide to
// their new places straight away; the banner says what it saved, with Undo putting back the
// saved values. Pure, so it's tested without a phone.

/** The banner when Optimize keeps the order. */
export const ALREADY_BEST = "Already the best order";

/** Optimize couldn't save: the banner's second line. */
export const OPTIMIZE_PUT_BACK = "The order is as it was.";

export interface OptimizeOutcome {
  error?: string;
  message?: string;
  detail?: string;
  /** Only the rows that change. */
  updates: JobChange[];
  /** Their saved values, for Undo; empty when the order stays. */
  undo: JobChange[];
}

/**
 * Optimize's change (core planDay) for a tech's day as it is (`jobs`, in route order): only what
 * changes, the rows that put it back, and the banner's line ("Optimized · 42 min less driving",
 * or "Already the best order" with no Undo when the order stays).
 */
export function optimizeOutcome(change: ScheduleChange, jobs: PlanJob[]): OptimizeOutcome {
  if (change.error) return { error: change.error, updates: [], undo: [] };
  const { updates, undo } = changeWithUndo(change.updates, jobs);
  const placed = new Map(change.updates.map((u) => [u.id, u.route_order ?? null]));
  const own = jobs.filter((j) => placed.has(j.id)).map((j) => j.id);
  const next = [...own].sort((a, b) => (placed.get(a) ?? 0) - (placed.get(b) ?? 0));
  const same = own.every((id, i) => id === next[i]);
  return {
    message: same ? ALREADY_BEST : change.message,
    ...(change.detail ? { detail: change.detail } : null),
    updates,
    undo: same ? [] : undo,
  };
}

/** Optimize Week couldn't save: the banner's second line. */
export const PLAN_WEEK_KEPT = "The week is as it was.";
