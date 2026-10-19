import Foundation

// Quotes (BUILD_PLAN 6.4). All money is integer cents and rates are basis points (1% = 100).
// The database recomputes the same totals when a quote is sent (app.quote_totals in
// 20261012001300_quotes.sql).

/// Round half away from zero, for money.
func roundCentsHalfAway(_ n: Double) -> Cents {
    let magnitude = ECMA.round(abs(n))
    return Int(n < 0 ? -magnitude : magnitude)
}

/// A quote's status. Port of quote.ts.
public enum QuoteStatus: String, Codable, CaseIterable, Sendable {
    case draft, sent, accepted, declined, expired

    public var label: String {
        switch self {
        case .draft: "Draft"
        case .sent: "Sent"
        case .accepted: "Accepted"
        case .declined: "Declined"
        case .expired: "Expired"
        }
    }
}

/// How a quote's deposit is worked out (company settings `deposit`).
public struct DepositRule: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case percent, fixed }

    public var type: Kind
    public var valueBps: Int?
    public var valueCents: Cents?
    public var minimumCents: Cents?

    public init(type: Kind, valueBps: Int? = nil, valueCents: Cents? = nil, minimumCents: Cents? = 0) {
        self.type = type
        self.valueBps = valueBps
        self.valueCents = valueCents
        self.minimumCents = minimumCents
    }

    enum CodingKeys: String, CodingKey {
        case type
        case valueBps = "value_bps"
        case valueCents = "value_cents"
        case minimumCents = "minimum_cents"
    }
}

/// A quote row.
public struct Quote: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var jobId: String
    public var number: Int?
    public var status: QuoteStatus
    public var subtotalCents: Cents
    public var discountCents: Cents
    public var taxCents: Cents
    public var totalCents: Cents
    public var depositRule: DepositRule?
    public var depositCents: Cents
    public var validUntil: String?
    public var notes: String?
    public var sentAt: String?
    public var acceptedAt: String?
    public var acceptedByName: String?
    public var repairJobId: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, number, status, notes
        case companyId = "company_id"
        case jobId = "job_id"
        case subtotalCents = "subtotal_cents"
        case discountCents = "discount_cents"
        case taxCents = "tax_cents"
        case totalCents = "total_cents"
        case depositRule = "deposit_rule"
        case depositCents = "deposit_cents"
        case validUntil = "valid_until"
        case sentAt = "sent_at"
        case acceptedAt = "accepted_at"
        case acceptedByName = "accepted_by_name"
        case repairJobId = "repair_job_id"
        case deletedAt = "deleted_at"
    }
}

/// A line with a quantity and a unit price (quote and invoice lines).
public protocol PricedLine {
    var quantity: Double { get }
    var unitPriceCents: Cents { get }
}

/// A quote line.
public struct QuoteLine: Codable, Equatable, Sendable, PricedLine {
    public var id: String?
    public var quantity: Double
    public var unitPriceCents: Cents
    public var taxable: Bool
    public var description: String?
    public var findingId: String?
    public var priceBookItemId: String?
    public var sortOrder: Int?
    public var deletedAt: String?

    public init(
        id: String? = nil, quantity: Double, unitPriceCents: Cents, taxable: Bool, description: String? = nil,
        findingId: String? = nil, priceBookItemId: String? = nil, sortOrder: Int? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.taxable = taxable
        self.description = description
        self.findingId = findingId
        self.priceBookItemId = priceBookItemId
        self.sortOrder = sortOrder
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, quantity, taxable, description
        case unitPriceCents = "unit_price_cents"
        case findingId = "finding_id"
        case priceBookItemId = "price_book_item_id"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }
}

/// A price book item.
public struct PriceBookItem: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var name: String
    public var description: String?
    public var category: String?
    public var componentTypeKey: String?
    public var unit: String
    public var priceCents: Cents
    public var taxable: Bool
    public var sortOrder: Int
    public var active: Bool
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description, category, unit, taxable, active
        case companyId = "company_id"
        case componentTypeKey = "component_type_key"
        case priceCents = "price_cents"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }
}

/// A row's `deleted_at` as JavaScript reads it: unset or empty means live.
func isLiveLine(_ deletedAt: String?) -> Bool { deletedAt?.isEmpty ?? true }

/// quantity × unit price. Quantities have at most 2 decimals.
public func lineTotal(_ line: some PricedLine) -> Cents {
    let hundredths = ECMA.round(line.quantity * 100)
    return roundCentsHalfAway((hundredths * Double(line.unitPriceCents)) / 100)
}

/// A quote's totals.
public struct QuoteTotals: Codable, Equatable, Sendable {
    public var subtotalCents: Cents
    public var discountCents: Cents
    public var taxCents: Cents
    public var totalCents: Cents
    public var depositCents: Cents

    enum CodingKeys: String, CodingKey {
        case subtotalCents = "subtotal_cents"
        case discountCents = "discount_cents"
        case taxCents = "tax_cents"
        case totalCents = "total_cents"
        case depositCents = "deposit_cents"
    }
}

/// Totals for a quote. The discount comes off before tax, shared between taxable and untaxed
/// lines in proportion to their amounts. The deposit follows the rule, never below its minimum
/// and never above the total.
public func quoteTotals(_ lines: [QuoteLine], _ discountCents: Cents, _ taxRateBps: Int, _ deposit: DepositRule)
    -> QuoteTotals
{
    let live = lines.filter { isLiveLine($0.deletedAt) }
    let subtotal = live.reduce(0) { $0 + lineTotal($1) }
    let taxable = live.filter(\.taxable).reduce(0) { $0 + lineTotal($1) }
    let discount = min(max(0, discountCents), subtotal)
    let taxableDiscount = subtotal == 0 ? 0 : roundCentsHalfAway(Double(discount * taxable) / Double(subtotal))
    let tax = roundCentsHalfAway(Double((taxable - taxableDiscount) * taxRateBps) / 10_000)
    let total = subtotal - discount + tax
    return QuoteTotals(
        subtotalCents: subtotal, discountCents: discount, taxCents: tax, totalCents: total,
        depositCents: depositFor(total, deposit))
}

/// The deposit for a total under a rule.
public func depositFor(_ total: Cents, _ rule: DepositRule) -> Cents {
    if total <= 0 { return 0 }
    let base =
        rule.type == .fixed
        ? (rule.valueCents ?? 0)
        : roundCentsHalfAway(Double(total * (rule.valueBps ?? 0)) / 10_000)
    return min(total, max(base, rule.minimumCents ?? 0))
}

/// Discount as basis points of the subtotal, for the tech discount limit.
public func discountBps(_ subtotal: Cents, _ discount: Cents) -> Int {
    subtotal <= 0 ? 0 : Int((Double(discount * 10_000) / Double(subtotal)).rounded(.up))
}

/// A tech's discount is capped by company settings; owners may give any discount.
public func discountAllowed(_ subtotal: Cents, _ discount: Cents, _ isOwner: Bool, _ limitBps: Int) -> Bool {
    isOwner || discountBps(subtotal, discount) <= limitBps
}

/// Price book items to suggest for a finding on a component of this type.
public func suggestItems(_ items: [PriceBookItem], _ componentTypeKey: String?) -> [PriceBookItem] {
    guard let key = componentTypeKey, !key.isEmpty else { return [] }
    let matching = items.enumerated().filter {
        $0.element.active && isLiveLine($0.element.deletedAt) && $0.element.componentTypeKey == key
    }
    // A stable sort, like JavaScript's.
    return matching.sorted { a, b in
        if a.element.sortOrder != b.element.sortOrder { return a.element.sortOrder < b.element.sortOrder }
        let byName = ECMA.localeCompare(a.element.name, b.element.name)
        return byName != 0 ? byName < 0 : a.offset < b.offset
    }.map(\.element)
}

/// A new line copied from a price book item, so later price changes don't touch the quote.
public func lineFromItem(_ item: PriceBookItem, _ findingId: String?) -> QuoteLine {
    let detail = item.description ?? ""
    return QuoteLine(
        quantity: 1, unitPriceCents: item.priceCents, taxable: item.taxable,
        description: detail.isEmpty ? item.name : "\(item.name): \(detail)", findingId: findingId,
        priceBookItemId: item.id)
}

/// The text a tech sends with the quote link.
public func quoteShareText(_ shopName: String, _ link: String) -> String {
    "\(shopName): your repair quote. Review and accept it here: \(link)"
}
