#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Record or edit one test, as a sheet. The form comes from the test type's field schema.
    /// Port of apps/mobile/src/app/(app)/jobs/[id]/(edit)/test/[testId].tsx.
    struct TestEditor: View {
        var jobId: String
        /// nil for a new test of `typeId`.
        var testId: String?
        var typeId: String?
        /// The checklist item it was started from.
        var componentId: String?

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form: TestForm?
        @State private var existing: TestResult?
        @State private var components: [JobComponent] = []
        @State private var loaded = false
        @State private var confirmDiscard = false
        @State private var confirmDelete = false
        @State private var saveError: String?
        @State private var saves = 0
        @FocusState private var focus: String?

        var body: some View {
            NavigationStack {
                Group {
                    if form != nil {
                        editor.mediaViewer(jobId: jobId)
                    } else if loaded {
                        Form {
                            Section { Notice(kind: .warning, text: "This test isn’t on this phone.") }
                                .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                        }
                    }
                }
                .navigationTitle(form?.type.name ?? "Test")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                    if form != nil {
                        ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.fontWeight(.semibold) }
                    }
                }
            }
            .interactiveDismissDisabled(form?.isDirty ?? false)
            .task(id: sync.revision) { load() }
            .sensoryFeedback(.success, trigger: saves)
            .confirmationDialog(form?.discardTitle ?? "", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep Editing", role: .cancel) {}
            }
            .confirmationDialog("Delete this test?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { delete() }
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

        // MARK: Form

        @ViewBuilder private var editor: some View {
            if let form {
                let calc = form.calculation
                Form {
                    if form.componentAlone { Section { componentPicker } }
                    ForEach(Array(form.groups.enumerated()), id: \.offset) { index, run in
                        if run[0].type == .textarea {
                            Section(run[0].label) {
                                longField(run[0])
                            }
                        } else {
                            Section {
                                if index == 0 && !form.componentAlone { componentPicker }
                                ForEach(run, id: \.key) { field in
                                    if field.type == .select { selectField(field) } else { typedField(field) }
                                }
                            }
                        }
                    }

                    if let summary = calc.summary {
                        Section {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Result").font(.subheadline.weight(.semibold)).foregroundStyle(Color.muted)
                                Text(summary).font(.title3.weight(.semibold))
                                if let suggested = form.suggestedText {
                                    Text(suggested).font(.subheadline).foregroundStyle(Color.muted)
                                }
                            }
                            .padding(.vertical, 4)
                            .accessibilityElement(children: .combine)
                        }
                    }

                    Section("Outcome") {
                        Picker(
                            "Outcome",
                            selection: Binding(
                                get: { self.form?.outcome }, set: { self.form?.chosenOutcome = $0 })
                        ) {
                            ForEach(form.type.resultOptions, id: \.self) { outcome in
                                Text(outcome.label).tag(Optional(outcome))
                            }
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    }
                    if form.changedSuggestion {
                        Section {
                            Notice(kind: .warning, text: "You changed the suggested outcome. Add a note saying why.")
                        }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }

                    Section {
                        TextField(
                            "Notes", text: Binding(get: { self.form?.notes ?? "" }, set: { self.form?.notes = $0 }),
                            axis: .vertical
                        )
                        .lineLimit(3...8)
                    }

                    // A new test says when photos can be added.
                    if let savedId = form.existingId {
                        MediaSection(target: MediaTarget(jobId: jobId, testResultId: savedId))
                    } else {
                        Section {
                            Text("Save the test first, then add photos.")
                                .font(.subheadline).foregroundStyle(Color.muted)
                        }
                    }

                    if !form.errors.isEmpty {
                        Section { Notice(kind: .error, text: "Fix the highlighted fields.") }
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }

                    Section {
                        VStack(spacing: 12) {
                            Button("Save Test") { save() }.buttonStyle(.primary)
                            if !form.isNew {
                                Button("Delete Test") { confirmDelete = true }.buttonStyle(.destructiveSecondary)
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
        }

        private var componentPicker: some View {
            Picker(
                "Component",
                selection: Binding(
                    get: { self.form?.componentId ?? "" },
                    set: { self.form?.componentId = $0.isEmpty ? nil : $0 })
            ) {
                Text("None").tag("")
                ForEach(components, id: \.id) { Text($0.label).tag($0.id) }
            }
            .frame(minHeight: minTarget)
        }

        private func value(_ key: String) -> Binding<String> {
            Binding(get: { self.form?.values[key] ?? "" }, set: { self.form?.values[key] = $0 })
        }

        @ViewBuilder private func error(_ field: TestField) -> some View {
            if let message = form?.errors[field.key] {
                Text(message).font(.footnote).foregroundStyle(Color.fail)
            }
        }

        /// A number or one-line text: label on the left, value on the right (units in the label).
        private func typedField(_ field: TestField) -> some View {
            let label = TestForm.label(field)
            return VStack(alignment: .leading, spacing: 4) {
                LabeledContent(label) {
                    TextField("", text: value(field.key))
                        .multilineTextAlignment(.trailing)
                        .keyboardType(field.type == .number ? .decimalPad : .default)
                        .textInputAutocapitalization(field.type == .number ? .never : .sentences)
                        .submitLabel(nextField(after: field.key) == nil ? .done : .next)
                        .focused($focus, equals: field.key)
                        .onSubmit { focus = nextField(after: field.key) }
                        .accessibilityLabel(label)
                }
                .frame(minHeight: minTarget)
                error(field)
            }
        }

        private func selectField(_ field: TestField) -> some View {
            let current = form?.values[field.key] ?? ""
            return VStack(alignment: .leading, spacing: 4) {
                Picker(field.label, selection: value(field.key)) {
                    if current.isEmpty { Text("Choose").tag("") }
                    ForEach(field.options ?? [], id: \.self) { Text($0).tag($0) }
                }
                .frame(minHeight: minTarget)
                error(field)
            }
        }

        private func longField(_ field: TestField) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                TextField(field.label, text: value(field.key), axis: .vertical)
                    .lineLimit(3...8)
                    .focused($focus, equals: field.key)
                error(field)
            }
        }

        /// Return moves from one typed field to the next, as in iOS forms.
        private func nextField(after key: String) -> String? {
            guard let fields = form?.type.fieldSchema.fields.filter({ $0.type != .select }),
                let index = fields.firstIndex(where: { $0.key == key }), index + 1 < fields.count
            else { return nil }
            return fields[index + 1].key
        }

        // MARK: Actions

        private func load() {
            guard let company = session.company else { return }
            let insp = JobInspection(sync.store, jobId: jobId)
            components = insp.components
            existing = testId.flatMap { id in insp.tests.first { $0.id == id } }
            defer { loaded = true }
            guard form == nil else { return }
            let config = InspectionConfig(sync.store, companyId: company.id)
            guard let type = config.testTypeById[existing?.testTypeId ?? typeId ?? ""],
                testId == nil || existing != nil
            else { return }
            form = TestForm(
                type: type, existing: existing, componentId: componentId,
                component: componentId.flatMap { insp.componentById[$0] })
        }

        private func cancel() {
            if form?.isDirty == true { confirmDiscard = true } else { dismiss() }
        }

        private func save() {
            guard var current = form, let company = session.company else { return }
            focus = nil
            do {
                let id = try current.save(sync, companyId: company.id, jobId: jobId, existing: existing)
                form = current
                if id != nil {
                    saves += 1
                    dismiss()
                }
            } catch {
                saveError = String(describing: error)
            }
        }

        private func delete() {
            guard let existing, let company = session.company else { return }
            do {
                try InspectionWrites.delete(sync, table: "test_result", id: existing.id, companyId: company.id)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }
#endif
