import { userTransitions, type JobStatus } from "@leakbook/core";

// The Next Step bar on a phone's job page (owner, 2026-10-20: one-handed use, item 1): the one
// or two buttons the tech most likely wants next, pinned above the tab bar.

export type NextStep =
  "start" | "complete" | "add-test" | "add-finding" | "add-photo" | "add-video" | "write-draft";

export const NEXT_STEP_LABELS: Record<NextStep, string> = {
  start: "Start Job",
  complete: "Complete Job",
  "add-test": "Add Test",
  "add-finding": "Add Finding",
  "add-photo": "Add Photo",
  "add-video": "Add Video",
  "write-draft": "Write Draft",
};

export interface NextStepState {
  /** The job section on screen: details, checklist, findings, photos, or wrap-up. */
  section: string;
  status: JobStatus;
  jobType: string;
  /** The shop has test types, so Add Test can open its sheet. */
  hasTestTypes: boolean;
  /** Wrap-Up's report panel is on screen and has no draft yet. */
  canWriteDraft: boolean;
}

/**
 * The bar's buttons, primary first; empty hides the bar. First match wins: a job that can be
 * started; a maintenance visit's checklist that can be completed; Findings; Photos; Wrap-Up
 * with no draft yet.
 */
export function nextStepButtons(s: NextStepState): NextStep[] {
  const moves = userTransitions(s.status, s.jobType);
  if ((s.status === "scheduled" || s.status === "unscheduled") && moves.includes("in_progress"))
    return ["start"];
  if (s.section === "checklist" && s.jobType === "maintenance" && moves.includes("done"))
    return ["complete"];
  if (s.section === "findings")
    return s.hasTestTypes ? ["add-test", "add-finding"] : ["add-finding"];
  if (s.section === "photos") return ["add-photo", "add-video"];
  if (s.section === "wrap-up" && s.canWriteDraft) return ["write-draft"];
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
