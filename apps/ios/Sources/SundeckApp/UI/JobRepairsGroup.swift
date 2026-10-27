#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// A repair job's Repairs on Details (owner, 2026-10-22: "On repair jobs, (in the intake and
    /// actually working the job) we need a button to 'add additional repair'"): each repair and its
    /// price, the total, and Add Additional Repair. A repair is removed by a swipe left, its "⋯"
    /// button (always shown), or touch and hold; it goes at once, with Undo for five seconds
    /// (owner, 2026-10-26). Saved through the sync layer, so it works offline. Port of
    /// apps/mobile/src/features/job/Repairs.tsx.
    struct JobRepairsGroup: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var adding = false
        @State private var saveError: String?

        var body: some View {
            let _ = sync.revision
            let lines = jobRepairs(sync.store, job: job.job)
            Grouped(label: RepairLabels.section, footer: RepairLabels.footer) {
                ForEach(lines) { line in
                    SwipeDeleteRow(
                        name: line.description, title: RepairLabels.remove, delete: { removeLine(line) }
                    ) {
                        repairRow(line)
                    }
                }
                if lines.isEmpty {
                    Text(RepairLabels.empty)
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                } else {
                    HStack(spacing: 12) {
                        Text(RepairLabels.total).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                        Spacer(minLength: 0)
                        Text(verbatim: formatCents(repairsTotal(lines.map(\.priceCents))))
                            .textRole(.bodyEmphasis)
                            .foregroundStyle(Color.text)
                            .monospacedDigit()
                    }
                    // Lines up with the prices above, which sit left of their "⋯" button.
                    .padding(.leading, CGFloat(Spacing.rowHorizontal))
                    .padding(.trailing, 52)
                    .frame(minHeight: minTarget)
                    .accessibilityElement(children: .combine)
                }
                Button {
                    adding = true
                } label: {
                    Label(RepairLabels.add, systemImage: "plus")
                        .textRole(.body)
                        .foregroundStyle(Color.link)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.row)
            }
            .sheet(isPresented: $adding) { AddRepairSheet(job: job) }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func repairRow(_ line: RepairLine) -> some View {
            HStack(spacing: 8) {
                Text(line.description)
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: formatCents(line.priceCents))
                    .textRole(.body)
                    .foregroundStyle(Color.textMuted)
                    .monospacedDigit()
                Menu {
                    Button(RepairLabels.remove, systemImage: "trash", role: .destructive) { removeLine(line) }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.textMuted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("More for \(line.description)")
            }
            .padding(.leading, CGFloat(Spacing.rowHorizontal))
            .padding(.trailing, 4)
            .frame(minHeight: minTarget)
            .rowMenu(
                line.description,
                [
                    SwipeAction(title: RepairLabels.remove, systemImage: "trash", tint: .fail, role: .destructive) {
                        removeLine(line)
                    }
                ])
        }

        private func removeLine(_ line: RepairLine) {
            do {
                guard let priceBefore = try removeJobRepair(sync, job: job.job, id: line.id) else { return }
                let row = job.job
                app.removals.show(.repair, detail: RepairLabels.removeMessage) { [weak sync] in
                    guard let sync else { return }
                    try? restoreJobRepair(sync, job: row, id: line.id, feeCents: priceBefore)
                }
            } catch {
                saveError = userMessage(error)
            }
        }
    }

    /// Add Additional Repair: a price book item, or Something else typed, and its price.
    struct AddRepairSheet: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var draft = RepairDraft()
        @State private var errors = RepairErrors()
        @State private var saveError: String?
        @State private var confirmDiscard = false
        /// What was typed, kept until it's added or discarded (owner, 2026-10-27).
        @State private var kept = DraftHandle()

        private var dirty: Bool { draft != RepairDraft() }

        var body: some View {
            let items = repairPriceBook(sync.store, companyId: job.job.companyId)
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        DraftNote(draft: kept)
                        if !items.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                SelectField(
                                    label: RepairLabels.item,
                                    selection: Binding(
                                        get: { draft.pick }, set: { draft = pickRepair(draft, $0, items) }),
                                    options: [""] + items.map(\.id) + [repairCustom],
                                    optionLabel: { choiceLabel($0, items) })
                                if draft.pick != repairCustom, let error = errors.description {
                                    FieldHint(text: error, error: true)
                                }
                            }
                        }
                        if items.isEmpty || draft.pick == repairCustom {
                            OutlinedField(
                                label: RepairLabels.description,
                                text: Binding(get: { draft.description }, set: { draft.description = $0 }),
                                error: errors.description)
                        }
                        OutlinedField(
                            label: RepairLabels.price,
                            text: Binding(get: { draft.price }, set: { draft.price = $0 }),
                            error: errors.price, keyboard: .decimalPad)
                        if let saveError { Notice(kind: .error, text: saveError) }
                        Button(RepairLabels.save) { saveRepair(items) }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(Color.bg)
                .navigationTitle(RepairLabels.add)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { if dirty { confirmDiscard = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") { saveRepair(items) }.fontWeight(.semibold)
                    }
                }
                .confirmationDialog("Discard changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                    Button("Discard Changes", role: .destructive) {
                        kept.clear()
                        dismiss()
                    }
                }
            }
            .sheetPresentation(dirty: dirty, detents: [.medium, .large])
            .keepsDraft(
                kept, form: "repair", id: job.job.id,
                fields: ["description": draft.description, "price": draft.price]
            ) { changes in
                if let value = changes["description"] { draft.description = value }
                if let value = changes["price"] { draft.price = value }
            }
        }

        private func choiceLabel(_ pick: String, _ items: [RepairItem]) -> String {
            if pick == repairCustom { return RepairLabels.custom }
            guard let item = items.first(where: { $0.id == pick }) else { return RepairLabels.pick }
            return "\(item.name) (\(formatCents(item.cents)))"
        }

        private func saveRepair(_ items: [RepairItem]) {
            let checked = checkRepairDraft(draft, items, required: true)
            errors = checked.errors
            guard let repair = checked.repair else { return }
            do {
                try addJobRepair(sync, job: job.job, repair)
                kept.clear()
                dismiss()
            } catch {
                saveError = userMessage(error)
            }
        }
    }
#endif
