import { userTransitions, type JobStatus } from "@leakbook/core";

// The Next Step bar on a phone's job page (owner, 2026-10-20: one-handed use, item 1): the one
// or two buttons the tech most likely wants next, pinned above the tab bar.

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
  /** The job section on screen: details, checklist, findings, photos, or wrap-up. */
  section: string;
  status: JobStatus;
  jobType: string;
  /** The shop has test types, so Add Test can open its sheet. */
  hasTestTypes: boolean;
  /**
   * Wrap-Up's next step's action ("Write the Draft", "Review with Customer"), or null when every
   * step is done (owner, 2026-10-22: the finish list's one button).
   */
  wrapUpAction?: string | null;
  /**
   * A maintenance visit's report button (core visitReportBar): View Report once sent, Send Visit
   * Report once done (owner, 2026-10-22: "the visit report is really buried").
   */
  visitAction?: "view" | "send" | null;
}

/**
 * The bar's buttons, primary first; empty hides the bar. First match wins: a job that can be
 * started; a done maintenance visit's report; a maintenance visit's checklist that can be
 * completed; Findings; Photos; Wrap-Up's next step.
 */
export function nextStepButtons(s: NextStepState): NextStep[] {
  const moves = userTransitions(s.status, s.jobType);
  if ((s.status === "scheduled" || s.status === "unscheduled") && moves.includes("in_progress"))
    return ["start"];
  if (s.jobType === "maintenance" && s.status === "done" && s.visitAction) return ["visit-report"];
  if (s.section === "checklist" && s.jobType === "maintenance" && moves.includes("done"))
    return ["complete"];
  if (s.section === "findings")
    return s.hasTestTypes ? ["add-test", "add-finding"] : ["add-finding"];
  if (s.section === "photos") return ["add-photo", "add-video"];
  if (s.section === "wrap-up" && s.wrapUpAction) return ["wrap-up"];
  return [];
}

/**
 * Completing a maintenance visit in a shop whose visit reports are Automatic sends the report,
 * so it asks first (owner, 2026-10-20: "maybe when you press complete it prompts you with 'are
 * you ready to send'"). Null when completing sends nothing: still one tap.
 */
export function completeSendPrompt({
  jobType,
  reportMode,
  customer,
}: {
  jobType: string;
  /** The shop's visit reports: auto, manual (By Hand), or off. */
  reportMode: string;
  customer: string | null | undefined;
}): { title: string; message: string; confirmLabel: string } | null {
  if (jobType !== "maintenance" || reportMode !== "auto") return null;
  return {
    title: "Ready to send the visit report?",
    message: `Completing this visit sends its report to ${customer?.trim() || "the customer"}.`,
    confirmLabel: "Complete and Send",
  };
}
