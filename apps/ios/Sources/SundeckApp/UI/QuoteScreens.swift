#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Standalone quotes (owner, 2026-11-24; docs/design/2026-11-24-standalone-quotes.md): More ›
    // Quotes, New Quote, and the Quote screen. Same words and behavior as the website and Android;
    // the rules are core's (SundeckCore/QuoteList.swift), the rows QuotesData.swift.

    // MARK: - Quotes list

    /// More › Quotes: every quote in the shop, newest first, under Draft | Sent | Accepted |
    /// Declined (opening on Sent), searched by customer, quote number or job number. A row opens
    /// the Quote screen; + makes a New Quote.
    struct QuotesScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @State private var rows: [QuoteListRow] = []
        @State private var loaded = false
        @State private var segment = QuoteSegment.default
        @State private var search = ""

        var body: some View {
            let shown = filterQuotes(rows, segment: segment.rawValue, q: search)
            let searching = !search.trimmingCharacters(in: .whitespaces).isEmpty
            ScreenScroll {
                Segmented(
                    selection: $segment, options: QuoteSegment.allCases, label: \.label, title: "Show",
                    // Four equal segments: 8 a side so Accepted and Declined fit unshrunk.
                    fillsWidth: true, segmentPadding: 8)
                if !loaded {
                    SkeletonRows(count: 4, dot: false, label: "Loading quotes")
                } else if shown.isEmpty {
                    EmptyState(text: searching ? quotesEmptySearch : segment.emptyText)
                } else {
                    Grouped {
                        ForEach(shown) { row in
                            Button {
                                openRoute(.quote(row.id))
                            } label: {
                                QuoteListRowView(row: row)
                            }
                            .buttonStyle(.row)
                        }
                    }
                }
            }
            .refreshable { await sync.syncNow() }
            .navigationTitle(QuotesText.title)
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $search, prompt: QuotesText.search)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if let company = session.company, canMakeJobs(company.role, company.settings) {
                        BarIconButton(systemImage: "plus", label: QuotesText.newQuote) {
                            openRoute(.newQuote(back: QuotesText.title))
                        }
                    }
                }
            }
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") {
                guard let company = session.company else { return }
                rows = quoteListRows(sync.store, companyId: company.id)
                loaded = true
            }
        }
    }

    /// A quote: the customer, "Quote #1043 · $1,250.00", the status pill, and for an accepted
    /// standalone quote without a pool, what the office does next.
    struct QuoteListRowView: View {
        var row: QuoteListRow

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.customer ?? "Customer").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(verbatim: row.detail).textRole(.secondary).monospacedDigit().foregroundStyle(
                        Color.textMuted)
                    if row.waitingForPool {
                        Text(quoteNeedsPool).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                Spacer(minLength: 0)
                Chip(text: row.status.label, tone: row.status.tone)
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Job route

    /// A job route's screen: the job page, or for a standalone quote's job (status quote) its Quote
    /// screen (an old link, Activity, search).
    struct JobOrQuoteScreen: View {
        var jobId: String
        var section: JobPageSection? = nil
        @Environment(SyncService.self) private var sync

        var body: some View {
            if let quoteId = standaloneQuoteId(sync.store, jobId: jobId) {
                QuoteScreen(quoteId: quoteId)
            } else {
                JobScreen(jobId: jobId, section: section)
            }
        }
    }

    // MARK: - Quote screen

    /// One quote: Customer (opens the customer page), Pool (or Add Pool for a quote job without
    /// one) and Job ("Job #1050") in a grouped list, then the job page's quote builder or sent
    /// card. A draft standalone quote has Delete Quote at the bottom.
    struct QuoteScreen: View {
        var quoteId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @Environment(\.dismiss) private var dismiss
        @State private var model: QuoteScreenModel?
        @State private var loaded = false
        @State private var addingPool = false
        @State private var confirmDelete = false
        @State private var problem: String?

        var body: some View {
            Group {
                if let model {
                    page(model)
                } else if loaded {
                    ScreenScroll { EmptyState(text: QuotesText.notOnPhone) }
                } else {
                    Color.bg
                }
            }
            .navigationTitle(model?.title ?? "Quote")
            .navigationBarTitleDisplayMode(.large)
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") {
                guard let company = session.company else { return }
                model = QuoteScreenModel(sync.store, companyId: company.id, quoteId: quoteId)
                loaded = true
            }
        }

        private var canEdit: Bool {
            session.company.map { canMakeJobs($0.role, $0.settings) } ?? false
        }

        private func page(_ m: QuoteScreenModel) -> some View {
            ScreenScroll(spacing: 16) {
                Grouped {
                    Button {
                        if let id = m.customerId { openRoute(.more(.customer(id))) }
                    } label: {
                        ListRow("Customer", value: m.customerName, chevron: m.customerId != nil)
                    }
                    .buttonStyle(.row)
                    .disabled(m.customerId == nil)
                    if let address = m.poolAddress {
                        ListRow("Pool", detail: address)
                    } else if m.canAddPool && canEdit {
                        ActionRow(QuotesText.addPool) { addingPool = true }
                    } else {
                        ListRow("Pool", value: "None")
                    }
                    if let label = m.jobLabel {
                        Button {
                            openRoute(.job(m.job.id))
                        } label: {
                            ListRow("Job", value: label, chevron: true)
                        }
                        .buttonStyle(.row)
                    }
                }
                if m.waitingForPool { Notice(kind: .info, text: quoteNeedsPool) }
                if let problem { Notice(kind: .error, text: problem) }
                QuoteSection(job: m.job, only: m.quote.id)
                if m.canDelete && canEdit {
                    Button(QuotesText.deleteQuote, role: .destructive) { confirmDelete = true }
                        .buttonStyle(.danger)
                        .padding(.top, 8)
                }
            }
            .refreshable { await sync.syncNow() }
            .confirmationDialog(QuotesText.deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(QuotesText.delete, role: .destructive) { delete(m) }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(isPresented: $addingPool) {
                AddPoolSheet(model: m) { problem = nil }
            }
        }

        private func delete(_ m: QuoteScreenModel) {
            guard let company = session.company else { return }
            do {
                try StandaloneQuoteWrites.delete(sync, companyId: company.id, quoteId: m.quote.id, jobId: m.job.id)
                dismiss()
            } catch {
                problem = userMessage(error)
            }
        }
    }

    /// Add Pool on a quote job: one of the customer's pools, or a new address (Street, City, State,
    /// ZIP). Saving sets the job's pool; an accepted quote then becomes the repair job.
    private struct AddPoolSheet: View {
        var model: QuoteScreenModel
        var onSaved: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var propertyId: String?
        @State private var address = NewQuoteInput()
        @State private var error: String?
        @State private var problem: String?
        @State private var askDiscard = false
        @State private var suggester = AddressSuggester()
        @State private var streetFocused = false

        private var dirty: Bool {
            propertyId != nil
                || [address.addressLine1, address.city, address.state, address.postalCode].contains {
                    !$0.trimmingCharacters(in: .whitespaces).isEmpty
                }
        }

        var body: some View {
            NavigationStack {
                ScreenScroll(spacing: 16) {
                    if !model.customerPools.isEmpty {
                        FormCard("Pool") {
                            SelectField(
                                label: "Pool", selection: $propertyId,
                                options: model.customerPools.map { Optional($0.id) } + [nil],
                                optionLabel: { id in
                                    id.flatMap { id in model.customerPools.first { $0.id == id }?.address }
                                        ?? "Another address…"
                                })
                        }
                    }
                    if propertyId == nil {
                        AddressCard(
                            input: $address, error: error, suggester: suggester, streetFocused: $streetFocused)
                    }
                    if let problem { Notice(kind: .error, text: problem) }
                    Button(QuotesText.addPool, action: save).buttonStyle(.primary)
                }
                .navigationTitle(QuotesText.addPool)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { if dirty { askDiscard = true } else { dismiss() } }
                    }
                }
                .discardPrompt(dirty: dirty, isPresented: $askDiscard)
            }
            .sheetPresentation(dirty: dirty)
            .onAppear {
                if model.customerPools.count == 1 { propertyId = model.customerPools[0].id }
            }
        }

        private func save() {
            guard let company = session.company else { return }
            if propertyId == nil, let problem = addPoolAddressError(address.addressLine1) {
                error = problem
                return
            }
            do {
                try StandaloneQuoteWrites.addPool(
                    sync, companyId: company.id, jobId: model.job.id, propertyId: propertyId,
                    customerId: model.customerId, address: address)
                onSaved()
                dismiss()
            } catch {
                problem = userMessage(error)
            }
        }
    }

    /// Street, City, State and ZIP as New Job's address card, with address suggestions under the
    /// street (owner, 2026-10-20).
    private struct AddressCard: View {
        var title = "Address"
        @Binding var input: NewQuoteInput
        var error: String?
        var suggester: AddressSuggester
        @Binding var streetFocused: Bool

        var body: some View {
            FormCard(title) {
                OutlinedField(
                    label: "Street address", text: $input.addressLine1, error: error,
                    onFocusChange: { streetFocused = $0 }
                )
                .textContentType(.streetAddressLine1)
                .addressLookup(suggester, text: input.addressLine1, focused: streetFocused)
                if !suggester.items.isEmpty {
                    Grouped {
                        AddressSuggestionRows(suggester: suggester) { s in
                            input.addressLine1 = s.line1
                            input.city = s.city
                            input.state = s.state
                            input.postalCode = s.postalCode
                        }
                    }
                }
                OutlinedField(label: "City", text: $input.city).textContentType(.addressCity)
                HStack(alignment: .top, spacing: 16) {
                    OutlinedField(label: "State", text: $input.state)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .onChange(of: input.state) { _, v in
                            if v.count > 2 { input.state = String(v.prefix(2)) }
                        }
                    OutlinedField(label: "ZIP", text: $input.postalCode, keyboard: .numberPad)
                        .textContentType(.postalCode)
                }
            }
        }
    }

    // MARK: - New Quote

    /// The pushed New Quote, like New Job; from a customer's page with that customer picked. Saving
    /// opens the Quote screen in its place.
    struct NewQuoteRoute: View {
        var back: String
        var customerId: String?
        @Environment(Session.self) private var session
        @Environment(\.replaceRoute) private var replaceRoute
        @State private var form: NewQuoteForm?

        var body: some View {
            // A ZStack with a clear layer, not a Group, so onAppear runs (as NewJobRoute).
            ZStack {
                Color.clear
                if let form {
                    NewQuoteView(form: form, back: back) { replaceRoute(.quote($0)) }
                } else {
                    SkeletonCard(label: "Loading New Quote").padding(16).frame(maxHeight: .infinity, alignment: .top)
                }
            }
            .onAppear {
                if form == nil, let company = session.company, let user = session.user {
                    form = NewQuoteForm(sync: session.sync, company: company, userId: user.id, customerId: customerId)
                }
            }
        }
    }

    /// New Quote: Customer (New or Existing, New Job's picker), Pool (Optional) with the
    /// customer's pools or an address, then Create Quote. Saves in one transaction, offline.
    struct NewQuoteView: View {
        @Bindable var form: NewQuoteForm
        var back = "Jobs"
        var onCreated: (String) -> Void
        @State private var saveProblem: String?
        @State private var saved = 0
        @State private var created = false
        @State private var suggester = AddressSuggester()
        @State private var streetFocused = false

        var body: some View {
            ScreenScroll(spacing: 16) {
                if form.canMakeJobs {
                    customerCard
                    poolCard
                    if !form.errors.isEmpty { Notice(kind: .error, text: "Fix the highlighted fields.") }
                    Button(QuotesText.createQuote, action: save).buttonStyle(.primary)
                } else {
                    Notice(kind: .info, text: NewJobForm.notAllowedMessage)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(QuotesText.newQuote)
            .navigationBarTitleDisplayMode(.large)
            .discardOnBack(dirty: form.isDirty && saved == 0, back: back)
            .sensoryFeedback(.success, trigger: saved)
            .alert(
                QuotesText.couldNotSave,
                isPresented: Binding(get: { saveProblem != nil }, set: { if !$0 { saveProblem = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveProblem ?? "")
            }
        }

        private var customerCard: some View {
            FormCard("Customer") {
                if !form.customers.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Who is it for?")
                        Segmented(
                            selection: $form.mode, options: NewJobForm.Mode.allCases, label: \.label,
                            title: "Who is it for?")
                    }
                }
                if form.mode == .existing {
                    VStack(alignment: .leading, spacing: 4) {
                        SelectField(
                            label: "Customer",
                            selection: Binding(get: { form.customerId }, set: { form.selectCustomer($0) }),
                            options: [nil] + form.customers.map { Optional($0.id) },
                            optionLabel: { id in
                                id.flatMap { id in form.customers.first { $0.id == id } }.map(form.customerLabel)
                                    ?? "Choose…"
                            })
                        if let error = form.errors["customer"] { FieldHint(text: error, error: true) }
                    }
                } else {
                    OutlinedField(label: "Name", text: $form.input.customerName, error: form.errors["customerName"])
                        .textContentType(.name)
                    OutlinedField(label: "Phone", text: $form.input.customerPhone, keyboard: .phonePad)
                        .textContentType(.telephoneNumber)
                    SwitchRow(OkToText.label, detail: OkToText.hint, isOn: $form.textOk, inset: false)
                    OutlinedField(
                        label: "Email", text: $form.input.customerEmail, error: form.errors["customerEmail"],
                        keyboard: .emailAddress
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }
            }
        }

        private var poolCard: some View {
            VStack(alignment: .leading, spacing: 8) {
                if form.mode == .existing && !form.customerProperties.isEmpty {
                    FormCard(QuotesText.poolSection) {
                        SelectField(
                            label: "Pool", selection: $form.propertyId,
                            options: form.customerProperties.map { Optional($0.id) } + [nil],
                            optionLabel: { id in
                                id.flatMap { id in form.properties.first { $0.id == id } }.map { addressText($0) }
                                    ?? "Another address…"
                            })
                    }
                    if form.newPool {
                        AddressCard(
                            input: $form.input, error: form.errors["addressLine1"], suggester: suggester,
                            streetFocused: $streetFocused)
                    }
                } else {
                    AddressCard(
                        title: QuotesText.poolSection, input: $form.input, error: form.errors["addressLine1"],
                        suggester: suggester, streetFocused: $streetFocused)
                }
                if form.newPool {
                    Text(QuotesText.poolFooter)
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                }
            }
        }

        private func save() {
            // Each save makes a quote of its own: one per screen.
            guard !created else { return }
            do {
                let id = try form.save()
                created = true
                saved += 1
                onCreated(id)
            } catch NewJobFormError.invalid {
                // The fields show what to fix.
            } catch {
                saveProblem = userMessage(error)
            }
        }
    }
#endif
