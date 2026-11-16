import Foundation
import SundeckCore
import SundeckSync

// Skip a Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md). The sheet's reasons come
// from the shop's synced `skip_reason` rows (Settings › Skip Reasons); Skip writes the job through
// the sync layer (row and outbox together), so it works offline. Website components/skip-visit.tsx;
// Android features/job/SkipVisit.tsx.

/// The reasons a tech can pick, in the shop's order (core `pickableSkipReasons`).
public func skipReasons(_ store: LocalStore, companyId: String) -> [SkipReason] {
    let rows = (try? store.list("skip_reason", companyId: companyId)) ?? []
    return pickableSkipReasons(
        rows.compactMap { r in
            guard let label = r["label"]?.string else { return nil }
            return SkipReason(
                id: r.id, label: label, sortOrder: Int(r["sort_order"]?.number ?? 0),
                active: r["active"]?.bool ?? true, system: r["system"]?.bool, deletedAt: r["deleted_at"]?.string)
        })
}

/// What Skip writes on the job: the status, the reason, the trimmed note and the phone's time.
public func skipJobValues(reason: String, note: String, at: Date = Date()) -> Row {
    let values = skipValues(
        reason: reason, note: note, at: isoTimestamp(milliseconds: at.timeIntervalSince1970 * 1000))
    return [
        "status": .string(values.status), "skip_reason": .string(values.skipReason),
        "skip_note": values.skipNote.map { .string($0) } ?? .null, "skipped_at": .string(values.skippedAt),
    ]
}

/// What Undo Skip writes: back on its time, or waiting for one.
public func unskipValues(_ job: JobView) -> Row {
    let timed = !(job.job["scheduled_start"]?.string ?? "").isEmpty
    return ["status": .string(timed ? JobStatus.scheduled.rawValue : JobStatus.unscheduled.rawValue)]
}

/// Settings › Scheduling › Skip Unfinished Visits at Day's End, through the sync layer (owners and
/// admins). Everything else in the shop's settings is kept.
@MainActor
public enum SkipUnfinishedWrites {
    public static func set(_ sync: SyncService, company: CompanyContext, on: Bool) throws {
        var o: [String: JSONValue] = [:]
        if case .object(let current) = company.settings { o = current }
        o["skip_unfinished_visits"] = .bool(on)
        try sync.write("company", id: company.id, companyId: company.id, ["settings": .object(o)])
    }
}

/// Whether Skip Visit is offered on this job's page (a maintenance visit not yet done).
public func jobCanSkip(_ status: JobStatus, type: JobType) -> Bool {
    userTransitions(from: status, type: type.rawValue).contains(.skipped)
}

/// What the skipped card needs from the job's row.
public func skipJob(_ job: JobView) -> SkipJob {
    SkipJob(
        type: job.type.rawValue, status: job.status.rawValue, skipReason: job.job["skip_reason"]?.string,
        skippedAt: job.job["skipped_at"]?.string, skipHandledAt: job.job["skip_handled_at"]?.string)
}

/// Tells the owners and admins about a skip (the server pushes it once). The skip has to reach the
/// server first, so this syncs, then asks; "pending" answers wait a little and ask again. Best
/// effort: the server's daily run catches any skip this never announced.
@MainActor
func announceSkip(jobId: String, sync: SyncService, api: WebAPI) async {
    for wait in [0, 10, 40] {
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        await sync.syncNow()
        do {
            let answer = try await api.post("api/jobs/\(jobId)/skipped")
            if case .object(let o) = answer, o["pending"] == .bool(true) { continue }
            return
        } catch {
            // No connection, or the server is busy: the next try, then the daily run.
            continue
        }
    }
}
