#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Tests" in the job's Findings section (spec 5.4): a grouped row per test (name, item and
    /// time, the calculation, the recorded fields, notes, the outcome chip), swipe left to delete.
    /// Add Test is on the job page's Next Step bar (owner, 2026-10-20). Tapping a row opens its
    /// Edit sheet. Port of TestsEditor in
    /// apps/web/src/components/job-work.tsx.
    struct TestsTab: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openEditor) private var openEditor
        @State private var deleting: TestRowItem?
        @State private var saveError: String?

        private var companyId: String { job.job["company_id"]?.string ?? "" }

        var body: some View {
            let _ = sync.revision  // reload after any write or pull
            let config = InspectionConfig(sync.store, companyId: companyId)
            let rows = testRows(
                JobInspection(sync.store, jobId: job.id), config, now: Date(),
                timeZone: session.company?.timeZone ?? "America/Phoenix")
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Tests")
                VStack(alignment: .leading, spacing: 16) {
                    if rows.isEmpty {
                        Text("No tests recorded.").textRole(.body).foregroundStyle(Color.textMuted)
                    } else {
                        Grouped {
                            ForEach(rows) { row in
                                SwipeDeleteRow(name: row.name, delete: { deleting = row }) {
                                    Button {
                                        openEditor(.test(jobId: job.id, testId: row.id, typeId: nil, componentId: nil))
                                    } label: {
                                        TestRow(row: row)
                                    }
                                    .buttonStyle(.row)
                                    .accessibilityLabel("Edit \(row.name)")
                                }
                            }
                        }
                    }
                }
            }
            .confirmationDialog(
                deleting.map { "Delete this \($0.name.lowercased())?" } ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { row in
                Button("Delete Test", role: .destructive) { delete(row.id) }
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func delete(_ id: String) {
            deleting = nil
            do {
                try InspectionWrites.delete(sync, table: "test_result", id: id, companyId: companyId)
            } catch {
                saveError = String(describing: error)
            }
        }
    }

    /// The test's name, "Skimmer · Today 9:40 AM", its calculation, fields and notes; the outcome
    /// chip and a chevron on the right.
    private struct TestRow: View {
        var row: TestRowItem

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    if let meta = row.meta {
                        Text(meta).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                    if let summary = row.summary {
                        Text(summary).textRole(.bodyMedium).foregroundStyle(Color.text).padding(.top, 2)
                    }
                    ForEach(row.fields, id: \.label) { field in
                        (Text("\(field.label): ").foregroundStyle(Color.textMuted)
                            + Text(field.value).foregroundStyle(Color.text))
                            .textRole(.secondary)
                    }
                    if let notes = row.notes {
                        Text(notes).textRole(.secondary).foregroundStyle(Color.text).padding(.top, 2)
                    }
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                OutcomeChip(outcome: row.outcome)
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, 12)
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
        }
    }
#endif
