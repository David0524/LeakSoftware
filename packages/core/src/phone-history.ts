import type { Job } from "./models";

/**
 * How long a finished job stays on phones (2026-10-15). The server sends a job to phones
 * while it is open, and for this many days after it was last scheduled, finished, or changed
 * (app.job_on_phones in supabase/migrations/20261012003400_phone_history_window.sql). The
 * website keeps everything.
 */
export const PHONE_HISTORY_DAYS = 90;

/** Phones drop a job this many days after the server stops sending it, never before. */
export const PHONE_HISTORY_MARGIN_DAYS = 7;

const CLOSED = new Set(["done", "paid", "canceled"]);

type JobDates = Pick<Job, "status" | "scheduled_start" | "completed_at"> & {
  updated_at?: string | null;
};

/** True while the job belongs on phones; `extraDays` widens the window (the phone's margin). */
export function jobOnPhones(job: JobDates, now: Date, extraDays = 0): boolean {
  if (!CLOSED.has(job.status)) return true;
  const latest = Math.max(
    ...[job.scheduled_start, job.completed_at, job.updated_at].map((d) => (d ? Date.parse(d) : 0)),
  );
  const cutoff = now.getTime() - (PHONE_HISTORY_DAYS + extraDays) * 24 * 60 * 60 * 1000;
  return latest >= cutoff;
}
