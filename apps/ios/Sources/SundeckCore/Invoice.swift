import Foundation

// Invoices (BUILD_PLAN 6.4, M9). Item lines are taxed like quote lines: the discount comes off
// before tax, shared between taxable and untaxed lines. Deposit credits come off after tax. The
// database computes the same totals when an invoice is sent (app.invoice_totals in
// 20261012001500_invoices.sql).

/// An invoice's status. Port of invoice.ts.
public enum InvoiceStatus: String, Codable, CaseIterable, Sendable {
    case draft, sent, paid, void
    case partiallyPaid = "partially_paid"

    public var label: String {
        switch self {
        case .draft: "Draft"
        case .sent: "Sent"
        case .partiallyPaid: "Partly paid"
        case .paid: "Paid"
        case .void: "Void"
        }
    }
}

/// The amounts of an invoice row that `invoiceBalance` reads.
public struct Invoice: Codable, Equatable, Sendable {
    public var totalCents: Cents
    public var amountPaidCents: Cents

    public init(totalCents: Cents, amountPaidCents: Cents) {
        self.totalCents = totalCents
        self.amountPaidCents = amountPaidCents
    }

    enum CodingKeys: String, CodingKey {
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
    }
}

/// An invoice line: an item, or a deposit already paid.
public struct InvoiceLine: Codable, Equatable, Sendable, PricedLine {
    public enum Kind: String, Codable, Sendable {
        case item
        case depositCredit = "deposit_credit"
    }

    public var id: String?
    public var kind: Kind
    public var description: String?
    public var quantity: Double
    /// Negative for deposit credits.
    public var unitPriceCents: Cents
    public var taxable: Bool
    public var sortOrder: Int?
    public var deletedAt: String?

    public init(
        id: String? = nil, kind: Kind, description: String? = nil, quantity: Double, unitPriceCents: Cents,
        taxable: Bool, sortOrder: Int? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.description = description
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.taxable = taxable
        self.sortOrder = sortOrder
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, description, quantity, taxable
        case unitPriceCents = "unit_price_cents"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }
}

/// An invoice's totals.
public struct InvoiceTotals: Codable, Equatable, Sendable {
    public var subtotalCents: Cents
    public var discountCents: Cents
    public var taxCents: Cents
    /// Deposits already paid, as a positive amount.
    public var creditCents: Cents
    public var totalCents: Cents

    enum CodingKeys: String, CodingKey {
        case subtotalCents = "subtotal_cents"
        case discountCents = "discount_cents"
        case taxCents = "tax_cents"
        case creditCents = "credit_cents"
        case totalCents = "total_cents"
    }
}

/// Totals for an invoice: items taxed like a quote's, deposit credits taken off after tax.
public func invoiceTotals(_ lines: [InvoiceLine], _ discountCents: Cents, _ taxRateBps: Int) -> InvoiceTotals {
    let live = lines.filter { isLiveLine($0.deletedAt) }
    let items = live.filter { $0.kind == .item }
    let subtotal = items.reduce(0) { $0 + lineTotal($1) }
    let taxable = items.filter(\.taxable).reduce(0) { $0 + lineTotal($1) }
    let credit = live.filter { $0.kind == .depositCredit }.reduce(0) { $0 - lineTotal($1) }
    let discount = min(max(0, discountCents), subtotal)
    let taxableDiscount = subtotal == 0 ? 0 : roundCentsHalfAway(Double(discount * taxable) / Double(subtotal))
    let tax = roundCentsHalfAway(Double((taxable - taxableDiscount) * taxRateBps) / 10_000)
    return InvoiceTotals(
        subtotalCents: subtotal, discountCents: discount, taxCents: tax, creditCents: credit,
        totalCents: subtotal - discount + tax - credit)
}

/// What is still owed.
public func invoiceBalance(_ invoice: Invoice) -> Cents {
    max(0, invoice.totalCents - invoice.amountPaidCents)
}

/// The text a tech sends with the invoice link.
public func invoiceShareText(_ shopName: String, _ link: String) -> String {
    "\(shopName): your invoice. View and pay it here: \(link)"
}

// MARK: - The Invoices list's filters and sorting (owner, 2026-10-20)

public enum InvoiceFilter: String, CaseIterable, Sendable {
    case all, open, overdue, draft, paid, void

    public var label: String {
        switch self {
        case .all: "All"
        case .open: "Unpaid"
        case .overdue: "Overdue"
        case .draft: "Drafts"
        case .paid: "Paid"
        case .void: "Void"
        }
    }
}

public enum InvoiceSort: String, CaseIterable, Sendable {
    case newest, oldest, due, balance, total, customer

    public var label: String {
        switch self {
        case .newest: "Newest"
        case .oldest: "Oldest"
        case .due: "Due Date"
        case .balance: "Amount Owed"
        case .total: "Total"
        case .customer: "Customer"
        }
    }
}

/// What the Invoices list filters and sorts on (core `InvoiceListItem`).
public struct InvoiceFilterItem: Codable, Equatable, Sendable {
    public var number: Int?
    public var status: InvoiceStatus
    public var totalCents: Cents
    public var amountPaidCents: Cents
    /// YYYY-MM-DD
    public var dueDate: String?
    public var sentAt: String?
    public var customer: String?
    public var jobNumber: Int?

    enum CodingKeys: String, CodingKey {
        case number, status, customer, jobNumber
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
        case dueDate = "due_date"
        case sentAt = "sent_at"
    }

    public init(
        number: Int?, status: InvoiceStatus, totalCents: Cents, amountPaidCents: Cents, dueDate: String?,
        sentAt: String?, customer: String?, jobNumber: Int? = nil
    ) {
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.amountPaidCents = amountPaidCents
        self.dueDate = dueDate
        self.sentAt = sentAt
        self.customer = customer
        self.jobNumber = jobNumber
    }

    var isOpen: Bool { status == .sent || status == .partiallyPaid }
    var balance: Cents { max(0, totalCents - amountPaidCents) }
}

/// Sent and not fully paid, past its due date (YYYY-MM-DD, the shop's today).
public func invoiceOverdue(_ i: InvoiceFilterItem, _ today: String) -> Bool {
    i.isOpen && (i.dueDate.map { !$0.isEmpty && $0 < today } ?? false)
}

/// The invoices a filter, search and sort show (`filterInvoices`). Search matches the customer's
/// name or the invoice or job number. Ties keep the list's order (newest first).
public func filterInvoices<T>(
    _ invoices: [T], item: (T) -> InvoiceFilterItem, filter: String?, sort: String?, q: String?, today: String
) -> [T] {
    let filter = filter.flatMap(InvoiceFilter.init(rawValue:)) ?? .all
    let sort = sort.flatMap(InvoiceSort.init(rawValue:)) ?? .newest
    var query = ECMA.trim(q ?? "").lowercased()
    if query.hasPrefix("#") { query.removeFirst() }
    let shown = invoices.enumerated().filter { _, t in
        let i = item(t)
        switch filter {
        case .open: if !i.isOpen { return false }
        case .overdue: if !invoiceOverdue(i, today) { return false }
        case .draft, .paid, .void: if i.status.rawValue != filter.rawValue { return false }
        case .all: break
        }
        if query.isEmpty { return true }
        return (i.customer ?? "").lowercased().contains(query) || i.number.map { String($0) == query } == true
            || i.jobNumber.map { String($0) == query } == true
    }
    let locale = Locale(identifier: "en_US")
    func order(_ a: InvoiceFilterItem, _ b: InvoiceFilterItem) -> ComparisonResult {
        switch sort {
        case .newest, .oldest: return .orderedSame
        case .due: return (a.dueDate ?? "9999").compare(b.dueDate ?? "9999")
        case .balance:
            return a.balance == b.balance
                ? .orderedSame : a.balance > b.balance ? .orderedAscending : .orderedDescending
        case .total:
            return a.totalCents == b.totalCents
                ? .orderedSame : a.totalCents > b.totalCents ? .orderedAscending : .orderedDescending
        case .customer:
            return (a.customer ?? "\u{FFFF}").compare(b.customer ?? "\u{FFFF}", locale: locale)
        }
    }
    return shown.sorted { x, y in
        let r = order(item(x.element), item(y.element))
        if r != .orderedSame { return r == .orderedAscending }
        return sort == .oldest ? y.offset < x.offset : x.offset < y.offset
    }.map(\.element)
}

public func filterInvoices(
    _ invoices: [InvoiceFilterItem], filter: String?, sort: String?, q: String?, today: String
) -> [InvoiceFilterItem] {
    filterInvoices(invoices, item: { $0 }, filter: filter, sort: sort, q: q, today: today)
}
