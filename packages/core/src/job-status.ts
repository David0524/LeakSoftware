/**
 * Job status machine. The database enforces the same rules
 * (supabase/migrations/20261012000300_jobs.sql); test/job-status.test.ts keeps them identical.
 */

export const JOB_STATUSES = [
  "unscheduled",
  "scheduled",
  "in_progress",
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "invoiced",
  "paid",
  "canceled",
  "done",
  "skipped",
  // A standalone quote's job (20261022005700_standalone_quotes.sql): hidden from every job
  // list until the customer accepts and it becomes the unscheduled repair job.
  "quote",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  // Skipped: a maintenance visit that couldn't be done (20261022004500_skip_visit.sql).
  unscheduled: ["scheduled", "in_progress", "canceled", "skipped"],
  // Complete Job straight from Scheduled (owner, 2026-10-19), for a visit done in one go.
  scheduled: ["unscheduled", "in_progress", "canceled", "done", "skipped"],
  in_progress: ["scheduled", "report_sent", "invoiced", "canceled", "done", "skipped"],
  report_sent: ["in_progress", "quote_sent", "invoiced", "canceled"],
  quote_sent: ["report_sent", "quote_accepted", "invoiced", "canceled"],
  quote_accepted: ["invoiced", "canceled"],
  invoiced: ["paid", "canceled"],
  paid: [],
  canceled: ["unscheduled"],
  // Maintenance visits (20261012002400_maintenance.sql).
  done: ["in_progress", "invoiced"],
  // Back on (Undo Skip, or a new day), off the calendar, or called off.
  skipped: ["scheduled", "unscheduled", "in_progress", "canceled"],
  // Only the server moves it on, when its quote is accepted (and it has a pool).
  quote: ["unscheduled"],
};

/** Statuses only the server sets, after sending, acceptance, invoicing, or payment. */
export const JOB_SERVER_STATUSES: readonly JobStatus[] = [
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "invoiced",
  "paid",
];

/**
 * Next statuses a person (not the server) can pick from the app or office view. Done is
 * how a maintenance visit ends; leak detection and repairs end with a report or invoice.
 */
export function userTransitions(from: JobStatus, type?: string): JobStatus[] {
  if (from === "quote") return [];
  // A skipped visit is put back with Undo Skip (Scheduled) or a new day (Reschedule), or called
  // off: not started or unscheduled by a status button (20261022004500_skip_visit.sql).
  if (from === "skipped")
    return JOB_STATUS_TRANSITIONS.skipped.filter((s) => s === "scheduled" || s === "canceled");
  // An unscheduled job is scheduled with a day (the Schedule's Move…), never by a status button:
  // "Move Back to Scheduled" on a job never scheduled made no sense (2026-10-21).
  return JOB_STATUS_TRANSITIONS[from].filter(
    (s) =>
      !JOB_SERVER_STATUSES.includes(s) &&
      (s !== "done" || type === "maintenance") &&
      (s !== "skipped" || type === "maintenance") &&
      !(from === "unscheduled" && s === "scheduled"),
  );
}

/**
 * The button that moves a job from one status to another (owner, 2026-10-19: "Your call" on
 * "Reopen Job" for a scheduled job). Unschedule takes a job off the calendar; Reopen Job brings
 * back a canceled job, or puts one whose report went out back in progress (2026-10-29: it read
 * Start Job, as if the work hadn't begun); Reopen Visit puts a finished visit back in progress.
 */
export function jobActionLabel(from: JobStatus, to: JobStatus): string {
  if (to === "skipped") return "Skip Visit";
  if (from === "skipped" && to === "scheduled") return "Undo Skip";
  if (to === "unscheduled") return from === "canceled" ? "Reopen Job" : "Unschedule";
  if (to === "in_progress") {
    if (from === "done") return "Reopen Visit";
    return from === "report_sent" ? "Reopen Job" : "Start Job";
  }
  if (to === "scheduled") return "Move Back to Scheduled";
  if (to === "canceled") return "Cancel Job";
  if (to === "done") return "Complete Job";
  return JOB_STATUS_LABELS[to];
}

/**
 * A step back (owner, 2026-10-29): Move Back to Scheduled and Unschedule sit in the job page's
 * ••• menu, so the buttons in view are forward steps. Reopen Job on a canceled job is forward.
 */
export function isBackwardMove(from: JobStatus, to: JobStatus): boolean {
  // Undo Skip is the way out of a skip, in view beside Reschedule.
  if (from === "skipped" && to === "scheduled") return false;
  return to === "scheduled" || (to === "unscheduled" && from !== "canceled");
}

/** Labels from the handoff, used in the office view. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In progress",
  report_sent: "Report sent",
  quote_sent: "Quote sent",
  quote_accepted: "Quote accepted",
  invoiced: "Invoiced",
  paid: "Paid",
  canceled: "Canceled",
  done: "Done",
  skipped: "Skipped",
  quote: "Quote",
};

/**
 * A standalone quote's job (New Quote, 2026-11-24): not a job yet. Every job list, count and
 * search leaves it out; the Quotes list and the quote screen show it.
 */
export function isQuoteJob(job: { status: string }): boolean {
  return job.status === "quote";
}
