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
