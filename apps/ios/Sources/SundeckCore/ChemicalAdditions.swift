import Foundation

// Added chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested chemicals to
// add, and what was actually added"; docs/design/2026-10-24-chemicals-added.md). What a tech adds
// on a visit is a synced `chemical_addition` row; a suggestion that wasn't added is worked out
// live from the readings. Shops that charge for chemicals bill the month's additions on the
// monthly invoice, one line per chemical. Port of packages/core/src/chemical-additions.ts.

/// A price book item a tech can add (the Chemicals category, or one with a chemical key).
public struct ChemicalItem: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var unit: String
    public var priceCents: Cents
    public var taxable: Bool?
    public var category: String?
    public var chemical: String?
    public var sortOrder: Double?
    public var active: Bool?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, unit, taxable, category, chemical, active
        case priceCents = "price_cents"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, name: String, unit: String, priceCents: Cents, taxable: Bool? = true, category: String? = nil,
        chemical: String? = nil, sortOrder: Double? = nil, active: Bool? = true, deletedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.unit = unit
        self.priceCents = priceCents
        self.taxable = taxable
        self.category = category
        self.chemical = chemical
        self.sortOrder = sortOrder
        self.active = active
        self.deletedAt = deletedAt
    }
}

/// One chemical added on a visit (table `chemical_addition`).
public struct ChemicalAddition: Codable, Equatable, Sendable, Identifiable, PricedLine {
    public var id: String
    public var jobId: String
    public var propertyId: String
    public var priceBookItemId: String?
    public var name: String
    public var unit: String
    /// The reading it answered, for an accepted suggestion; nil for one added on its own.
    public var readingKey: ReadingKey?
    public var suggestedQuantity: Double?
    public var quantity: Double
    public var customerSupplied: Bool
    public var note: String?
    /// Set by the server from the price book when the row arrives.
    public var unitPriceCents: Cents
    public var taxable: Bool?
    public var billedInvoiceId: String?
    public var addedAt: String
    public var sortOrder: Double
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, unit, quantity, note, taxable
        case jobId = "job_id"
        case propertyId = "property_id"
        case priceBookItemId = "price_book_item_id"
        case readingKey = "reading_key"
        case suggestedQuantity = "suggested_quantity"
        case customerSupplied = "customer_supplied"
        case unitPriceCents = "unit_price_cents"
        case billedInvoiceId = "billed_invoice_id"
        case addedAt = "added_at"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, jobId: String, propertyId: String, priceBookItemId: String?, name: String, unit: String,
        readingKey: ReadingKey?, suggestedQuantity: Double?, quantity: Double, customerSupplied: Bool = false,
        note: String? = nil, unitPriceCents: Cents, taxable: Bool? = nil, billedInvoiceId: String? = nil,
        addedAt: String, sortOrder: Double = 0, deletedAt: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.propertyId = propertyId
        self.priceBookItemId = priceBookItemId
        self.name = name
        self.unit = unit
        self.readingKey = readingKey
        self.suggestedQuantity = suggestedQuantity
        self.quantity = quantity
        self.customerSupplied = customerSupplied
        self.note = note
        self.unitPriceCents = unitPriceCents
        self.taxable = taxable
        self.billedInvoiceId = billedInvoiceId
        self.addedAt = addedAt
        self.sortOrder = sortOrder
        self.deletedAt = deletedAt
    }

    var live: Bool { deletedAt?.isEmpty ?? true }
}

/// The fields a new addition is written with, before it has an id.
public struct AdditionDraft: Codable, Equatable, Sendable, PricedLine {
    public var priceBookItemId: String?
    public var name: String
    public var unit: String
    public var readingKey: ReadingKey?
    public var suggestedQuantity: Double?
    public var quantity: Double
    /// The price the phone shows until the server's stored price arrives.
    public var unitPriceCents: Cents

    public init(
        priceBookItemId: String?, name: String, unit: String, readingKey: ReadingKey?, suggestedQuantity: Double?,
        quantity: Double, unitPriceCents: Cents
    ) {
        self.priceBookItemId = priceBookItemId
        self.name = name
        self.unit = unit
        self.readingKey = readingKey
        self.suggestedQuantity = suggestedQuantity
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
    }

    enum CodingKeys: String, CodingKey {
        case name, unit, quantity
        case priceBookItemId = "price_book_item_id"
        case readingKey = "reading_key"
        case suggestedQuantity = "suggested_quantity"
        case unitPriceCents = "unit_price_cents"
    }

    /// Encodes nulls as JavaScript writes them (the fixtures compare with null).
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(priceBookItemId, forKey: .priceBookItemId)
        try c.encode(name, forKey: .name)
        try c.encode(unit, forKey: .unit)
        try c.encode(readingKey, forKey: .readingKey)
        try c.encode(suggestedQuantity, forKey: .suggestedQuantity)
        try c.encode(quantity, forKey: .quantity)
        try c.encode(unitPriceCents, forKey: .unitPriceCents)
    }
}

// MARK: - Settings

/// Settings › Price Book › Charge for Chemicals (company.settings.charge_chemicals). Off unset.
public func chargesChemicals(_ settings: JSONValue?) -> Bool {
    if case .bool(true)? = settings?["charge_chemicals"] { return true }
    return false
}

/// The settings to save when Charge for Chemicals is switched: on records the month it starts.
public func chargeChemicalsSettings(_ on: Bool, today: String) -> [String: JSONValue] {
    on
        ? ["charge_chemicals": .bool(true), "charge_chemicals_from": .string("\(today.prefix(7))-01")]
        : ["charge_chemicals": .bool(false)]
}

/// `CHARGE_CHEMICALS_TEXT`.
public enum ChargeChemicalsText {
    public static let label = "Charge for Chemicals"
    public static let on =
        "Chemicals techs add on visits go on the customer’s monthly invoice at these prices, one line per chemical, and on the visit report with their prices."
    public static let off = "Chemicals techs add are recorded and shown on visit reports, without prices."
    public static let all: [String: String] = ["label": label, "on": on, "off": off]
}

// MARK: - Items and units

/// The chemicals a tech can pick, in price book order.
public func chemicalItems(_ items: [ChemicalItem]) -> [ChemicalItem] {
    ECMA.sort(
        items.filter {
            ($0.deletedAt?.isEmpty ?? true) && $0.active != false
                && ($0.category == "Chemicals" || !($0.chemical ?? "").isEmpty)
        }
    ) { a, b in
        let d = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        return d != 0 ? d : Double(ECMA.localeCompare(a.name, b.name))
    }
}

/// The shop's item for a chemical the calculator suggests, the first in price book order.
public func itemForChemical(_ items: [ChemicalItem], _ chemical: String?) -> ChemicalItem? {
    guard let chemical, !chemical.isEmpty else { return nil }
    return chemicalItems(items).first { $0.chemical == chemical }
}

/// `UNIT_STEPS`: how much − and + move an amount in each unit.
public let unitSteps: [String: Double] = ["gal": 0.25, "qt": 0.5, "lb": 0.5, "oz": 1, "bag": 0.5, "tab": 1, "each": 1]

public func unitStep(_ unit: String) -> Double {
    unitSteps[ECMA.lowercase(ECMA.trim(unit))] ?? 1
}

/// The next amount up or down: to the next whole step, never below one step.
public func stepQuantity(_ quantity: Double, unit: String, direction: Int) -> Double {
    let step = unitStep(unit)
    let at = quantity / step
    let next =
        direction > 0 ? (at + 1e-9).rounded(.down) * step + step : (at - 1e-9).rounded(.up) * step - step
    return max(step, ECMA.round(next * 100) / 100)
}

private let per: [String: [String: Double]] = [
    "gal": ["qt": 4, "oz": 128],
    "qt": ["gal": 0.25, "oz": 32],
    "lb": ["oz": 16],
    "oz": ["lb": 1.0 / 16],
]

/// An amount in another unit (gallons to quarts, pounds to ounces), or nil when it can't be.
public func convertQuantity(_ quantity: Double, from: String, to: String) -> Double? {
    let f = ECMA.lowercase(ECMA.trim(from))
    let t = ECMA.lowercase(ECMA.trim(to))
    if f == t { return quantity }
    guard let k = per[f]?[t] else { return nil }
    return ECMA.round(quantity * k * 100) / 100
}

private let fractions: [(Double, String)] = [(0.25, "¼"), (0.33, "⅓"), (0.5, "½"), (0.67, "⅔"), (0.75, "¾")]

/// 2.75 → "2¾", 0.33 → "⅓", 1.2 → "1.2".
private func amount(_ n: Double) -> String {
    let r = ECMA.round(n * 100) / 100
    let whole = r.rounded(.down)
    let part = ECMA.round((r - whole) * 100) / 100
    if part == 0 { return ECMA.numberString(whole) }
    if let f = fractions.first(where: { abs($0.0 - part) < 0.005 }) {
        return whole != 0 ? "\(ECMA.numberString(whole))\(f.1)" : f.1
    }
    return ECMA.numberString(r)
}

private let plural: [String: String] = ["tab": "tabs", "bag": "bags", "cup": "cups"]

/// An amount the way a tech reads it: "½ gal", "2¾ gal", "1½ lb", "3 tabs", "1 bag"; cups under
/// a quarter gallon; "each" as a count.
public func formatQuantity(_ quantity: Double, unit: String) -> String {
    let u = ECMA.lowercase(ECMA.trim(unit))
    if u == "gal" && quantity < 0.24 {
        let cups = max(0.5, ECMA.round(quantity * 16 * 2) / 2)
        return "\(amount(cups)) \(cups > 1 ? "cups" : "cup")"
    }
    if u == "each" { return amount(quantity) }
    let word = quantity > 1 ? plural[u] ?? ECMA.trim(unit) : ECMA.trim(unit)
    return "\(amount(quantity)) \(word)"
}

/// "½ gal Liquid chlorine", "2 × Phosphate remover".
public func additionLabel(quantity: Double, unit: String, name: String) -> String {
    ECMA.lowercase(ECMA.trim(unit)) == "each"
        ? "\(amount(quantity)) × \(name)" : "\(formatQuantity(quantity, unit: unit)) \(name)"
}

public func additionLabel(_ a: ChemicalAddition) -> String {
    additionLabel(quantity: a.quantity, unit: a.unit, name: a.name)
}

public func additionLabel(_ a: AdditionDraft) -> String {
    additionLabel(quantity: a.quantity, unit: a.unit, name: a.name)
}

/// The price per unit: "$8.00 / gal", "$35.00 each".
public func unitPriceLabel(_ cents: Cents, unit: String) -> String {
    ECMA.lowercase(ECMA.trim(unit)) == "each"
        ? "\(formatCents(cents)) each" : "\(formatCents(cents)) / \(ECMA.trim(unit))"
}

// MARK: - Suggestions and the visit's rows

/// The product's name without its strength or a note in brackets.
private func plainProduct(_ product: String) -> String {
    product.replacing(/\ \d+(\.\d+)?%/, with: "", maxReplacements: 1)
}

/// What a step suggests, in words: "½ gal liquid chlorine".
public func suggestionText(_ step: DoseStep) -> String {
    guard let q = step.quantity, let unit = step.unit else { return step.product }
    let product = plainProduct(step.product).replacing(/\ \(.*\)$/, with: "", maxReplacements: 1)
    return "\(formatQuantity(q, unit: unit)) \(ECMA.lowercase(product))"
}

/// The addition a suggestion makes when the tech taps it; nil for an action.
public func suggestedAddition(_ step: DoseStep, _ items: [ChemicalItem]) -> AdditionDraft? {
    guard step.chemical != nil, let q = step.quantity, let unit = step.unit else { return nil }
    guard let item = itemForChemical(items, step.chemical) else {
        return AdditionDraft(
            priceBookItemId: nil, name: plainProduct(step.product), unit: unit, readingKey: step.key,
            suggestedQuantity: q, quantity: q, unitPriceCents: 0)
    }
    let converted = convertQuantity(q, from: unit, to: item.unit)
    return AdditionDraft(
        priceBookItemId: item.id, name: item.name, unit: item.unit, readingKey: step.key,
        suggestedQuantity: converted ?? q, quantity: converted ?? 1, unitPriceCents: item.priceCents)
}

/// The addition picked from the Add Chemical sheet: one step of the item's unit.
public func itemAddition(_ item: ChemicalItem, quantity: Double? = nil) -> AdditionDraft {
    AdditionDraft(
        priceBookItemId: item.id, name: item.name, unit: item.unit, readingKey: nil, suggestedQuantity: nil,
        quantity: quantity ?? max(1, unitStep(item.unit)), unitPriceCents: item.priceCents)
}

/// One reading's row on the visit's Chemicals.
public struct ChemicalRow: Codable, Equatable, Sendable {
    public var key: ReadingKey
    public var step: DoseStep?
    /// Its place in the order to add (1, 2, 3).
    public var order: Int?
    public var suggestion: AdditionDraft?
    public var added: [ChemicalAddition]

    public init(key: ReadingKey, step: DoseStep?, order: Int?, suggestion: AdditionDraft?, added: [ChemicalAddition]) {
        self.key = key
        self.step = step
        self.order = order
        self.suggestion = suggestion
        self.added = added
    }
}

/// `chemicalRows`' result: one row per reading, then what was added on its own.
public struct ChemicalRows: Codable, Equatable, Sendable {
    public var rows: [ChemicalRow]
    public var extras: [ChemicalAddition]

    public init(rows: [ChemicalRow], extras: [ChemicalAddition]) {
        self.rows = rows
        self.extras = extras
    }
}

private func liveSorted(_ additions: [ChemicalAddition]) -> [ChemicalAddition] {
    ECMA.sort(additions.filter(\.live)) { a, b in
        a.sortOrder != b.sortOrder ? a.sortOrder - b.sortOrder : Double(compareStrings(a.addedAt, b.addedAt))
    }
}

/// `String.prototype.localeCompare` on timestamps sorts like plain comparison.
private func compareStrings(_ a: String, _ b: String) -> Int {
    ECMA.localeCompare(a, b)
}

/// The visit's Chemicals: one row per reading with its suggestion and what was added for it,
/// then Also Added, oldest first.
public func chemicalRows(_ result: ChemistryResult, _ additions: [ChemicalAddition], _ items: [ChemicalItem])
    -> ChemicalRows
{
    let added = liveSorted(additions)
    let rows = ReadingKey.allCases.map { key -> ChemicalRow in
        let i = result.steps.firstIndex { $0.key == key }
        let step = i.map { result.steps[$0] }
        return ChemicalRow(
            key: key, step: step, order: i.map { $0 + 1 }, suggestion: step.flatMap { suggestedAddition($0, items) },
            added: added.filter { $0.readingKey == key })
    }
    return ChemicalRows(rows: rows, extras: added.filter { $0.readingKey == nil })
}

/// The suggestions not added yet: what Mark All Added adds.
public func openSuggestions(_ rows: [ChemicalRow]) -> [AdditionDraft] {
    rows.compactMap { $0.added.isEmpty ? $0.suggestion : nil }
}

/// What the added chemicals come to (customer-supplied ones are never billed).
public func additionsCents(_ additions: [ChemicalAddition]) -> Cents {
    additions.filter { $0.live && !$0.customerSupplied }.reduce(0) { $0 + lineTotal($1) }
}

/// The chemical card's closed line: "3 added · FC 1 · pH 7.8".
public func chemicalCardLine(_ readingLine: String, _ additions: [ChemicalAddition]) -> String {
    let n = additions.filter(\.live).count
    let parts = [n > 0 ? "\(n) added" : "", readingLine].filter { !$0.isEmpty }
    return parts.isEmpty ? "Add today’s readings" : parts.joined(separator: " · ")
}

// MARK: - Totals

public struct ChemicalTotal: Codable, Equatable, Sendable, PricedLine {
    public var name: String
    public var unit: String
    public var quantity: Double
    public var unitPriceCents: Cents
    public var totalCents: Cents
    public var customerSupplied: Bool

    public init(
        name: String, unit: String, quantity: Double, unitPriceCents: Cents, totalCents: Cents, customerSupplied: Bool
    ) {
        self.name = name
        self.unit = unit
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.totalCents = totalCents
        self.customerSupplied = customerSupplied
    }

    enum CodingKeys: String, CodingKey {
        case name, unit, quantity
        case unitPriceCents = "unit_price_cents"
        case totalCents = "total_cents"
        case customerSupplied = "customer_supplied"
    }
}

/// Added chemicals totaled per chemical, unit and price, in the order first added; customer
/// supplied ones apart, at no charge (`chemicalTotals`).
public func chemicalTotals(_ additions: [ChemicalAddition]) -> [ChemicalTotal] {
    var out: [ChemicalTotal] = []
    let sorted = ECMA.sort(additions.filter(\.live)) { a, b in
        let c = compareStrings(a.addedAt, b.addedAt)
        return c != 0 ? Double(c) : a.sortOrder - b.sortOrder
    }
    for a in sorted {
        let supplied = a.customerSupplied
        let price = supplied ? 0 : a.unitPriceCents
        if let i = out.firstIndex(where: {
            $0.name == a.name && $0.unit == a.unit && $0.unitPriceCents == price && $0.customerSupplied == supplied
        }) {
            out[i].quantity = ECMA.round((out[i].quantity + a.quantity) * 100) / 100
        } else {
            out.append(
                ChemicalTotal(
                    name: a.name, unit: a.unit, quantity: a.quantity, unitPriceCents: price, totalCents: 0,
                    customerSupplied: supplied))
        }
    }
    for i in out.indices { out[i].totalCents = lineTotal(out[i]) }
    return out
}

private let monthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December",
]

/// "October", from a date ("2026-10-23" or a timestamp) in the shop's time zone.
public func monthName(_ isoOrDate: String, timeZone: String) -> String {
    if isoOrDate.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) != nil, let m = Int(isoOrDate.dropFirst(5).prefix(2)),
        (1...12).contains(m)
    {
        return monthNames[m - 1]
    }
    guard let ms = ECMA.parseDate(isoOrDate), let zone = try? ECMA.zone(timeZone) else { return "" }
    return monthNames[ECMA.wallClock(ms, zone).month - 1]
}

/// One month of a pool's chemicals on its log.
public struct MonthlyUsage: Codable, Equatable, Sendable {
    /// "2026-10"
    public var month: String
    /// "October"
    public var label: String
    /// "2¾ gal Liquid chlorine, 12 tabs Chlorine tabs"
    public var line: String

    public init(month: String, label: String, line: String) {
        self.month = month
        self.label = label
        self.line = line
    }
}

/// The pool's chemicals by month, newest month first (`monthlyUsage`).
public func monthlyUsage(_ additions: [ChemicalAddition], timeZone: String, months: Int = 3) -> [MonthlyUsage] {
    func key(_ iso: String) -> String {
        guard let ms = ECMA.parseDate(iso), let zone = try? ECMA.zone(timeZone) else { return "" }
        let w = ECMA.wallClock(ms, zone)
        return "\(ECMA.yearString(w.year))-\(ECMA.pad(String(w.month), 2))"
    }
    var byMonth: [String: [ChemicalAddition]] = [:]
    for a in additions where a.live { byMonth[key(a.addedAt), default: []].append(a) }
    return byMonth.keys.sorted().reversed().prefix(max(0, months)).map { m in
        var totals: [ChemicalTotal] = []
        for t in chemicalTotals(byMonth[m]!) {
            if let i = totals.firstIndex(where: { $0.name == t.name && $0.unit == t.unit }) {
                totals[i].quantity = ECMA.round((totals[i].quantity + t.quantity) * 100) / 100
            } else {
                totals.append(t)
            }
        }
        return MonthlyUsage(
            month: m, label: monthName("\(m)-15", timeZone: timeZone),
            line: totals.map { additionLabel(quantity: $0.quantity, unit: $0.unit, name: $0.name) }
                .joined(separator: ", "))
    }
}

// MARK: - The visit report

/// An added chemical as the report snapshot keeps it.
public struct ReportAddition: Codable, Equatable, Sendable, PricedLine {
    public var name: String
    public var unit: String
    public var quantity: Double
    public var readingKey: ReadingKey?
    public var note: String?
    public var customerSupplied: Bool
    public var unitPriceCents: Cents

    public init(
        name: String, unit: String, quantity: Double, readingKey: ReadingKey?, note: String? = nil,
        customerSupplied: Bool = false, unitPriceCents: Cents
    ) {
        self.name = name
        self.unit = unit
        self.quantity = quantity
        self.readingKey = readingKey
        self.note = note
        self.customerSupplied = customerSupplied
        self.unitPriceCents = unitPriceCents
    }

    enum CodingKeys: String, CodingKey {
        case name, unit, quantity, note
        case readingKey = "reading_key"
        case customerSupplied = "customer_supplied"
        case unitPriceCents = "unit_price_cents"
    }
}

public struct ReportAddedRow: Codable, Equatable, Sendable {
    public var label: String
    /// "To lower pH", the note, or nil.
    public var why: String?
    /// "$4.00" when the shop charged; nil otherwise or when the customer supplied it.
    public var price: String?
    public var supplied: Bool

    public init(label: String, why: String?, price: String?, supplied: Bool) {
        self.label = label
        self.why = why
        self.price = price
        self.supplied = supplied
    }

    /// Encodes nulls as JavaScript writes them.
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(label, forKey: .label)
        try c.encode(why, forKey: .why)
        try c.encode(price, forKey: .price)
        try c.encode(supplied, forKey: .supplied)
    }

    enum CodingKeys: String, CodingKey { case label, why, price, supplied }
}

/// The report's Added Chemicals: one line each, why (from the reading it answered), and the price
/// when the shop charged for it.
public func reportAddedRows(_ added: [ReportAddition], reading: Readings?, goals: Readings?, charged: Bool)
    -> [ReportAddedRow]
{
    let t = targets(reading?.cya)
    return added.map { a in
        var why: String? = a.note.map(ECMA.trim).flatMap { $0.isEmpty ? nil : $0 }
        if why == nil, let key = a.readingKey, let value = reading?[key] {
            let aim = goalRange(t[key], key, goals?[key]).target
            why = "To \(value > aim ? "lower" : "raise") \(key == .ph ? "pH" : ECMA.lowercase(key.label))"
        }
        return ReportAddedRow(
            label: additionLabel(quantity: a.quantity, unit: a.unit, name: a.name), why: why,
            price: charged && !a.customerSupplied ? formatCents(lineTotal(a)) : nil, supplied: a.customerSupplied)
    }
}

/// What the report's chemicals came to, when the shop charged: "$28.75".
public func reportAddedTotal(_ added: [ReportAddition], charged: Bool) -> String? {
    guard charged else { return nil }
    let cents = added.filter { !$0.customerSupplied }.reduce(0) { $0 + lineTotal($1) }
    return cents > 0 ? formatCents(cents) : nil
}
