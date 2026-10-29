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
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  unscheduled: ["scheduled", "in_progress", "canceled"],
  // Complete Job straight from Scheduled (owner, 2026-10-19), for a visit done in one go.
  scheduled: ["unscheduled", "in_progress", "canceled", "done"],
  in_progress: ["scheduled", "report_sent", "invoiced", "canceled", "done"],
  report_sent: ["in_progress", "quote_sent", "invoiced", "canceled"],
  quote_sent: ["report_sent", "quote_accepted", "invoiced", "canceled"],
  quote_accepted: ["invoiced", "canceled"],
  invoiced: ["paid", "canceled"],
  paid: [],
  canceled: ["unscheduled"],
  // Maintenance visits (20261012002400_maintenance.sql).
  done: ["in_progress", "invoiced"],
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
  // An unscheduled job is scheduled with a day (the Schedule's Move…), never by a status button:
  // "Move Back to Scheduled" on a job never scheduled made no sense (2026-10-21).
  return JOB_STATUS_TRANSITIONS[from].filter(
    (s) =>
      !JOB_SERVER_STATUSES.includes(s) &&
      (s !== "done" || type === "maintenance") &&
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
};
