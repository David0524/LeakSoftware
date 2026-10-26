// The end-of-day card on Today (owner, 2026-10-26: "Today: 8 pools · 3 reports sent · 2 quotes
// accepted"): once every stop of the tech's day is done, it replaces the empty "all done" card's
// blank space. Only the nonzero parts, counted from what's on the device for that person's own
// day: the pools (stops) done, the reports sent today on those stops' jobs, and the quotes
// accepted today on them. No confetti. No I/O. Ported to
// apps/ios/Sources/SundeckCore/EndOfDay.swift and checked by its fixtures.

import { localDate } from "./job-list";

export interface EndOfDayStop {
  /** The stop's job. */
  id: string;
  done: boolean;
}

export interface EndOfDay {
  pools: number;
  reports: number;
  quotes: number;
  /** "Today: 8 pools · 3 reports sent · 2 quotes accepted". */
  line: string;
}

const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The day's wrap-up line, or null while a stop is still open (or the day has no stops).
 * `reports` and `quotes` are the sent reports and accepted quotes on this device; only those
 * for the day's own jobs, with their `sent_at` / `accepted_at` on `today` in the shop's time
 * zone, count. A job with several reports sent that day counts once.
 */
export function endOfDay(input: {
  stops: EndOfDayStop[];
  reports: { job_id: string; sent_at?: string | null; status?: string | null }[];
  quotes: { job_id: string; accepted_at?: string | null }[];
  today: string;
  timeZone: string;
}): EndOfDay | null {
  const { stops, today, timeZone } = input;
  if (stops.length === 0 || stops.some((s) => !s.done)) return null;
  const jobs = new Set(stops.map((s) => s.id));
  const onToday = (iso: string | null | undefined) => {
    if (!iso) return false;
    const at = new Date(iso);
    return !Number.isNaN(at.getTime()) && localDate(at, timeZone) === today;
  };
  const reports = new Set(
    input.reports
      .filter((r) => jobs.has(r.job_id) && r.status !== "draft" && onToday(r.sent_at))
      .map((r) => r.job_id),
  ).size;
  const quotes = input.quotes.filter((q) => jobs.has(q.job_id) && onToday(q.accepted_at)).length;
  const pools = stops.length;
  const parts = [
    part(pools, "pool", "pools"),
    reports > 0 ? `${part(reports, "report", "reports")} sent` : null,
    quotes > 0 ? `${part(quotes, "quote", "quotes")} accepted` : null,
  ].filter((p): p is string => !!p);
  return { pools, reports, quotes, line: `Today: ${parts.join(" · ")}` };
}
