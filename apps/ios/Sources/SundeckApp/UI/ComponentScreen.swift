#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The Checklist item screen (apps only, spec 5.4), pushed from an item's name: its answer and
    /// where, method, exclusion reason, notes, photos and voice notes, and its tests and findings.
    /// Port of apps/mobile/src/app/(app)/jobs/[id]/component/[componentId].tsx, restyled to the spec.
    /// Where and Notes save by themselves 1 second after typing stops and when the item is left; it
    /// ends with Previous Item and Next Item in a bottom bar (owner, 2026-10-20).
    struct ComponentScreen: View {
        var jobId: String
        /// The item shown: starts at the one opened, then Previous Item and Next Item move it.
        @State private var componentId: String
        @State private var neighbors: (previous: String?, next: String?) = (nil, nil)
        /// Where or Notes typed since the last save, and "Saved" after one.
        @State private var typed = false
        @State private var savedText = false
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
        @State private var reasons: [String] = []
        @State private var saveError: String?

        init(jobId: String, componentId: String) {
            self.jobId = jobId
            _componentId = State(initialValue: componentId)
        }

        /// A test or finding waiting for its delete confirmation (with its name for the title).
        enum Deleting: Equatable {
            case test(String, String)
            case finding(String, String)

            var title: String {
                switch self {
                case .test(_, let name): "Delete this \(name.lowercased())?"
                case .finding(_, let title): "Delete “\(title)”?"
                }
            }

            var button: String {
                switch self {
                case .test: "Delete Test"
                case .finding: "Delete Finding"
                }
            }
        }

        var body: some View {
            Group {
                if let form {
                    content(form)
                } else if missing {
                    ScreenScroll { Notice(kind: .warning, text: "This item isn’t on this phone.") }
                } else {
                    // Not loaded yet. Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.bg
                }
            }
            .navigationTitle(form?.component.label ?? "Item")
            .navigationBarTitleDisplayMode(.large)
            .task(id: "\(sync.revision)|\(componentId)") { reload() }
            .onDisappear { autosave() }
            .bottomBar {
                HStack(spacing: 12) {
                    Button("Previous Item") { move(to: neighbors.previous) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                        .disabled(neighbors.previous == nil)
                    Button("Next Item") { move(to: neighbors.next) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                        .disabled(neighbors.next == nil)
                }
            }
            .sensoryFeedback(.success, trigger: saved)
            .confirmationDialog(
                "Remove \(form?.component.label ?? "") from the checklist?", isPresented: $confirmRemove,
                titleVisibility: .visible
            ) {
                Button("Remove Item", role: .destructive) { remove() }
            }
            .confirmationDialog(
                deleting?.title ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { target in
                Button(target.button, role: .destructive) { delete(target) }
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        /// What the website's checklist row has no room for on a phone (spec 5.4): the answer and
        /// where, the method, why it was left out, notes, photos and voice notes, and the tests and
        /// findings on this item.
        private func content(_ form: ComponentForm) -> some View {
            @Bindable var form = form
            return ScreenScroll {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Result")
                        Segmented(
                            selection: $form.verdict, options: form.options.map { Optional($0.value) },
                            label: { v in form.options.first { $0.value == v }?.label ?? "" }, title: "Result",
                            fillsWidth: true, segmentPadding: 6)
                    }
                    if form.needsWhere {
                        OutlinedField(
                            label: "Where", text: typing($form.location),
                            placeholder: "Where? Under the deck, at the throat…")
                    }
                    if !form.type.methods.isEmpty {
                        SelectField(
                            label: "Method", selection: $form.method, options: form.methodChoices,
                            optionLabel: { $0.isEmpty ? "Not recorded" : $0 })
                    }
                    if form.asksExclusion {
                        let choices =
                            [""] + reasons
                            + (reasons.contains(form.exclusionReason) || form.exclusionReason.isEmpty
                                ? [] : [form.exclusionReason])
                        SelectField(
                            label: "Why it was left out (optional)", selection: $form.exclusionReason,
                            options: choices, optionLabel: { $0.isEmpty ? "Choose…" : $0 })
                    }
                    OutlinedField(
                        label: "Notes (optional)", text: typing($form.notes), placeholder: "What you saw",
                        multiline: true)
                    HStack(spacing: 12) {
                        Button("Save") { save(form) }.buttonStyle(.primary)
                        if savedText { SavedLabel() }
                    }
                    .task(id: "\(form.location)|\(form.notes)") {
                        guard typed else { return }
                        try? await Task.sleep(for: Autosave.delay)
                        guard !Task.isCancelled else { return }
                        autosave()
                    }
                }

                MediaSection(target: MediaTarget(jobId: jobId, componentId: componentId))

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Tests")
                    if tests.isEmpty {
                        Text("No tests on this item.").textRole(.body).foregroundStyle(Color.textMuted)
                    } else {
                        Grouped {
                            ForEach(tests, id: \.id) { test in
                                let name = config?.testTypeById[test.testTypeId]?.name ?? "Test"
                                SwipeDeleteRow(name: name, delete: { deleting = .test(test.id, name) }) {
                                    Button {
                                        openEditor(
                                            .test(
                                                jobId: jobId, testId: test.id, typeId: test.testTypeId,
                                                componentId: componentId))
                                    } label: {
                                        ListRow(title: name, chevron: true) { OutcomeChip(outcome: test.outcome) }
                                    }
                                    .buttonStyle(.row)
                                }
                            }
                        }
                    }
                    if !(config?.testTypes.isEmpty ?? true) {
                        Button("Add Test") {
                            openEditor(.test(jobId: jobId, testId: nil, typeId: nil, componentId: componentId))
                        }
                        .buttonStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Findings")
                    if findings.isEmpty {
                        Text("No findings on this item.").textRole(.body).foregroundStyle(Color.textMuted)
                    } else {
                        Grouped {
                            ForEach(findings, id: \.id) { finding in
                                SwipeDeleteRow(
                                    name: finding.title, delete: { deleting = .finding(finding.id, finding.title) }
                                ) {
                                    Button {
                                        openEditor(
                                            .finding(jobId: jobId, findingId: finding.id, componentId: componentId))
                                    } label: {
                                        ListRow(finding.title, detail: finding.status.label, chevron: true)
                                    }
                                    .buttonStyle(.row)
                                }
                            }
                        }
                    }
                    Button("Add Finding") {
                        openEditor(.finding(jobId: jobId, findingId: nil, componentId: componentId))
                    }
                    .buttonStyle(.secondary)
                }

                Button("Remove Item", role: .destructive) { confirmRemove = true }
                    .buttonStyle(.danger)
                    .padding(.top, 8)
            }
            .mediaViewer(jobId: jobId)
        }

        // MARK: - Writes

        /// A field binding that marks the item as typed in, for saving by itself.
        private func typing(_ text: Binding<String>) -> Binding<String> {
            Binding(
                get: { text.wrappedValue },
                set: {
                    text.wrappedValue = $0
                    typed = true
                    savedText = false
                })
        }

        /// Saves what was typed (the whole form, as Save does) without leaving the item.
        private func autosave() {
            guard typed, let form else { return }
            do {
                try form.save(sync, userId: session.user?.id)
                typed = false
                withAnimation { savedText = true }
            } catch {
                saveError = String(describing: error)
            }
        }

        /// Previous Item or Next Item: what was typed is saved first, then the item changes here.
        private func move(to next: String?) {
            guard let next else { return }
            autosave()
            form = nil
            savedText = false
            componentId = next
        }

        private func save(_ form: ComponentForm) {
            do {
                try form.save(sync, userId: session.user?.id)
                typed = false
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
                case .test(let id, _):
                    try InspectionWrites.delete(sync, table: "test_result", id: id, companyId: company.id)
                case .finding(let id, _):
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
            reasons = exclusionReasons(sync.store, companyId: company.id)
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
            if let job = (try? jobViews(sync.store, companyId: company.id))?.first(where: { $0.id == jobId }) {
                neighbors = ChecklistModel(
                    config: config, inspection: inspection, jobType: job.type, property: job.decodedProperty
                ).neighbors(of: componentId)
            }
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
