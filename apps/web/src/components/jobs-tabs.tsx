"use client";

import Link from "next/link";
import { useTrackOverflow } from "./gestures";
import { SEGMENT_TRACK, cx, segmentClass } from "./ui";

/**
 * Jobs | Reports at the top of both pages (owner, 2026-10-18: "a reports tab under JOBS"), a
 * segmented control of links as on iOS.
 */
export function JobsTabs({ current }: { current: "jobs" | "reports" }) {
  // Large text: the two segments scroll inside the track rather than past the page's edge.
  const track = useTrackOverflow<HTMLElement>(current === "jobs" ? 0 : 1);
  return (
    <nav
      ref={track}
      aria-label="Jobs and Reports"
      className={cx(SEGMENT_TRACK, "segment-scroll mb-5")}
    >
      {(
        [
          { key: "jobs", href: "/jobs", label: "Jobs" },
          { key: "reports", href: "/jobs/reports", label: "Reports" },
        ] as const
      ).map((o) => (
        <Link
          key={o.key}
          href={o.href}
          data-segment
          aria-current={o.key === current ? "page" : undefined}
          className={segmentClass(o.key === current, "min-w-28")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
