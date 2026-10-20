/**
 * Pool Inspection (owner, 2026-10-20; docs/plans/pool-inspection.md): a job type for leak shops
 * whose checklist is Leaktronics' New Swimming Pool Inspection form, every question word for
 * word, as config rows (component_type, job_type "inspection").
 *
 * Its questions are answered with one of their options ("choice"), several ("multi"), or text.
 * An option's flag says what the answer means: "attention" or "leaking" (counted, and listed
 * first on the report as Needs attention), "ok", or "na" (not applicable). The first question of
 * a group can be a gate: an option with `fold` ("Is a perimeter fence present?" No) folds the rest
 * of its group away as "Not present". Nothing is deleted; Yes opens them all again.
 */
import type { ChecklistItemResult, ChecklistOutcome, ChecklistSection } from "./inspection";
import type { IntakeQuestion, JobType } from "./models";

/** One choice on an inspection question. */
export interface ChoiceOption {
  label: string;
  flag?: "ok" | "attention" | "leaking" | "na";
  /** Choosing it folds away the rest of the question's group. */
  fold?: boolean;
}

export type InspectionAnswerKind = "choice" | "multi" | "text";

/** An inspection answer: an option's label, several labels, or text. */
export type InspectionValue = string | string[] | null;

/** The eight checklist sections, one per tab of the form, in order. */
export const INSPECTION_SECTIONS: ChecklistSection[] = [
  "insp_equipment",
  "insp_self_cleaning",
  "insp_heaters",
  "insp_electrical",
  "insp_fencing",
  "insp_covers",
  "insp_visual",
  "insp_plumbing",
];

/** What a folded group shows instead of its questions. */
export const NOT_PRESENT_LABEL = "Not present";

export function isInspectionAnswer(
  answer: string | null | undefined,
): answer is InspectionAnswerKind {
  return answer === "choice" || answer === "multi" || answer === "text";
}

/** A question's options from its row (bad or missing rows read as none). */
export function choiceOptions(raw: unknown): ChoiceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o): ChoiceOption[] => {
    if (!o || typeof o !== "object") return [];
    const { label, flag, fold } = o as Record<string, unknown>;
    if (typeof label !== "string" || !label.trim()) return [];
    return [
      {
        label,
        ...(flag === "ok" || flag === "attention" || flag === "leaking" || flag === "na"
          ? { flag }
          : {}),
        ...(fold === true ? { fold: true } : {}),
      },
    ];
  });
}

/** A stored answer as a value: text for choice and text questions, a list for multi. */
export function inspectionValue(answer: string | null | undefined, raw: unknown): InspectionValue {
  if (answer === "multi")
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/**
 * The checklist row for an answer. A choice takes its option's flag: attention or leaking set the
 * outcome, not applicable excludes the item, anything else passes. A list with something picked,
 * or text, is answered. An empty answer puts the question back to do.
 */
export function inspectionAnswerValues(
  type: { answer?: string | null; options?: unknown },
  value: InspectionValue,
  userId: string | null,
  now: Date = new Date(),
): {
  status: "pending" | "inspected" | "excluded";
  outcome: ChecklistOutcome | null;
  value: InspectionValue;
  method: string | null;
  inspected_at: string | null;
  inspected_by: string | null;
} {
  const at = now.toISOString();
  const blank = value === null || (Array.isArray(value) ? value.length === 0 : value.trim() === "");
  if (blank)
    return {
      status: "pending",
      outcome: null,
      value: null,
      method: null,
      inspected_at: null,
      inspected_by: null,
    };
  if (type.answer === "choice") {
    const label = Array.isArray(value) ? (value[0] ?? "") : value;
    const flag = choiceOptions(type.options).find((o) => o.label === label)?.flag;
    if (flag === "na")
      return {
        status: "excluded",
        outcome: null,
        value: label,
        method: null,
        inspected_at: at,
        inspected_by: userId,
      };
    return {
      status: "inspected",
      outcome: flag === "attention" || flag === "leaking" ? flag : "ok",
      value: label,
      method: "Visual",
      inspected_at: at,
      inspected_by: userId,
    };
  }
  return {
    status: "inspected",
    outcome: "ok",
    value:
      type.answer === "multi" ? (Array.isArray(value) ? value : [value]) : String(value).trim(),
    method: "Visual",
    inspected_at: at,
    inspected_by: userId,
  };
}

/** A multi answer with one label turned on or off, in the options' order. */
export function toggleChoice(options: ChoiceOption[], picked: string[], label: string): string[] {
  const on = picked.includes(label) ? picked.filter((p) => p !== label) : [...picked, label];
  const order = options.map((o) => o.label);
  return on.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** The answer as text: "Yes", "Pool main drain, Pool skimmer", the text, or null. */
export function inspectionAnswerText(
  answer: string | null | undefined,
  raw: unknown,
): string | null {
  const v = inspectionValue(answer, raw);
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return v;
}

/** The tone of an answer, from its option's flag. */
export function inspectionTone(
  r: Pick<ChecklistItemResult, "status" | "outcome"> | null | undefined,
): "pending" | "pass" | "attention" | "leaking" | "not_applicable" {
  if (!r || r.status === "pending") return "pending";
  if (r.status === "excluded") return "not_applicable";
  if (r.outcome === "leaking") return "leaking";
  if (r.outcome === "attention") return "attention";
  return "pass";
}

/** A row as the folding rule reads it: its section, group, options, and answer. */
export interface FoldRow {
  id: string;
  section?: string | null;
  group_label?: string | null;
  options?: unknown;
  value?: unknown;
}

/**
 * The questions folded away by their group's gate, as ids. Rows come in checklist order; a
 * group is the run of rows with the same section and group label, and its first row is the gate
 * when one of its options folds. Ungrouped rows never fold.
 */
export function foldedItems(rows: FoldRow[]): Set<string> {
  const folded = new Set<string>();
  const groups = new Map<string, FoldRow[]>();
  for (const r of rows) {
    if (!r.group_label) continue;
    const key = `${r.section ?? ""}\u0000${r.group_label}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [, items] of groups) {
    const [gate, ...rest] = items;
    if (!gate || rest.length === 0) continue;
    const chosen = typeof gate.value === "string" ? gate.value : null;
    if (chosen && choiceOptions(gate.options).some((o) => o.fold && o.label === chosen))
      for (const r of rest) folded.add(r.id);
  }
  return folded;
}

/** Whether a row is the gate of its group (its options fold the rest). */
export function isGate(row: { options?: unknown }): boolean {
  return choiceOptions(row.options).some((o) => o.fold);
}

/**
 * A section's progress, leaving out folded questions: "12 of 49 answered", and how many need
 * attention or are leaking. `toDo` is what's left; Complete Job counts it when the shop requires a
 * finished checklist.
 */
export function inspectionProgress(
  rows: (FoldRow & { result: Pick<ChecklistItemResult, "status" | "outcome"> | null })[],
  folded: Set<string> = foldedItems(rows),
): { answered: number; total: number; toDo: number; attention: number; leaking: number } {
  const shown = rows.filter((r) => !folded.has(r.id));
  const answered = shown.filter((r) => r.result && r.result.status !== "pending").length;
  return {
    answered,
    total: shown.length,
    toDo: shown.length - answered,
    attention: shown.filter((r) => r.result?.outcome === "attention").length,
    leaking: shown.filter((r) => r.result?.outcome === "leaking").length,
  };
}

/** "12 of 49 answered", or "All answered" with what needs attention. */
export function inspectionProgressText(p: {
  answered: number;
  total: number;
  attention: number;
  leaking: number;
}): string {
  if (p.answered < p.total) return `${p.answered} of ${p.total} answered`;
  const flagged = [
    p.leaking ? `${p.leaking} leaking` : null,
    p.attention ? `${p.attention} need${p.attention === 1 ? "s" : ""} attention` : null,
  ].filter(Boolean);
  return flagged.length ? flagged.join(" · ") : "All answered";
}

/**
 * The From the Customer questions this job type asks. A question without job types is a leak
 * detection question, as before inspections.
 */
export function intakeQuestionsFor<T extends IntakeQuestion>(questions: T[], type: JobType): T[] {
  return questions.filter((q) =>
    (q.job_types?.length ? q.job_types : ["detection"]).includes(type),
  );
}
