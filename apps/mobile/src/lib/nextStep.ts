import { userTransitions, type JobStatus } from "@leakbook/core";

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
  | "write-draft"
  | "review";

export const NEXT_STEP_LABELS: Record<NextStep, string> = {
  start: "Start Job",
  complete: "Complete Job",
  "add-test": "Add Test",
  "add-finding": "Add Finding",
  "add-photo": "Add Photo",
  "add-video": "Add Video",
  "write-draft": "Write Draft",
  review: "Review with Customer",
};

export interface NextStepState {
  /** The job section on screen: details, checklist, findings, photos, or wrapup. */
  section: string;
  status: JobStatus;
  jobType: string;
  /** The shop has test types, so Add Test can open its sheet. */
  hasTestTypes: boolean;
  /** Wrap-Up's report has no draft yet (and the shop uses it). */
  noDraft: boolean;
  /** Drafts can be written now (server set up and a signal); otherwise Review with Customer. */
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
  if (s.section === "wrapup" && s.noDraft) return [s.canWriteDraft ? "write-draft" : "review"];
  return [];
}
