import { JOB_STATUS_TRANSITIONS, userTransitions, type JobStatus } from "@leakbook/core";

// The Next Step bar on the job page (owner, 2026-10-20: one-handed use, item 1): the one or two
// buttons the tech most likely wants next, pinned above the tab bar. The same rule as the
// website's lib/next-step.ts.

export type NextStep =
  | "start"
  | "complete"
  | "add-test"
  | "add-finding"
  | "add-photo"
  | "add-video"
  | "wrap-up"
  | "visit-report";

export const NEXT_STEP_LABELS: Record<NextStep, string> = {
  start: "Start Job",
  complete: "Complete Job",
  "add-test": "Add Test",
  "add-finding": "Add Finding",
  "add-photo": "Add Photo",
  "add-video": "Add Video",
  // Wrap-Up's button names its next step (core wrapUp's next.action); this is its fallback.
  "wrap-up": "Next Step",
  // View Report or Send Visit Report (core visitReportBar's label); this is its fallback.
  "visit-report": "Visit Report",
};

export interface NextStepState {
  /** The job section on screen: details, checklist, findings, photos, or wrapup. */
  section: string;
  status: JobStatus;
  jobType: string;
  /** The shop has test types, so Add Test can open its sheet. */
  hasTestTypes: boolean;
  /** Wrap-Up's next step's action (core wrapUp), null when every step is done. */
  wrapUpAction?: string | null;
  /** A maintenance visit's report button (core visitReportBar): View Report or Send. */
  visitAction?: "view" | "send" | null;
}

/**
 * The moves a person can make from this status. A status this version of the app doesn't
 * know (added on the server after it was built) has none, instead of failing the page.
 */
export function jobMoves(status: JobStatus, jobType: string): JobStatus[] {
  return Object.prototype.hasOwnProperty.call(JOB_STATUS_TRANSITIONS, status)
    ? userTransitions(status, jobType)
    : [];
}

/**
 * The bar's buttons, primary first; empty hides the bar. First match wins: a job that can be
 * started; a done maintenance visit's report; a maintenance visit's checklist that can be
 * completed; Findings; Photos; Wrap-Up's next step.
 */
export function nextStepButtons(s: NextStepState): NextStep[] {
  const moves = jobMoves(s.status, s.jobType);
  if ((s.status === "scheduled" || s.status === "unscheduled") && moves.includes("in_progress"))
    return ["start"];
  if (s.jobType === "maintenance" && s.status === "done" && s.visitAction) return ["visit-report"];
  if (s.section === "checklist" && s.jobType === "maintenance" && moves.includes("done"))
    return ["complete"];
  if (s.section === "findings")
    return s.hasTestTypes ? ["add-test", "add-finding"] : ["add-finding"];
  if (s.section === "photos") return ["add-photo", "add-video"];
  if (s.section === "wrapup" && s.wrapUpAction) return ["wrap-up"];
  return [];
}
