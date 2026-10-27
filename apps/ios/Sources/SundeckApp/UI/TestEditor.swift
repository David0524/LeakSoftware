#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Add Test / Edit {Test name} (spec 6.1), a sheet: Test (adding only), Item, the type's fields,
    /// the live calculation, Result, Notes and photos; Add Test / Save Test in a bar pinned to the
    /// bottom (above the keyboard), and the keyboard bar's Previous and Next through the readings
    /// (owner, 2026-10-20). Editing ends with Delete Test, away from Save. Add Photo on a new test
    /// saves it first and keeps the sheet open as Edit. Port of TestForm and TestsEditor's sheet in apps/web/src/components/job-work.tsx.
    struct TestEditor: View {
        var jobId: String
        /// nil for a new test.
        var testId: String?
        /// A new test's type; nil starts on the shop's first test type.
        var typeId: String?
        /// The checklist item it was started from.
        var componentId: String?

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var form: TestForm?
        @State private var existing: TestResult?
        @State private var components: [JobComponent] = []
        @State private var types: [TestType] = []
        @State private var loaded = false
        /// A new test saved by Add Photo: the sheet edits it from then on.
        @State private var savedId: String?
        @State private var confirmDiscard = false
        @State private var saveError: String?
        @State private var saves = 0
        @State private var closing = false
        /// The notes, kept until the test is saved or discarded (owner, 2026-10-27).
        @State private var draft = DraftHandle()
        /// The field with the keyboard, for the keyboard bar's Previous and Next.
        @FocusState private var focus: String?

        var body: some View {
            NavigationStack {
                Group {
                    if let form {
                        editor(form).mediaViewer(jobId: jobId)
                    } else if loaded {
                        ScrollView {
                            Notice(kind: .warning, text: "This test isn’t on this phone.").padding(16)
                        }
                    } else {
                        Color.clear
                    }
                }
                .background(Color.bg)
                .navigationTitle(form?.sheetTitle ?? "Test")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                }
                .keyboardBar($focus, order: fieldOrder)
            }
            .sheetPresentation(dirty: form?.isDirty ?? false)
            .task(id: sync.revision) { load() }
            .sensoryFeedback(.success, trigger: saves)
            .discardPrompt(dirty: form?.isDirty ?? false, isPresented: $confirmDiscard, draft: draft)
            .keepsDraft(
                draft, form: "test", id: testId ?? "new-\(jobId)", fields: ["notes": form?.notes ?? ""],
                ready: form != nil
            ) { changes in
                if let value = changes["notes"] { self.form?.notes = value }
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

        private func editor(_ form: TestForm) -> some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DraftNote(draft: draft)
                    if form.isNew {
                        SelectField(
                            label: "Test",
                            selection: Binding(
                                get: { self.form?.type.id ?? "" },
                                set: { id in
                                    if let type = types.first(where: { $0.id == id }) { self.form?.changeType(type) }
                                }),
                            options: types.map(\.id),
                            optionLabel: { id in types.first { $0.id == id }?.name ?? "Test" })
                    }
                    SelectField(
                        label: "Item (optional)",
                        selection: Binding(
                            get: { self.form?.componentId ?? "" },
                            set: { self.form?.componentId = $0.isEmpty ? nil : $0 }),
                        options: [""] + components.map(\.id),
                        optionLabel: { id in components.first { $0.id == id }?.label ?? "Whole job" })
                    ForEach(form.type.fieldSchema.fields, id: \.key) { field in
                        fieldView(field, error: form.errors[field.key])
                    }
                    if let summary = form.calculation.summary {
                        Text(summary)
                            .textRole(.bodyEmphasis)
                            .foregroundStyle(Color.text)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    SelectField(
                        label: "Result",
                        selection: Binding(get: { self.form?.chosenOutcome }, set: { self.form?.chosenOutcome = $0 }),
                        options: form.resultChoices,
                        optionLabel: { self.form?.resultLabel($0) ?? "" })
                    OutlinedField(
                        label: "Notes (optional)",
                        text: Binding(get: { self.form?.notes ?? "" }, set: { self.form?.notes = $0 }), multiline: true,
                        chain: $focus, chainKey: notesKey)
                    // Photos for the test (apps, S5), from the start: Add Photo on a new test saves
                    // it first, with the same checks as Save (owner, 2026-10-20).
                    MediaSection(
                        target: form.existingId.map { MediaTarget(jobId: jobId, testResultId: $0) }, jobId: jobId,
                        prepare: saveForPhotos)
                    if !form.isNew {
                        VStack(spacing: 16) {
                            Hairline()
                            Button(role: .destructive) {
                                delete()
                            } label: {
                                Text("Delete Test")
                            }
                            .buttonStyle(.danger(fullWidth: true, size: .field))
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            // Save is always in reach: pinned to the bottom, above the keyboard when it's open.
            .bottomBar {
                Button(form.submitTitle) { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
            }
        }

        private let notesKey = "notes"

        /// The typed fields in order, then Notes: Next moves through the readings.
        private var fieldOrder: [String] {
            (form?.type.fieldSchema.fields ?? []).filter { $0.type != .select }.map(\.key) + [notesKey]
        }

        /// Add Photo on a test not saved yet: saves it (the same checks as Save) and keeps the
        /// sheet open as Edit; nil when a field needs fixing, so no camera opens.
        private func saveForPhotos() -> MediaTarget? {
            guard var current = form, let company = session.company else { return nil }
            do {
                guard let id = try current.save(sync, companyId: company.id, jobId: jobId, existing: existing) else {
                    form = current
                    return nil
                }
                current.markSaved(id)
                form = current
                draft.clear()
                savedId = id
                existing = JobInspection(sync.store, jobId: jobId).tests.first { $0.id == id }
                saves += 1
                return MediaTarget(jobId: jobId, testResultId: id)
            } catch {
                saveError = userMessage(error)
                return nil
            }
        }

        private func value(_ key: String) -> Binding<String> {
            Binding(get: { self.form?.values[key] ?? "" }, set: { self.form?.values[key] = $0 })
        }

        /// A number with a decimal keyboard, a choice as a select ("Choose…"), long text as a
        /// text area, else a one-line field. Units sit in the label: "Start PSI (psi)".
        @ViewBuilder private func fieldView(_ field: TestField, error: String?) -> some View {
            let label = TestForm.label(field)
            switch field.type {
            case .select:
                VStack(alignment: .leading, spacing: 4) {
                    SelectField(
                        label: label, selection: value(field.key), options: [""] + (field.options ?? []),
                        optionLabel: { $0.isEmpty ? "Choose…" : $0 })
                    if let error { FieldHint(text: error, error: true) }
                }
            case .textarea:
                OutlinedField(
                    label: label, text: value(field.key), error: error, multiline: true, chain: $focus,
                    chainKey: field.key)
            case .number:
                OutlinedField(
                    label: label, text: value(field.key), error: error, keyboard: .decimalPad, chain: $focus,
                    chainKey: field.key)
            case .text:
                OutlinedField(label: label, text: value(field.key), error: error, chain: $focus, chainKey: field.key)
            }
        }

        // MARK: Actions

        private func load() {
            guard let company = session.company else { return }
            let insp = JobInspection(sync.store, jobId: jobId)
            components = insp.components
            existing = (testId ?? savedId).flatMap { id in insp.tests.first { $0.id == id } }
            defer { loaded = true }
            let config = InspectionConfig(sync.store, companyId: company.id)
            types = config.testTypes
            guard form == nil else { return }
            guard
                let type = config.testTypeById[existing?.testTypeId ?? typeId ?? ""]
                    ?? (testId == nil ? types.first : nil),
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
            // The sheet takes a moment to close: a second tap there would add a second one.
            guard var current = form, let company = session.company, !closing else { return }
            do {
                let id = try current.save(sync, companyId: company.id, jobId: jobId, existing: existing)
                form = current
                if id != nil {
                    closing = true
                    saves += 1
                    draft.clear()
                    dismiss()
                }
            } catch {
                saveError = userMessage(error)
            }
        }

        private func delete() {
            guard let existing, let company = session.company else { return }
            // Deleted at once, with Undo for five seconds on the page behind this sheet (owner,
            // 2026-10-26), not asked first.
            do {
                try app.removals.remove(
                    .test, [RemovalRow("test_result", existing.id)], sync: sync, companyId: company.id)
                dismiss()
            } catch {
                saveError = userMessage(error)
            }
        }
    }
#endif
