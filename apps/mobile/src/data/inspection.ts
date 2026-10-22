import { useMemo } from "react";
import {
  currentVerdict,
  checklistTally,
  foldedItems,
  inspectionAnswerValues,
  inspectionProgress,
  jobHasChecklist,
  nextInstance,
  planComponents,
  type InspectionValue,
  type ChecklistItemResult,
  type ComponentType,
  type ExclusionReason,
  type Finding,
  type JobComponent,
  type JobType,
  type Property,
  type SeverityLevel,
  type TestResult,
  type TestType,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import type { SyncService } from "../lib/sync-service";
import { useRows, useJobRows } from "./hooks";

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/** The checklists there are: leak detection's, a maintenance visit's, a pool inspection's. */
export type ChecklistJobType = "detection" | "maintenance" | "inspection";

/**
 * Which checklist a job takes: its own for visits and pool inspections, the leak one otherwise
 * (a repair has none of its own), as the website.
 */
export function checklistJobType(type: JobType | string | null | undefined): ChecklistJobType {
  return type === "maintenance" || type === "inspection" ? type : "detection";
}

/** Company configuration used by the inspection screens. */
export function useInspectionConfig(companyId: string) {
  const componentTypes = useRows<ComponentType>("component_type", companyId);
  const testTypes = useRows<TestType>("test_type", companyId);
  const severities = useRows<SeverityLevel>("severity_level", companyId);
  const reasons = useRows<ExclusionReason>("exclusion_reason", companyId);
  return useMemo(
    () => ({
      componentTypes: componentTypes.filter((t) => t.active).sort(bySort),
      componentTypeById: new Map(componentTypes.map((t) => [t.id, t])),
      testTypes: testTypes.filter((t) => t.active).sort(bySort),
      testTypeById: new Map(testTypes.map((t) => [t.id, t])),
      severities: severities.filter((s) => s.active).sort(bySort),
      severityByKey: new Map(severities.map((s) => [s.key, s])),
      exclusionReasons: reasons.filter((r) => r.active).sort(bySort),
    }),
    [componentTypes, testTypes, severities, reasons],
  );
}

/** Everything recorded on one job. Rows are already filtered to non-deleted. */
export function useJobInspection(companyId: string, jobId: string) {
  const components = useJobRows<JobComponent>("job_component", companyId, jobId);
  const results = useJobRows<ChecklistItemResult>("checklist_item_result", companyId, jobId);
  const tests = useJobRows<TestResult>("test_result", companyId, jobId);
  const findings = useJobRows<Finding>("finding", companyId, jobId);
  return useMemo(() => {
    const comps = components.filter((c) => c.job_id === jobId).sort(bySort);
    const res = results.filter((r) => r.job_id === jobId);
    return {
      components: comps,
      componentById: new Map(comps.map((c) => [c.id, c])),
      resultByComponent: new Map(res.map((r) => [r.job_component_id, r])),
      results: res,
      tests: tests
        .filter((t) => t.job_id === jobId)
        .sort((a, b) => (a.performed_at ?? "").localeCompare(b.performed_at ?? "")),
      findings: findings.filter((f) => f.job_id === jobId),
    };
  }, [components, results, tests, findings, jobId]);
}

// ---------------------------------------------------------------------------
// Writes (all offline, through the sync layer)
// ---------------------------------------------------------------------------

/** Add one component instance and its pending checklist row. Call inside sync.batch. */
function insertComponent(
  sync: SyncService,
  companyId: string,
  jobId: string,
  planned: {
    component_type_id: string;
    instance_number: number;
    label: string;
    sort_order: number;
  },
): string {
  const componentId = sync.insert("job_component", companyId, { job_id: jobId, ...planned });
  sync.insert("checklist_item_result", companyId, {
    job_id: jobId,
    job_component_id: componentId,
    status: "pending",
  });
  return componentId;
}

/** Create the default checklist for a job (used when the job is created, or later). */
export function createChecklist(
  sync: SyncService,
  companyId: string,
  jobId: string,
  types: ComponentType[],
  property: Pick<Property, "has_pool" | "has_spa"> & { pool_type?: string | null },
  jobType: ChecklistJobType = "detection",
) {
  sync.batch(() => {
    for (const planned of planComponents(types, property, jobType))
      insertComponent(sync, companyId, jobId, planned);
  });
}

export function addComponent(
  sync: SyncService,
  companyId: string,
  jobId: string,
  type: ComponentType,
  existing: JobComponent[],
): string {
  return sync.batch(() => insertComponent(sync, companyId, jobId, nextInstance(type, existing)));
}

/** Remove an instance added by mistake. Its checklist row goes with it. */
export function removeComponent(
  sync: SyncService,
  companyId: string,
  component: JobComponent,
  result?: ChecklistItemResult,
) {
  const now = new Date().toISOString();
  sync.batch(() => {
    if (result) sync.write("checklist_item_result", result.id, companyId, { deleted_at: now });
    sync.write("job_component", component.id, companyId, { deleted_at: now });
  });
}

export function saveChecklistResult(
  sync: SyncService,
  companyId: string,
  jobId: string,
  componentId: string,
  existing: ChecklistItemResult | undefined,
  values: Record<string, JsonValue>,
) {
  // `existing` is what the screen last showed; two saves before it re-renders (the notes saved
  // as the field is left, then the answer) would otherwise both add a result.
  const current =
    existing ??
    (sync.list("checklist_item_result", companyId, jobId) as unknown as ChecklistItemResult[]).find(
      (r) => r.job_component_id === componentId,
    );
  if (current) sync.write("checklist_item_result", current.id, companyId, values);
  else
    sync.insert("checklist_item_result", companyId, {
      job_id: jobId,
      job_component_id: componentId,
      ...values,
    });
}

/**
 * "Where" typed on a Leaking or Attention item. Saved by itself after typing stops or when the
 * field goes away, so by then the answer may have changed to one without a Where (Not Leaking
 * clears it): then it isn't written back.
 */
export function saveWhere(
  sync: SyncService,
  companyId: string,
  jobId: string,
  componentId: string,
  where: string | null,
) {
  const current = (
    sync.list("checklist_item_result", companyId, jobId) as unknown as ChecklistItemResult[]
  ).find((r) => r.job_component_id === componentId);
  const verdict = currentVerdict(current);
  if (!current || (verdict !== "leaking" && verdict !== "attention")) return;
  if ((current.location_text ?? null) === where) return;
  sync.write("checklist_item_result", current.id, companyId, { location_text: where });
}

/**
 * A pool inspection answer (2026-10-20): an option, several, or text. The question's own options
 * decide the outcome (inspectionAnswerValues), as the website's setAnswer.
 */
export function saveInspectionAnswer(
  sync: SyncService,
  companyId: string,
  jobId: string,
  componentId: string,
  existing: ChecklistItemResult | undefined,
  type: Pick<ComponentType, "answer" | "options">,
  value: InspectionValue,
  userId: string | null,
) {
  saveChecklistResult(
    sync,
    companyId,
    jobId,
    componentId,
    existing,
    inspectionAnswerValues(type, value, userId),
  );
}

/** A job's checklist rows as the folding rule reads them, in checklist order. */
export function inspectionRows(
  components: JobComponent[],
  resultByComponent: Map<string, ChecklistItemResult>,
  typeById: Map<string, ComponentType>,
) {
  return components.flatMap((c) => {
    const t = typeById.get(c.component_type_id);
    const r = resultByComponent.get(c.id);
    return t
      ? [
          {
            id: c.id,
            section: t.section ?? null,
            group_label: t.group_label ?? null,
            options: t.options,
            value: r?.value,
            result: r ? { status: r.status, outcome: r.outcome ?? null } : null,
          },
        ]
      : [];
  });
}

/**
 * A job's checklist counts: the tally, and for a pool inspection its progress leaving out the
 * questions its gates folded away. `toDo` is what the Checklist badge and Complete Job count.
 */
export function useChecklistProgress(companyId: string, jobId: string, jobType?: string | null) {
  const config = useInspectionConfig(companyId);
  const insp = useJobInspection(companyId, jobId);
  return useMemo(() => {
    // A repair job has no checklist (owner, 2026-10-22): rows an older one has aren't counted.
    if (!jobHasChecklist(jobType))
      return { tally: checklistTally([], []), inspection: null, toDo: 0 };
    const tally = checklistTally(insp.components, insp.results);
    if (jobType !== "inspection") return { tally, inspection: null, toDo: tally.pending };
    const rows = inspectionRows(insp.components, insp.resultByComponent, config.componentTypeById);
    const inspection = inspectionProgress(rows, foldedItems(rows));
    return { tally, inspection, toDo: inspection.toDo };
  }, [insp, config.componentTypeById, jobType]);
}
