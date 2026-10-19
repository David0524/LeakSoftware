#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// The job's tests, and a button per test type to add one. List content (sections) for the
    /// job page's List. Port of apps/mobile/src/features/inspection/TestsTab.tsx.
    struct TestsTab: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(\.openEditor) private var openEditor
        @State private var deleting: String?
        @State private var saveError: String?

        private var companyId: String { job.job["company_id"]?.string ?? "" }

        var body: some View {
            let _ = sync.revision  // reload after any write or pull
            let config = InspectionConfig(sync.store, companyId: companyId)
            let rows = testRows(JobInspection(sync.store, jobId: job.id), config)
            if !rows.isEmpty {
                Section {
                    ForEach(rows) { row in
                        Button {
                            openEditor(.test(jobId: job.id, testId: row.id, typeId: nil, componentId: nil))
                        } label: {
                            TestRow(row: row)
                        }
                        .swipeActions {
                            Button("Delete", role: .destructive) { deleting = row.id }
                        }
                    }
                }
            }
            Section {
                if rows.isEmpty {
                    Text("No tests recorded yet. Pick one to add.")
                        .font(.subheadline).foregroundStyle(Color.muted)
                }
                ForEach(config.testTypes, id: \.id) { type in
                    Button("+ \(type.name)") {
                        openEditor(.test(jobId: job.id, testId: nil, typeId: type.id, componentId: nil))
                    }
                    .buttonStyle(.secondary)
                }
            } header: {
                if !rows.isEmpty { Text("Add a test") }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            .confirmationDialog(
                "Delete this test?",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { delete() }
                Button("Keep", role: .cancel) { deleting = nil }
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func delete() {
            guard let id = deleting else { return }
            deleting = nil
            do {
                try InspectionWrites.delete(sync, table: "test_result", id: id, companyId: companyId)
            } catch {
                saveError = String(describing: error)
            }
        }
    }

    /// "Pressure test · Return 1", its result line, and the outcome chip.
    private struct TestRow: View {
        var row: TestRowItem

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.body.weight(.semibold)).foregroundStyle(.primary)
                    if let detail = row.detail {
                        Text(detail).font(.subheadline).foregroundStyle(Color.muted)
                    }
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                OutcomeChip(outcome: row.outcome)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color(Tokens.Role.placeholder))
                    .accessibilityHidden(true)
            }
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
        }
    }
#endif
