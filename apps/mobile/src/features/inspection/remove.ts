import { removeItemConfirm, type ChecklistItemResult, type JobComponent } from "@leakbook/core";
import { announceRemoved } from "../../lib/removedBanner";
import { removeRows } from "../../lib/removal";
import type { SyncService } from "../../lib/sync-service";

/**
 * Deletes a test, finding, or checklist item, at once, and says so with Undo for five seconds
 * (owner, 2026-10-26: Undo instead of "Are you sure?"). Shared by the record's own screen (its
 * Delete button) and the list rows (swipe and the screen reader's Delete action), so the write
 * through the sync layer and its Undo are the same everywhere.
 */
export function deleteTest(
  sync: SyncService,
  companyId: string,
  testId: string,
  after?: () => void,
) {
  announceRemoved(removeRows(sync, companyId, "test", [{ table: "test_result", id: testId }]));
  after?.();
}

export function deleteFinding(
  sync: SyncService,
  companyId: string,
  findingId: string,
  after?: () => void,
) {
  announceRemoved(removeRows(sync, companyId, "finding", [{ table: "finding", id: findingId }]));
  after?.();
}

/** An item removed from the checklist: it and its result go together, and come back together. */
export function removeChecklistItem(
  sync: SyncService,
  companyId: string,
  component: JobComponent,
  result: ChecklistItemResult | undefined,
  after?: () => void,
) {
  announceRemoved(
    removeRows(
      sync,
      companyId,
      "checklistItem",
      [
        // The component first, so Undo makes it live before its result.
        { table: "job_component", id: component.id },
        ...(result ? [{ table: "checklist_item_result", id: result.id }] : []),
      ],
      {
        // A scheduled cleaning stays due on its plan, so it goes on the next visit.
        detail: removeItemConfirm(component.label, !!component.plan_cleaning_id).message,
      },
    ),
  );
  after?.();
}
