import type { ChecklistItemResult, ChecklistOutcome, ComponentType } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";

/** One tap per item: the four verdicts the shop uses (yes/no items: No, Yes, N/A). */
export type Verdict = ChecklistOutcome | "na";

export function verdictOptions(type: Pick<ComponentType, "answer">) {
  return type.answer === "yes_no"
    ? [
        { value: "ok" as Verdict, label: "No" },
        { value: "attention" as Verdict, label: "Yes" },
        { value: "na" as Verdict, label: "N/A" },
      ]
    : [
        { value: "ok" as Verdict, label: "Not Leaking" },
        { value: "leaking" as Verdict, label: "Leaking" },
        { value: "attention" as Verdict, label: "Attention" },
        { value: "na" as Verdict, label: "N/A" },
      ];
}

export function currentVerdict(r: ChecklistItemResult | undefined): Verdict | null {
  if (!r || r.status === "pending") return null;
  if (r.status === "excluded") return "na";
  return r.outcome ?? "ok";
}

/** The checklist row values for a verdict. */
export function verdictValues(v: Verdict | null, userId: string | null): Record<string, JsonValue> {
  const now = new Date().toISOString();
  if (v === null)
    return { status: "pending", outcome: null, inspected_at: null, inspected_by: null };
  if (v === "na")
    return { status: "excluded", outcome: null, inspected_at: now, inspected_by: userId };
  return { status: "inspected", outcome: v, inspected_at: now, inspected_by: userId };
}
