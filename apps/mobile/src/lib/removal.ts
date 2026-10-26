import { REMOVED_TEXT, RESTORE_ROW, type RemovedKind } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";

// Undo instead of "Are you sure?" (owner, 2026-10-26; docs/design/2026-10-26-undo.md). A removal
// is a soft delete written through the sync layer (row + outbox), and Undo writes `deleted_at:
// null` on the same rows the same way, so a removal and its Undo sync like any other change.
// Pure, so it's tested without a phone.

/** What the removal needs from the sync layer. */
export interface RemovalSync {
  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void;
  batch<T>(fn: () => T): T;
}

export interface RowRef {
  table: string;
  id: string;
}

export interface Removal {
  kind: RemovedKind;
  /** "Photo removed". */
  message: string;
  /** A second, smaller line, when there's something to know ("It's still due…"). */
  detail?: string;
  /** Puts the rows back, as they were. */
  undo: () => void;
}

/** A removal made some other way (a repair also rewrites its job's price), with its Undo. */
export function removalFor(kind: RemovedKind, undo: () => void, detail?: string): Removal {
  return { kind, message: REMOVED_TEXT[kind], ...(detail ? { detail } : {}), undo };
}

/**
 * Marks `rows` deleted (as one batch) and says how to put them back. Undo clears `deleted_at`
 * on the same rows in the same order (list a parent before what hangs from it).
 */
export function removeRows(
  sync: RemovalSync,
  companyId: string,
  kind: RemovedKind,
  rows: readonly RowRef[],
  options: { now?: string; detail?: string | null } = {},
): Removal {
  const now = options.now ?? new Date().toISOString();
  sync.batch(() => {
    for (const r of rows) sync.write(r.table, r.id, companyId, { deleted_at: now });
  });
  return {
    kind,
    message: REMOVED_TEXT[kind],
    ...(options.detail ? { detail: options.detail } : {}),
    undo: () =>
      sync.batch(() => {
        for (const r of rows) sync.write(r.table, r.id, companyId, { ...RESTORE_ROW });
      }),
  };
}
