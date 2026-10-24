import { formatSchedule } from "./job-list";
import type { VisitReportMode } from "./maintenance";

// The maintenance visit report bar (owner, 2026-10-22: "For maintenance plans, the visit report
// is really buried ... Maybe a floating bottom bar like in your wrap up mock";
// docs/design/2026-10-22-wrap-up.md). Before the visit is done the bar keeps Complete Job (in an
// Automatic shop with a line saying the report sends by itself); once it's done the bar is about
// the visit report: a status line and View Report or Send Visit Report. The same rule on the
// website, iPhone (SundeckCore/VisitReportBar.swift) and Android.

export type VisitReportBarAction = "view" | "send";

export interface VisitReportBar {
  /** "Visit report sent · 2:14 PM", "Ready to send", "Sends by itself when you finish". */
  line: string;
  /** The bar's button, if it has one besides Complete Job. */
  action: VisitReportBarAction | null;
  /** "View Report" or "Send Visit Report". */
  label: string | null;
}

export const VISIT_REPORT_BAR_LABELS: Record<VisitReportBarAction, string> = {
  view: "View Report",
  send: "Send Visit Report",
};

/**
 * What the bar says about the visit report; null when it says nothing (not a maintenance visit,
 * the shop turned visit reports off, a canceled visit, or a Manual shop before the visit is
 * done). `sentAt` is the newest version's send time.
 */
export function visitReportBar(input: {
  jobType: string;
  status: string;
  mode: VisitReportMode;
  sentAt: string | null;
  now: Date;
  timeZone: string;
}): VisitReportBar | null {
  const { jobType, status, mode, sentAt } = input;
  if (jobType !== "maintenance" || mode === "off" || status === "canceled") return null;
  if (sentAt)
    return {
      line: `Visit report sent · ${formatSchedule(sentAt, input.now, input.timeZone)}`,
      action: "view",
      label: VISIT_REPORT_BAR_LABELS.view,
    };
  if (status !== "done")
    return mode === "auto"
      ? { line: "Sends by itself when you finish", action: null, label: null }
      : null;
  return {
    // A done visit in an Automatic shop that hasn't gone out yet (no signal, or it failed). In a
    // Monthly shop it goes with the month's invoice; Send Visit Report still sends it now.
    line:
      mode === "auto"
        ? "Not sent yet"
        : mode === "monthly"
          ? "Goes with the monthly invoice"
          : "Ready to send",
    action: "send",
    label: VISIT_REPORT_BAR_LABELS.send,
  };
}
