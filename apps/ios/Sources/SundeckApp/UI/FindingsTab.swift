#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// The pool diagram with every finding's pin, the shape picker, the numbered findings and
    /// Add Finding. List content (sections) for the job page's List. Port of
    /// apps/mobile/src/features/inspection/FindingsTab.tsx.
    struct FindingsTab: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(\.openEditor) private var openEditor
        @State private var deleting: String?
        @State private var saveError: String?

        private var companyId: String { job.job["company_id"]?.string ?? "" }

        var body: some View {
            let _ = sync.revision  // reload after any write or pull
            let config = InspectionConfig(sync.store, companyId: companyId)
            let insp = JobInspection(sync.store, jobId: job.id)
            // The property as it is now (the shape picker writes it).
            let property = job.property.flatMap { (try? sync.store.get("property", $0.id)) ?? $0 }
            let shape = diagramShape(of: property)
            let rows = findingRows(insp, config)
            if let property {
                Section {
                    PoolDiagram(
                        shape: shape, hasSpa: property["has_spa"]?.bool ?? false, pins: findingPins(insp, config))
                    ShapePicker(value: shape, hint: shape == nil ? shapeNotPickedHint : nil) { newShape in
                        do {
                            try InspectionWrites.setDiagramShape(
                                sync, propertyId: property.id, companyId: companyId, shape: newShape)
                        } catch {
                            saveError = String(describing: error)
                        }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
            }
            Section {
                if rows.isEmpty {
                    Text("No findings yet. Add one for each leak you find.")
                        .font(.subheadline).foregroundStyle(Color.muted)
                } else {
                    ForEach(rows) { row in
                        Button {
                            openEditor(.finding(jobId: job.id, findingId: row.id, componentId: nil))
                        } label: {
                            FindingRow(row: row)
                        }
                        .swipeActions {
                            Button("Delete", role: .destructive) { deleting = row.id }
                        }
                    }
                }
            }
            Section {
                Button("Add Finding") { openEditor(.finding(jobId: job.id, findingId: nil, componentId: nil)) }
                    .buttonStyle(.primary)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            .confirmationDialog(
                "Delete this finding?",
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
                try InspectionWrites.delete(sync, table: "finding", id: id, companyId: companyId)
            } catch {
                saveError = String(describing: error)
            }
        }
    }

    /// The number badge in the severity's color, the title and the details line.
    private struct FindingRow: View {
        var row: FindingRowItem
        @ScaledMetric(relativeTo: .body) private var badge: CGFloat = 28

        var body: some View {
            HStack(spacing: 12) {
                Text("\(row.number)")
                    .font(.body.weight(.bold))
                    .foregroundStyle(Color(Tokens.Role.onHeader))
                    .frame(width: badge, height: badge)
                    .background(Circle().fill(severityColor(row.color)))
                    .accessibilityLabel("Finding \(row.number)")
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.body).foregroundStyle(.primary)
                    if !row.subtitle.isEmpty {
                        Text(row.subtitle).font(.subheadline).foregroundStyle(Color.muted)
                    }
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color(Tokens.Role.placeholder))
                    .accessibilityHidden(true)
            }
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }
#endif
