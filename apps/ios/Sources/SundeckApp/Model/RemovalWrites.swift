import Foundation
import SundeckCore
import SundeckSync

// Undo instead of "Are you sure?" (owner, 2026-10-26; docs/design/2026-10-26-undo.md). A removal
// is a soft delete written through the sync layer (row + outbox, one transaction), and Undo
// writes `deleted_at: null` on the same rows the same way, so a removal and its Undo sync like
// any other change. Website: restore* server actions; Android: lib/removal.ts.

/// One row a removal marks deleted.
public struct RemovalRow: Equatable, Sendable {
    public var table: String
    public var id: String

    public init(_ table: String, _ id: String) {
        self.table = table
        self.id = id
    }
}

extension RemovalRow {
    /// A checklist item, removed or restored whole: its component first (so Undo makes it live
    /// before its result), then its result.
    public static func checklistItem(_ component: JobComponent, _ result: ChecklistItemResult?) -> [RemovalRow] {
        [RemovalRow("job_component", component.id)]
            + (result.map { [RemovalRow("checklist_item_result", $0.id)] } ?? [])
    }
}

@MainActor
public enum RemovalWrites {
    /// Marks `rows` deleted, as one batch.
    public static func remove(_ sync: SyncService, companyId: String, rows: [RemovalRow]) throws {
        let now = nowISO()
        try sync.batch {
            for row in rows { try sync.store.write(row.table, id: row.id, companyId: companyId, ["deleted_at": now]) }
        }
    }

    /// Undo: the same rows live again (`RESTORE_ROW`), in the same order (list a parent first).
    public static func restore(_ sync: SyncService, companyId: String, rows: [RemovalRow]) throws {
        try sync.batch {
            for row in rows { try sync.store.write(row.table, id: row.id, companyId: companyId, ["deleted_at": .null]) }
        }
    }
}
