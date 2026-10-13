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
  scheduled: ["unscheduled", "in_progress", "canceled"],
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

/** Statuses a new job may be created in (including offline on a phone). */
export const JOB_INITIAL_STATUSES: readonly JobStatus[] = [
  "unscheduled",
  "scheduled",
  "in_progress",
];

/** Statuses only the server sets, after sending, acceptance, invoicing, or payment. */
export const JOB_SERVER_STATUSES: readonly JobStatus[] = [
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "invoiced",
  "paid",
];

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || JOB_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Next statuses a person (not the server) can pick from the app or office view. Done is
 * how a maintenance visit ends; leak detection and repairs end with a report or invoice.
 */
export function userTransitions(from: JobStatus, type?: string): JobStatus[] {
  return JOB_STATUS_TRANSITIONS[from].filter(
    (s) => !JOB_SERVER_STATUSES.includes(s) && (s !== "done" || type === "maintenance"),
  );
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
