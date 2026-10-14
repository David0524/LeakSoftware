import type { ChecklistItemResult, JobComponent } from "@leakbook/core";
import { removeComponent } from "../../data/inspection";
import type { SyncService } from "../../lib/sync-service";
import { confirmDestructive } from "../../ui/confirm";

/**
 * Asks, then deletes, a test, finding, or checklist item. Shared by the record's own screen
 * (its Delete button) and the list rows (swipe and the screen reader's Delete action), so the
 * question and the write through the sync layer are the same everywhere.
 */
export function confirmDeleteTest(
  sync: SyncService,
  companyId: string,
  testId: string,
  after?: () => void,
) {
  confirmDestructive({
    title: "Delete this test?",
    confirm: "Delete",
    cancel: "Keep",
    onConfirm: () => {
      sync.write("test_result", testId, companyId, { deleted_at: new Date().toISOString() });
      after?.();
    },
  });
}

export function confirmDeleteFinding(
  sync: SyncService,
  companyId: string,
  findingId: string,
  after?: () => void,
) {
  confirmDestructive({
    title: "Delete this finding?",
    confirm: "Delete",
    cancel: "Keep",
    onConfirm: () => {
      sync.write("finding", findingId, companyId, { deleted_at: new Date().toISOString() });
      after?.();
    },
  });
}

export function confirmRemoveComponent(
  sync: SyncService,
  companyId: string,
  component: JobComponent,
  result: ChecklistItemResult | undefined,
  after?: () => void,
) {
  confirmDestructive({
    title: `Remove ${component.label}?`,
    message: "Use this only if it was added by mistake.",
    confirm: "Remove",
    cancel: "Keep",
    onConfirm: () => {
      removeComponent(sync, companyId, component, result);
      after?.();
    },
  });
}
