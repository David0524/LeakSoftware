#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// One checklist item: its verdict and where, notes, tests, and findings. Port of
    /// apps/mobile/src/app/(app)/jobs/[id]/component/[componentId].tsx.
    struct ComponentScreen: View {
        var jobId: String
        var componentId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @Environment(\.openEditor) private var openEditor
        @State private var form: ComponentForm?
        @State private var missing = false
        @State private var config: InspectionConfig?
        @State private var tests: [TestResult] = []
        @State private var findings: [Finding] = []
        @State private var confirmRemove = false
        @State private var deleting: Deleting?
        @State private var saved = 0
        @State private var saveError: String?

        init(jobId: String, componentId: String) {
            self.jobId = jobId
            self.componentId = componentId
        }

        /// A test or finding waiting for its delete confirmation.
        enum Deleting: Equatable {
            case test(String)
            case finding(String)

            var title: String {
                switch self {
                case .test: "Delete this test?"
                case .finding: "Delete this finding?"
                }
            }
        }

        var body: some View {
            Group {
                if let form {
                    content(form)
                } else if missing {
                    List {
                        Notice(kind: .warning, text: "This item isn’t on this phone.")
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }
                    .listStyle(.insetGrouped)
                } else {
                    // Not loaded yet. Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.clear
                }
            }
            .navigationTitle(form?.component.label ?? "Item")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: sync.revision) { reload() }
            .sensoryFeedback(.success, trigger: saved)
            .confirmationDialog(
                "Remove \(form?.component.label ?? "")?", isPresented: $confirmRemove, titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive) { remove() }
                Button("Keep", role: .cancel) {}
            } message: {
                Text("Use this only if it was added by mistake.")
            }
            .confirmationDialog(
                deleting?.title ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { target in
                Button("Delete", role: .destructive) { delete(target) }
                Button("Keep", role: .cancel) {}
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func content(_ form: ComponentForm) -> some View {
            @Bindable var form = form
            return List {
                Section("Result") {
                    Picker("Result", selection: $form.verdict) {
                        ForEach(form.options, id: \.value) { Text($0.label).tag(Optional($0.value)) }
                    }
                    .pickerStyle(.segmented)
                    .frame(minHeight: minTarget)
                    if form.needsWhere {
                        TextField("Where", text: $form.location, prompt: Text("Where on the line or fitting"))
                            .frame(minHeight: minTarget)
                            .accessibilityLabel("Where")
                    }
                }
                Section("Notes") {
                    TextField("Notes", text: $form.notes, prompt: Text("What you saw"), axis: .vertical)
                        .lineLimit(3...8)
                        .accessibilityLabel("Notes")
                }
                Section {
                    Button("Save") { save(form) }.buttonStyle(.primary)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

                MediaSection(target: MediaTarget(jobId: jobId, componentId: componentId))

                Section("Tests on this item") {
                    ForEach(tests, id: \.id) { test in
                        Button {
                            openEditor(
                                .test(jobId: jobId, testId: test.id, typeId: test.testTypeId, componentId: componentId))
                        } label: {
                            HStack {
                                Text(config?.testTypeById[test.testTypeId]?.name ?? "Test").foregroundStyle(.primary)
                                Spacer()
                                OutcomeChip(outcome: test.outcome)
                            }
                            .frame(minHeight: minTarget)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button {
                                deleting = .test(test.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .tint(.fail)
                        }
                        .accessibilityAction(named: "Delete") { deleting = .test(test.id) }
                    }
                    ForEach(config?.testTypes ?? [], id: \.id) { type in
                        Button("+ \(type.name)") {
                            openEditor(.test(jobId: jobId, testId: nil, typeId: type.id, componentId: componentId))
                        }
                        .foregroundStyle(Color.brandPrimary)
                        .frame(minHeight: minTarget)
                    }
                }

                Section("Findings on this item") {
                    ForEach(findings, id: \.id) { finding in
                        Button {
                            openEditor(.finding(jobId: jobId, findingId: finding.id, componentId: componentId))
                        } label: {
                            Text(finding.title).foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button {
                                deleting = .finding(finding.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .tint(.fail)
                        }
                        .accessibilityAction(named: "Delete") { deleting = .finding(finding.id) }
                    }
                    Button("+ Finding Here") {
                        openEditor(.finding(jobId: jobId, findingId: nil, componentId: componentId))
                    }
                    .foregroundStyle(Color.brandPrimary)
                    .frame(minHeight: minTarget)
                }

                Section {
                    Button("Remove \(form.component.label)") { confirmRemove = true }
                        .buttonStyle(.destructiveSecondary)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            .listStyle(.insetGrouped)
        }

        // MARK: - Writes

        private func save(_ form: ComponentForm) {
            do {
                try form.save(sync, userId: session.user?.id)
                saved += 1
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }

        private func remove() {
            guard let form else { return }
            do {
                try InspectionWrites.removeComponent(
                    sync, companyId: form.companyId, component: form.component, result: form.result)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }

        private func delete(_ target: Deleting) {
            guard let company = session.company else { return }
            do {
                switch target {
                case .test(let id):
                    try InspectionWrites.delete(sync, table: "test_result", id: id, companyId: company.id)
                case .finding(let id):
                    try InspectionWrites.delete(sync, table: "finding", id: id, companyId: company.id)
                }
            } catch {
                saveError = String(describing: error)
            }
        }

        /// Loads the item; the form keeps what was typed (it's read once, like the Expo screen),
        /// while the tests and findings follow every write and pull.
        private func reload() {
            guard let company = session.company else { return }
            let config = InspectionConfig(sync.store, companyId: company.id)
            let inspection = JobInspection(sync.store, jobId: jobId)
            self.config = config
            tests = inspection.tests.filter { $0.jobComponentId == componentId }
            findings = inspection.findings.filter { $0.jobComponentId == componentId }
            guard let component = inspection.componentById[componentId],
                let type = config.componentTypeById[component.componentTypeId]
            else {
                form = nil
                missing = true
                return
            }
            missing = false
            if let form {
                form.result = inspection.resultByComponent[componentId]
            } else {
                form = ComponentForm(
                    companyId: company.id, jobId: jobId, component: component, type: type,
                    result: inspection.resultByComponent[componentId])
            }
        }
    }
#endif
