#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Findings" in the job's Findings section (spec 5.4): the pool diagram with every pin, a
    /// numbered grouped row per finding (swipe left to delete), then Add Finding. Tapping a row
    /// opens its Edit sheet; the pool's shape is set in that sheet. Port of FindingsEditor in
    /// apps/web/src/components/job-work.tsx.
    struct FindingsTab: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(\.openEditor) private var openEditor
        @State private var deleting: FindingRowItem?
        @State private var saveError: String?

        private var companyId: String { job.job["company_id"]?.string ?? "" }

        var body: some View {
            let _ = sync.revision  // reload after any write or pull
            let config = InspectionConfig(sync.store, companyId: companyId)
            let insp = JobInspection(sync.store, jobId: job.id)
            // The property as it is now (the finding sheet's shape picker writes it).
            let property = job.property.flatMap { (try? sync.store.get("property", $0.id)) ?? $0 }
            let rows = findingRows(insp, config)
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Findings")
                VStack(alignment: .leading, spacing: 16) {
                    if rows.isEmpty {
                        Text("No findings recorded.").textRole(.body).foregroundStyle(Color.textMuted)
                    } else {
                        VStack(spacing: 20) {
                            if let property {
                                PoolDiagram(
                                    shape: diagramShape(of: property), hasSpa: property["has_spa"]?.bool ?? false,
                                    layout: diagramLayout(of: property),
                                    pins: findingPins(insp, config))
                            }
                            Grouped(separatorInset: 60) {
                                ForEach(rows) { row in
                                    SwipeDeleteRow(name: row.title, delete: { deleting = row }) {
                                        Button {
                                            openEditor(.finding(jobId: job.id, findingId: row.id, componentId: nil))
                                        } label: {
                                            FindingRow(row: row)
                                        }
                                        .buttonStyle(.row)
                                        .accessibilityLabel("Edit \(row.title)")
                                    }
                                }
                            }
                        }
                    }
                    Button("Add Finding") { openEditor(.finding(jobId: job.id, findingId: nil, componentId: nil)) }
                        .buttonStyle(.secondary)
                }
            }
            .confirmationDialog(
                deleting.map { "Delete “\($0.title)”?" } ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { row in
                Button("Delete Finding", role: .destructive) { delete(row.id) }
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
                try InspectionWrites.delete(sync, table: "finding", id: id, companyId: companyId)
            } catch {
                saveError = String(describing: error)
            }
        }
    }

    /// The number in a 28 circle of the severity's color, the title, "Major · Return 3 · Open ·
    /// Pinned on the diagram", where it is, the notes, and a chevron.
    private struct FindingRow: View {
        var row: FindingRowItem
        @ScaledMetric(relativeTo: .body) private var badge: CGFloat = 28

        var body: some View {
            HStack(spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Text("\(row.number)")
                        .font(.system(size: 15, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Color.onHeader)
                        .frame(width: badge, height: badge)
                        .background(Circle().fill(severityColor(row.color)))
                        .accessibilityLabel("Finding \(row.number)")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                        if !row.subtitle.isEmpty {
                            Text(row.subtitle).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        if let location = row.location {
                            Text(location).textRole(.body).foregroundStyle(Color.text).padding(.top, 2)
                        }
                        if let notes = row.notes {
                            Text(notes).textRole(.secondary).foregroundStyle(Color.text).padding(.top, 2)
                        }
                    }
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, 12)
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }
#endif
