import Foundation
import SundeckCore
import SundeckSync

// Service issues on this phone (docs/design/2026-11-16-service-issues.md): a tech reports a problem
// on a visit (Report an Issue), the office resolves it or makes a job of it. Table
// `service_issue`. Every write is a row + outbox through the sync layer, so it all works offline;
// the owners and admins hear about a report once it reached the server (`IssueNotices`). Port of
// apps/mobile/src/data/issues.ts.

/// An issue row as the screens read it. A report made on this phone has no status until the
/// server's comes back: it's open.
func decodeIssue(_ row: Row) -> ServiceIssue? {
    var row = row
    if row["status"]?.string == nil { row["status"] = "open" }
    if row["reported_at"]?.string == nil { row["reported_at"] = .string(row["created_at"]?.string ?? "") }
    return try? JSONValue.object(row).decode(ServiceIssue.self)
}

/// The shop's issues on this phone (removed ones left out).
public func shopIssues(_ store: LocalStore, companyId: String) -> [ServiceIssue] {
    ((try? store.list("service_issue", companyId: companyId)) ?? []).compactMap(decodeIssue)
        .filter { $0.deletedAt == nil }
}

/// Issues reported on a job, newest first.
public func jobIssues(_ store: LocalStore, jobId: String) -> [ServiceIssue] {
    ((try? store.list("service_issue", jobId: jobId)) ?? []).compactMap(decodeIssue)
        .filter { $0.deletedAt == nil && $0.jobId == jobId }
        .sorted { $0.reportedAt > $1.reportedAt }
}

/// One issue, or nil when it isn't on this phone.
public func findIssue(_ store: LocalStore, id: String) -> ServiceIssue? {
    (try? store.get("service_issue", id)).flatMap(decodeIssue)
}

/// An issue's own photos and videos: on its visit, oldest first.
public func issueMedia(_ store: LocalStore, _ issue: ServiceIssue) -> [Media] {
    guard let jobId = issue.jobId else { return [] }
    return Array(jobMedia(store, MediaTarget(jobId: jobId, serviceIssueId: issue.id)).reversed())
}

@MainActor
public enum IssueWrites {
    /// Report an Issue: saves it (open, by this person), or updates what it says when it was saved
    /// already (a photo saves it first).
    public static func save(
        _ sync: SyncService, companyId: String, id: String, customerId: String, propertyId: String, jobId: String,
        description: String, suggested: IssueWork?, userId: String, now: Date = Date()
    ) throws {
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let suggestion: JSONValue = suggested.map { .string($0.rawValue) } ?? .null
        if (try? sync.store.get("service_issue", id)) != nil {
            try sync.write(
                "service_issue", id: id, companyId: companyId,
                ["description": .string(text), "suggested_type": suggestion])
        } else {
            // Open on the phone at once (the server's default; pushed as an unchanged update).
            try sync.write(
                "service_issue", id: id, companyId: companyId,
                [
                    "customer_id": .string(customerId), "property_id": .string(propertyId), "job_id": .string(jobId),
                    "description": .string(text), "suggested_type": suggestion, "reported_by": .string(userId),
                    "reported_at": .string(isoString(now)), "status": "open",
                ])
        }
    }

    /// Resolve, with an optional note.
    public static func resolve(
        _ sync: SyncService, _ issue: ServiceIssue, companyId: String, userId: String, note: String
    ) throws {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        try sync.write(
            "service_issue", id: issue.id, companyId: companyId,
            [
                "status": "resolved", "resolution_note": text.isEmpty ? .null : .string(text),
                "resolved_by": .string(userId), "resolved_at": .string(isoString(Date())),
            ])
    }

    /// Reopen a resolved issue.
    public static func reopen(_ sync: SyncService, _ issue: ServiceIssue, companyId: String) throws {
        try sync.write(
            "service_issue", id: issue.id, companyId: companyId,
            ["status": "open", "resolution_note": .null, "resolved_by": .null, "resolved_at": .null])
    }

    /// Make Quote (a repair job) or Make Leak Detection Job, in one save: the job for the issue's
    /// pool and customer (the description as its notes), the issue converted to it, its photos and
    /// videos copied onto the job (the same files; the server marks a copy uploaded with its
    /// original), and, for leak detection, the pool's checklist. Returns the job's id. Port of
    /// core issueConversion and the phone's convertIssue.
    public static func convert(
        _ sync: SyncService, _ issue: ServiceIssue, type: IssueWork, companyId: String, userId: String
    ) throws -> String {
        let store = sync.store
        let jobId = uuidv7()
        let media = issueMedia(store, issue)
        let mediaRows = media.compactMap { m in try? store.get("media", m.id) }
        let pool = issue.propertyId.flatMap { try? store.get("property", $0) }
        let types = ((try? store.list("component_type", companyId: companyId)) ?? []).compactMap {
            try? JSONValue.object($0).decode(ComponentType.self)
        }
        let copied = [
            "kind", "storage_path", "upload_state", "mime_type", "size_bytes", "sha256", "width", "height",
            "duration_ms", "captured_at", "latitude", "longitude", "markup", "caption",
        ]
        let now = isoString(Date())
        return try sync.batch {
            try store.write(
                "job", id: jobId, companyId: companyId,
                [
                    "type": .string(type.rawValue), "property_id": issue.propertyId.map(JSONValue.string) ?? .null,
                    "bill_to_customer_id": issue.customerId.map(JSONValue.string) ?? .null, "status": "unscheduled",
                    "summary_notes": .string(issue.description.trimmingCharacters(in: .whitespacesAndNewlines)),
                ])
            try store.write(
                "service_issue", id: issue.id, companyId: companyId,
                [
                    "status": "converted", "converted_job_id": .string(jobId), "resolved_by": .string(userId),
                    "resolved_at": .string(now),
                ])
            for row in mediaRows {
                var copy: Row = ["job_id": .string(jobId), "service_issue_id": .string(issue.id)]
                for key in copied { copy[key] = row[key] ?? .null }
                try store.write("media", id: uuidv7(), companyId: companyId, copy)
            }
            if type == .detection {
                let planned = try JSONValue.object([
                    "address_line1": "", "has_pool": true, "has_spa": .bool(pool?["has_spa"]?.bool ?? false),
                    "pool_type": pool?["pool_type"] ?? .null,
                ])
                .decode(Property.self)
                for item in planComponents(types, planned, .detection) {
                    let componentId = try store.insert(
                        "job_component", companyId: companyId,
                        [
                            "job_id": .string(jobId), "component_type_id": .string(item.componentTypeId),
                            "instance_number": .number(Double(item.instanceNumber)), "label": .string(item.label),
                            "sort_order": .number(Double(item.sortOrder)),
                        ])
                    try store.insert(
                        "checklist_item_result", companyId: companyId,
                        ["job_id": .string(jobId), "job_component_id": .string(componentId), "status": "pending"])
                }
            }
            return jobId
        }
    }
}

/// After a sync: issues this person reported that reached the server but haven't been announced
/// yet go to /api/issues/notify, which tells the owners and admins once. Never throws.
@MainActor
public func flushIssueNotices(_ sync: SyncService, _ api: WebAPI, companyId: String, userId: String) async {
    let waiting = ((try? sync.store.list("service_issue", companyId: companyId)) ?? [])
        .filter { row in
            row["reported_by"]?.string == userId && row["notified_at"]?.string == nil
                && row["deleted_at"]?.string == nil && !sync.hasPendingWrites("service_issue", row.id)
                // Its photos first, so the office sees them with it.
                && !(row["job_id"]?.string.map { sync.hasPendingUploads(jobId: $0) } ?? false)
        }
        .map(\.id)
    guard !waiting.isEmpty else { return }
    // No connection, signed out, or refused: the next sync asks again (the server tells once).
    _ = try? await api.post(
        "api/issues/notify",
        ["company_id": .string(companyId), "ids": .array(waiting.prefix(50).map(JSONValue.string))])
}
