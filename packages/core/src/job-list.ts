import type { Job } from "./models";

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
  return new Intl.DateTimeFormat("en-CA", {
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
    const day = j.scheduled_start ? localDate(new Date(j.scheduled_start), timeZone) : null;
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
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  if (localDate(d, timeZone) === localDate(now, timeZone)) return time;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  return `${date}, ${time}`;
}
