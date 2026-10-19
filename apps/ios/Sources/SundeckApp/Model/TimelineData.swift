import Foundation
import SundeckCore
import SundeckSync

/// What the job's Timeline asks the audit log about, and how it names a record. Port of the
/// website's Timeline in apps/web/src/app/(office)/jobs/[id]/page.tsx.
public struct TimelineSubjects: Sendable {
    /// The job and every checklist, test, finding and capture row on it.
    public var rowIds: [String]
    private var labels: [String: String]

    public init(_ store: LocalStore, companyId: String, jobId: String) {
        let inspection = JobInspection(store, jobId: jobId)
        let config = InspectionConfig(store, companyId: companyId)
        let media = ((try? store.list("media", jobId: jobId)) ?? []).compactMap { $0["id"]?.string }
        rowIds =
            [jobId] + inspection.components.map(\.id) + inspection.results.map(\.id) + inspection.tests.map(\.id)
            + inspection.findings.map(\.id) + media
        var labels: [String: String] = [:]
        for c in inspection.components { labels["job_component|\(c.id)"] = c.label }
        for r in inspection.results {
            if let label = inspection.componentById[r.jobComponentId]?.label {
                labels["checklist_item_result|\(r.id)"] = label
            }
        }
        for t in inspection.tests {
            if let name = config.testTypeById[t.testTypeId]?.name { labels["test_result|\(t.id)"] = name }
        }
        for f in inspection.findings { labels["finding|\(f.id)"] = f.title }
        self.labels = labels
    }

    public func label(_ table: String, _ rowId: String) -> String? { labels["\(table)|\(rowId)"] }
}
