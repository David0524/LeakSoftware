"use client";

import Link from "next/link";
import { issuesSegmentLabel } from "@leakbook/core";
import { useTrackOverflow } from "./gestures";
import { SEGMENT_TRACK, cx, segmentClass } from "./ui";

const TABS = ["jobs", "reports", "issues"] as const;

/**
 * Jobs | Reports | Issues at the top of the three pages (owner, 2026-10-18: "a reports tab under
 * JOBS"; issues reported on visits with their open count, docs/design/
 * 2026-11-16-service-issues.md), a segmented control of links as on iOS.
 */
export function JobsTabs({
  current,
  openIssues = 0,
}: {
  current: (typeof TABS)[number];
  /** Open issues this person sees: "Issues (3)". */
  openIssues?: number;
}) {
  // Large text: the segments scroll inside the track rather than past the page's edge.
  const track = useTrackOverflow<HTMLElement>(TABS.indexOf(current));
  return (
    <nav
      ref={track}
      aria-label="Jobs, Reports and Issues"
      className={cx(SEGMENT_TRACK, "segment-scroll mb-5")}
    >
      {(
        [
          { key: "jobs", href: "/jobs", label: "Jobs" },
          { key: "reports", href: "/jobs/reports", label: "Reports" },
          { key: "issues", href: "/jobs/issues", label: issuesSegmentLabel(openIssues) },
        ] as const
      ).map((o) => (
        <Link
          key={o.key}
          href={o.href}
          data-segment
          aria-current={o.key === current ? "page" : undefined}
          className={segmentClass(o.key === current, "min-w-22")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
