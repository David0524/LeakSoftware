import type { ChecklistItemResult, ChecklistTally, ComponentType } from "./inspection";
import { currentVerdict } from "./inspection";

/** The color a checklist section's summary is drawn in. */
export type ChecklistSummaryTone = "muted" | "pass" | "fail" | "warning";

/**
 * The one-line summary at the right of a checklist section's header (design spec 5.4):
 * "2 of 9 to do", "All clear", "1 leaking", "1 attention", "1 leaking · 1 attention"; on a
 * pool service list "All done" or "1 needs attention". Attention is warning-colored, not green
 * (spec decision 10); anything leaking is red. `open` is whether the section starts unfolded.
 */
export function checklistSectionSummary(
  items: { result: Pick<ChecklistItemResult, "status" | "outcome"> | null | undefined }[],
  service = false,
): { text: string; tone: ChecklistSummaryTone; toDo: number; open: boolean } {
  const toDo = items.filter((i) => currentVerdict(i.result ?? undefined) === null).length;
  const leaking = items.filter((i) => i.result?.outcome === "leaking").length;
  const attention = items.filter((i) => i.result?.outcome === "attention").length;
  if (toDo > 0)
    return { text: `${toDo} of ${items.length} to do`, tone: "muted", toDo, open: true };
  if (service)
    return attention
      ? {
          text: `${attention} need${attention === 1 ? "s" : ""} attention`,
          tone: "warning",
          toDo,
          open: false,
        }
      : { text: "All done", tone: "pass", toDo, open: false };
  if (leaking || attention)
    return {
      text: [leaking ? `${leaking} leaking` : null, attention ? `${attention} attention` : null]
        .filter(Boolean)
        .join(" · "),
      tone: leaking ? "fail" : "warning",
      toDo,
      open: false,
    };
  return { text: "All clear", tone: "pass", toDo, open: false };
}

/**
 * The "mark the rest" action under a section's items: "Answer 3 Remaining No" for yes/no
 * items, "Mark 3 Remaining Done" for pool service items, else "Mark 3 Remaining Not Leaking".
 */
export function markRemainingLabel(answers: ComponentType["answer"][]): string {
  const n = answers.length;
  if (answers.every((a) => a === "yes_no")) return `Answer ${n} Remaining No`;
  if (answers.every((a) => a === "done")) return `Mark ${n} Remaining Done`;
  return `Mark ${n} Remaining Not Leaking`;
}

/** "1 needs attention", "2 need attention". */
export function needAttentionText(n: number): string {
  return `${n} need${n === 1 ? "s" : ""} attention`;
}

/**
 * The line under a pool inspection's Checklist heading: "12 of 49 answered", then what needs
 * attention or is leaking, each only when there is some (owner, 2026-10-26: no zero counts).
 */
export function inspectionTallyText(p: {
  answered: number;
  total: number;
  attention: number;
  leaking: number;
}): string {
  return [
    `${p.answered} of ${p.total} answered`,
    p.attention ? needAttentionText(p.attention) : null,
    p.leaking ? `${p.leaking} leaking` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The line under a leak or maintenance checklist's heading: the counts that aren't zero, in this
 * order. Maintenance: done, needs attention, skipped, to do. Leak detection: not leaking,
 * attention, leaking, not applicable, to do. `pending: false` leaves out "to do" (the report
 * screen words what's left on its own line). Empty when every count is zero.
 */
export function checklistTallyText(
  t: ChecklistTally,
  maintenance: boolean,
  pending = true,
): string {
  const parts = maintenance
    ? [
        t.pass ? `${t.pass} done` : null,
        t.attention ? needAttentionText(t.attention) : null,
        t.notApplicable ? `${t.notApplicable} skipped` : null,
      ]
    : [
        t.pass ? `${t.pass} not leaking` : null,
        t.attention ? `${t.attention} attention` : null,
        t.leaking ? `${t.leaking} leaking` : null,
        t.notApplicable ? `${t.notApplicable} not applicable` : null,
      ];
  if (pending && t.pending) parts.push(`${t.pending} to do`);
  return parts.filter(Boolean).join(" · ");
}
