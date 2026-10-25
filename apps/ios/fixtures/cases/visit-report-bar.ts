import { VISIT_REPORT_BAR_LABELS, visitReportBar, type VisitReportMode } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// visit-report-bar.ts (owner, 2026-10-22): the maintenance visit report bar.

const NOW = "2026-10-22T20:00:00Z";
type Args = [string, string, VisitReportMode, string | null, string, string, boolean];
const c = (
  status: string,
  mode: VisitReportMode,
  sentAt: string | null = null,
  jobType = "maintenance",
  tz = "America/Los_Angeles",
  needsPhoto = false,
): Args => [jobType, status, mode, sentAt, NOW, tz, needsPhoto];
// Require a Photo (owner, 2026-10-25): a done visit with no photo.
const p = (status: string, mode: VisitReportMode, sentAt: string | null = null): Args =>
  c(status, mode, sentAt, "maintenance", "America/Los_Angeles", true);

export const visitReportBarCases: ModuleCases = {
  visitReportBar: rule(
    (
      jobType: string,
      status: string,
      mode: VisitReportMode,
      sentAt: string | null,
      now: string,
      tz: string,
      needsPhoto: boolean,
    ) =>
      visitReportBar({
        jobType,
        status,
        mode,
        sentAt,
        now: new Date(now),
        timeZone: tz,
        needsPhoto,
      }),
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
      c("done", "monthly"),
      c("in_progress", "monthly"),
      c("done", "monthly", "2026-10-22T21:14:00Z"),
      p("done", "manual"),
      p("done", "auto"),
      p("done", "monthly"),
      p("in_progress", "auto"),
      p("done", "manual", "2026-10-22T21:14:00Z"),
      p("done", "off"),
    ],
  ),
  VISIT_REPORT_BAR_LABELS: rule(() => VISIT_REPORT_BAR_LABELS, [[]]),
};
