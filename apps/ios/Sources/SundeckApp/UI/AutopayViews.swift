#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Autopay (docs/design/2026-11-16-autopay.md): the customer page's Autopay group and an
    // invoice's Charge Card on File, as the website's components/autopay.tsx and the Android app's
    // features/autopay/AutopayGroup.tsx, with the same words.

    /// The customer page's Autopay group (owners and admins).
    struct AutopayGroup: View {
        var customer: CustomerDetail
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @State private var busy = false
        @State private var message: (error: Bool, text: String)?
        @State private var confirmTurnOff = false
        @State private var confirmRemove = false
        @State private var requesting = false

        var body: some View {
            let _ = sync.revision
            let company = session.company
            let method = company.flatMap { savedMethod(sync.store, companyId: $0.id, customerId: customer.id) }
            let shopOn = autopaySettings(company?.settings).on
            let status = autopayStatus(customer.autopay, method)
            let today = company.flatMap { try? localDate(Date(), $0.timeZone) } ?? ""
            VStack(alignment: .leading, spacing: 12) {
                Grouped(
                    label: AutopayText.group,
                    footer: autopayGroupFooter(shopOn: shopOn, customerAutopay: customer.autopay, method: method)
                ) {
                    ListRow(AutopayText.status, value: status.value)
                    if let method {
                        ListRow(savedMethodLabel(method), detail: savedMethodDetail(method, today: today))
                    } else {
                        Text(AutopayText.noMethod)
                            .textRole(.body)
                            .foregroundStyle(Color.textMuted)
                            .padding(.horizontal, 16)
                            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    }
                    if method != nil && customer.autopay {
                        ActionRow(AutopayText.turnOff) { confirmTurnOff = true }
                    }
                    if method != nil && !customer.autopay && shopOn {
                        ActionRow(AutopayText.turnOn) { Task { await run(.turnOn) } }
                    }
                    ActionRow(AutopayText.request) { requesting = true }
                    if method != nil {
                        ActionRow(AutopayText.remove, role: .destructive) { confirmRemove = true }
                    }
                }
                .disabled(busy)
                if let message { Notice(kind: message.error ? .error : .success, text: message.text) }
            }
            .alert(AutopayText.turnOffTitle, isPresented: $confirmTurnOff) {
                Button("Cancel", role: .cancel) {}
                Button(AutopayText.turnOff) { Task { await run(.turnOff) } }
            } message: {
                Text(AutopayText.turnOffMessage)
            }
            .confirmationDialog(AutopayText.removeTitle, isPresented: $confirmRemove, titleVisibility: .visible) {
                Button(AutopayText.remove, role: .destructive) { Task { await run(.remove) } }
            } message: {
                Text(AutopayText.removeMessage)
            }
            .confirmationDialog(AutopayText.requestTitle, isPresented: $requesting, titleVisibility: .visible) {
                if let email = customer.email {
                    Button("Email \(email)") { Task { await run(.request, channel: .email) } }
                }
                if customer.phone != nil, texting {
                    Button("Text from Shop Number") { Task { await run(.request, channel: .text) } }
                }
                if customer.phone != nil {
                    Button("Text from My Phone") { Task { await textFromPhone() } }
                }
            } message: {
                Text(
                    customer.email == nil && customer.phone == nil
                        ? "Add the customer’s email or mobile number first." : AutopayText.requestMessage)
            }
        }

        /// The shop has a working company number, so the link can go from it.
        private var texting: Bool {
            companyLine(sync.store, companyId: session.company?.id ?? "")?.status == "active"
        }

        private func run(_ action: AutopayServer.Action, channel: AutopayServer.Channel = .link) async {
            guard !busy else { return }
            busy = true
            defer { busy = false }
            message = nil
            do {
                let reply = try await AutopayServer.run(
                    app.api, sync: sync, customerId: customer.id, action: action, channel: channel)
                message = (false, reply.message)
            } catch {
                message = (true, MonthlyBillingServer.message(error, sending: action == .request))
            }
        }

        /// The link in the phone's own Messages, as an invoice's link is texted.
        private func textFromPhone() async {
            guard !busy else { return }
            busy = true
            defer { busy = false }
            message = nil
            do {
                let reply = try await AutopayServer.run(
                    app.api, sync: sync, customerId: customer.id, action: .request, channel: .link)
                let to = (customer.phone ?? "").filter { $0.isNumber || $0 == "+" }
                var parts = URLComponents()
                parts.scheme = "sms"
                parts.path = to
                parts.queryItems = [URLQueryItem(name: "body", value: reply.text ?? reply.link ?? "")]
                if let url = parts.url { openURL(url) }
            } catch {
                message = (true, MonthlyBillingServer.message(error, sending: true))
            }
        }
    }

    /// An invoice's automatic charge ("Paid automatically with Visa •••• 4242", or the failure),
    /// and Charge Card on File for owners and admins while something is owed.
    struct InvoiceAutopayRows: View {
        var invoiceId: String
        var customerId: String?
        var customerName: String
        var balanceCents: Int
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var busy = false
        @State private var confirming = false
        @State private var message: (error: Bool, text: String)?

        var body: some View {
            let _ = sync.revision
            let company = session.company
            let row = (try? sync.store.get("invoice", invoiceId)) ?? nil
            let autopay = row.map(autopayInvoice) ?? AutopayInvoice()
            let status = row?["status"]?.string ?? ""
            let method = company.flatMap { savedMethod(sync.store, companyId: $0.id, customerId: customerId) }
            let owed = (status == "sent" || status == "partially_paid") && balanceCents > 0
            let canCharge =
                isManagerRole(company?.role) && method != nil && owed && autopay.status != "processing"
            let line = autopayInvoiceLine(autopay)
            if line != nil || canCharge || message != nil {
                VStack(alignment: .leading, spacing: 8) {
                    if let line {
                        Text(line)
                            .textRole(.secondary)
                            .foregroundStyle(autopay.status == "failed" ? Color.fail : Color.textMuted)
                    }
                    if canCharge, let method {
                        let confirm = chargeConfirm(
                            method: method, balanceCents: balanceCents, feeBps: cardFeeBps(company?.settings),
                            customer: customerName)
                        Button {
                            confirming = true
                        } label: {
                            BusyButtonLabel(AutopayText.charge, busy: busy, busyTitle: "Charging…")
                        }
                        .buttonStyle(.secondary)
                        .disabled(busy)
                        .alert(confirm.title, isPresented: $confirming) {
                            Button("Cancel", role: .cancel) {}
                            Button(confirm.confirm) { Task { await charge() } }
                        } message: {
                            Text(confirm.message)
                        }
                    }
                    if let message { Notice(kind: message.error ? .error : .success, text: message.text) }
                }
            }
        }

        private func charge() async {
            guard !busy else { return }
            busy = true
            defer { busy = false }
            message = nil
            do {
                let r = try await AutopayServer.charge(app.api, sync: sync, invoiceId: invoiceId)
                message = (r.failed, r.message)
            } catch {
                message = (true, MonthlyBillingServer.message(error, sending: true))
            }
        }
    }
#endif
