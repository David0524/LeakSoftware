import Foundation

// autopay.ts (docs/design/2026-11-16-autopay.md): the customer page's Autopay group and an
// invoice's automatic charge, in the same words as the website and the Android app. Checked
// against fixtures (Tests/SundeckCoreTests/AutopayTests.swift).

/// A saved card or bank account's summary (customer_payment_method; never the number).
public struct SavedMethod: Codable, Equatable, Sendable {
    public var kind: String
    public var brand: String?
    public var last4: String
    public var expMonth: Int?
    public var expYear: Int?
    public var bankName: String?

    public init(
        kind: String, brand: String? = nil, last4: String, expMonth: Int? = nil, expYear: Int? = nil,
        bankName: String? = nil
    ) {
        self.kind = kind
        self.brand = brand
        self.last4 = last4
        self.expMonth = expMonth
        self.expYear = expYear
        self.bankName = bankName
    }

    enum CodingKeys: String, CodingKey {
        case kind, brand, last4
        case expMonth = "exp_month"
        case expYear = "exp_year"
        case bankName = "bank_name"
    }
}

private let cardBrands = [
    "visa": "Visa", "mastercard": "Mastercard", "amex": "American Express", "discover": "Discover",
    "diners": "Diners Club", "jcb": "JCB", "unionpay": "UnionPay",
]

/// "Visa •••• 4242", "Chase •••• 6789", "Bank account •••• 6789".
public func savedMethodLabel(_ m: SavedMethod) -> String {
    if m.kind == "card" { return "\(cardBrands[(m.brand ?? "").lowercased()] ?? "Card") •••• \(m.last4)" }
    let bank = m.bankName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return "\(bank.isEmpty ? "Bank account" : bank) •••• \(m.last4)"
}

/// Whether a card's expiry month is before `today` (YYYY-MM-DD). Bank accounts don't expire.
public func savedMethodExpired(_ m: SavedMethod, today: String) -> Bool {
    guard m.kind == "card", let month = m.expMonth, let year = m.expYear, month > 0, year > 0 else { return false }
    let parts = today.split(separator: "-").compactMap { Int($0) }
    guard parts.count >= 2 else { return false }
    return year < parts[0] || (year == parts[0] && month < parts[1])
}

/// The line under the label: "Expires 04/30", "Expired 04/24", or "Bank account".
public func savedMethodDetail(_ m: SavedMethod, today: String) -> String {
    if m.kind != "card" { return "Bank account" }
    guard let month = m.expMonth, let year = m.expYear, month > 0, year > 0 else { return "Card" }
    let mm = month < 10 ? "0\(month)" : "\(month)"
    let yy = year % 100 < 10 ? "0\(year % 100)" : "\(year % 100)"
    return "\(savedMethodExpired(m, today: today) ? "Expired" : "Expires") \(mm)/\(yy)"
}

/// The shop's autopay settings (company.settings): on (default), retries 0 to 3 (default 2),
/// days between tries 1 to 14 (default 3).
public struct AutopaySettings: Codable, Equatable, Sendable {
    public var on: Bool
    public var retries: Int
    public var retryDays: Int

    public init(on: Bool, retries: Int, retryDays: Int) {
        self.on = on
        self.retries = retries
        self.retryDays = retryDays
    }
}

private func wholeNumber(_ n: Double, from low: Double, to high: Double) -> Int? {
    n.isFinite && n == n.rounded(.towardZero) && n >= low && n <= high ? Int(n) : nil
}

public func autopaySettings(_ settings: JSONValue?) -> AutopaySettings {
    AutopaySettings(
        on: settings?["autopay"] != .bool(false),
        retries: wholeNumber(ECMA.toNumber(settings?["autopay_retries"]), from: 0, to: 3) ?? 2,
        retryDays: wholeNumber(ECMA.toNumber(settings?["autopay_retry_days"]), from: 1, to: 14) ?? 3)
}

/// The next try after a failed one, or nil when there are no more (`triesMade` counts the
/// failed one).
public func autopayNextTry(_ today: String, triesMade: Int, _ s: AutopaySettings) -> String? {
    guard triesMade <= s.retries else { return nil }
    return try? addDays(today, s.retryDays)
}

private let monthAbbreviations = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/// "Nov 19" from YYYY-MM-DD.
public func autopayDay(_ iso: String) -> String {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3, (1...12).contains(parts[1]) else { return iso }
    return "\(monthAbbreviations[parts[1] - 1]) \(parts[2])"
}

/// The words, as AUTOPAY_TEXT.
public enum AutopayText {
    public static let group = "Autopay"
    public static let shopSwitch = "Autopay"
    public static let shopFooter =
        "Customers can save a card or bank account and have their monthly maintenance invoices paid the day they’re sent. Other invoices are charged only when you tap Charge Card on File."
    public static let retries = "Retry Failed Payments"
    public static let retryEvery = "Try Again"
    public static let retriesFooter =
        "When an automatic payment fails, the customer gets an email with their pay link and owners and admins are notified. The card is tried again on this schedule."
    public static let payOverTime = "Offer Pay Over Time"
    public static let payOverTimeFooter =
        "Customers can pay quote deposits and invoices of $50 or more with Affirm or Klarna. You’re paid in full; they pay Affirm or Klarna back over time."
    public static let status = "Status"
    public static let on = "On"
    public static let off = "Off"
    public static let turnOff = "Turn Off Autopay"
    public static let turnOn = "Turn On Autopay"
    public static let request = "Request Card on File"
    public static let remove = "Remove Card"
    public static let charge = "Charge Card on File"
    public static let noMethod = "No card or bank account on file"
    public static let saveForAutopay = "Save for Autopay"
    public static let requestTitle = "Request Card on File"
    public static let removeTitle = "Remove the saved card?"
    public static let removeMessage =
        "The customer’s card or bank account is removed and autopay turns off. Payments already made aren’t changed."
    public static let turnOffTitle = "Turn off autopay?"
    public static let turnOffMessage =
        "Invoices are no longer charged automatically. The card stays saved for Charge Card on File."
    /// Request Card on File's question (the apps' action sheet).
    public static let requestMessage =
        "The customer gets a secure link to save a card or bank account. Nothing is charged until an invoice is sent."
}

/// The Autopay group's Status row: "On" with the method, or "Off".
public struct AutopayStatus: Codable, Equatable, Sendable {
    public var value: String
    public var method: String
}

public func autopayStatus(_ customerAutopay: Bool, _ method: SavedMethod?) -> AutopayStatus {
    guard let method else { return AutopayStatus(value: AutopayText.off, method: AutopayText.noMethod) }
    return AutopayStatus(value: customerAutopay ? AutopayText.on : AutopayText.off, method: savedMethodLabel(method))
}

private let footerShopOff = "Autopay is off for your shop. Turn it on in Settings › Payments and Deposits."
private let footerOn =
    "Monthly maintenance invoices are charged to this card the day they’re sent. Other invoices: Charge Card on File on the invoice."
private let footerSaved =
    "Saved, but not charged automatically. Charge Card on File on an invoice charges it once."
private let footerNone =
    "Send a link so the customer can save a card or bank account. Nothing is charged until an invoice is sent."

/// The line under the Autopay group.
public func autopayGroupFooter(shopOn: Bool, customerAutopay: Bool, method: SavedMethod?) -> String {
    if !shopOn { return footerShopOff }
    if method != nil && customerAutopay { return footerOn }
    return method != nil ? footerSaved : footerNone
}

/// An invoice's latest automatic charge (server-written invoice columns).
public struct AutopayInvoice: Codable, Equatable, Sendable {
    public var status: String?
    public var method: String?
    public var failure: String?
    public var nextTry: String?

    public init(status: String? = nil, method: String? = nil, failure: String? = nil, nextTry: String? = nil) {
        self.status = status
        self.method = method
        self.failure = failure
        self.nextTry = nextTry
    }

    enum CodingKeys: String, CodingKey {
        case status = "autopay_status"
        case method = "autopay_method"
        case failure = "autopay_failure"
        case nextTry = "autopay_next_try"
    }
}

private func sentence(_ text: String) -> String { text.hasSuffix(".") ? text : "\(text)." }

/// The office's line on an invoice: "Paid automatically with Visa •••• 4242", or the failure.
public func autopayInvoiceLine(_ inv: AutopayInvoice) -> String? {
    let named = inv.method?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let method = named.isEmpty ? "the saved card" : named
    switch inv.status {
    case "succeeded": return "Paid automatically with \(method)"
    case "processing": return "Charged to \(method); the bank payment is processing"
    case "failed":
        let why = inv.failure?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let next = inv.nextTry.map { " Trying again \(autopayDay($0))." } ?? " No more tries."
        return "Autopay failed\(why.isEmpty ? "." : ": \(sentence(why))")\(next)"
    default: return nil
    }
}

/// "3" or "2.9" from basis points (core bpsToPercent).
func percentText(_ bps: Int) -> String {
    var text = String(format: "%.2f", Double(bps) / 100)
    while text.hasSuffix("0") { text.removeLast() }
    if text.hasSuffix(".") { text.removeLast() }
    return text
}

/// The shop's card fee in basis points (settings.card_fee_bps): 0 when off, at most 3% (core
/// cardFeeBps).
public func cardFeeBps(_ settings: JSONValue?) -> Int {
    let v = ECMA.toNumber(settings?["card_fee_bps"])
    guard v.isFinite, v == v.rounded(.towardZero), v > 0 else { return 0 }
    return Int(min(v, 300))
}

/// Charge Card on File's confirmation.
public struct ChargeConfirm: Codable, Equatable, Sendable {
    public var title: String
    public var message: String
    public var confirm: String
    public var totalCents: Int
    public var feeCents: Int
}

public func chargeConfirm(method: SavedMethod, balanceCents: Int, feeBps: Int, customer: String) -> ChargeConfirm {
    let label = savedMethodLabel(method)
    let card = method.kind == "card"
    let feeCents = card && feeBps > 0 ? (balanceCents * feeBps + 5_000) / 10_000 : 0
    let total = balanceCents + feeCents
    let fee = feeCents > 0 ? " That includes the \(percentText(feeBps))% card fee (\(formatCents(feeCents)))." : ""
    let bank = card ? "" : " Bank payments take a few business days to clear."
    return ChargeConfirm(
        title: "Charge \(label)?", message: "\(customer) is charged \(formatCents(total)) now.\(fee)\(bank)",
        confirm: "Charge \(formatCents(total))", totalCents: total, feeCents: feeCents)
}
