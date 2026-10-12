import { useMemo } from "react";
import {
  nextInstance,
  planComponents,
  type ChecklistItemResult,
  type ComponentType,
  type ExclusionReason,
  type Finding,
  type JobComponent,
  type Property,
  type SeverityLevel,
  type TestResult,
  type TestType,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import type { SyncService } from "../lib/sync-service";
import { useRows } from "./hooks";

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

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
  const components = useRows<JobComponent>("job_component", companyId);
  const results = useRows<ChecklistItemResult>("checklist_item_result", companyId);
  const tests = useRows<TestResult>("test_result", companyId);
  const findings = useRows<Finding>("finding", companyId);
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
  property: Pick<Property, "has_pool" | "has_spa">,
) {
  sync.batch(() => {
    for (const planned of planComponents(types, property))
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
  if (existing) sync.write("checklist_item_result", existing.id, companyId, values);
  else
    sync.insert("checklist_item_result", companyId, {
      job_id: jobId,
      job_component_id: componentId,
      ...values,
    });
}
