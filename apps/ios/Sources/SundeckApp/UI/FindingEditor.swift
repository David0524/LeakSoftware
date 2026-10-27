#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Add Finding / Edit Finding (spec 6.2), a sheet: What, Severity, Item, Where, Status, the
    /// pool's shape and spa (saved at once), the pin on the diagram, Notes and photos; Add Finding
    /// / Save Finding in a bar pinned to the bottom, above the keyboard (owner, 2026-10-20).
    /// Editing ends with Delete Finding, away from Save. Add Photo on a new finding saves it first
    /// and keeps the sheet open as Edit Finding. Port of FindingForm and
    /// FindingsEditor's sheet in apps/web/src/components/job-work.tsx.
    struct FindingEditor: View {
        var jobId: String
        /// nil for a new finding.
        var findingId: String?
        /// The checklist item it was started from.
        var componentId: String?

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var form: FindingForm?
        @State private var existing: Finding?
        @State private var insp: JobInspection?
        @State private var config: InspectionConfig?
        @State private var property: Row?
        @State private var loaded = false
        @State private var confirmDiscard = false
        @State private var saveError: String?
        @State private var saves = 0
        @State private var closing = false
        /// Typed text kept until it's saved or discarded (owner, 2026-10-27).
        @State private var draft = DraftHandle()
        /// A new finding saved by Add Photo: the sheet edits it from then on.
        @State private var savedId: String?
        /// The field with the keyboard, for the keyboard bar's Previous and Next.
        @FocusState private var focus: String?

        var body: some View {
            NavigationStack {
                Group {
                    if form != nil {
                        editor.mediaViewer(jobId: jobId)
                    } else if loaded {
                        ScrollView {
                            Notice(kind: .warning, text: "This finding isn’t on this phone.").padding(16)
                        }
                    } else {
                        Color.clear
                    }
                }
                .background(Color.bg)
                .navigationTitle(form?.navigationTitle ?? "Finding")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                }
                .keyboardBar($focus, order: ["title", "location", "notes"])
            }
            .sheetPresentation(dirty: form?.isDirty ?? false)
            .task(id: sync.revision) { load() }
            .sensoryFeedback(.success, trigger: saves)
            .discardPrompt(dirty: form?.isDirty ?? false, isPresented: $confirmDiscard, draft: draft)
            .keepsDraft(
                draft, form: "finding", id: findingId ?? "new-\(jobId)",
                fields: [
                    "title": form?.title ?? "", "location": form?.location ?? "", "notes": form?.notes ?? "",
                ], ready: form != nil
            ) { changes in
                if let value = changes["title"] { self.form?.title = value }
                if let value = changes["location"] { self.form?.location = value }
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

        private func binding<T>(_ key: WritableKeyPath<FindingForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // MARK: Form

        @ViewBuilder private var editor: some View {
            if let form, let insp, let config {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        DraftNote(draft: draft)
                        OutlinedField(
                            label: "What", text: binding(\.title, ""), placeholder: "Crack at the skimmer throat",
                            error: form.errors["title"], chain: $focus, chainKey: "title")
                        VStack(alignment: .leading, spacing: 4) {
                            SelectField(
                                label: "Severity", selection: binding(\.severity, ""),
                                options: [""] + config.severities.map(\.key),
                                optionLabel: { key in config.severityByKey[key]?.name ?? "Choose…" })
                            if let error = form.errors["severity_key"] { FieldHint(text: error, error: true) }
                        }
                        SelectField(
                            label: "Item (optional)",
                            selection: Binding(
                                get: { self.form?.componentId ?? "" },
                                set: { self.form?.componentId = $0.isEmpty ? nil : $0 }),
                            options: [""] + insp.components.map(\.id),
                            optionLabel: { id in insp.componentById[id]?.label ?? "None" })
                        OutlinedField(
                            label: "Where (optional)", text: binding(\.location, ""),
                            placeholder: "Two feet left of the skimmer", chain: $focus, chainKey: "location")
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel("Status")
                            Segmented(
                                selection: binding(\.status, .open), options: findingStatusChoices, label: \.label,
                                title: "Status", fillsWidth: true, segmentPadding: 8)
                        }
                        if let property { pool(property) }
                        pin(form, config)
                        OutlinedField(
                            label: "Notes (optional)", text: binding(\.notes, ""), multiline: true, chain: $focus,
                            chainKey: "notes")
                        // Photos for the finding (apps, S5), from the start: Add Photo on a new
                        // finding saves it first, with the same checks as Save (owner, 2026-10-20).
                        MediaSection(
                            target: form.existingId.map { MediaTarget(jobId: jobId, findingId: $0) }, jobId: jobId,
                            prepare: saveForPhotos)
                        if !form.isNew {
                            VStack(spacing: 16) {
                                Hairline()
                                Button(role: .destructive) {
                                    delete()
                                } label: {
                                    Text("Delete Finding")
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
        }

        /// Add Photo on a finding not saved yet: saves it (the same checks as Save) and keeps the
        /// sheet open as Edit Finding; nil when a field needs fixing, so no camera opens.
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
                existing = JobInspection(sync.store, jobId: jobId).findings.first { $0.id == id }
                saves += 1
                return MediaTarget(jobId: jobId, findingId: id)
            } catch {
                saveError = userMessage(error)
                return nil
            }
        }

        /// The pool's shape and spa, saved as soon as they're tapped; the diagram redraws.
        private func pool(_ property: Row) -> some View {
            let shape = diagramShape(of: property)
            return VStack(alignment: .leading, spacing: 8) {
                ShapePicker(value: shape, hint: shape == nil ? shapeNotPickedHint : nil) { next in
                    write { companyId in
                        try InspectionWrites.setDiagramShape(
                            sync, propertyId: property.id, companyId: companyId, shape: next)
                    }
                }
                Toggle(
                    isOn: Binding(
                        get: { property["has_spa"]?.bool ?? false },
                        set: { spa in
                            write { companyId in
                                try InspectionWrites.setHasSpa(
                                    sync, propertyId: property.id, companyId: companyId, hasSpa: spa)
                            }
                        })
                ) {
                    Text("Has a spa").textRole(.body).foregroundStyle(Color.text)
                }
                .tint(Color.pass)
                .frame(minHeight: minTarget)
            }
        }

        /// "Pin on the diagram (optional)": tap where the leak is; "Pin placed." with Clear Pin.
        private func pin(_ form: FindingForm, _ config: InspectionConfig) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Pin on the diagram (optional)")
                FieldHint(text: form.pinHint)
                PoolDiagram(
                    shape: diagramShape(of: property), hasSpa: property?["has_spa"]?.bool ?? false,
                    layout: diagramLayout(of: property),
                    pins: editorPins(config, form: form), outlined: true
                ) { x, y in
                    self.form?.place(x: x, y: y)
                }
                .frame(maxWidth: 448)
                .padding(.top, 4)
                HStack(spacing: 12) {
                    Text(form.pinStatus).textRole(.secondary).foregroundStyle(Color.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if form.pin != nil {
                        // Never cut short ("Clea…", owner 2026-10-22): the button keeps its width.
                        Button("Clear Pin") { self.form?.pin = nil }.buttonStyle(.quiet).fixedSize()
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: minTarget)
                .accessibilityElement(children: .contain)
            }
        }

        // MARK: Actions

        private func write(_ body: (String) throws -> Void) {
            guard let company = session.company else { return }
            do { try body(company.id) } catch { saveError = userMessage(error) }
        }

        private func load() {
            guard let company = session.company else { return }
            let current = JobInspection(sync.store, jobId: jobId)
            insp = current
            config = InspectionConfig(sync.store, companyId: company.id)
            let job = try? sync.store.get("job", jobId)
            property = (job?["property_id"]?.string).flatMap { try? sync.store.get("property", $0) }
            existing = (findingId ?? savedId).flatMap { id in current.findings.first { $0.id == id } }
            defer { loaded = true }
            guard form == nil, findingId == nil || existing != nil else { return }
            form = FindingForm(existing: existing, componentId: componentId)
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
                    .finding, [RemovalRow("finding", existing.id)], sync: sync, companyId: company.id)
                dismiss()
            } catch {
                saveError = userMessage(error)
            }
        }
    }
#endif
