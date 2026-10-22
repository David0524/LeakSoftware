import { VISIT_REPORT_BAR_LABELS, visitReportBar, type VisitReportMode } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// visit-report-bar.ts (owner, 2026-10-22): the maintenance visit report bar.

const NOW = "2026-10-22T20:00:00Z";
type Args = [string, string, VisitReportMode, string | null, string, string];
const c = (
  status: string,
  mode: VisitReportMode,
  sentAt: string | null = null,
  jobType = "maintenance",
  tz = "America/Los_Angeles",
): Args => [jobType, status, mode, sentAt, NOW, tz];

export const visitReportBarCases: ModuleCases = {
  visitReportBar: rule(
    (
      jobType: string,
      status: string,
      mode: VisitReportMode,
      sentAt: string | null,
      now: string,
      tz: string,
    ) => visitReportBar({ jobType, status, mode, sentAt, now: new Date(now), timeZone: tz }),
    [
      c("done", "manual"),
      c("done", "auto"),
      c("in_progress", "auto"),
      c("scheduled", "auto"),
      c("in_progress", "manual"),
      c("done", "manual", "2026-10-22T21:14:00Z"),
      c("done", "auto", "2026-10-20T16:05:00Z"),
      c("done", "manual", "2026-10-22T21:14:00Z", "maintenance", "America/New_York"),
      c("in_progress", "manual", "2026-10-22T18:00:00Z"),
      c("done", "off"),
      c("canceled", "auto"),
      c("done", "manual", null, "detection"),
    ],
  ),
  VISIT_REPORT_BAR_LABELS: rule(() => VISIT_REPORT_BAR_LABELS, [[]]),
};
