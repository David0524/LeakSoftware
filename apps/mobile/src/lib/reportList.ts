import { matchesJobType, sortReports, type JobTypeFilter } from "@leakbook/core";

/** Jobs › Reports' search box words (owner, 2026-10-25), as the website's. */
export const REPORT_SEARCH_PLACEHOLDER = "Customer name or job number";

/** "No reports match “Smith”." */
export function reportsNoMatch(query: string): string {
  return `No reports match “${query.trim()}”.`;
}

export interface ReportListItem {
  status: string;
  sent_at?: string | null;
  updated_at?: string | null;
  job?: { type: string; number?: number | null; customer?: { name?: string | null } | null };
}

/** Whether a report's job matches a search: the customer's name (contains) or "1038" / "#1038". */
export function reportMatchesSearch(item: ReportListItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const number = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  if (number != null && item.job?.number === number) return true;
  return (item.job?.customer?.name ?? "").toLowerCase().includes(q.toLowerCase());
}

/**
 * Jobs › Reports as the website lists it (owner, 2026-10-25): the status pill, the job's type,
 * the search, then core's sort.
 */
export function listReports<T extends ReportListItem>(
  items: T[],
  opts: { status: string; type: JobTypeFilter; search: string; sort: unknown },
): T[] {
  const matched = items
    .filter((r) => r.status !== "superseded")
    .filter((r) => opts.status === "all" || r.status === opts.status)
    .filter((r) => matchesJobType(r.job?.type, opts.type))
    .filter((r) => reportMatchesSearch(r, opts.search));
  return sortReports(
    matched.map((r) => ({
      r,
      number: r.job?.number,
      customer: r.job?.customer?.name,
      sent_at: r.sent_at,
      updated_at: r.updated_at,
    })),
    opts.sort,
  ).map((k) => k.r);
}
