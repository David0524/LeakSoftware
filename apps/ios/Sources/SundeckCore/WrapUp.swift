import Foundation

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md):
// a row per step in order (Report, each quote, Customer signs, each invoice), each with its
// state in words, the next step marked, and one button naming the next step's action.
// Port of packages/core/src/wrap-up.ts.

public enum WrapUpStep: String, Codable, Sendable {
    case report, quote, sign, invoice
}

/// One quote on the job. Port of WrapUpQuote.
public struct WrapUpQuote: Codable, Equatable, Sendable {
    public var id: String
    public var number: Int?
    public var status: QuoteStatus
    public var totalCents: Cents
    /// A deposit payment went through.
    public var depositPaid: Bool

    enum CodingKeys: String, CodingKey {
        case id, number, status, depositPaid
        case totalCents = "total_cents"
    }

    public init(id: String, number: Int?, status: QuoteStatus, totalCents: Cents, depositPaid: Bool) {
        self.id = id
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.depositPaid = depositPaid
    }
}

/// One invoice on the job. Port of WrapUpInvoice.
public struct WrapUpInvoice: Codable, Equatable, Sendable {
    public var id: String
    public var number: Int?
    public var status: InvoiceStatus
    public var totalCents: Cents
    public var amountPaidCents: Cents

    enum CodingKeys: String, CodingKey {
        case id, number, status
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
    }

    public init(id: String, number: Int?, status: InvoiceStatus, totalCents: Cents, amountPaidCents: Cents) {
        self.id = id
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.amountPaidCents = amountPaidCents
    }
}

/// What the finish list is worked out from. Port of WrapUpInput.
public struct WrapUpInput: Codable, Equatable, Sendable {
    public var jobType: String
    public var customer: String?
    /// The shop uses the homeowner report.
    public var reportOn: Bool
    /// The report has a draft with text to read.
    public var hasDraft: Bool
    /// The newest finished (sent) version's number.
    public var sentVersion: Int?
    /// Why the newest finished version wasn't signed.
    public var unsignedReason: String?
    public var findings: Int
    public var tests: Int
    /// Who signed the report's sign-off (not work authorization or quote acceptance).
    public var signers: [String]
    public var quotes: [WrapUpQuote]
    /// The job's invoices; voided ones are left out of the list.
    public var invoices: [WrapUpInvoice]

    public init(
        jobType: String, customer: String?, reportOn: Bool, hasDraft: Bool, sentVersion: Int?,
        unsignedReason: String?, findings: Int, tests: Int, signers: [String], quotes: [WrapUpQuote],
        invoices: [WrapUpInvoice]
    ) {
        self.jobType = jobType
        self.customer = customer
        self.reportOn = reportOn
        self.hasDraft = hasDraft
        self.sentVersion = sentVersion
        self.unsignedReason = unsignedReason
        self.findings = findings
        self.tests = tests
        self.signers = signers
        self.quotes = quotes
        self.invoices = invoices
    }
}

/// One row of the list. Port of WrapUpRow. Not `Identifiable`: its `id` is the quote or invoice
/// (nil for Report and Customer signs), so lists key rows by `key` (`ForEach(rows, id: \.key)`).
public struct WrapUpRow: Codable, Equatable, Sendable {
    /// "report", "sign", "quote:<id>", "invoice:<id>" or "invoice".
    public var key: String
    public var step: WrapUpStep
    /// The step's number (quote rows share one, as do invoice rows).
    public var number: Int
    public var title: String
    public var detail: String
    /// Quotes and invoices: the total.
    public var amount: String?
    public var done: Bool
    /// The next thing to do: a blue marker.
    public var next: Bool
    /// What tapping the row opens.
    public var opens: WrapUpStep
    /// The quote or invoice the row is about.
    public var id: String?
    /// What VoiceOver reads: "Step 3 of 4, Customer signs, not yet, next".
    public var spoken: String
}

/// The step the bottom button does. Port of WrapUpNext.
public struct WrapUpNext: Codable, Equatable, Sendable {
    public var step: WrapUpStep
    public var id: String?
    public var action: String
}

/// The finish list. Port of WrapUp.
public struct WrapUp: Codable, Equatable, Sendable {
    public var rows: [WrapUpRow]
    public var done: Int
    public var total: Int
    /// "Maria Alvarez · 2 of 4 done", "Maria Alvarez · All done".
    public var subtitle: String
    /// Nil when every step is done: the button is hidden.
    public var next: WrapUpNext?
    /// The "New Quote" row under the list.
    public var canStartQuote: Bool
}

/// The bottom button's words for each step. Port of WRAP_UP_ACTIONS.
public let wrapUpActions: [WrapUpStep: String] = [
    .report: "Write the Draft",
    .quote: "Send Quote",
    .sign: "Review with Customer",
    .invoice: "Send Invoice",
]

public let newQuoteLabel = "New Quote"

private func plural(_ n: Int, _ one: String) -> String { "\(n) \(one)\(n == 1 ? "" : "s")" }

private func lowerFirst(_ s: String) -> String { s.prefix(1).lowercased() + s.dropFirst() }

private func trimmed(_ s: String?) -> String? {
    let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return t.isEmpty ? nil : t
}

private func reportDetail(_ i: WrapUpInput) -> String {
    if i.hasDraft {
        let parts = [
            i.findings > 0 ? plural(i.findings, "finding") : nil, i.tests > 0 ? plural(i.tests, "test") : nil,
        ]
        .compactMap { $0 }
        return parts.isEmpty ? "Draft ready" : "Draft ready · " + parts.joined(separator: ", ")
    }
    if let v = i.sentVersion { return "Sent · version \(v)" }
    return "Not written yet"
}

private func quoteDetail(_ q: WrapUpQuote) -> String {
    switch q.status {
    case .draft: "Draft · not sent"
    case .sent: "Sent · waiting"
    case .accepted: q.depositPaid ? "Accepted · deposit paid" : "Accepted"
    case .declined: "Declined"
    case .expired: "Expired"
    }
}

private func invoiceDetail(_ v: WrapUpInvoice) -> String {
    let due = formatCents(max(0, v.totalCents - v.amountPaidCents))
    switch v.status {
    case .draft: return "Draft · not sent"
    case .sent: return "Sent · \(due) due"
    case .partiallyPaid: return "Partly paid · \(due) due"
    case .paid: return "Paid"
    case .void: return "Void"
    }
}

/// Oldest number first, unnumbered last, otherwise in the order given.
private func byNumber<T>(_ items: [T], _ number: (T) -> Int?) -> [T] {
    items.enumerated()
        .sorted { a, b in
            let x = number(a.element) ?? Int.max
            let y = number(b.element) ?? Int.max
            return x != y ? x < y : a.offset < b.offset
        }
        .map(\.element)
}

private struct Pending {
    var key: String
    var step: WrapUpStep
    var title: String
    var detail: String
    var amount: String?
    var done: Bool
    var opens: WrapUpStep
    var id: String?
}

/// The finish list for one job's Wrap-Up. Port of wrapUp.
public func wrapUp(_ input: WrapUpInput) -> WrapUp {
    var groups: [(step: WrapUpStep, rows: [Pending])] = []
    let reportDone = input.hasDraft || input.sentVersion != nil

    if input.reportOn {
        groups.append(
            (
                .report,
                [
                    Pending(
                        key: "report", step: .report, title: "Report", detail: reportDetail(input), done: reportDone,
                        opens: .report)
                ]
            ))
    }

    // A repair job is the quote's work: it has no quote rows.
    let quotes = input.jobType == "repair" ? [] : byNumber(input.quotes, \.number)
    if !quotes.isEmpty {
        groups.append(
            (
                .quote,
                quotes.map { q in
                    Pending(
                        key: "quote:\(q.id)", step: .quote, title: q.number.map { "Quote #\($0)" } ?? "Quote",
                        detail: quoteDetail(q), amount: formatCents(q.totalCents), done: q.status != .draft,
                        opens: .quote, id: q.id)
                }
            ))
    }

    if input.reportOn {
        var signers: [String] = []
        for s in input.signers {
            if let name = trimmed(s), !signers.contains(name) { signers.append(name) }
        }
        let reason = trimmed(input.unsignedReason)
        // Sent without a signature and without a reason: nothing is left to sign.
        let sentUnsigned = !input.hasDraft && input.sentVersion != nil
        let done = !signers.isEmpty || reason != nil || sentUnsigned
        let detail: String =
            if !signers.isEmpty {
                "Signed by " + signers.joined(separator: ", ")
            } else if let reason {
                "Not signed: " + lowerFirst(reason)
            } else if sentUnsigned {
                "Sent without a signature"
            } else if reportDone {
                "Not yet"
            } else {
                "Write the report first"
            }
        groups.append(
            (
                .sign,
                [
                    Pending(
                        key: "sign", step: .sign, title: "Customer signs", detail: detail, done: done,
                        // Nothing to sign before the report has a draft.
                        opens: done || reportDone ? .sign : .report)
                ]
            ))
    }

    let invoices = byNumber(input.invoices.filter { $0.status != .void }, \.number)
    groups.append(
        (
            .invoice,
            invoices.isEmpty
                ? [
                    Pending(
                        key: "invoice", step: .invoice, title: "Invoice", detail: "Not started", done: false,
                        opens: .invoice)
                ]
                : invoices.map { v in
                    Pending(
                        key: "invoice:\(v.id)", step: .invoice, title: v.number.map { "Invoice #\($0)" } ?? "Invoice",
                        detail: invoiceDetail(v), amount: formatCents(v.totalCents), done: v.status != .draft,
                        opens: .invoice, id: v.id)
                }
        ))

    let total = groups.count
    let groupDone = groups.map { $0.rows.allSatisfy(\.done) }
    let done = groupDone.filter { $0 }.count
    var nextGroup = groupDone.firstIndex(of: false)
    // Customer signs can't be next before the report has a draft.
    if let g = nextGroup, groups[g].step == .sign, !reportDone { nextGroup = nil }

    var next: WrapUpNext?
    var rows: [WrapUpRow] = []
    for (gi, group) in groups.enumerated() {
        let number = gi + 1
        // The next step's first unfinished row carries the blue marker.
        let nextKey = gi == nextGroup ? group.rows.first { !$0.done }?.key : nil
        if let nextKey, let row = group.rows.first(where: { $0.key == nextKey }) {
            next = WrapUpNext(step: group.step, id: row.id, action: wrapUpActions[group.step] ?? "")
        }
        for r in group.rows {
            let isNext = r.key == nextKey
            let spoken = [
                "Step \(number) of \(total)", r.title,
                lowerFirst(r.detail.replacingOccurrences(of: " · ", with: ", ")), r.amount,
                r.done ? "done" : isNext ? "next" : nil,
            ]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
            rows.append(
                WrapUpRow(
                    key: r.key, step: r.step, number: number, title: r.title, detail: r.detail, amount: r.amount,
                    done: r.done, next: isNext, opens: r.opens, id: r.id, spoken: spoken))
        }
    }

    let counted = done == total ? "All done" : "\(done) of \(total) done"
    let customer = trimmed(input.customer)
    return WrapUp(
        rows: rows, done: done, total: total, subtitle: customer.map { "\($0) · \(counted)" } ?? counted, next: next,
        canStartQuote: input.jobType != "repair"
            && !input.quotes.contains { $0.status == .draft || $0.status == .accepted })
}
