#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"), as on the
    // website (apps/web/src/components/payment-receipt.tsx): Record Payment says how it was paid,
    // then Send Receipt offers Email or Text (with a company number) or Not Now.

    /// Record Payment's Paid by (Cash | Check | Other) and, for a check, its number.
    struct PaymentMethodFields: View {
        @Binding var method: ManualPaymentMethod
        @Binding var checkNumber: String
        var error: String?

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel(ReceiptText.methodLabel)
                    Segmented(
                        selection: $method, options: ManualPaymentMethod.allCases, label: \.label,
                        title: ReceiptText.methodLabel, fillsWidth: true)
                }
                if method == .check {
                    CommitField(
                        label: ReceiptText.checkNumberLabel, text: $checkNumber, hint: ReceiptText.checkNumberHint,
                        error: error, keyboard: .numbersAndPunctuation)
                }
            }
        }
    }

    /// Send Receipt, as a sheet: what was recorded, Email | Text (Text only with a company
    /// number), the customer's address or number, then Send Receipt or Not Now. `done` gets the
    /// result line once sent, or nil for Not Now and Cancel.
    struct SendReceiptSheet: View {
        @State var form: ReceiptForm
        var done: (String?) -> Void
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(spacing: 4) {
                            if let status = form.start.status {
                                Text(receiptPrompt(status: status)).textRole(.bodyEmphasis)
                                    .foregroundStyle(Color.text)
                            }
                            if !form.start.summary.isEmpty {
                                Text(form.start.summary).textRole(.secondary).monospacedDigit()
                                    .foregroundStyle(Color.textMuted)
                            }
                        }
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        if form.texting {
                            VStack(alignment: .leading, spacing: 4) {
                                FieldLabel("Send by")
                                Segmented(
                                    selection: $form.channel, options: ReceiptChannel.allCases, label: \.label,
                                    title: "Send by", fillsWidth: true)
                            }
                        }
                        if form.channel == .email {
                            CommitField(
                                label: ReceiptText.emailLabel, text: $form.email,
                                hint: "Their other emails get it too.",
                                error: form.error, keyboard: .emailAddress)
                        } else {
                            CommitField(
                                label: ReceiptText.phoneLabel, text: $form.phone, hint: ReceiptText.textHint,
                                error: form.error, keyboard: .phonePad)
                        }
                        VStack(spacing: 12) {
                            Button {
                                Task {
                                    if let sent = await form.send(server: MoneyServer(sync: sync, api: app.api)) {
                                        done(sent)
                                    }
                                }
                            } label: {
                                BusyButtonLabel(ReceiptText.send, busy: form.busy, busyTitle: "Sending…")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.primary)
                            .disabled(form.busy)
                            Button {
                                done(nil)
                            } label: {
                                Text(ReceiptText.notNow).frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.secondary)
                            .disabled(form.busy)
                        }
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle(ReceiptText.send)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                }
                .onChange(of: form.channel) { form.error = nil }
            }
            .sheetPresentation(detents: [.medium, .large])
        }
    }

    /// Record Payment from the Invoices list, as a sheet: the amount (the balance to start), Paid
    /// by, and a check's number, through the invoice card's own server call. `done` gets the flow
    /// once it's saved (its `receipt` opens Send Receipt next), or nil for Cancel.
    struct RecordPaymentSheet: View {
        var title: String
        var invoice: InvoiceRecord
        @State var flow: InvoiceFlow
        var done: (InvoiceFlow?) -> Void
        @Environment(AppEnvironment.self) private var app
        @State private var amount: String
        @State private var method = ManualPaymentMethod.cash
        @State private var checkNumber = ""

        init(title: String, invoice: InvoiceRecord, flow: InvoiceFlow, done: @escaping (InvoiceFlow?) -> Void) {
            self.title = title
            self.invoice = invoice
            _flow = State(initialValue: flow)
            self.done = done
            _amount = State(initialValue: centsFieldText(invoice.balanceCents))
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(title).textRole(.secondary).foregroundStyle(Color.textMuted)
                            .frame(maxWidth: .infinity)
                        CommitField(
                            label: "Amount received ($)", text: $amount, hint: InvoiceCardModel.paymentHint,
                            keyboard: .decimalPad, numeric: true)
                        PaymentMethodFields(method: $method, checkNumber: $checkNumber)
                        if let error = flow.error { Notice(kind: .error, text: error) }
                        Button {
                            Task {
                                await flow.recordPayment(
                                    invoice.id, amount: amount, method: method, checkNumber: checkNumber,
                                    totalCents: invoice.totalCents, paidCents: invoice.amountPaidCents,
                                    rpc: LenientRPC(client: app.client))
                                if flow.error == nil { done(flow) }
                            }
                        } label: {
                            BusyButtonLabel("Record Payment", busy: flow.busy == .payment, busyTitle: "Recording…")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.primary)
                        .disabled(flow.busy != nil)
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("Record Payment")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
        }
    }

    extension View {
        /// Presents Send Receipt for `start` (the job's customer's email and phone to start).
        func sendReceiptSheet(
            _ start: Binding<ReceiptStart?>, email: String?, phone: String?, texting: Bool,
            done: @escaping (String) -> Void
        ) -> some View {
            sheet(item: start) { s in
                SendReceiptSheet(
                    form: ReceiptForm(start: s, email: email, phone: phone, texting: texting)
                ) { sent in
                    start.wrappedValue = nil
                    if let sent { done(sent) }
                }
            }
        }
    }
#endif
