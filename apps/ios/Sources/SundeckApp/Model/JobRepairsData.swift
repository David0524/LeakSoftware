import Foundation
import SundeckCore
import SundeckSync

// A repair job's repairs on this phone (owner, 2026-10-22: "add additional repair";
// packages/core/src/repairs.ts). Table `job_repair`. Every change is local first (row + outbox,
// in one transaction with the job's price), so it works offline; the server keeps the price at
// the repairs' sum when two phones add at once. Port of apps/mobile/src/data/repairs.ts.

/// The job's fields the repairs read.
public func repairJob(_ job: Row) -> RepairJob {
    RepairJob(
        id: job.id, type: job["type"]?.string ?? "", feeCents: job["fee_cents"]?.number.map { Int($0) },
        intake: job["intake"])
}

/// The job's repair rows, removed ones too (they say the booking was written as a row).
public func jobRepairRows(_ store: LocalStore, job: Row) -> [JobRepair] {
    ((try? store.list("job_repair", companyId: job.companyId, jobId: job.id, includeDeleted: true)) ?? [])
        .compactMap { JobRepair(row: $0) }
}

/// The job's repairs in order: its rows, or the repair it was booked for.
public func jobRepairs(_ store: LocalStore, job: Row) -> [RepairLine] {
    jobRepairLines(repairJob(job), jobRepairRows(store, job: job))
}

/// Price book items a repair can be picked from: active ones, in the price book's order.
public func repairPriceBook(_ store: LocalStore, companyId: String) -> [RepairItem] {
    ((try? store.list("price_book_item", companyId: companyId)) ?? [])
        .filter { $0["active"]?.bool == true && ($0["deleted_at"]?.string ?? "").isEmpty }
        .enumerated()
        .sorted { a, b in
            let (x, y) = (a.element["sort_order"]?.number ?? 0, b.element["sort_order"]?.number ?? 0)
            return x == y ? a.offset < b.offset : x < y
        }
        .compactMap { e in
            e.element["price_cents"]?.number.map {
                RepairItem(id: e.element.id, name: e.element["name"]?.string ?? "Item", cents: Int($0))
            }
        }
}

@MainActor
private func apply(_ sync: SyncService, job: Row, _ change: RepairChange) throws {
    let store = sync.store
    let companyId = job.companyId
    try sync.batch {
        for w in change.writes {
            if let id = w.id {
                try store.write("job_repair", id: id, companyId: companyId, w.values)
            } else {
                try store.insert("job_repair", companyId: companyId, w.values)
            }
        }
        try store.write("job", id: job.id, companyId: companyId, ["fee_cents": .number(Double(change.feeCents))])
    }
}

/// Add Additional Repair, through the sync layer.
@MainActor
public func addJobRepair(_ sync: SyncService, job: Row, _ repair: RepairValues) throws {
    try apply(sync, job: job, addRepairWrites(repairJob(job), jobRepairRows(sync.store, job: job), repair))
}

/// Removes one repair (soft delete, so it syncs). Returns the job's price from before, for
/// Undo, or nil when the repair was already gone.
@MainActor
@discardableResult
public func removeJobRepair(_ sync: SyncService, job: Row, id: String, now: Date = Date()) throws -> Int? {
    let rows = jobRepairRows(sync.store, job: job)
    let before = repairsTotal(jobRepairLines(repairJob(job), rows).map(\.priceCents))
    let change = removeRepairWrites(repairJob(job), rows, id: id, now: isoString(now))
    guard !change.writes.isEmpty else { return nil }
    try apply(sync, job: job, change)
    return before
}

/// Undo for `removeJobRepair` (owner, 2026-10-26: Undo instead of "Are you sure?"): the row is live
/// again, as it was, and the job's price is what it was before (the server keeps it at the
/// repairs' sum). One transaction, like the removal.
@MainActor
public func restoreJobRepair(_ sync: SyncService, job: Row, id: String, feeCents: Int) throws {
    try sync.batch {
        try sync.store.write("job_repair", id: id, companyId: job.companyId, ["deleted_at": .null])
        try sync.store.write(
            "job", id: job.id, companyId: job.companyId, ["fee_cents": .number(Double(feeCents))])
    }
}
