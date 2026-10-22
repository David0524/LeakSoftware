import Foundation

// Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"). Port of
// packages/core/src/receipt.ts: Record Payment's method and check number, and the Send Receipt
// sheet's words, the same on the website and both apps.

/// How a payment the shop records was paid.
public enum ManualPaymentMethod: String, Codable, CaseIterable, Sendable {
    case cash, check, other

    public var label: String {
        switch self {
        case .cash: "Cash"
        case .check: "Check"
        case .other: "Other"
        }
    }
}

/// How a receipt goes to the customer.
public enum ReceiptChannel: String, Codable, CaseIterable, Sendable {
    case email, text

    public var label: String {
        switch self {
        case .email: "Email"
        case .text: "Text"
        }
    }
}

public enum ReceiptText {
    public static let methodLabel = "Paid by"
    public static let checkNumberLabel = "Check number"
    public static let checkNumberHint = "Optional. It shows on the receipt."
    /// The most a check number can be, as the database keeps it.
    public static let checkNumberMax = 20
    public static let send = "Send Receipt"
    public static let notNow = "Not Now"
    public static let emailLabel = "Customer email"
    public static let phoneLabel = "Mobile number"
    public static let textHint = "Texted from your company number."
    public static let offline =
        "Sending a receipt needs a connection. Use Send Receipt on the invoice when you’re back online."
}

/// "#1234 " -> "1234"; nothing typed -> nil.
public func cleanCheckNumber(_ text: String?) -> String? {
    var s = ECMA.trim(text ?? "")
    while s.hasPrefix("#") { s.removeFirst() }
    s = ECMA.trim(s)
    return s.isEmpty ? nil : s
}

public func checkNumberError(_ text: String?) -> String? {
    guard let s = cleanCheckNumber(text), s.utf16.count > ReceiptText.checkNumberMax else { return nil }
    return "Enter a check number up to \(ReceiptText.checkNumberMax) characters."
}

/// "Cash", "Check #1234", "Card", "Bank account", "Other payment"; the office's lists say "Bank"
/// and "Recorded by the office".
public func paymentMethodLabel(_ method: String, checkNumber: String? = nil, office: Bool = false) -> String {
    switch method {
    case "cash": "Cash"
    case "check": cleanCheckNumber(checkNumber).map { "Check #\($0)" } ?? "Check"
    case "card": "Card"
    case "ach": office ? "Bank" : "Bank account"
    case "other": office ? "Recorded by the office" : "Other payment"
    default: method
    }
}

/// A payment, as a receipt needs it.
public struct ReceiptPayment: Codable, Equatable, Sendable {
    public var id: String
    public var amountCents: Cents
    public var method: String
    public var checkNumber: String?
    public var status: String
    public var paidAt: String?

    enum CodingKeys: String, CodingKey {
        case id, method, status
        case amountCents = "amount_cents"
        case checkNumber = "check_number"
        case paidAt = "paid_at"
    }

    public init(
        id: String, amountCents: Cents, method: String, checkNumber: String? = nil, status: String,
        paidAt: String? = nil
    ) {
        self.id = id
        self.amountCents = amountCents
        self.method = method
        self.checkNumber = checkNumber
        self.status = status
        self.paidAt = paidAt
    }
}

/// The payment a receipt is for when none is named: the latest received one.
public func latestReceiptPayment(_ payments: [ReceiptPayment]) -> ReceiptPayment? {
    var best: ReceiptPayment?
    for p in payments where p.status == "succeeded" {
        if best == nil || (p.paidAt ?? "") >= (best?.paidAt ?? "") { best = p }
    }
    return best
}

/// Send Receipt shows on a sent invoice (not void) with a payment received.
public func canSendReceipt(status: String, payments: [ReceiptPayment]) -> Bool {
    status != "draft" && status != "void" && payments.contains { $0.status == "succeeded" }
}

/// "Balance remaining $449.00", or "Paid in full".
public func receiptBalanceText(totalCents: Cents, amountPaidCents: Cents) -> String {
    let balance = max(totalCents - amountPaidCents, 0)
    return balance > 0 ? "Balance remaining \(formatCents(balance))" : "Paid in full"
}

/// The Send Receipt sheet's line: "$200.00 · Check #1234 · Balance remaining $449.00".
public func receiptSummary(_ payment: ReceiptPayment, totalCents: Cents, amountPaidCents: Cents) -> String {
    [
        formatCents(payment.amountCents), paymentMethodLabel(payment.method, checkNumber: payment.checkNumber),
        receiptBalanceText(totalCents: totalCents, amountPaidCents: amountPaidCents),
    ].joined(separator: " · ")
}

/// The sheet's first line right after recording.
public func receiptPrompt(status: String) -> String {
    "\(status == "paid" ? "Paid in full." : "Payment recorded.") Send the customer a receipt?"
}

/// Why the address can't take the receipt, or nil.
public func receiptRecipientError(_ channel: ReceiptChannel, _ to: String) -> String? {
    let t = ECMA.trim(to)
    switch channel {
    case .email: return t.wholeMatch(of: /\S+@\S+\.\S+/) != nil ? nil : "Enter the customer’s email."
    case .text: return toE164(t) != nil ? nil : "Enter a mobile number like (602) 555-0142."
    }
}

/// "Receipt emailed to sam@example.com." / "Receipt texted to (602) 555-0142."
public func receiptSentMessage(_ channel: ReceiptChannel, _ to: String) -> String {
    let t = ECMA.trim(to)
    switch channel {
    case .email: return "Receipt emailed to \(t)."
    case .text: return "Receipt texted to \(formatPhone(toE164(t) ?? t))."
    }
}

/// The text message the server sends (the website words it; ported for the fixtures).
public func receiptTextMessage(
    shop: String, payment: ReceiptPayment, number: Int?, totalCents: Cents, amountPaidCents: Cents, link: String
) -> String {
    let balance = max(totalCents - amountPaidCents, 0)
    let what = "Invoice" + (number.map { $0 != 0 ? " #\($0)" : "" } ?? "")
    return [
        "\(shop): Thank you for your \(formatCents(payment.amountCents)) payment (\(paymentMethodLabel(payment.method, checkNumber: payment.checkNumber))).",
        balance > 0 ? "Balance remaining on \(what): \(formatCents(balance))." : "\(what) is paid in full.",
        "Your receipt: \(link)",
    ].joined(separator: " ")
}
