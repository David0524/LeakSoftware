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

/// Removes one repair (soft delete, so it syncs).
@MainActor
public func removeJobRepair(_ sync: SyncService, job: Row, id: String, now: Date = Date()) throws {
    let change = removeRepairWrites(
        repairJob(job), jobRepairRows(sync.store, job: job), id: id, now: isoString(now))
    guard !change.writes.isEmpty else { return }
    try apply(sync, job: job, change)
}
