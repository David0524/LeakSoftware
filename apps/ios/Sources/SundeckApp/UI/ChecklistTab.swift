#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The checklist in the shop's sections, one verdict per item (works offline). Port of
    /// apps/mobile/src/features/inspection/ChecklistTab.tsx. Its body is list content (sections),
    /// placed inside the job page's inset grouped List.
    struct ChecklistTab: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var saveError: String?

        init(job: JobView) { self.job = job }

        // Worked out on every render: reading `sync.revision` re-renders after any write or pull.
        // (No `.task` or dialog on the tab itself: modifiers on list content repeat per row.)
        var body: some View {
            let _ = sync.revision
            if let company = session.company {
                let config = InspectionConfig(sync.store, companyId: company.id)
                let inspection = JobInspection(sync.store, jobId: job.id)
                let model = ChecklistModel(
                    config: config, inspection: inspection, jobType: job.type, property: job.decodedProperty)
                if model.isEmpty {
                    Section {
                        Text("No checklist yet for this job.").modifier(errorAlert)
                        Button("Set Up Checklist") { setUp(config.componentTypes) }
                            .buttonStyle(.primary)
                    }
                } else {
                    content(model, inspection)
                }
            }
        }

        private var errorAlert: ChecklistErrorAlert { ChecklistErrorAlert(message: $saveError) }

        @ViewBuilder private func content(_ model: ChecklistModel, _ inspection: JobInspection) -> some View {
            Section {
                Text(model.tallyText)
                    .font(.subheadline)
                    .foregroundStyle(Color.muted)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .modifier(errorAlert)
            }
            ForEach(model.sections) { section in
                Section(section.title) {
                    ForEach(section.items) { item in
                        ChecklistItemView(
                            jobId: job.id, item: item,
                            choose: { choose(item, $0) },
                            addAnother: { addAnother(item.type, inspection) },
                            saveWhere: { saveWhere(item, $0) },
                            remove: { remove(item) })
                    }
                }
            }
            if !model.missing.isEmpty {
                Section("Add an item") {
                    ForEach(model.missing, id: \.id) { type in
                        Button("+ \(type.name)") { addAnother(type, inspection) }
                            .foregroundStyle(Color.brandPrimary)
                            .frame(minHeight: minTarget)
                    }
                }
            }
        }

        // MARK: - Writes

        private func run(_ body: () throws -> Void) {
            do { try body() } catch { saveError = String(describing: error) }
        }

        private func setUp(_ types: [ComponentType]) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.createChecklist(
                    sync, companyId: company.id, jobId: job.id, types: types,
                    property: ChecklistModel.planningProperty(job.decodedProperty), jobType: job.type)
            }
        }

        private func choose(_ item: ChecklistItemRow, _ verdict: Verdict?) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.setVerdict(
                    sync, companyId: company.id, jobId: job.id, componentId: item.component.id, existing: item.result,
                    verdict: verdict, userId: session.user?.id)
            }
        }

        private func addAnother(_ type: ComponentType, _ inspection: JobInspection) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.addComponent(
                    sync, companyId: company.id, jobId: job.id, type: type, existing: inspection.components)
            }
        }

        private func saveWhere(_ item: ChecklistItemRow, _ draft: String) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.saveWhere(
                    sync, companyId: company.id, jobId: job.id, componentId: item.component.id, result: item.result,
                    draft: draft)
            }
        }

        private func remove(_ item: ChecklistItemRow) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.removeComponent(
                    sync, companyId: company.id, component: item.component, result: item.result)
            }
        }
    }

    /// One checklist row: the name, "+ Add" and "More", the one-tap verdict (or a Done check),
    /// and "Where" for Leaking or Attention, saved when the field loses focus.
    private struct ChecklistItemView: View {
        var jobId: String
        var item: ChecklistItemRow
        var choose: (Verdict?) -> Void
        var addAnother: () -> Void
        var saveWhere: (String) -> Void
        var remove: () -> Void
        @Environment(\.openRoute) private var openRoute
        @State private var draft: String?
        @State private var confirmRemove = false
        @FocusState private var focused: Bool

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    if item.isCheck {
                        Button {
                            choose(item.isDone ? nil : .ok)
                        } label: {
                            Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                                .font(.title2)
                                .foregroundStyle(item.isDone ? Color.pass : Color.controlBorder)
                                .frame(minWidth: minTarget, minHeight: minTarget)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(item.component.label)
                        .accessibilityValue(item.isDone ? "Done" : "Not done")
                        .accessibilityAddTraits(.isToggle)
                    }
                    Text(item.component.label)
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityAction(named: "Remove") { confirmRemove = true }
                    if item.addsAnother {
                        Button("+ Add", action: addAnother)
                            .buttonStyle(.borderless)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color.brandPrimary)
                            .frame(minHeight: minTarget)
                            .accessibilityLabel("Add another \(item.type.name.lowercased())")
                    }
                    Button("More") { openRoute(.component(jobId: jobId, componentId: item.component.id)) }
                        .buttonStyle(.borderless)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.brandPrimary)
                        .frame(minHeight: minTarget)
                        .accessibilityLabel("\(item.component.label): photos, tests, and notes")
                }
                if !item.isCheck {
                    Picker(
                        item.component.label,
                        selection: Binding(get: { item.verdict }, set: { if $0 != item.verdict { choose($0) } })
                    ) {
                        ForEach(item.options, id: \.value) { Text($0.label).tag(Optional($0.value)) }
                    }
                    .pickerStyle(.segmented)
                    .frame(minHeight: minTarget)
                }
                if item.needsWhere {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Where").font(.subheadline).foregroundStyle(Color.muted)
                        TextField(
                            "Where",
                            text: Binding(
                                get: { draft ?? item.result?.locationText ?? "" }, set: { draft = $0 }),
                            prompt: Text("Where on the line or fitting")
                        )
                        .focused($focused)
                        .submitLabel(.done)
                        .onSubmit { focused = false }
                        .frame(minHeight: minTarget)
                        .padding(.horizontal, 12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(Color.controlBorder, lineWidth: 1))
                    }
                }
            }
            .padding(.vertical, 4)
            .onChange(of: focused) { _, isFocused in
                if !isFocused, let draft {
                    saveWhere(draft)
                    self.draft = nil
                }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button {
                    confirmRemove = true
                } label: {
                    Label("Remove", systemImage: "trash")
                }
                .tint(.fail)
            }
            .confirmationDialog(
                "Remove \(item.component.label)?", isPresented: $confirmRemove, titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive, action: remove)
                Button("Keep", role: .cancel) {}
            } message: {
                Text("Use this only if it was added by mistake.")
            }
        }
    }

    /// "Couldn’t Save" with the error, on one row of the tab.
    private struct ChecklistErrorAlert: ViewModifier {
        @Binding var message: String?

        func body(content: Content) -> some View {
            content.alert(
                "Couldn’t Save", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
            ) {
                Button("OK") { message = nil }
            } message: {
                Text(message ?? "")
            }
        }
    }
#endif
