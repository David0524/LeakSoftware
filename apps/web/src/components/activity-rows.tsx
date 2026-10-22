import Link from "next/link";
import type { ActivityRow, ActivitySymbol } from "@leakbook/core";

// Activity rows (docs/plans/search-and-activity.md section 2): a round symbol for the kind,
// the title, the detail, and the time in secondary text; tapping opens what it's about.

const PATHS: Record<ActivitySymbol, string> = {
  // A document with a check.
  quote: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 14l2 2 3.5-4",
  // A dollar sign.
  payment:
    "M12 4v16M16 8.5c0-1.7-1.8-2.8-4-2.8s-4 1.1-4 2.8 1.8 2.5 4 3 4 1.3 4 3-1.8 2.8-4 2.8-4-1.1-4-2.8",
  // A pen on a line.
  signature: "M4 20h16M6 16l9.5-9.5a2.1 2.1 0 0 1 3 3L9 19H6z",
  // A paper plane.
  report: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  // A check.
  done: "M5 12.5l4.5 4.5L19 7.5",
  // A person.
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  // A calendar with an arrow.
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM10 14h6M13.5 11.5 16 14l-2.5 2.5",
  // An eye (a customer opened a report).
  opened: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  // A speech bubble.
  text: "M4 5h16v11H9l-5 4z",
};

export function ActivityIcon({ symbol }: { symbol: ActivitySymbol }) {
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-link/10 text-link">
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={PATHS[symbol]} />
      </svg>
    </span>
  );
}

export function activityHref(open: ActivityRow["open"]): string | null {
  if (!open) return null;
  return open.screen === "job" ? `/jobs/${open.id}` : `/messages/${open.id}`;
}

/** One event in an inset grouped list. */
export function ActivityItem({ row }: { row: ActivityRow }) {
  const href = activityHref(row.open);
  const inner = (
    <>
      <ActivityIcon symbol={row.symbol} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{row.title}</span>
        {row.detail ? (
          <span className="block text-[0.9375rem] break-words text-text-muted">{row.detail}</span>
        ) : null}
      </span>
      <span className="shrink-0 self-start pt-0.5 text-[0.9375rem] text-text-muted">
        {row.time}
      </span>
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 px-4 py-2.5";
  return (
    <li data-testid="activity-row">
      {href ? (
        <Link href={href} className={`${cls} hover:bg-text/[0.03] active:bg-text/[0.06]`}>
          {inner}
        </Link>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  );
}
