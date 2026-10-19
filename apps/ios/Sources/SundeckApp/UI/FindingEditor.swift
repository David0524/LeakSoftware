#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Record a leak: what, where, how serious, and a pin on the pool diagram. A sheet. Port of
    /// apps/mobile/src/app/(app)/jobs/[id]/(edit)/finding/[findingId].tsx.
    struct FindingEditor: View {
        var jobId: String
        /// nil for a new finding.
        var findingId: String?
        /// The checklist item it was started from.
        var componentId: String?

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form: FindingForm?
        @State private var existing: Finding?
        @State private var insp: JobInspection?
        @State private var config: InspectionConfig?
        @State private var property: Row?
        @State private var loaded = false
        @State private var confirmDiscard = false
        @State private var confirmDelete = false
        @State private var saveError: String?
        @State private var saves = 0
        @FocusState private var focus: Field?

        enum Field { case title, location, notes }

        var body: some View {
            NavigationStack {
                Group {
                    if form != nil {
                        editor
                    } else if loaded {
                        Form {
                            Section { Notice(kind: .warning, text: "This finding isn’t on this phone.") }
                                .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                        }
                    }
                }
                .navigationTitle(form?.navigationTitle ?? "Finding")
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
            .confirmationDialog("Delete this finding?", isPresented: $confirmDelete, titleVisibility: .visible) {
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

        private func binding<T>(_ key: WritableKeyPath<FindingForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // MARK: Form

        @ViewBuilder private var editor: some View {
            if let form, let insp, let config {
                Form {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("What did you find?").font(.subheadline.weight(.semibold))
                            TextField("Return 3 line break", text: binding(\.title, ""), axis: .vertical)
                                .textInputAutocapitalization(.sentences)
                                .focused($focus, equals: .title)
                                .submitLabel(.next)
                                .onSubmit { focus = .location }
                                .accessibilityLabel("What did you find?")
                            if let message = form.errors["title"] {
                                Text(message).font(.footnote).foregroundStyle(Color.fail)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    Section {
                        Picker("Severity", selection: binding(\.severity, "")) {
                            ForEach(config.severities) { Text($0.name).tag($0.key) }
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    } header: {
                        Text("Severity")
                    } footer: {
                        if let message = form.errors["severity_key"] {
                            Text(message).font(.footnote).foregroundStyle(Color.fail)
                        }
                    }

                    Section {
                        Picker(
                            "Component",
                            selection: Binding(
                                get: { self.form?.componentId ?? "" },
                                set: { self.form?.componentId = $0.isEmpty ? nil : $0 })
                        ) {
                            Text("None").tag("")
                            ForEach(insp.components, id: \.id) { Text($0.label).tag($0.id) }
                        }
                        .frame(minHeight: minTarget)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Location").font(.subheadline.weight(.semibold))
                            TextField(
                                "Between pad and pool, 6 ft from the fitting", text: binding(\.location, ""),
                                axis: .vertical
                            )
                            .focused($focus, equals: .location)
                            .submitLabel(.done)
                            .onSubmit { focus = nil }
                            .accessibilityLabel("Location")
                        }
                        .padding(.vertical, 4)
                    }

                    Section {
                        Text(form.pinHint).font(.subheadline).foregroundStyle(Color.muted)
                        if let property {
                            PoolDiagram(
                                shape: diagramShape(of: property), hasSpa: property["has_spa"]?.bool ?? false,
                                pins: editorPins(insp, config, form: form)
                            ) { x, y in
                                self.form?.place(x: x, y: y)
                            }
                        }
                    } header: {
                        HStack {
                            Text("Pin on the diagram")
                            Spacer()
                            if form.pin != nil {
                                Button("Clear Pin") { self.form?.pin = nil }
                                    .font(.subheadline.weight(.semibold))
                                    .textCase(nil)
                                    .frame(minHeight: minTarget)
                            }
                        }
                    }

                    if form.showsStatus {
                        Section("Status") {
                            Picker("Status", selection: binding(\.status, .open)) {
                                ForEach(findingStatusChoices, id: \.self) { Text($0.label).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                        }
                    }

                    Section {
                        TextField("Notes", text: binding(\.notes, ""), axis: .vertical)
                            .lineLimit(3...8)
                            .focused($focus, equals: .notes)
                    }

                    // Photos arrive in S5; until then a new finding says when they can be added.
                    if form.isNew {
                        Section {
                            Text("Save the finding first, then add photos.")
                                .font(.subheadline).foregroundStyle(Color.muted)
                        }
                    }

                    if !form.errors.isEmpty {
                        Section { Notice(kind: .error, text: "Fix the highlighted fields.") }
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }

                    Section {
                        VStack(spacing: 12) {
                            Button("Save Finding") { save() }.buttonStyle(.primary)
                            if !form.isNew {
                                Button("Delete Finding") { confirmDelete = true }.buttonStyle(.destructiveSecondary)
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
        }

        // MARK: Actions

        private func load() {
            guard let company = session.company else { return }
            let current = JobInspection(sync.store, jobId: jobId)
            insp = current
            config = InspectionConfig(sync.store, companyId: company.id)
            let job = try? sync.store.get("job", jobId)
            property = (job?["property_id"]?.string).flatMap { try? sync.store.get("property", $0) }
            existing = findingId.flatMap { id in current.findings.first { $0.id == id } }
            defer { loaded = true }
            guard form == nil, findingId == nil || existing != nil else { return }
            form = FindingForm(existing: existing, componentId: componentId)
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
                try InspectionWrites.delete(sync, table: "finding", id: existing.id, companyId: company.id)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }
#endif
