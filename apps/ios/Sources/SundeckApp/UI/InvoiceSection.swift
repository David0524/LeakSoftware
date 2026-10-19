#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Wrap-Up's "Invoice" (spec 5.4 Wrap-Up 4; milestone S7): create it from the job, edit a
    /// draft's lines and details, send it by email or without (a link to text), then payments,
    /// the customer link, Record Payment and Void Invoice for managers. Content for the job page's
    /// scroll view. Port of apps/mobile/src/features/invoice/InvoiceSection.tsx with the website's
    /// look (apps/web/src/components/invoice-panel.tsx).
    struct InvoiceSection: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var flow: InvoiceFlow?

        var body: some View {
            let _ = sync.revision
            if let company = session.company, let flow, flow.jobId == job.id {
                let model = InvoiceSectionModel(
                    store: sync.store, companyId: company.id, settings: company.settings, role: company.role, job: job,
                    timeZone: company.timeZone)
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Invoice")
                    switch model.state {
                    case .invoice(let card):
                        InvoiceCard(card: card, job: job, flow: flow)
                    case .create(let hint):
                        VStack(alignment: .leading, spacing: 12) {
                            Text(hint).textRole(.body).foregroundStyle(Color.textMuted)
                            Button {
                                Task { await flow.create(server: MoneyServer(sync: sync, api: app.api)) }
                            } label: {
                                BusyButtonLabel("Create Invoice", busy: flow.busy == .create, busyTitle: "Creating…")
                            }
                            .buttonStyle(.secondary)
                            .disabled(flow.busy != nil)
                            if let error = flow.error { Notice(kind: .error, text: error) }
                        }
                        .card()
                    case .empty(let text):
                        EmptyState(text: text)
                    }
                    if case .invoice = model.state {
                    } else if let message = flow.message {
                        Notice(kind: .success, text: message)
                    }
                    if let voided = model.voidedText {
                        Text(voided).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if let company = session.company {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: minTarget)
                    .onAppear { flow = InvoiceFlow(sync: sync, companyId: company.id, jobId: job.id) }
            }
        }
    }

    /// The invoice card: number, status and total; the lines and totals; then the draft's Add a
    /// Line, Details and Send, or a sent invoice's payments, link, Record Payment and Void Invoice.
    private struct InvoiceCard: View {
        var card: InvoiceCardModel
        var job: JobView
        @Bindable var flow: InvoiceFlow
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @State private var removing: InvoiceLineText?
        @State private var confirmVoid = false
        @State private var description = ""
        @State private var quantity = "1"
        @State private var price = ""
        @State private var taxable = true
        @State private var discount = ""
        @State private var hasDue = false
        @State private var due = Date()
        @State private var notes = ""
        @State private var to: String?
        @State private var amount: String?
        @State private var savedDetails = false

        private var server: MoneyServer { MoneyServer(sync: sync, api: app.api) }
        private var rpc: any RPCClient { LenientRPC(client: app.client) }
        private var companyId: String { session.company?.id ?? "" }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    CardTitle(card.title)
                    Spacer(minLength: 0)
                    Text(card.totalText).font(.system(size: 20, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(Color.text)
                }
                lines
                Hairline()
                MoneyRows(rows: card.totalRows)
                if card.isDraft {
                    draftParts.padding(.top, 8)
                } else {
                    sentParts.padding(.top, 4)
                }
                if let error = flow.error { Notice(kind: .error, text: error) }
                if let message = flow.message { Notice(kind: .success, text: message) }
                if let share = flow.shareText {
                    CopyBox(label: ReportTabModel.textedLabel, text: share, button: "Copy Message")
                }
            }
            .card()
            .onAppear(perform: resetDetails)
            .onChange(of: card.invoice.invoice) { resetDetails() }
            .confirmationDialog(
                removing.map { "Remove “\($0.description)” from the invoice?" } ?? "",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { line in
                Button("Remove Line", role: .destructive) {
                    flow.edit {
                        try InvoiceWrites.removeLine(sync, companyId: companyId, invoice: card.invoice, lineId: line.id)
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog(
                card.isDraft ? InvoiceCardModel.deleteTitle : InvoiceCardModel.voidTitle, isPresented: $confirmVoid,
                titleVisibility: .visible
            ) {
                Button(card.isDraft ? "Delete Draft" : "Void Invoice", role: .destructive) {
                    Task { await flow.void(card.invoice.id, draft: card.isDraft, rpc: rpc) }
                }
                Button("Cancel", role: .cancel) {}
            }
        }

        private var lines: some View {
            VStack(spacing: 0) {
                ForEach(Array(card.lines.enumerated()), id: \.element.id) { index, line in
                    if index > 0 { Hairline() }
                    HStack(spacing: 12) {
                        (Text(line.description).foregroundColor(Color.text)
                            + Text(line.noTax ? " · no tax" : "").font(.role(.secondary)).foregroundColor(
                                Color.textMuted))
                            .font(.role(.body))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(line.amount).font(.role(.body)).monospacedDigit().foregroundStyle(Color.text)
                        if line.removable {
                            Button("Remove") { removing = line }
                                .buttonStyle(.quiet(size: .small))
                                .accessibilityLabel("Remove \(line.description)")
                        }
                    }
                    .padding(.vertical, 8)
                    .frame(minHeight: minTarget)
                }
            }
        }

        // MARK: Draft

        @ViewBuilder private var draftParts: some View {
            VStack(alignment: .leading, spacing: 12) {
                SubHeading("Add a Line")
                CommitField(
                    label: "Description", text: $description,
                    error: flow.fieldError?.field == "description" ? flow.fieldError?.description : nil)
                HStack(alignment: .top, spacing: 12) {
                    CommitField(
                        label: "Quantity", text: $quantity,
                        error: flow.fieldError?.field == "quantity" ? flow.fieldError?.description : nil,
                        keyboard: .decimalPad, numeric: true)
                    CommitField(
                        label: "Price ($)", text: $price,
                        error: flow.fieldError?.field == "price" ? flow.fieldError?.description : nil,
                        keyboard: .decimalPad, numeric: true)
                }
                Toggle(isOn: $taxable) { Text("Taxable").textRole(.body).foregroundStyle(Color.text) }
                    .tint(Color.pass)
                    .frame(minHeight: minTarget)
                Button("Add Line") {
                    let saved = flow.edit {
                        try InvoiceWrites.addLine(
                            sync, companyId: companyId, invoice: card.invoice, description: description,
                            quantity: quantity, price: price, taxable: taxable)
                    }
                    if saved {
                        description = ""
                        quantity = "1"
                        price = ""
                        taxable = true
                    }
                }
                .buttonStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                SubHeading("Details")
                HStack(alignment: .top, spacing: 12) {
                    CommitField(
                        label: "Discount ($)", text: $discount,
                        error: flow.fieldError?.field == "discount" ? flow.fieldError?.description : nil,
                        keyboard: .decimalPad, numeric: true)
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Due date")
                        if hasDue {
                            HStack(spacing: 4) {
                                DatePicker("Due date", selection: $due, displayedComponents: [.date])
                                    .labelsHidden()
                                    .datePickerStyle(.compact)
                                    .tint(Color.link)
                                Button {
                                    hasDue = false
                                } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(Color.textMuted)
                                        .frame(width: minTarget, height: minTarget)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Clear Due Date")
                            }
                        } else {
                            Button("Add Date") { hasDue = true }
                                .buttonStyle(.quiet)
                                .padding(.leading, -20)
                        }
                        FieldHint(text: InvoiceCardModel.dueHint)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                CommitField(label: "Note to the customer", text: $notes, multiline: true)
                HStack(spacing: 12) {
                    Button("Save") {
                        savedDetails = flow.edit {
                            try InvoiceWrites.saveDetails(
                                sync, companyId: companyId, invoice: card.invoice, discount: discount,
                                dueDate: hasDue ? isoDay(due) : nil, notes: notes)
                        }
                    }
                    .buttonStyle(.secondary)
                    if savedDetails { Text("Saved.").textRole(.secondary).foregroundStyle(Color.pass) }
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                SubHeading("Send")
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Customer email")
                    TextField("", text: Binding(get: { to ?? card.customerEmail }, set: { to = $0 }))
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(nil)
                        .accessibilityLabel("Customer email")
                        .fieldBox()
                    FieldHint(text: InvoiceCardModel.emailHint)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) { sendButtons }
                    VStack(alignment: .leading, spacing: 12) { sendButtons }
                }
                Text(InvoiceCardModel.sendNote).textRole(.secondary).foregroundStyle(Color.textMuted)
            }

            Button("Delete Draft") { confirmVoid = true }
                .buttonStyle(.danger)
                .disabled(flow.busy != nil)
        }

        @ViewBuilder private var sendButtons: some View {
            Button {
                Task {
                    await flow.send(
                        card.invoice.id, email: to ?? card.customerEmail, phone: job.customer?["phone"]?.string,
                        server: server)
                }
            } label: {
                BusyButtonLabel("Send by Email", busy: flow.busy == .email, busyTitle: "Sending…")
            }
            .buttonStyle(.primary)
            .disabled(flow.busy != nil)
            Button {
                Task {
                    await flow.send(card.invoice.id, email: nil, phone: job.customer?["phone"]?.string, server: server)
                }
            } label: {
                BusyButtonLabel("Send Without Email", busy: flow.busy == .withoutEmail, busyTitle: "Sending…")
            }
            .buttonStyle(.secondary)
            .disabled(flow.busy != nil)
        }

        // MARK: Sent

        @ViewBuilder private var sentParts: some View {
            if !card.payments.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(card.payments, id: \.self) { Text($0).textRole(.secondary).foregroundStyle(Color.text) }
                }
            }
            if let link = card.link {
                CopyBox(label: "Customer link", text: link.absoluteString, monospaced: true)
            }
            if card.canRecordPayment {
                VStack(alignment: .leading, spacing: 12) {
                    CommitField(
                        label: "Amount received ($)",
                        text: Binding(get: { amount ?? card.balanceText }, set: { amount = $0 }),
                        hint: InvoiceCardModel.paymentHint, keyboard: .decimalPad, numeric: true)
                    Button {
                        Task {
                            await flow.recordPayment(card.invoice.id, amount: amount ?? card.balanceText, rpc: rpc)
                            amount = nil
                        }
                    } label: {
                        BusyButtonLabel("Record Payment", busy: flow.busy == .payment, busyTitle: "Recording…")
                    }
                    .buttonStyle(.secondary)
                    .disabled(flow.busy != nil)
                }
            }
            if card.canVoid {
                Button("Void Invoice") { confirmVoid = true }
                    .buttonStyle(.danger)
                    .disabled(flow.busy != nil)
            }
        }

        private func resetDetails() {
            discount = card.discountText
            notes = card.notes
            if let day = card.dueDate, let date = parseDay(day) {
                hasDue = true
                due = date
            } else {
                hasDue = false
            }
        }

        private func isoDay(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }

        private func parseDay(_ day: String) -> Date? {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: day)
        }
    }

    /// Database functions that may return nothing (void_invoice): an empty reply reads as null.
    struct LenientRPC: RPCClient {
        let client: SupabaseClient

        func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
            do {
                let response = try await client.rpc(function, params: arguments).execute()
                return (try? JSONDecoder().decode(JSONValue.self, from: response.data)) ?? .null
            } catch let error as PostgrestError {
                throw WebAPI.Failure(description: error.message)
            }
        }
    }
#endif
