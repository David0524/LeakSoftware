#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Saved reports (owner, 2026-10-20: "Be able to save report templates. Not like AI prompts,
    // but a copy/paste essentially that the tech uses each time").

    /// Use Saved Report: the shop's saved reports; picking one fills the draft's sections with its
    /// text, after asking when it would replace different text already there.
    struct UseSavedReportSheet: View {
        var flow: ReportFlow
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var asking: (saved: SavedReport, question: String)?

        var body: some View {
            let list = savedReports(sync.store, companyId: session.company?.id ?? "")
            FormSheet(title: SavedReportText.use) {
                if list.isEmpty {
                    EmptyState(text: SavedReportText.none)
                } else {
                    Grouped {
                        ForEach(list) { saved in
                            Button {
                                pick(saved)
                            } label: {
                                ListRow(saved.name, detail: saved.detail, chevron: true)
                            }
                            .buttonStyle(.row)
                        }
                    }
                }
            }
            .confirmationDialog(
                asking?.question ?? "", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
                titleVisibility: .visible
            ) {
                Button(SavedReportText.replace, role: .destructive) {
                    if let saved = asking?.saved { use(saved) }
                }
                Button("Cancel", role: .cancel) { asking = nil }
            }
        }

        private func pick(_ saved: SavedReport) {
            let replaces = flow.savedReportReplaces(saved)
            if replaces.isEmpty {
                use(saved)
            } else {
                asking = (saved, replaceSavedReportQuestion(replaces))
            }
        }

        private func use(_ saved: SavedReport) {
            flow.useSavedReport(saved)
            dismiss()
        }
    }

    /// Save as Saved Report (owners and admins): names the draft's text and keeps it.
    struct SaveAsSavedReportSheet: View {
        var flow: ReportFlow
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var error: String?

        var body: some View {
            FormSheet(title: SavedReportText.saveAs, dirty: !name.isEmpty) {
                Grouped(footer: SavedReportText.saveAsHint) {
                    LabeledFieldRow(label: "Name", text: $name, placeholder: "No leak found", labelWidth: 80)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") {
                    do {
                        try flow.saveAsSavedReport(name: name)
                        dismiss()
                    } catch {
                        self.error = (error as? WebAPI.Failure)?.description ?? userMessage(error)
                    }
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
            }
        }
    }

    /// Settings › Report Templates › Saved reports: each opens its editor; swipe left (or the
    /// editor's Delete button) deletes; Add Saved Report adds one.
    struct SavedReportsGroup: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var editing: SavedReportTarget?
        @State private var deleting: SavedReport?
        @State private var error: String?

        var body: some View {
            let list = savedReports(sync.store, companyId: session.company?.id ?? "")
            let _ = sync.revision
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: SavedReportText.group, footer: SavedReportText.groupFooter) {
                    ForEach(list) { saved in
                        SwipeDeleteRow(name: saved.name, delete: { deleting = saved }) {
                            Button {
                                editing = .edit(saved)
                            } label: {
                                ListRow(saved.name, detail: saved.detail, chevron: true)
                            }
                            .buttonStyle(.row)
                        }
                        // Touch and hold: Edit, Delete… (gestures spec section 12).
                        .rowMenu(
                            saved.name,
                            [
                                SwipeAction(title: "Edit", systemImage: "pencil", tint: Color.link) {
                                    editing = .edit(saved)
                                },
                                SwipeAction(
                                    title: "Delete…", systemImage: "trash", tint: Color.fail, role: .destructive
                                ) { deleting = saved },
                            ])
                    }
                    ActionRow(SavedReportText.add) { editing = .add }
                }
                if let error { Notice(kind: .error, text: error) }
            }
            .sheet(item: $editing) { target in SavedReportSheet(saved: target.saved) }
            .confirmationDialog(
                SavedReportText.deleteConfirm,
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible
            ) {
                Button(SavedReportText.delete, role: .destructive) {
                    guard let saved = deleting else { return }
                    do { try SavedReportWrites.delete(sync, id: saved.id) } catch {
                        self.error = userMessage(error)
                    }
                    deleting = nil
                }
            }
        }
    }

    enum SavedReportTarget: Identifiable {
        case add
        case edit(SavedReport)

        var id: String {
            if case .edit(let s) = self { return s.id }
            return "new"
        }

        var saved: SavedReport? {
            if case .edit(let s) = self { return s }
            return nil
        }
    }

    /// A saved report's name and each section's text.
    struct SavedReportSheet: View {
        var saved: SavedReport?
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var texts: [String: String] = [:]
        @State private var loaded = false
        @State private var error: String?
        @State private var confirmDelete = false

        var body: some View {
            FormSheet(
                title: saved?.name ?? SavedReportText.add,
                dirty: loaded && (name != (saved?.name ?? "") || texts != (saved?.sections ?? [:]))
            ) {
                Grouped(footer: SavedReportText.nameHint) {
                    LabeledFieldRow(label: "Name", text: $name, labelWidth: 80)
                }
                ForEach(savedReportSectionList, id: \.key) { section in
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel(section.title)
                        TextField(
                            "", text: Binding(get: { texts[section.key] ?? "" }, set: { texts[section.key] = $0 }),
                            prompt: Text("Leave empty to keep the draft’s own text.").foregroundStyle(
                                Color.placeholder),
                            axis: .vertical
                        )
                        .lineLimit(3...)
                        .accessibilityLabel(section.title)
                        .fieldBox(focused: false, minHeight: 96)
                    }
                }
                if let error { Notice(kind: .error, text: error) }
                Button(saved == nil ? SavedReportText.add : "Save") { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                if saved != nil {
                    Hairline()
                    Button(SavedReportText.delete, role: .destructive) { confirmDelete = true }
                        .buttonStyle(.danger(fullWidth: true, size: .field))
                }
            }
            .confirmationDialog(SavedReportText.deleteConfirm, isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(SavedReportText.delete, role: .destructive) { remove() }
            }
            .onAppear {
                if !loaded {
                    name = saved?.name ?? ""
                    texts = saved?.sections ?? [:]
                    loaded = true
                }
            }
        }

        private func save() {
            if let problem = savedReportNameProblem(name) {
                error = problem
                return
            }
            guard let company = session.company else { return }
            do {
                if let saved {
                    try SavedReportWrites.save(sync, companyId: company.id, id: saved.id, name: name, sections: texts)
                } else {
                    try SavedReportWrites.add(sync, companyId: company.id, name: name, sections: texts)
                }
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }

        private func remove() {
            guard let saved else { return }
            do {
                try SavedReportWrites.delete(sync, id: saved.id)
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }
    }
#endif
