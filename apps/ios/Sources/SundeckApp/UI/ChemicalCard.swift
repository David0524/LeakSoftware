#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// A visit's Chemicals, first on its Checklist and opened in place (owner, 2026-10-19 and
    /// 2026-10-24: "the actual reading, the aim for, the suggested chemicals to add, and what was
    /// actually added"; website components/visit-chemicals.tsx). One row per reading: Reading and
    /// Aim For, then Suggested (numbered in the order to add) and Added. Tapping a suggestion's
    /// circle adds it as it is; its text opens the Added Chemical sheet. Mark All Added; Also Added
    /// with Add Chemical. Everything saves as it's typed or tapped, through the sync layer (no
    /// Submit on visits). The full Chemical screen stays for More and the customer's pool.
    struct ChemicalCard: View {
        var target: ChemicalTarget
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @State private var open: Bool
        @State private var form = ChemicalForm()
        @State private var saved = ChemicalForm()
        @State private var started = false
        @State private var problem: String?
        @State private var editing: AddedChemicalTarget?
        @State private var picking = false
        @State private var saveError: String?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.dynamicTypeSize) private var typeSize

        /// Accessibility text sizes: rows stack (name, then each field full width with its own
        /// label) instead of squeezing into columns, so nothing truncates or breaks mid-word.
        private var large: Bool { typeSize.isAccessibilitySize }

        /// Side by side at the default sizes; stacked at accessibility sizes.
        private func rowLayout(spacing: CGFloat = 12) -> AnyLayout {
            large
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                : AnyLayout(HStackLayout(spacing: spacing))
        }

        /// `open` starts it open (screenshots).
        init(target: ChemicalTarget, open: Bool = false) {
            self.target = target
            _open = State(initialValue: open)
        }

        var body: some View {
            let _ = sync.revision  // what was added shows after any write or pull
            let company = session.company
            let items = company.map { visitChemicalItems(sync.store, companyId: $0.id) } ?? []
            let added = target.jobId.map { visitAdditions(sync.store, jobId: $0, items: items) } ?? []
            let charges = company.map { chargesChemicals($0.settings) } ?? false
            let locked = lockedAdditions(sync.store, added)
            let typed = readingSummary(form.readingValues)
            let last =
                company.map {
                    ChemicalCardText.line(
                        sync.store, companyId: $0.id, propertyId: target.propertyId, timeZone: $0.timeZone)
                } ?? ChemicalCardText.empty
            let line = chemicalCardLine(typed.isEmpty ? (last == ChemicalCardText.empty ? "" : last) : typed, added)
            VStack(spacing: 0) {
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { open.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ChemicalCardText.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            Text(line)
                                .textRole(.secondary)
                                .monospacedDigit()
                                .foregroundStyle(Color.textMuted)
                                .lineLimit(large ? nil : 1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.textMuted)
                            .rotationEffect(.degrees(open ? 180 : 0))
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
                .accessibilityHint(open ? "Folds the chemicals" : "Opens the chemicals")
                if open {
                    Hairline()
                    content(items: items, added: added, charges: charges, locked: locked)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .padding(.bottom, 20)
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
            .onAppear {
                guard !started else { return }
                started = true
                let pool = chemicalPool(sync.store, target)
                let remembered = sync.kv.getJSON(KVKey.chemicalGoals, as: [String: String].self) ?? [:]
                form =
                    target.jobId.map {
                        visitChemicalForm(
                            sync.store, jobId: $0, poolGallons: pool?.gallons, rememberedGoals: remembered)
                    } ?? ChemicalForm(gallons: pool?.gallons, goals: remembered)
                saved = form
                if !added.isEmpty || !readingSummary(form.readingValues).isEmpty { open = true }
            }
            .onChange(of: form.storedGoals) { _, goals in sync.kv.setJSON(KVKey.chemicalGoals, goals) }
            // Saved as typed: half a second after the last change.
            .task(id: form) {
                guard started, form != saved else { return }
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled else { return }
                save()
            }
            .sheet(item: $editing) { t in
                AddedChemicalSheet(
                    target: t, items: items, charges: charges, locked: locked.contains(t.id),
                    onSave: { save(t, $0) }, onRemove: { remove($0) })
            }
            .sheet(isPresented: $picking) {
                AddChemicalSheet(items: items, charges: charges) { draft, supplied, note in
                    add([draft], added: added, supplied: supplied, note: note)
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

        // MARK: - The open card

        private func content(items: [ChemicalItem], added: [ChemicalAddition], charges: Bool, locked: Set<String>)
            -> some View
        {
            let result = form.result
            // Suggestions wait for the gallons and a reading.
            var dosed = result
            if !form.ready { dosed.steps = [] }
            let rows = chemicalRows(dosed, added, items)
            let unadded = openSuggestions(rows.rows)
            let recommended = form.recommended
            return VStack(alignment: .leading, spacing: 0) {
                rowLayout {
                    Text("Gallons").textRole(.bodyMedium).foregroundStyle(Color.text)
                    if !large { Spacer(minLength: 0) }
                    HStack(spacing: 6) {
                        TextField(
                            "", text: Binding(get: { form.gallons }, set: { form.gallons = gallonsWithCommas($0) }),
                            prompt: Text("20,000").foregroundStyle(Color.placeholder)
                        )
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .accessibilityLabel("Gallons")
                        Text("gal").textRole(.secondary).foregroundStyle(Color.textMuted).accessibilityHidden(true)
                    }
                    .fieldBox()
                    .frame(width: large ? nil : 150)
                    .frame(maxWidth: large ? .infinity : nil)
                }
                .padding(.bottom, 12)
                Hairline()
                // Stacked rows label each field instead (accessibility sizes).
                if !large {
                    HStack(spacing: 8) {
                        Spacer(minLength: 0)
                        columnLabel("Reading")
                        columnLabel("Aim For")
                    }
                    .padding(.top, 12)
                }
                ForEach(Array(rows.rows.enumerated()), id: \.element.key) { index, row in
                    if index > 0 { Hairline() }
                    readingRow(
                        row, status: result.statuses.first { $0.key == row.key }, recommended: recommended,
                        charges: charges, added: added, locked: locked
                    )
                    .padding(.vertical, 12)
                }
                Text("Numbers are the order to add them. Aim For starts at the recommended level.")
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
                if let problem { FieldHint(text: problem, error: true).padding(.top, 4) }
                if !unadded.isEmpty {
                    Button("Mark All Added") { add(unadded, added: added) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                        .padding(.top, 12)
                }
                alsoAdded(rows.extras, charges: charges)
                    .padding(.top, 24)
                if let lsi = result.lsi {
                    Hairline().padding(.top, 20)
                    rowLayout(spacing: 8) {
                        Text("Water balance").textRole(.body).foregroundStyle(Color.text)
                        if !large { Spacer(minLength: 0) }
                        (Text(verbatim: "\(lsi > 0 ? "+" : "")\(String(format: "%.1f", lsi))").bold()
                            .foregroundStyle(Color.text)
                            + Text(verbatim: " · \(result.lsiLabel ?? "")").foregroundStyle(Color.textMuted))
                            .textRole(.body)
                            .monospacedDigit()
                    }
                    .frame(minHeight: minTarget)
                    .accessibilityElement(children: .combine)
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Suggestions use")
                    VStack(spacing: 12) {
                        SelectField(
                            label: "Chlorine", selection: $form.chlorine, options: ChlorineProduct.allCases,
                            optionLabel: \.label)
                        SelectField(
                            label: "Acid", selection: $form.acid, options: AcidProduct.allCases, optionLabel: \.label)
                    }
                }
                .padding(.top, 20)
                OutlinedField(
                    label: "Notes", text: $form.notes, placeholder: "Anything the customer should know", multiline: true
                )
                .padding(.top, 16)
                if charges {
                    Hairline().padding(.top, 20)
                    rowLayout(spacing: 8) {
                        Text("Chemicals today").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                        if !large { Spacer(minLength: 0) }
                        Text(verbatim: formatCents(additionsCents(added)))
                            .textRole(.bodyEmphasis)
                            .monospacedDigit()
                            .foregroundStyle(Color.text)
                    }
                    .frame(minHeight: minTarget)
                    .accessibilityElement(children: .combine)
                }
                Text(
                    charges
                        ? "Saved as you go. Billed on \(customerFirstName())’s \(visitMonth()) invoice."
                        : "Saved as you go."
                )
                .textRole(.secondary)
                .foregroundStyle(Color.textMuted)
                .padding(.top, 4)
            }
        }

        /// A line's price: beside it at the default sizes, on its own line when stacked.
        private func price(_ cents: Cents) -> some View {
            Text(verbatim: formatCents(cents))
                .textRole(.body)
                .monospacedDigit()
                .foregroundStyle(Color.textMuted)
                .fixedSize()
        }

        private func columnLabel(_ text: String) -> some View {
            Text(text)
                .font(.role(.footnote).weight(.semibold))
                .foregroundStyle(Color.textMuted)
                .frame(width: 76, alignment: .trailing)
                .accessibilityHidden(true)
        }

        private func cell(_ label: String, _ text: Binding<String>, placeholder: String = "") -> some View {
            TextField("", text: text, prompt: Text(placeholder).foregroundStyle(Color.placeholder))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .accessibilityLabel(label)
                .fieldBox()
                .frame(width: large ? nil : 76)
                .frame(maxWidth: large ? .infinity : nil)
        }

        /// A field with its own label above it, full width (stacked rows).
        private func labeledCell(_ title: String, _ label: String, _ text: Binding<String>, placeholder: String = "")
            -> some View
        {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).textRole(.footnote).foregroundStyle(Color.textMuted).accessibilityHidden(true)
                cell(label, text, placeholder: placeholder)
            }
        }

        private func readingRow(
            _ row: ChemicalRow, status: ReadingStatus?, recommended: ChemistryTargets, charges: Bool,
            added: [ChemicalAddition], locked: Set<String>
        ) -> some View {
            let key = row.key
            let (word, tone): (String, Color) =
                switch status?.status {
                case nil: ("Not tested", Color.textMuted)
                case .ok?: ("In range", Color.pass)
                case .low?: ("Low", Color.warning)
                case .high?: ("High", Color.warning)
                }
            return VStack(alignment: .leading, spacing: 10) {
                let reading = Binding(get: { form.readings[key] ?? "" }, set: { form.readings[key] = $0 })
                let goal = Binding(get: { form.goals[key] ?? "" }, set: { form.goals[key] = $0 })
                let aimLabel = "\(key.label): aim for (recommended \(levelText(recommended[key].target)))"
                let aimPlaceholder = levelText(recommended[key].target)
                if large {
                    // Accessibility sizes: the name and status, then each field full width.
                    VStack(alignment: .leading, spacing: 8) {
                        (Text(key.label).foregroundStyle(Color.text)
                            + Text(verbatim: " · ").foregroundStyle(Color.textMuted)
                            + Text(word).fontWeight(status == nil ? .regular : .semibold).foregroundStyle(tone))
                            .textRole(.bodyMedium)
                            .accessibilityElement(children: .combine)
                        labeledCell("Reading", "\(key.label) reading", reading)
                        labeledCell("Aim For", aimLabel, goal, placeholder: aimPlaceholder)
                    }
                } else {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(key.label).textRole(.bodyMedium).foregroundStyle(Color.text)
                            Text(word)
                                .font(.role(.secondary).weight(status == nil ? .regular : .semibold))
                                .foregroundStyle(tone)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        cell("\(key.label) reading", reading)
                        cell(aimLabel, goal, placeholder: aimPlaceholder)
                    }
                }
                if row.step != nil || !row.added.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        if let step = row.step {
                            // Accessibility sizes: "Suggested" above the amount, full width.
                            rowLayout(spacing: 8) {
                                HStack(spacing: 8) {
                                    if let order = row.order {
                                        Text(verbatim: "\(order)")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundStyle(Color.onPrimary)
                                            .frame(width: 20, height: 20)
                                            .background(Circle().fill(Color.brandPrimary))
                                            .accessibilityLabel("Step \(order)")
                                    }
                                    Text("Suggested").textRole(.secondary).foregroundStyle(Color.textMuted)
                                        .fixedSize()
                                }
                                if !large { Spacer(minLength: 8) }
                                Text(suggestionText(step))
                                    .font(.role(.secondary).weight(.medium))
                                    .foregroundStyle(Color.text)
                                    .multilineTextAlignment(large ? .leading : .trailing)
                            }
                            .accessibilityElement(children: .combine)
                            if key == .ph, step.note != nil {
                                Text("Acid to water, never water to acid.")
                                    .textRole(.secondary)
                                    .foregroundStyle(Color.textMuted)
                                    .padding(.top, 4)
                            } else if row.suggestion == nil, let note = step.note {
                                Text(note).textRole(.secondary).foregroundStyle(Color.textMuted).padding(.top, 4)
                            }
                        }
                        ForEach(row.added) { a in
                            Hairline().padding(.top, 8)
                            addedRow(a, charges: charges, locked: locked.contains(a.id))
                        }
                        if row.added.isEmpty, let suggestion = row.suggestion {
                            Hairline().padding(.top, 8)
                            suggestionRow(suggestion, charges: charges, added: added)
                        }
                    }
                    .well(padding: 12)
                }
            }
        }

        private func addedRow(_ a: ChemicalAddition, charges: Bool, locked: Bool) -> some View {
            HStack(spacing: 4) {
                Button {
                    remove(a)
                } label: {
                    RoundCheck(done: true).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // On a sent invoice it stays (the invoice is final); the sheet says so.
                .disabled(locked)
                .opacity(locked ? 0.6 : 1)
                .accessibilityLabel("Remove \(additionLabel(a))")
                Button {
                    editing = .edit(a)
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(a.customerSupplied ? "Added · customer supplied" : "Added")
                                .font(.role(.footnote).weight(.semibold))
                                .foregroundStyle(Color.pass)
                            Text(additionLabel(a)).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            if large && charges && !a.customerSupplied { price(lineTotal(a)) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if !large && charges && !a.customerSupplied { price(lineTotal(a)) }
                        Chevron()
                    }
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityHint(locked ? "On a sent invoice" : "Changes the amount or the chemical")
            }
        }

        private func suggestionRow(_ s: AdditionDraft, charges: Bool, added: [ChemicalAddition]) -> some View {
            HStack(spacing: 4) {
                Button {
                    add([s], added: added)
                } label: {
                    RoundCheck(done: false).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark added: \(additionLabel(s))")
                Button {
                    editing = .suggestion(s)
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Not added yet").textRole(.footnote).foregroundStyle(Color.textMuted)
                            Text(additionLabel(s)).textRole(.body).foregroundStyle(Color.textMuted)
                            if large && charges { price(lineTotal(s)) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if !large && charges { price(lineTotal(s)) }
                        Chevron()
                    }
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Change the amount before adding it")
            }
        }

        private func alsoAdded(_ extras: [ChemicalAddition], charges: Bool) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Also added")
                VStack(spacing: 0) {
                    ForEach(extras) { a in
                        Button {
                            editing = .edit(a)
                        } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(additionLabel(a)).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                                    let detail = [a.customerSupplied ? "Customer supplied" : nil, a.note]
                                        .compactMap { $0 }.joined(separator: " · ")
                                    if !detail.isEmpty {
                                        Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                                    }
                                    if large && charges && !a.customerSupplied { price(lineTotal(a)) }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                if !large && charges && !a.customerSupplied { price(lineTotal(a)) }
                                Chevron()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .frame(minHeight: minTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.row)
                        .accessibilityElement(children: .combine)
                        Hairline().padding(.leading, 16)
                    }
                    Button {
                        picking = true
                    } label: {
                        Label("Add Chemical", systemImage: "plus.circle.fill")
                            .textRole(.body)
                            .foregroundStyle(Color.link)
                            .padding(.horizontal, 16)
                            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.row)
                }
                .background(
                    RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous).fill(Color.well)
                )
                .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
            }
        }

        // MARK: - Saving

        private func customerFirstName() -> String {
            visitCustomerFirstName(sync.store, jobId: target.jobId, propertyId: target.propertyId)
        }

        /// "October": the month the visit is billed in.
        private func visitMonth() -> String {
            guard let company = session.company else { return "" }
            let job = target.jobId.flatMap { try? sync.store.get("job", $0) }
            let day =
                job?["plan_date"]?.string ?? job?["scheduled_start"]?.string ?? job?["completed_at"]?.string
                ?? ((try? localDate(Date(), company.timeZone)) ?? "")
            return monthName(day, timeZone: company.timeZone)
        }

        private func save() {
            guard let company = session.company, let jobId = target.jobId else { return }
            do {
                problem = try VisitChemicalWrites.saveReading(
                    sync, companyId: company.id, jobId: jobId, propertyId: target.propertyId, form: form)
                if problem == nil { saved = form }
            } catch {
                saveError = String(describing: error)
            }
        }

        private func add(
            _ drafts: [AdditionDraft], added: [ChemicalAddition], supplied: Bool = false, note: String? = nil
        ) {
            guard let company = session.company, let jobId = target.jobId else { return }
            do {
                try VisitChemicalWrites.add(
                    sync, companyId: company.id, jobId: jobId, propertyId: target.propertyId, drafts,
                    customerSupplied: supplied, note: note, firstSort: added.count)
            } catch {
                saveError = String(describing: error)
            }
        }

        private func save(_ t: AddedChemicalTarget, _ a: ChemicalAddition) {
            guard let company = session.company else { return }
            switch t {
            case .edit:
                do { try VisitChemicalWrites.update(sync, companyId: company.id, a) } catch {
                    saveError = String(describing: error)
                }
            case .suggestion:
                let draft = AdditionDraft(
                    priceBookItemId: a.priceBookItemId, name: a.name, unit: a.unit, readingKey: a.readingKey,
                    suggestedQuantity: a.suggestedQuantity, quantity: a.quantity, unitPriceCents: a.unitPriceCents)
                let added =
                    target.jobId.map {
                        visitAdditions(
                            sync.store, jobId: $0, items: visitChemicalItems(sync.store, companyId: company.id))
                    } ?? []
                add([draft], added: added, supplied: a.customerSupplied, note: a.note)
            }
        }

        private func remove(_ a: ChemicalAddition) {
            do { try VisitChemicalWrites.remove(sync, id: a.id) } catch { saveError = String(describing: error) }
        }
    }

    /// What the Added Chemical sheet edits: an addition, or a suggestion before it's added.
    enum AddedChemicalTarget: Identifiable {
        case edit(ChemicalAddition)
        case suggestion(AdditionDraft)

        var id: String {
            switch self {
            case .edit(let a): a.id
            case .suggestion(let s): "suggestion-\(s.readingKey?.rawValue ?? s.name)"
            }
        }

        var addition: ChemicalAddition {
            switch self {
            case .edit(let a): a
            case .suggestion(let s):
                ChemicalAddition(
                    id: "", jobId: "", propertyId: "", priceBookItemId: s.priceBookItemId, name: s.name, unit: s.unit,
                    readingKey: s.readingKey, suggestedQuantity: s.suggestedQuantity, quantity: s.quantity,
                    unitPriceCents: s.unitPriceCents, addedAt: "")
            }
        }
    }

    /// The amount: a number field beside a stepper (steppers.md: pair a stepper with a field when
    /// values vary widely), stepping by the unit.
    struct ChemicalAmountRow: View {
        @Binding var text: String
        var unit: String
        @Environment(\.dynamicTypeSize) private var typeSize

        var body: some View {
            let large = typeSize.isAccessibilitySize
            // Accessibility sizes: the field full width, the stepper under it.
            let layout =
                large
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                HStack(spacing: 6) {
                    TextField("", text: $text)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .accessibilityLabel("Amount")
                    Text(unit).textRole(.secondary).foregroundStyle(Color.textMuted).accessibilityHidden(true)
                }
                .fieldBox()
                .frame(width: large ? nil : 130)
                .frame(maxWidth: large ? .infinity : nil)
                if !large { Spacer(minLength: 0) }
                Stepper(
                    "Amount",
                    onIncrement: { step(1) },
                    onDecrement: { step(-1) }
                )
                .labelsHidden()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, 8)
            .frame(minHeight: 56)
        }

        private func step(_ direction: Int) {
            let n = chemicalNumber(text) ?? 0
            text = levelText(stepQuantity(n, unit: unit, direction: direction))
        }
    }

    /// Added Chemical: another chemical, the amount, Customer Supplied, a note, or Remove. For a
    /// suggestion not added yet, Add.
    struct AddedChemicalSheet: View {
        var target: AddedChemicalTarget
        var items: [ChemicalItem]
        var charges: Bool
        /// On a sent invoice: shown, not changed (sent invoices are final).
        var locked = false
        var onSave: (ChemicalAddition) -> Void
        var onRemove: (ChemicalAddition) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var itemId = ""
        @State private var amount = ""
        @State private var supplied = false
        @State private var note = ""
        @State private var loaded = false
        @State private var confirmRemove = false
        @State private var confirmDiscard = false

        private var original: ChemicalAddition { target.addition }
        private var isNew: Bool { if case .suggestion = target { true } else { false } }
        /// Something changed since the sheet opened: swiping down or Cancel asks first.
        private var dirty: Bool {
            loaded && !locked
                && (itemId != (original.priceBookItemId ?? "") || chemicalNumber(amount) != original.quantity
                    || supplied != original.customerSupplied || note != (original.note ?? ""))
        }

        var body: some View {
            let list = chemicalItems(items)
            let item = list.first { $0.id == itemId }
            let unit = item?.unit ?? original.unit
            let price = item?.priceCents ?? original.unitPriceCents
            let quantity = chemicalNumber(amount)
            let valid = (quantity ?? 0) > 0 && (quantity ?? 0) <= 100_000
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Grouped(label: "Chemical") {
                            Picker("Chemical", selection: $itemId) {
                                // The chemical as it was added, when the price book no longer has it.
                                if !list.contains(where: { $0.id == itemId }) {
                                    Text(original.name).tag(original.priceBookItemId ?? "")
                                }
                                ForEach(list, id: \.id) { i in
                                    Text(charges ? "\(i.name) (\(unitPriceLabel(i.priceCents, unit: i.unit)))" : i.name)
                                        .tag(i.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(Color.text)
                            .disabled(locked)
                            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        }
                        Grouped(
                            label: "Amount",
                            footer: locked
                                ? "This chemical is on a sent invoice. Change the invoice instead."
                                : charges && valid
                                    ? supplied
                                        ? "Customer supplied: on the report, not billed."
                                        : "\(formatQuantity(quantity!, unit: unit)) × \(formatCents(price)) = \(formatCents(lineTotal(QuantityPrice(quantity: quantity!, unitPriceCents: price)))), on the monthly invoice."
                                    : nil
                        ) {
                            ChemicalAmountRow(text: $amount, unit: unit)
                            SwitchRow("Customer Supplied", isOn: $supplied)
                            ChemicalNoteRow(note: $note)
                        }
                        .disabled(locked)
                        if !isNew && !locked {
                            Button("Remove Chemical", role: .destructive) { confirmRemove = true }
                                .buttonStyle(.danger(fullWidth: true, size: .field))
                        }
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(Color.bg)
                .navigationTitle(isNew ? "Add Chemical" : "Added Chemical")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(locked ? "Done" : "Cancel") { if dirty { confirmDiscard = true } else { dismiss() } }
                    }
                    if !locked {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(isNew ? "Add" : "Save") {
                                guard let quantity, valid else { return }
                                var a = original
                                if let item {
                                    a.priceBookItemId = item.id
                                    a.name = item.name
                                    a.unit = item.unit
                                    a.unitPriceCents = item.priceCents
                                }
                                a.quantity = quantity
                                a.customerSupplied = supplied
                                let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                                a.note = trimmed.isEmpty ? nil : trimmed
                                onSave(a)
                                dismiss()
                            }
                            .fontWeight(.semibold)
                            .disabled(!valid)
                        }
                    }
                }
                .confirmationDialog("Remove this chemical?", isPresented: $confirmRemove, titleVisibility: .visible) {
                    Button("Remove Chemical", role: .destructive) {
                        onRemove(original)
                        dismiss()
                    }
                } message: {
                    Text("It comes off the visit and its report.")
                }
            }
            .sheetPresentation(dirty: dirty, detents: [.medium, .large])
            .discardPrompt(dirty: dirty, isPresented: $confirmDiscard)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                itemId = original.priceBookItemId ?? ""
                amount = levelText(original.quantity)
                supplied = original.customerSupplied
                note = original.note ?? ""
            }
        }
    }

    /// An added chemical's note: one line, at most 200 characters (the server's limit).
    struct ChemicalNoteRow: View {
        @Binding var note: String
        @Environment(\.dynamicTypeSize) private var typeSize

        var body: some View {
            let large = typeSize.isAccessibilitySize
            let layout =
                large
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                Text("Note").textRole(.body).foregroundStyle(Color.text)
                TextField("", text: $note, prompt: Text("Optional").foregroundStyle(Color.placeholder))
                    .multilineTextAlignment(large ? .leading : .trailing)
                    .foregroundStyle(Color.textMuted)
                    .accessibilityLabel("Note")
                    .onChange(of: note) { _, now in if now.count > 200 { note = String(now.prefix(200)) } }
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, large ? 8 : 0)
            .frame(minHeight: minTarget)
        }
    }

    /// A quantity and a unit price, for a line's total.
    struct QuantityPrice: PricedLine {
        var quantity: Double
        var unitPriceCents: Cents
    }

    /// Add Chemical: the shop's chemicals with search, then the amount.
    struct AddChemicalSheet: View {
        var items: [ChemicalItem]
        var charges: Bool
        var onAdd: (AdditionDraft, Bool, String?) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var query = ""
        @State private var picked: ChemicalItem?
        @State private var amount = "1"
        @State private var supplied = false
        @State private var note = ""
        @State private var confirmDiscard = false

        var body: some View {
            let list = chemicalItems(items)
            let shown = query.isEmpty ? list : list.filter { $0.name.localizedCaseInsensitiveContains(query) }
            let quantity = chemicalNumber(amount)
            let valid = picked != nil && (quantity ?? 0) > 0 && (quantity ?? 0) <= 100_000
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let picked {
                            Grouped(
                                label: "Amount",
                                footer: charges && valid
                                    ? supplied
                                        ? "Customer supplied: on the report, not billed."
                                        : "\(formatCents(lineTotal(QuantityPrice(quantity: quantity!, unitPriceCents: picked.priceCents)))), on the monthly invoice."
                                    : nil
                            ) {
                                ListRow(
                                    picked.name,
                                    value: charges ? unitPriceLabel(picked.priceCents, unit: picked.unit) : nil,
                                    emphasized: true)
                                ChemicalAmountRow(text: $amount, unit: picked.unit)
                                SwitchRow("Customer Supplied", isOn: $supplied)
                                ChemicalNoteRow(note: $note)
                            }
                        }
                        Grouped(label: "Chemicals") {
                            ForEach(shown, id: \.id) { i in
                                Button {
                                    picked = i
                                    amount = levelText(itemAddition(i).quantity)
                                } label: {
                                    HStack(spacing: 8) {
                                        VStack(alignment: .leading, spacing: 0) {
                                            Text(i.name).textRole(.body).foregroundStyle(Color.text)
                                            if charges {
                                                Text(unitPriceLabel(i.priceCents, unit: i.unit))
                                                    .textRole(.secondary)
                                                    .foregroundStyle(Color.textMuted)
                                            }
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        if picked?.id == i.id {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 17, weight: .semibold))
                                                .foregroundStyle(Color.link)
                                                .accessibilityHidden(true)
                                        }
                                    }
                                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                                    .padding(.vertical, 8)
                                    .frame(minHeight: minTarget)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.row)
                                .accessibilityAddTraits(picked?.id == i.id ? .isSelected : [])
                            }
                            if shown.isEmpty {
                                Text("No chemicals match. Add them in Settings › Price Book.")
                                    .textRole(.body)
                                    .foregroundStyle(Color.textMuted)
                                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                            }
                        }
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(Color.bg)
                .searchable(
                    text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search chemicals"
                )
                .navigationTitle("Add Chemical")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { if picked != nil { confirmDiscard = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            guard let picked, let quantity, valid else { return }
                            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                            onAdd(itemAddition(picked, quantity: quantity), supplied, trimmed.isEmpty ? nil : trimmed)
                            dismiss()
                        }
                        .fontWeight(.semibold)
                        .disabled(!valid)
                    }
                }
            }
            .sheetPresentation(dirty: picked != nil, detents: [.medium, .large])
            .discardPrompt(dirty: picked != nil, isPresented: $confirmDiscard)
        }
    }
#endif
