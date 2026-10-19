import type { Outcome } from "@leakbook/core";
import { Pill } from "../../ui/components";
import { color } from "../../ui/theme";

export const OUTCOME_LABELS: Record<Outcome, string> = {
  pass: "Pass",
  fail: "Fail",
  inconclusive: "Unclear",
};

/** A test's outcome as a solid status chip (spec 3.6): Pass, Fail, Unclear. */
export function OutcomeChip({ outcome }: { outcome?: Outcome | null }) {
  if (!outcome) return null;
  const bg = outcome === "pass" ? color.pass : outcome === "fail" ? color.fail : color.warning;
  return <Pill label={OUTCOME_LABELS[outcome]} color={bg} />;
}
