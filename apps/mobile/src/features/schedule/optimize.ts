import {
  OPTIMIZE_WORDS,
  changeWithUndo,
  partnerOf,
  type JobChange,
  type PartnerDay,
  type PlanJob,
  type ScheduleChange,
} from "@leakbook/core";

// Optimize with Undo (owner, 2026-10-22: "Make Optimize show the new order at once, with Undo";
// docs/design/2026-10-22-schedule-hold-drag.md), as the website and the iPhone app say it. The
// phone works the order out and saves it through the sync layer at once, so the stops slide to
// their new places straight away; the banner says what it saved, with Undo putting back the
// saved values. Pure, so it's tested without a phone.

/** The banner when Optimize keeps the order and every stop could move. */
export const ALREADY_BEST = OPTIMIZE_WORDS.alreadyBest;

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
 * "Already the best order", or "No change: all 3 stops are shared with Jake Turner, so their
 * times stay.", with no Undo when the order stays).
 */
export function optimizeOutcome(change: ScheduleChange, jobs: PlanJob[]): OptimizeOutcome {
  if (change.error) return { error: change.error, updates: [], undo: [] };
  const { updates, undo } = changeWithUndo(change.updates, jobs);
  return {
    message: change.message,
    ...(change.detail ? { detail: change.detail } : null),
    updates,
    undo: change.unchanged ? [] : undo,
  };
}

/**
 * The other techs' days on a tech's shared jobs, for Optimize and moves to check a shared job's
 * new time against (owner, 2026-10-24). Owners and admins only, as on the website: they have
 * every job and where each tech starts on the phone; a tech's view of a teammate may be partial,
 * so their shared jobs keep their times.
 */
export function partnerDays(
  manager: boolean,
  techId: string,
  jobs: PlanJob[],
  dayOf: (techId: string) => PlanJob[],
): PartnerDay[] {
  if (!manager) return [];
  const techs = new Set(
    jobs.map((j) => partnerOf(j, techId)).filter((t): t is string => !!t && t !== techId),
  );
  return [...techs].map((t) => ({ techId: t, jobs: dayOf(t) }));
}

/**
 * The banner for Optimize on several routes at once: what each saved, else "Already the best
 * order" only when every route says so, else "No change" with what stayed.
 */
export function optimizeManyText(
  outs: OptimizeOutcome[],
  optimized: string,
): { message: string; detail?: string } {
  if (outs.some((o) => o.undo.length)) return { message: optimized };
  if (outs.every((o) => o.message === ALREADY_BEST)) return { message: ALREADY_BEST };
  // Each route's reason once, without its own "No change: ".
  const lead = `${OPTIMIZE_WORDS.noChange}: `;
  const why = [
    ...new Set(
      outs.flatMap((o) =>
        o.message === ALREADY_BEST
          ? []
          : [o.message === OPTIMIZE_WORDS.noChange ? o.detail : o.message],
      ),
    ),
  ]
    .filter((t): t is string => !!t)
    .map((t) =>
      t.startsWith(lead) ? `${t.charAt(lead.length).toUpperCase()}${t.slice(lead.length + 1)}` : t,
    );
  return why.length
    ? { message: OPTIMIZE_WORDS.noChange, detail: why.join(" ") }
    : { message: OPTIMIZE_WORDS.noChange };
}

/** Optimize Week couldn't save: the banner's second line. */
export const PLAN_WEEK_KEPT = "The week is as it was.";
