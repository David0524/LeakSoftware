import Link from "next/link";
import {
  FEEDBACK_FILTERS,
  feedbackSubtitle,
  shortDate,
  type FeedbackFilter,
  type FeedbackRow,
} from "@leakbook/core";
import { ThumbsDownIcon, ThumbsUpIcon } from "./icons";
import { RowContent, SEGMENT_TRACK, cx, segmentClass } from "./ui";

// Customer Feedback rows and tabs (owner's competitor notes, 2026-11-16), shared by the list and
// the customer's page.

/** Open | Closed | Thumbs Up, a segmented control of links as Jobs | Reports. */
export function FeedbackTabs({ current }: { current: FeedbackFilter }) {
  return (
    <nav aria-label="Feedback" className={cx(SEGMENT_TRACK, "mb-5")}>
      {FEEDBACK_FILTERS.map((o) => (
        <Link
          key={o.value}
          href={o.value === "open" ? "/feedback" : `/feedback?show=${o.value}`}
          aria-current={o.value === current ? "page" : undefined}
          className={segmentClass(o.value === current, "min-w-22")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** One answer as a row: who, what they said, when; opens the case. */
export function FeedbackRowItem({
  row,
  timeZone,
  now,
  showCustomer = true,
}: {
  row: FeedbackRow;
  timeZone: string;
  now: Date;
  showCustomer?: boolean;
}) {
  const up = row.rating === "up";
  const when = shortDate(row.created_at, now, timeZone);
  return (
    <li>
      <RowContent
        href={up ? undefined : `/feedback/${row.id}`}
        icon={
          <span
            className={cx(
              "flex size-9 items-center justify-center rounded-full",
              up
                ? "bg-status-pass/12 text-status-pass"
                : row.status === "open"
                  ? "bg-status-fail/12 text-status-fail"
                  : "bg-text/[0.06] text-text-muted",
            )}
          >
            {up ? <ThumbsUpIcon className="size-5" /> : <ThumbsDownIcon className="size-5" />}
          </span>
        }
        label={
          <span className="font-semibold">
            {showCustomer ? row.customer_name || "A customer" : feedbackSubtitle(row, when)}
          </span>
        }
        detail={
          <>
            {up ? null : <span className="line-clamp-2">{row.comment || "No comment left."}</span>}
            {showCustomer ? <span className="block">{feedbackSubtitle(row, when)}</span> : null}
          </>
        }
      />
    </li>
  );
}
