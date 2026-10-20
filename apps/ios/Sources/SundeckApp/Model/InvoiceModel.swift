import Foundation
import Observation
import SundeckCore
import SundeckSync

// The Wrap-Up section's Invoice (spec 5.4 Invoice; milestone S7): which state the job is in, what
// the invoice card shows, and the draft edits, sending, payments and voiding. Port of
// apps/mobile/src/features/invoice/InvoiceSection.tsx with the website's look and words
// (apps/web/src/components/invoice-panel.tsx, app/actions/invoices.ts). Linux-tested.

/// One line on the invoice card: "Skimmer repair × 2 · no tax", its amount, and Remove on drafts.
public struct InvoiceLineText: Equatable, Sendable, Identifiable {
    public var id: String
    public var description: String
    /// " · no tax", in muted, when the shop charges tax and this line has none.
    public var noTax: Bool
    public var amount: String
    public var removable: Bool
}

/// The invoice card (spec 5.4 Invoice).
public struct InvoiceCardModel: Equatable, Sendable {
    public var invoice: JobInvoice
    /// "Invoice #1025 · Draft"
    public var title: String
    public var totalText: String
    public var lines: [InvoiceLineText]
    /// Subtotal, Discount, Tax, Deposit paid, Total; then Paid and Balance due once sent.
    public var totalRows: [MoneyRow]
    public var isDraft: Bool
    /// "$375.00 · Card · received · Oct 15, 2026"
    public var payments: [String]
    public var link: URL?
    /// Managers: "Amount received ($)" and Record Payment while something is owed.
    public var canRecordPayment: Bool
    /// The balance, prefilled in the amount field.
    public var balanceText: String
    /// Managers: Void Invoice while nothing is paid.
    public var canVoid: Bool
    public var customerEmail: String
    /// The draft's Details as saved.
    public var discountText: String
    public var dueDate: String?
    public var notes: String

    public static let sendNote = "Sending locks the invoice and gives you a link for the customer."
    public static let emailHint = "Their other emails get it too."
    public static let dueHint = "Empty: due on receipt."
    public static let paymentHint = "A check, cash, or anything paid outside Sundeck Pro."
    public static let deleteTitle = "Delete this draft invoice?"
    public static let voidTitle = "Void this invoice? The customer's link will show it as void."
}

/// What the Invoice part shows.
public enum InvoiceState: Equatable, Sendable {
    case invoice(InvoiceCardModel)
    /// A card with the hint and Create Invoice.
    case create(hint: String)
    /// An empty state: maintenance visits are billed monthly, or the job hasn't started.
    case empty(String)
}

/// The job's Invoice part (spec 5.4): the current invoice or how to make one, and the voided ones.
public struct InvoiceSectionModel: Equatable, Sendable {
    public var state: InvoiceState
    /// "Voided: #1025 ($649.00), #1020 ($0.00)"
    public var voidedText: String?

    /// Statuses where the job's work has started, so it can be invoiced.
    public static let invoiceable: Set<JobStatus> = [.inProgress, .reportSent, .quoteSent, .quoteAccepted, .invoiced]
    public static let notStarted = "Start the job before invoicing it."
    public static let monthly =
        "Finished visits are billed once a month, one invoice per customer, from the Invoices page."
    public static let onMonthly = "This visit is on the customer’s monthly invoice. Find it on the Invoices page."

    public init(
        store: LocalStore, companyId: String, settings: JSONValue?, role: String?, job: JobView, timeZone: String,
        webURL: URL? = AppConfig.webURL
    ) {
        let invoices = jobInvoices(store, companyId: companyId, jobId: job.id)
        let voided = invoices.filter { $0.invoice.status == .void }
        voidedText =
            voided.isEmpty
            ? nil
            : "Voided: "
                + voided.map { "#\($0.invoice.number.map(String.init) ?? "") (\(formatCents($0.invoice.totalCents)))" }
                .joined(separator: ", ")
        if let current = invoices.first(where: { $0.invoice.status != .void }) {
            state = .invoice(
                Self.card(
                    current, settings: settings, manager: isManagerRole(role),
                    customerEmail: job.customer?["email"]?.string,
                    timeZone: timeZone, webURL: webURL))
        } else if job.type == .maintenance {
            state = .empty(job.job["billed_invoice_id"]?.string != nil ? Self.onMonthly : Self.monthly)
        } else if Self.invoiceable.contains(job.status) {
            let fee = job.job["fee_cents"]?.number.map { Int($0) } ?? 0
            state = .create(
                hint: job.type == .repair
                    ? "Copies the accepted quote and credits the deposit already paid. You can change it before sending."
                    : fee > 0
                        ? "Bills the detection fee of \(formatCents(fee)). You can add lines before sending."
                        : "Starts an empty invoice. Add the lines before sending.")
        } else {
            state = .empty(Self.notStarted)
        }
    }

    static func card(
        _ inv: JobInvoice, settings: JSONValue?, manager: Bool, customerEmail: String?, timeZone: String,
        webURL: URL?
    ) -> InvoiceCardModel {
        let invoice = inv.invoice
        let rate = settings?["tax_rate_bps"]?.number.map { Int($0) } ?? 0
        let draft = invoice.status == .draft
        let computed = invoiceTotals(inv.lines, invoice.discountCents, rate)
        // A sent invoice shows the totals the server locked; a draft, the lines as they are now.
        let t =
            draft
            ? (
                subtotalCents: computed.subtotalCents, discountCents: computed.discountCents,
                taxCents: computed.taxCents, creditCents: computed.creditCents, totalCents: computed.totalCents
            )
            : (
                subtotalCents: invoice.subtotalCents, discountCents: invoice.discountCents, taxCents: invoice.taxCents,
                creditCents: invoice.creditCents, totalCents: invoice.totalCents
            )
        var rows = [MoneyRow("Subtotal", formatCents(t.subtotalCents))]
        if t.discountCents > 0 { rows.append(MoneyRow("Discount", "−" + formatCents(t.discountCents))) }
        if t.taxCents > 0 { rows.append(MoneyRow("Tax", formatCents(t.taxCents))) }
        if t.creditCents > 0 { rows.append(MoneyRow("Deposit paid", "−" + formatCents(t.creditCents))) }
        rows.append(MoneyRow("Total", formatCents(t.totalCents), strong: true))
        if !draft {
            rows.append(MoneyRow("Paid", formatCents(invoice.amountPaidCents)))
            rows.append(
                MoneyRow(
                    "Balance due",
                    formatCents(
                        invoiceBalance(Invoice(totalCents: t.totalCents, amountPaidCents: invoice.amountPaidCents))),
                    strong: true))
        }
        let live = invoice.status != .void
        let paidSomething = inv.payments.contains { $0.status == "succeeded" || $0.status == "pending" }
        return InvoiceCardModel(
            invoice: inv,
            title: "Invoice" + (invoice.number.map { " #\($0)" } ?? "") + " · " + invoice.status.label,
            totalText: formatCents(t.totalCents),
            lines: inv.lines.map { l in
                InvoiceLineText(
                    id: l.id ?? "",
                    description: (l.description ?? "") + (l.quantity != 1 ? " × \(quantityText(l.quantity))" : ""),
                    noTax: l.kind == .item && !l.taxable && rate > 0, amount: formatCents(lineTotal(l)),
                    removable: draft && l.kind == .item)
            },
            totalRows: rows, isDraft: draft,
            payments: inv.payments.map { p in
                [
                    formatCents(p.amountCents), paymentMethod(p.method), paymentStatus(p.status),
                ].joined(separator: " · ") + (p.paidAt.map { " · " + mediumDate($0, timeZone: timeZone) } ?? "")
            },
            link: live ? inv.token.flatMap { token in webURL.map { invoiceURL($0, token) } } : nil,
            canRecordPayment: manager && !draft && live && invoice.balanceCents > 0,
            balanceText: centsFieldText(invoice.balanceCents),
            canVoid: manager && !draft && live && !paidSomething,
            customerEmail: customerEmail ?? "",
            discountText: invoice.discountCents > 0 ? centsFieldText(invoice.discountCents) : "",
            dueDate: invoice.dueDate, notes: invoice.notes ?? "")
    }
}

func paymentMethod(_ method: String) -> String {
    switch method {
    case "card": "Card"
    case "ach": "Bank"
    case "other": "Recorded by the office"
    default: method
    }
}

func paymentStatus(_ status: String) -> String {
    switch status {
    case "pending": "processing"
    case "succeeded": "received"
    case "failed": "failed"
    case "refunded": "refunded"
    default: status
    }
}

/// The customer's invoice page: {web}/i/{token}.
public func invoiceURL(_ webURL: URL, _ token: String) -> URL {
    webURL.appendingPathComponent("i").appendingPathComponent(token)
}

/// A draft invoice's edits, through the sync layer (the server freezes lines once it's sent).
/// An invoice line's quantity as typed ("2.5", "2,5", blank for 1), or nil when it isn't one:
/// more than 0, at most two decimals, and a real number ("1e309" is too big to be one).
public func invoiceLineQuantity(_ text: String) -> Double? {
    let q = text.trimmingCharacters(in: .whitespaces)
    guard let n = q.isEmpty ? 1 : Double(q.replacingOccurrences(of: ",", with: ".")), n.isFinite, n > 0,
        (n * 100).rounded() == n * 100
    else { return nil }
    return n
}

@MainActor
public enum InvoiceWrites {
    public struct Problem: Error, Equatable, CustomStringConvertible {
        public var field: String
        public var description: String
    }

    /// Add a Line: Description; Quantity (1 by default) and Price ($); Taxable.
    @discardableResult
    public static func addLine(
        _ sync: SyncService, companyId: String, invoice: JobInvoice, description: String, quantity: String,
        price: String, taxable: Bool
    ) throws -> String {
        try requireDraft(invoice)
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let n = invoiceLineQuantity(quantity)
        if let problem = Limits.lineDescriptionError(text) { throw Problem(field: "description", description: problem) }
        guard let n else {
            throw Problem(field: "quantity", description: "Enter a quantity like 1 or 2.5.")
        }
        guard let cents = parseDollars(price), cents >= 0 else {
            throw Problem(field: "price", description: "Enter a price like 125.")
        }
        let items = invoice.lines.filter { $0.kind == .item }
        return try sync.insert(
            "invoice_line_item", companyId: companyId,
            [
                "invoice_id": .string(invoice.id), "kind": "item", "description": .string(text),
                "quantity": .number(n), "unit_price_cents": .number(Double(cents)), "taxable": .bool(taxable),
                "sort_order": .number(Double(items.count + 1)),
            ])
    }

    public static func removeLine(_ sync: SyncService, companyId: String, invoice: JobInvoice, lineId: String) throws {
        try requireDraft(invoice)
        try sync.write("invoice_line_item", id: lineId, companyId: companyId, ["deleted_at": nowISO()])
    }

    /// Details: Discount ($), Due date (nil: due on receipt), Note to the customer.
    public static func saveDetails(
        _ sync: SyncService, companyId: String, invoice: JobInvoice, discount: String, dueDate: String?,
        notes: String
    ) throws {
        try requireDraft(invoice)
        let trimmed = discount.trimmingCharacters(in: .whitespaces)
        let cents = trimmed.isEmpty ? 0 : parseDollars(trimmed)
        guard let cents, cents >= 0 else {
            throw Problem(field: "discount", description: "Enter an amount like 50, or leave it empty.")
        }
        let subtotal = invoiceTotals(invoice.lines, 0, 0).subtotalCents
        if let tooLarge = Limits.discountTooLarge(cents, subtotal: subtotal) {
            throw Problem(field: "discount", description: tooLarge)
        }
        if let dueDate, dueDate.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) == nil {
            throw Problem(field: "due_date", description: "Pick a date.")
        }
        let note = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        try sync.write(
            "invoice", id: invoice.id, companyId: companyId,
            [
                "discount_cents": .number(Double(cents)), "due_date": dueDate.map(JSONValue.string) ?? .null,
                "notes": note.isEmpty ? .null : .string(note),
            ])
    }

    private static func requireDraft(_ invoice: JobInvoice) throws {
        guard invoice.invoice.status == .draft else {
            throw Problem(field: "", description: "This invoice has been sent and can’t be changed.")
        }
    }
}

/// The server's side of the invoice: create, send, record a payment, void or delete a draft.
@MainActor @Observable
public final class InvoiceFlow {
    public enum Action: Equatable, Sendable { case create, email, withoutEmail, payment, void }

    public var busy: Action?
    public var error: String?
    /// The field a draft edit was refused for ("description", "quantity", "price", "discount").
    public var fieldError: InvoiceWrites.Problem?
    public var message: String?
    /// After Send Without Email: the text message with the link, to copy or share.
    public var shareText: String?

    public let sync: SyncService
    public let companyId: String
    public let jobId: String

    public init(sync: SyncService, companyId: String, jobId: String) {
        self.sync = sync
        self.companyId = companyId
        self.jobId = jobId
    }

    /// Runs a local draft edit; a refusal shows under its field. Returns whether it saved.
    @discardableResult
    public func edit(_ work: () throws -> Void) -> Bool {
        do {
            try work()
            fieldError = nil
            error = nil
            return true
        } catch let problem as InvoiceWrites.Problem {
            fieldError = problem
            return false
        } catch {
            self.error = String(describing: error)
            return false
        }
    }

    private func run(_ action: Action, _ work: () async throws -> Void) async {
        busy = action
        error = nil
        message = nil
        defer { busy = nil }
        do {
            try await work()
        } catch {
            self.error = (error as? WebAPI.Failure)?.description ?? String(describing: error)
        }
    }

    public func create(server: MoneyServer) async {
        await run(.create) {
            _ = try await server.createInvoice(jobId: jobId)
            message = "Invoice drafted. Check it, then send it."
        }
    }

    /// Send by Email (to the customer's address) or Send Without Email (a link to text).
    public func send(_ invoiceId: String, email to: String?, phone: String?, server: MoneyServer) async {
        let email = to?.trimmingCharacters(in: .whitespacesAndNewlines)
        await run(email == nil ? .withoutEmail : .email) {
            if let email, email.wholeMatch(of: /\S+@\S+\.\S+/) == nil {
                throw WebAPI.Failure(description: "Enter the customer’s email.")
            }
            let sent = try await server.sendInvoice(
                invoiceId, channel: email == nil ? .smsDevice : .email, to: email ?? phone)
            if let email, sent.emailed {
                message = "Sent to \(email)."
            } else {
                message = "Invoice sent. Copy the link for the customer."
                shareText = sent.message.isEmpty ? nil : sent.message
            }
        }
    }

    /// Managers: a check, cash or anything paid outside Sundeck Pro.
    public func recordPayment(_ invoiceId: String, amount: String, rpc: any RPCClient) async {
        guard let cents = parseDollars(amount), cents > 0 else {
            error = "Enter an amount like 649."
            return
        }
        await run(.payment) {
            let reply = try await rpc.call(
                "record_invoice_payment", ["target_invoice": .string(invoiceId), "amount": .number(Double(cents))])
            await sync.syncNow()
            message = reply["status"]?.string == "paid" ? "Paid in full." : "Payment recorded."
        }
    }

    /// Void Invoice (managers, nothing paid) or Delete Draft: the server's void_invoice either way.
    public func void(_ invoiceId: String, draft: Bool, rpc: any RPCClient) async {
        await run(.void) {
            await sync.syncNow()
            _ = try await rpc.call("void_invoice", ["target_invoice": .string(invoiceId)])
            await sync.syncNow()
            message = draft ? "Draft deleted." : "Invoice voided."
        }
    }
}
