#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// A maintenance visit's Charges, on its Checklist after Regular cleanings (owner, 2026-11-15:
    /// "a way to add extra charges ... like if they cleaned their filter or cleaned the salt cell,
    /// or replaced any parts"; website components/charges.tsx `VisitCharges`). A row per charge:
    /// its name, "1 × $24.00" and the amount; tapping opens it with Remove Charge, and the row
    /// swipes left to Remove too. Then "+ Add Charge". The footer says which invoice bills them;
    /// once that invoice is sent they're shown, not changed. Saved through the sync layer, offline.
    struct VisitChargesBox: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var adding = false
        @State private var opened: VisitCharge?
        @State private var removing: VisitCharge?
        @State private var saveError: String?

        var body: some View {
            let _ = sync.revision
            if let company = session.company {
                let items = visitChargeItems(sync.store, companyId: company.id)
                let charges = visitCharges(sync.store, jobId: job.id, items: items)
                let sent = visitChargesSentInvoice(sync.store, charges, timeZone: company.timeZone)
                let locked = sent != nil
                Grouped(
                    label: "Charges", footer: visitChargesFooter(job, sent: sent, timeZone: company.timeZone)
                ) {
                    ForEach(charges) { c in
                        if locked {
                            ListRow(c.name, detail: chargeDetail(c), value: formatCents(chargeCents(c)))
                        } else {
                            SwipeDeleteRow(name: c.name, title: "Remove", delete: { removing = c }) {
                                Button {
                                    opened = c
                                } label: {
                                    ListRow(
                                        c.name, detail: chargeDetail(c), value: formatCents(chargeCents(c)),
                                        chevron: true)
                                }
                                .buttonStyle(.row)
                            }
                        }
                    }
                    if !locked {
                        AddChargeRow { adding = true }
                    }
                }
                .sheet(isPresented: $adding) {
                    AddChargeSheet(items: items) { draft in
                        _ = try VisitChargeWrites.add(sync, companyId: company.id, jobId: job.id, draft)
                    }
                }
                .sheet(item: $opened) { c in
                    ChargeSheet(charge: c) { remove(c) }
                }
                .confirmationDialog(
                    "Remove this charge?",
                    isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                    titleVisibility: .visible, presenting: removing
                ) { c in
                    Button("Remove Charge", role: .destructive) { remove(c) }
                    Button("Cancel", role: .cancel) {}
                }
                .alert(
                    "Couldn’t Save",
                    isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
                ) {
                    Button("OK") { saveError = nil }
                } message: {
                    Text(saveError ?? "")
                }
            }
        }

        private func remove(_ c: VisitCharge) {
            do {
                try VisitChargeWrites.remove(sync, id: c.id)
                opened = nil
            } catch {
                saveError = userMessage(error)
            }
        }
    }

    /// "+ Add Charge" at the end of a grouped list (website `AddChargeRow`).
    struct AddChargeRow: View {
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                HStack(spacing: 12) {
                    Image(systemName: "plus")
                        .font(.system(size: 17, weight: .semibold))
                        .accessibilityHidden(true)
                    Text("Add Charge").textRole(.body)
                }
                .foregroundStyle(Color.link)
                .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                .padding(.vertical, CGFloat(Spacing.rowVertical))
                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.row)
        }
    }

    /// A charge opened from the visit: what it is, and Remove Charge (the row's swipe does the same).
    struct ChargeSheet: View {
        var charge: VisitCharge
        var onRemove: () -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var confirm = false

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("\(chargeDetail(charge)) · \(formatCents(chargeCents(charge)))")
                            .textRole(.body)
                            .monospacedDigit()
                            .foregroundStyle(Color.textMuted)
                        Button("Remove Charge", role: .destructive) { confirm = true }
                            .buttonStyle(.danger(fullWidth: true, size: .field))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .background(Color.bg)
                .navigationTitle(charge.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }.fontWeight(.semibold)
                    }
                }
            }
            .sheetPresentation(detents: [.medium])
            .confirmationDialog("Remove this charge?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Remove Charge", role: .destructive) {
                    onRemove()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    /// Add Charge (website `AddChargeForm`): Price Book | Custom. From the price book: search,
    /// tap an item, then Quantity. Custom: Description, Price, Quantity and Taxable. Add checks
    /// the fields as the website does and says what to fix under them. `onAdd` saves; what it
    /// throws shows above the fields and keeps the sheet open.
    struct AddChargeSheet: View {
        var items: [ChargeItem]
        var onAdd: (ChargeDraft) throws -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var mode: ChargeMode
        @State private var query = ""
        @State private var picked: ChargeItem?
        @State private var quantity = "1"
        @State private var description = ""
        @State private var price = ""
        @State private var taxable = true
        @State private var errors: [String: String] = [:]
        @State private var problem: String?
        @State private var confirmDiscard = false

        init(items: [ChargeItem], onAdd: @escaping (ChargeDraft) throws -> Void) {
            self.items = items
            self.onAdd = onAdd
            _mode = State(initialValue: items.isEmpty ? .custom : .book)
        }

        private var dirty: Bool {
            picked != nil || quantity != "1" || !description.isEmpty || !price.isEmpty || !taxable
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Segmented(
                            selection: $mode, options: ChargeMode.allCases, label: \.label, title: "Charge from",
                            fillsWidth: true)
                        if let problem { Notice(kind: .error, text: problem) }
                        if mode == .book { book } else { custom }
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(Color.bg)
                .navigationTitle("Add Charge")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { if dirty { confirmDiscard = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") { add() }.fontWeight(.semibold)
                    }
                }
            }
            .sheetPresentation(dirty: dirty, detents: [.large])
            .discardPrompt(dirty: dirty, isPresented: $confirmDiscard)
            .onChange(of: mode) { _, _ in errors = [:] }
        }

        @ViewBuilder private var book: some View {
            let q = query.trimmingCharacters(in: .whitespaces).lowercased()
            let shown = items.filter { q.isEmpty || $0.name.lowercased().contains(q) }
            SearchField(text: $query, placeholder: "Search the price book")
            VStack(alignment: .leading, spacing: 4) {
                Grouped {
                    ForEach(shown) { i in itemRow(i) }
                    if shown.isEmpty {
                        Text("Nothing matches. Add it in Settings › Price Book, or use Custom.")
                            .textRole(.body)
                            .foregroundStyle(Color.textMuted)
                            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                            .padding(.vertical, CGFloat(Spacing.rowVertical))
                            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    }
                }
                if let error = errors["item"] { FieldHint(text: error, error: true).padding(.horizontal, 16) }
            }
            OutlinedField(
                label: "Quantity", text: $quantity, error: errors["quantity"], keyboard: .decimalPad, numeric: true)
        }

        @ViewBuilder private var custom: some View {
            OutlinedField(label: "Description", text: $description, error: errors["description"])
                .onChange(of: description) { _, now in if now.count > 200 { description = String(now.prefix(200)) } }
            OutlinedField(
                label: "Price ($)", text: $price, placeholder: "24.00", error: errors["price"], keyboard: .decimalPad,
                numeric: true)
            OutlinedField(
                label: "Quantity", text: $quantity, error: errors["quantity"], keyboard: .decimalPad, numeric: true)
            Grouped {
                SwitchRow("Taxable", isOn: $taxable)
            }
        }

        /// A price book item: its name, its price and category, and a check when it's picked.
        private func itemRow(_ i: ChargeItem) -> some View {
            Button {
                picked = i
                errors["item"] = nil
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i.name).textRole(.body).foregroundStyle(Color.text)
                        Text((i.priceCents.map(formatCents) ?? "No price") + (i.category.map { " · \($0)" } ?? ""))
                            .textRole(.secondary)
                            .monospacedDigit()
                            .foregroundStyle(Color.textMuted)
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

        private func add() {
            problem = nil
            switch checkCharge(
                mode: mode, item: picked, quantity: quantity, description: description, price: price,
                taxable: taxable)
            {
            case .failure(let e):
                errors = e.fields
            case .success(let draft):
                errors = [:]
                do {
                    try onAdd(draft)
                    dismiss()
                } catch {
                    problem = userMessage(error)
                }
            }
        }
    }
#endif
