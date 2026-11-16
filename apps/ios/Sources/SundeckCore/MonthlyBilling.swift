import Foundation

// Monthly billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): charges on a
// visit, each customer's invoice day, and Send All. One wording on all four platforms. Port of
// packages/core/src/monthly-billing.ts, checked against the `monthly-billing` fixtures.

// MARK: - Invoice day

/// Days a monthly invoice can be drafted on: 1 to 28, so every month has them (`INVOICE_DAYS`).
public let invoiceDayChoices: [Int] = Array(1...28)

/// 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd".
public func ordinalDay(_ day: Int) -> String {
    let tens = day % 100
    if tens >= 11 && tens <= 13 { return "\(day)th" }
    switch day % 10 {
    case 1: return "\(day)st"
    case 2: return "\(day)nd"
    case 3: return "\(day)rd"
    default: return "\(day)th"
    }
}

/// A whole number from 1 to 28, else nil.
private func invoiceDay(_ n: Double) -> Int? {
    n.isFinite && n == n.rounded(.towardZero) && n >= 1 && n <= 28 ? Int(n) : nil
}

/// The shop's invoice day from its settings (1 to 28), else the 1st.
public func shopInvoiceDay(_ settings: JSONValue?) -> Int {
    invoiceDay(ECMA.toNumber(settings?["invoice_day"])) ?? 1
}

/// A day typed or chosen: 1 to 28, else nil (the shop's default).
public func parseInvoiceDay(_ input: JSONValue?) -> Int? {
    switch input {
    case nil, .null?, .string("")?: return nil
    default: return invoiceDay(ECMA.toNumber(input))
    }
}

/// A plan's Invoice Day choice: "Shop Default (1st)" or "15th".
public func planInvoiceDayLabel(_ day: Int?, shopDay: Int) -> String {
    if let day, day != 0 { return ordinalDay(day) }
    return "Shop Default (\(ordinalDay(shopDay)))"
}

/// Monthly billing's fixed words.
public enum MonthlyBillingText {
    public static let invoiceDayFooter =
        "Each customer’s invoice for the month is drafted on this day of the next month, ready to review and send. A plan can use its own day."
    public static let planInvoiceDayFooter = "The day of the next month this customer’s monthly invoice is drafted."
    public static let chargeLocked = "This charge is on a sent invoice. Change the invoice instead."
    public static let noWayToSend = "No email or mobile number"
    public static let sendAllFooter =
        "Each goes by email, or by text from your shop’s number when there’s no email. Customers without either stay here."
    /// The Send All footer's addition when the shop sends by itself (owner, 2026-11-16).
    public static let autoSendOnFooter =
        "These also go by themselves on each customer’s invoice day. Send All sends them now."
}

/// A draft that couldn't go by itself: "Didn’t go on its invoice day: No email or mobile number".
public func autoSendFailed(_ reason: String) -> String {
    "Didn’t go on its invoice day: \(reason)"
}

// MARK: - Charges on a visit

/// A part or service added on a maintenance visit (table `visit_charge`).
public struct VisitCharge: Codable, Equatable, Sendable, Identifiable, PricedLine {
    public var id: String
    public var jobId: String
    public var priceBookItemId: String?
    public var name: String
    public var quantity: Double
    public var unitPriceCents: Cents
    public var taxable: Bool?
    /// Server-set: the monthly invoice that billed it.
    public var billedInvoiceId: String?
    public var addedAt: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, quantity, taxable
        case jobId = "job_id"
        case priceBookItemId = "price_book_item_id"
        case unitPriceCents = "unit_price_cents"
        case billedInvoiceId = "billed_invoice_id"
        case addedAt = "added_at"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, jobId: String, priceBookItemId: String? = nil, name: String, quantity: Double,
        unitPriceCents: Cents, taxable: Bool? = true, billedInvoiceId: String? = nil, addedAt: String? = nil,
        deletedAt: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.priceBookItemId = priceBookItemId
        self.name = name
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.taxable = taxable
        self.billedInvoiceId = billedInvoiceId
        self.addedAt = addedAt
        self.deletedAt = deletedAt
    }
}

/// A charge's quantity and price, for `chargeCents` and `chargeDetail`.
public struct ChargeAmount: Codable, Equatable, Sendable, PricedLine {
    public var quantity: Double
    public var unitPriceCents: Cents

    enum CodingKeys: String, CodingKey {
        case quantity
        case unitPriceCents = "unit_price_cents"
    }

    public init(quantity: Double, unitPriceCents: Cents) {
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
    }
}

/// A charge's amount: quantity × price, in cents (as the database totals a line).
public func chargeCents(_ c: some PricedLine) -> Cents {
    Cents(ECMA.round((ECMA.round(c.quantity * 100) * Double(c.unitPriceCents)) / 100))
}

/// "1 × $24.00", "2.5 × $8.00".
public func chargeDetail(_ c: some PricedLine) -> String {
    let q = c.quantity
    var count: String
    if q.isFinite && q == q.rounded(.towardZero) {
        count = ECMA.numberString(q)
    } else {
        count = ECMA.toFixed(q, 2)
        if count.hasSuffix("0") { count.removeLast() }
    }
    return "\(count) × \(formatCents(c.unitPriceCents))"
}

/// A price book item as Add Charge offers it (the website's `ChargeItem`).
public struct ChargeItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var category: String?
    public var priceCents: Cents?
    public var taxable: Bool?
    public var chemical: String?
    public var sortOrder: Double?
    public var active: Bool?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, category, taxable, chemical, active
        case priceCents = "price_cents"
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, name: String, category: String? = nil, priceCents: Cents? = nil, taxable: Bool? = true,
        chemical: String? = nil, sortOrder: Double? = nil, active: Bool? = true, deletedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.priceCents = priceCents
        self.taxable = taxable
        self.chemical = chemical
        self.sortOrder = sortOrder
        self.active = active
        self.deletedAt = deletedAt
    }
}

/// The price book items Add Charge offers: services and parts, not chemicals (those are added
/// under Chemicals) or detection and inspection fees (jobs of their own), in the book's order.
public func chargeItems(_ items: [ChargeItem]) -> [ChargeItem] {
    items.filter {
        ($0.deletedAt?.isEmpty ?? true) && ($0.chemical?.isEmpty ?? true)
            && !["Chemicals", "Detection", "Inspection"].contains($0.category ?? "")
    }
}

/// The sent invoice a visit's charges are on: its number and "Nov 1".
public struct SentInvoiceRef: Codable, Equatable, Sendable {
    public var number: Int?
    public var sentOn: String

    public init(number: Int?, sentOn: String) {
        self.number = number
        self.sentOn = sentOn
    }
}

/// The Charges footer: where they're billed, or that they're on a sent invoice.
public func chargesFooter(firstName: String, month: String, sentInvoice: SentInvoiceRef?) -> String {
    if let sent = sentInvoice {
        let number = sent.number.flatMap { $0 != 0 ? " #\($0)" : nil } ?? ""
        return "On invoice\(number), sent \(sent.sentOn)."
    }
    return "Billed on \(firstName)’s \(month) invoice."
}

// MARK: - Monthly Billing

/// A row on Invoices › Monthly Billing (public.billing_months).
public struct BillingMonth: Codable, Equatable, Hashable, Sendable, Identifiable {
    public var month: String
    public var drafts: Int
    public var draftTotalCents: Cents
    public var sent: Int
    public var notInvoiced: Int
    public var current: Bool

    public var id: String { month }

    enum CodingKeys: String, CodingKey {
        case month, drafts, sent, current
        case draftTotalCents = "draft_total_cents"
        case notInvoiced = "not_invoiced"
    }

    public init(month: String, drafts: Int, draftTotalCents: Cents, sent: Int, notInvoiced: Int, current: Bool) {
        self.month = month
        self.drafts = drafts
        self.draftTotalCents = draftTotalCents
        self.sent = sent
        self.notInvoiced = notInvoiced
        self.current = current
    }
}

/// A Postgres numeric as JSON may hold it: a number, or text.
private func decodeNumber<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) throws -> Double {
    if let n = try? c.decode(Double.self, forKey: key) { return n }
    let text = try c.decode(String.self, forKey: key)
    guard let n = Double(text) else {
        throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "Not a number: \(text)")
    }
    return n
}

/// A line on a month's draft.
public struct MonthBillingLine: Codable, Equatable, Sendable, Identifiable, PricedLine {
    public var id: String
    public var description: String
    public var quantity: Double
    public var unitPriceCents: Cents
    public var unit: String?
    public var kind: String
    public var taxable: Bool

    enum CodingKeys: String, CodingKey {
        case id, description, quantity, unit, kind, taxable
        case unitPriceCents = "unit_price_cents"
    }

    public init(
        id: String, description: String, quantity: Double, unitPriceCents: Cents, unit: String? = nil,
        kind: String, taxable: Bool
    ) {
        self.id = id
        self.description = description
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.unit = unit
        self.kind = kind
        self.taxable = taxable
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        description = try c.decode(String.self, forKey: .description)
        quantity = try decodeNumber(c, .quantity)
        unitPriceCents = Cents(try decodeNumber(c, .unitPriceCents))
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "item"
        taxable = try c.decodeIfPresent(Bool.self, forKey: .taxable) ?? true
    }
}

/// A customer's invoice for the month.
public struct MonthBillingInvoice: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var number: Int?
    public var status: String
    public var jobId: String
    public var customerId: String
    public var customer: String
    public var email: String?
    public var phone: String?
    public var totalCents: Cents
    public var amountPaidCents: Cents
    public var sentAt: String?
    public var dueDate: String?
    /// Why it didn't go by itself on the invoice day (a draft only).
    public var autoSendError: String?
    public var lines: [MonthBillingLine]

    enum CodingKeys: String, CodingKey {
        case id, number, status, customer, email, phone, lines
        case autoSendError = "auto_send_error"
        case jobId = "job_id"
        case customerId = "customer_id"
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
        case sentAt = "sent_at"
        case dueDate = "due_date"
    }

    public init(
        id: String, number: Int?, status: String, jobId: String, customerId: String, customer: String,
        email: String?, phone: String?, totalCents: Cents, amountPaidCents: Cents, sentAt: String?,
        dueDate: String?, lines: [MonthBillingLine], autoSendError: String? = nil
    ) {
        self.autoSendError = autoSendError
        self.id = id
        self.number = number
        self.status = status
        self.jobId = jobId
        self.customerId = customerId
        self.customer = customer
        self.email = email
        self.phone = phone
        self.totalCents = totalCents
        self.amountPaidCents = amountPaidCents
        self.sentAt = sentAt
        self.dueDate = dueDate
        self.lines = lines
    }
}

/// Customers whose month waits for their invoice day.
public struct BillingWait: Codable, Equatable, Sendable {
    public var date: String
    public var customers: Int

    public init(date: String, customers: Int) {
        self.date = date
        self.customers = customers
    }
}

/// A month's page (public.month_billing).
public struct MonthBilling: Codable, Equatable, Sendable {
    public var month: String
    public var invoices: [MonthBillingInvoice]
    public var notInvoiced: Int
    public var waiting: [BillingWait]

    enum CodingKeys: String, CodingKey {
        case month, invoices, waiting
        case notInvoiced = "not_invoiced"
    }

    public init(month: String, invoices: [MonthBillingInvoice], notInvoiced: Int, waiting: [BillingWait]) {
        self.month = month
        self.invoices = invoices
        self.notInvoiced = notInvoiced
        self.waiting = waiting
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        month = try c.decode(String.self, forKey: .month)
        invoices = try c.decodeIfPresent([MonthBillingInvoice].self, forKey: .invoices) ?? []
        notInvoiced = try c.decodeIfPresent(Int.self, forKey: .notInvoiced) ?? 0
        waiting = try c.decodeIfPresent([BillingWait].self, forKey: .waiting) ?? []
    }

    /// The drafts, To Send.
    public var drafts: [MonthBillingInvoice] { invoices.filter { $0.status == "draft" } }
    /// The rest, Sent.
    public var sent: [MonthBillingInvoice] { invoices.filter { $0.status != "draft" } }
}

private func plural(_ n: Int, _ one: String) -> String { "\(n) \(n == 1 ? one : "\(one)s")" }

private let monthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December",
]

/// "October 2026" for "2026-10-01" ("October" without the year).
public func billingMonthName(_ month: String, withYear: Bool = true) -> String {
    let parts = month.split(separator: "-", omittingEmptySubsequences: false).map { ECMA.number(String($0)) }
    let y = parts.first ?? .nan
    let m = parts.count > 1 ? parts[1] : 1
    let index = Int(m.isFinite ? m : 1) - 1
    let name = monthNames.indices.contains(index) ? monthNames[index] : ""
    return withYear ? "\(name) \(ECMA.numberString(y))" : name
}

/// A Monthly Billing row's detail: "38 to send · $5,912.00 · 3 customers not invoiced yet".
public func billingMonthDetail(_ m: BillingMonth) -> String {
    var parts: [String] = []
    if m.drafts > 0 { parts.append("\(m.drafts) to send · \(formatCents(m.draftTotalCents))") }
    if m.notInvoiced > 0 {
        parts.append(
            m.notInvoiced == 1 ? "1 customer not invoiced yet" : "\(m.notInvoiced) customers not invoiced yet")
    }
    if m.current { parts.append("so far") }
    return parts.joined(separator: " · ")
}

/// How a draft will go when sent with Send All.
public enum SendRoute: Codable, Equatable, Hashable, Sendable {
    case email(String)
    case text(String)
    case noContact

    enum CodingKeys: String, CodingKey { case channel, to }

    public var channel: String {
        switch self {
        case .email: "email"
        case .text: "text"
        case .noContact: "none"
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(channel, forKey: .channel)
        switch self {
        case .email(let to), .text(let to): try c.encode(to, forKey: .to)
        case .noContact: break
        }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .channel) {
        case "email": self = .email(try c.decode(String.self, forKey: .to))
        case "text": self = .text(try c.decode(String.self, forKey: .to))
        default: self = .noContact
        }
    }
}

/// Email first; a text from the shop's number when there's no email and the shop texts.
public func sendRoute(email: String?, phone: String?, texting: Bool) -> SendRoute {
    let email = email.map(ECMA.trim)
    if let email, !email.isEmpty, email.wholeMatch(of: /\S+@\S+\.\S+/) != nil { return .email(email) }
    let phone = phone.map(ECMA.trim)
    if texting, let phone, !phone.isEmpty,
        phone.unicodeScalars.filter({ ("0"..."9").contains($0) }).count >= 10
    {
        return .text(phone)
    }
    return .noContact
}

/// A draft's way to go (`sendRoute(inv, texting)`).
public func sendRoute(_ invoice: MonthBillingInvoice, texting: Bool) -> SendRoute {
    sendRoute(email: invoice.email, phone: invoice.phone, texting: texting)
}

/// A To Send row's "how it goes" line.
public func sendRouteLabel(_ route: SendRoute) -> String {
    switch route {
    case .email(let to): to
    case .text(let to): "Text \(to)"
    case .noContact: MonthlyBillingText.noWayToSend
    }
}

/// A draft's lines in one short line: "Pool service · Replace skimmer basket · 1 more".
public func linesSummary(_ lines: [MonthBillingLine], shown: Int = 2) -> String {
    let items = lines.filter { $0.kind != "deposit_credit" }
    if items.isEmpty { return "No lines yet" }
    // "Pool service, October" reads as "Pool service"; "Replace skimmer basket, Oct 14" as its name.
    let names = items.map { $0.description.replacing(/, [^,]*$/, with: "", maxReplacements: 1) }
    let head = names.prefix(shown).joined(separator: " · ")
    return items.count > shown ? "\(head) · \(items.count - shown) more" : head
}

/// The page's subtitle: "38 to send · $5,912.00", or "All sent" when nothing waits.
public func monthBillingSubtitle(_ b: MonthBilling) -> String {
    let drafts = b.drafts
    if drafts.isEmpty { return b.invoices.isEmpty ? "Nothing to send yet" : "All sent" }
    return "\(drafts.count) to send · \(formatCents(drafts.reduce(0) { $0 + $1.totalCents }))"
}

/// The not-invoiced card: "3 customers have visits not on an invoice yet." with who waits for
/// their day.
public func notInvoicedText(_ b: MonthBilling, formatDate: (String) -> String) -> String? {
    if b.notInvoiced == 0 { return nil }
    let head =
        b.notInvoiced == 1
        ? "1 customer has visits not on an invoice yet."
        : "\(b.notInvoiced) customers have visits not on an invoice yet."
    let waiting = b.waiting.reduce(0) { $0 + $1.customers }
    let waits: String
    if b.waiting.count == 1 && waiting == b.notInvoiced {
        waits =
            "\(b.notInvoiced == 1 ? "It’s" : "They’re") billed on their invoice day, \(formatDate(b.waiting[0].date))."
    } else {
        waits = b.waiting
            .map { w in
                "\(w.customers == 1 ? "1 is" : "\(w.customers) are") billed on their invoice day, \(formatDate(w.date))."
            }
            .joined(separator: " ")
    }
    let now = waiting != 0 ? " Create Invoices drafts them now." : ""
    return waits.isEmpty ? head : "\(head) \(waits)\(now)"
}

/// Send All's button: "Send 38 Invoices".
public func sendAllLabel(_ n: Int) -> String { n == 1 ? "Send 1 Invoice" : "Send \(n) Invoices" }

/// Send All's alert.
public struct SendAllConfirm: Codable, Equatable, Sendable {
    public var title: String
    public var message: String
}

public func sendAllConfirm(_ routes: [SendRoute], monthName: String) -> SendAllConfirm {
    let email = routes.filter { $0.channel == "email" }.count
    let text = routes.filter { $0.channel == "text" }.count
    let none = routes.count - email - text
    let n = email + text
    let how = [email > 0 ? "\(email) by email" : nil, text > 0 ? "\(text) by text" : nil]
        .compactMap { $0 }
        .joined(separator: ", ")
    let stays =
        none > 0
        ? " \(none == 1 ? "1 without an email or mobile number stays a draft" : "\(none) without an email or mobile number stay drafts")."
        : ""
    return SendAllConfirm(
        title: n == 1 ? "Send 1 invoice?" : "Send \(n) invoices?",
        message: "Each customer gets their \(monthName) invoice now: \(how).\(stays)")
}

/// After Send All: "Sent 38 invoices." or "Sent 36 invoices. 2 didn’t go."
public func sendAllResult(sent: Int, failed: Int) -> String {
    let head = "Sent \(plural(sent, "invoice"))."
    return failed > 0 ? "\(head) \(failed) didn’t go." : head
}

/// What Send All returns, on every platform (POST /api/invoices/month/{month}/send).
public struct SendAllResult: Codable, Equatable, Sendable {
    public struct Failure: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var customer: String
        public var reason: String
    }

    public var sent: Int
    public var failed: [Failure]
    public var message: String
}
