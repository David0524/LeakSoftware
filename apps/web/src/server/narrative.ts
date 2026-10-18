import {
  plainNarrative,
  validateNarrative,
  type Narrative,
  type NarrativeProblem,
  type ReportSnapshot,
} from "@leakbook/core";

// The report's written sections (BUILD_PLAN 6.2): the plain draft, written straight from the
// frozen job facts and checked by the validator. AI writing was removed (owner, 2026-10-18:
// "I don't think it's needed (plus we can always add back later)"); the tech reads and edits
// the draft before sending, as before.

export interface NarrativeResult {
  narrative: Narrative;
  problems: NarrativeProblem[];
  model: string;
  promptVersion: string;
}

/** Recorded on the report as the draft's writer. */
export const PLAIN_MODEL = "leakbook-plain";

export function writeNarrative(
  snapshot: ReportSnapshot,
  template: "homeowner" | "partner",
): NarrativeResult {
  const narrative = plainNarrative(snapshot, template);
  return {
    narrative,
    problems: validateNarrative(narrative, snapshot),
    model: PLAIN_MODEL,
    promptVersion: "plain",
  };
}
