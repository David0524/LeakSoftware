import type { Job } from "./models";
import { dateFormat } from "./intl";

export interface JobGroups<T extends Job = Job> {
  /** Scheduled today, or in progress regardless of date. */
  today: T[];
  /** Scheduled after today. */
  upcoming: T[];
  /** Open jobs without a date. */
  unscheduled: T[];
  /** Past-dated or finished jobs from the last 30 days, newest first. */
  recent: T[];
}

const OPEN = new Set(["unscheduled", "scheduled", "in_progress"]);

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return dateFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function when(j: Job): number {
  return Date.parse(j.scheduled_start ?? j.started_at ?? j.created_at ?? "") || 0;
}

/** Sort and bucket jobs for the jobs list, using the shop's time zone for "today". */
export function groupJobs<T extends Job>(jobs: T[], now: Date, timeZone: string): JobGroups<T> {
  const today = localDate(now, timeZone);
  const recentCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const groups: JobGroups<T> = { today: [], upcoming: [], unscheduled: [], recent: [] };

  for (const j of jobs) {
    if (j.deleted_at) continue;
    // Only open jobs need their day; finished ones (most of a shop's history) skip the date math.
    const day =
      OPEN.has(j.status) && j.scheduled_start
        ? localDate(new Date(j.scheduled_start), timeZone)
        : null;
    if (j.status === "in_progress" || (OPEN.has(j.status) && day === today)) {
      groups.today.push(j);
    } else if (OPEN.has(j.status) && day && day > today) {
      groups.upcoming.push(j);
    } else if (OPEN.has(j.status) && !day) {
      groups.unscheduled.push(j);
    } else if (when(j) >= recentCutoff || OPEN.has(j.status)) {
      groups.recent.push(j);
    }
  }

  const byTime = (a: T, b: T) => when(a) - when(b);
  groups.today.sort(byTime);
  groups.upcoming.sort(byTime);
  groups.unscheduled.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  groups.recent.sort((a, b) => byTime(b, a));
  return groups;
}

/** "9:00 AM" today, "Tue Oct 14, 9:00 AM" otherwise, "Not scheduled" without a date. */
export function formatSchedule(
  start: string | null | undefined,
  now: Date,
  timeZone: string,
): string {
  if (!start) return "Not scheduled";
  const d = new Date(start);
  const time = dateFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  if (localDate(d, timeZone) === localDate(now, timeZone)) return time;
  const date = dateFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  return `${date}, ${time}`;
}

// ---------------------------------------------------------------------------
// Sorting the Jobs list (owner, 2026-10-20: "Add sorting on the jobs page just like invoices")
// ---------------------------------------------------------------------------

export type JobSort = "scheduled" | "newest" | "oldest" | "customer" | "number";

/** The sort menu, in order. Scheduled Date first, as the page opens. */
export const JOB_SORTS: { key: JobSort; label: string }[] = [
  { key: "scheduled", label: "Scheduled Date" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "customer", label: "Customer" },
  { key: "number", label: "Job Number" },
];

/** A sort key from a page's address or a saved choice; Scheduled Date when it isn't one. */
export function jobSort(key: unknown): JobSort {
  return JOB_SORTS.find((s) => s.key === key)?.key ?? "scheduled";
}

export interface JobSortItem {
  number?: number | null;
  scheduled_start?: string | null;
  created_at?: string | null;
  customer?: string | null;
}

/**
 * The jobs in a sort's order:
 * - Scheduled Date: soonest first, jobs without a date last.
 * - Newest and Oldest: by when the job was made.
 * - Customer: A to Z.
 * - Job Number: highest first.
 * Ties go to the highest job number, then keep the list's order.
 */
export function sortJobs<T extends JobSortItem>(jobs: T[], sort: unknown): T[] {
  const s = jobSort(sort);
  const time = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : null);
  const by: Record<JobSort, (a: T, b: T) => number> = {
    scheduled: (a, b) => {
      const x = time(a.scheduled_start);
      const y = time(b.scheduled_start);
      return x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y;
    },
    newest: (a, b) => (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0),
    oldest: (a, b) => (time(a.created_at) ?? 0) - (time(b.created_at) ?? 0),
    customer: (a, b) =>
      (a.customer?.trim() || "￿").localeCompare(b.customer?.trim() || "￿", "en", {
        sensitivity: "base",
      }),
    number: () => 0,
  };
  return jobs
    .map((j, n) => ({ j, n }))
    .sort((x, y) => by[s](x.j, y.j) || (y.j.number ?? 0) - (x.j.number ?? 0) || x.n - y.n)
    .map((x) => x.j);
}
