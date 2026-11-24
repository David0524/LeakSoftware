import Foundation

// Refunds on a shop's invoices (owner, 2026-11-24: "how would we reverse a charge?"). Port of
// packages/core/src/refund.ts: owners and admins refund a card or bank payment, all of it or
// part, through the shop's own Stripe account. The same rules and words on the website and both
// apps.

/// A payment as the invoice has it: `amountCents` is what's still kept after refunds.
public struct RefundablePayment: Codable, Equatable, Sendable {
    public var amountCents: Cents
    public var method: String
    public var status: String
    /// Refunded so far (0 when none).
    public var refundedCents: Cents

    enum CodingKeys: String, CodingKey {
        case method, status
        case amountCents = "amount_cents"
        case refundedCents = "refunded_cents"
    }

    public init(amountCents: Cents, method: String, status: String, refundedCents: Cents = 0) {
        self.amountCents = amountCents
        self.method = method
        self.status = status
        self.refundedCents = refundedCents
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        amountCents = try c.decode(Cents.self, forKey: .amountCents)
        method = try c.decode(String.self, forKey: .method)
        status = try c.decode(String.self, forKey: .status)
        refundedCents = try c.decodeIfPresent(Cents.self, forKey: .refundedCents) ?? 0
    }
}

public enum RefundText {
    public static let button = "Refund"
    public static let title = "Refund Payment"
    public static let full = "Refund Full"
    public static let part = "Refund Part"
    public static let amountLabel = "Amount"
    public static let offline = "Refunds need a signal."
    /// Payments that went through Stripe, so Stripe can send them back.
    public static let methods = ["card", "ach"]
}

/// What can still be refunded on a payment: what it still holds, when Stripe took it.
public func refundableCents(_ p: RefundablePayment) -> Cents {
    guard p.status == "succeeded", RefundText.methods.contains(p.method) else { return 0 }
    return max(0, p.amountCents)
}

/// Refund shows to owners and admins only (techs record payments but never refund them), on a
/// sent invoice that isn't void, for a card or bank payment with something left to refund.
public func canRefund(role: String?, invoiceStatus: String, _ p: RefundablePayment) -> Bool {
    (role == "owner" || role == "admin") && invoiceStatus != "draft" && invoiceStatus != "void"
        && refundableCents(p) > 0
}

/// The sheet's explanation, for the payment's method.
public func refundExplainer(_ method: String) -> String {
    let place = method == "ach" ? "bank account" : "card"
    return "The money goes back to the customer’s \(place) through your Stripe account. "
        + "It takes 5 to 10 business days to show. A refund can’t be undone."
}

/// The sheet's button: "Refund $80.00".
public func refundButtonText(_ cents: Cents) -> String { "Refund \(formatCents(cents))" }

/// After the refund went through.
public func refundDoneText(_ cents: Cents) -> String { "Refunded \(formatCents(cents))." }

/// The amount to refund, or why it can't be.
public enum RefundAmount: Equatable, Sendable, Encodable {
    case cents(Cents)
    case error(String)

    public var cents: Cents? {
        if case .cents(let c) = self { return c }
        return nil
    }

    public var error: String? {
        if case .error(let e) = self { return e }
        return nil
    }

    enum CodingKeys: String, CodingKey { case cents, error }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .cents(let cents): try c.encode(cents, forKey: .cents)
        case .error(let error): try c.encode(error, forKey: .error)
        }
    }
}

/// The amount to refund: all of what's left, or the amount typed for part (more than $0, no more
/// than what's left).
public func refundAmount(part: Bool, typed: String, refundable: Cents) -> RefundAmount {
    if refundable <= 0 { return .error("Nothing is left to refund on this payment.") }
    if !part { return .cents(refundable) }
    guard let cents = parseDollars(typed), cents > 0 else { return .error("Enter an amount, like 25.00.") }
    if cents > refundable { return .error("Refund \(formatCents(refundable)) or less.") }
    return .cents(cents)
}

/// Said after the payment's line: "Refunded $20.00", "Refunded" when all of it.
public func refundedText(_ p: RefundablePayment) -> String? {
    // Refunded in full: the line's own status word says so.
    if p.status == "refunded" { return nil }
    return p.refundedCents > 0 ? "Refunded \(formatCents(p.refundedCents))" : nil
}
