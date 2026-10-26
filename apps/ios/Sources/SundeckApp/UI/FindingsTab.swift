#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Findings" in the job's Findings section (spec 5.4): a
    /// numbered grouped row per finding (swipe left to delete, at once, with Undo for five seconds:
    /// owner, 2026-10-26); Add Finding is on the job page's
    /// Next Step bar (owner, 2026-10-20). Tapping a row
    /// opens its Edit sheet; the pool's shape is set in that sheet. Port of FindingsEditor in
    /// apps/web/src/components/job-work.tsx.
    struct FindingsTab: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(\.openEditor) private var openEditor
        @Environment(AppEnvironment.self) private var app
        @State private var saveError: String?

        private var companyId: String { job.job["company_id"]?.string ?? "" }

        var body: some View {
            let _ = sync.revision  // reload after any write or pull
            let config = InspectionConfig(sync.store, companyId: companyId)
            let insp = JobInspection(sync.store, jobId: job.id)
            let rows = findingRows(insp, config)
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Findings")
                VStack(alignment: .leading, spacing: 16) {
                    if rows.isEmpty {
                        Text("No findings recorded.").textRole(.body).foregroundStyle(Color.textMuted)
                    } else {
                        // The diagram with the pins is the Pool Diagram section above (owner, 2026-10-19).
                        VStack(spacing: 20) {
                            Grouped(separatorInset: 60) {
                                ForEach(rows) { row in
                                    SwipeDeleteRow(name: row.title, delete: { delete(row.id) }) {
                                        Button {
                                            openEditor(.finding(jobId: job.id, findingId: row.id, componentId: nil))
                                        } label: {
                                            FindingRow(row: row)
                                        }
                                        .buttonStyle(.row)
                                        .accessibilityLabel("Edit \(row.title)")
                                    }
                                    // Touch and hold: Edit, Delete (gestures spec section 12).
                                    .rowMenu(
                                        row.title,
                                        [
                                            SwipeAction(title: "Edit", systemImage: "pencil", tint: Color.link) {
                                                openEditor(.finding(jobId: job.id, findingId: row.id, componentId: nil))
                                            },
                                            SwipeAction(
                                                title: "Delete", systemImage: "trash", tint: Color.fail,
                                                role: .destructive
                                            ) { delete(row.id) },
                                        ])
                                }
                            }
                        }
                    }
                }
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
            do {
                try app.removals.remove(.finding, [RemovalRow("finding", id)], sync: sync, companyId: companyId)
            } catch {
                saveError = userMessage(error)
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
