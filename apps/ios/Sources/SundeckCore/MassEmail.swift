import Foundation

// Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"): the words of
// packages/core/src/mass-email.ts, the same on every platform. The server counts, sends, and
// fills {first name}; the phone only shows. Checked against the TypeScript by
// Tests/SundeckCoreTests/MassEmailTests.swift (fixtures: apps/ios/fixtures/cases/mass-email.ts).

public enum MassEmailText {
    public static let title = "Email Customers"
    public static let anyCity = "Any City"
    public static let subjectLimit = 150
    public static let bodyLimit = 10_000
    public static let messageNote =
        "Write {first name} to use each customer’s first name. Every email ends with your shop’s name, mailing address and an unsubscribe link."
    public static let noAddress =
        "Add your shop’s mailing address in Settings › Company first. The law asks for it in every email like this."
    public static let offline = "Sending needs a connection. Try again when you have signal."
    public static let listChanged = "The list changed. Check the count and send again."
    public static let nobody = "No customers with an email match. Change who it goes to."
    public static let historyEmpty = "No emails sent yet."
    public static let sendTest = "Send Test to Me"

    /// "Test sent to dana@example.com."
    public static func testSent(_ email: String) -> String { "Test sent to \(email)." }
}

/// Last Job: had a job in the last N days (nil: any time).
public struct LastJobChoice: Codable, Hashable, Sendable {
    public var days: Int?
    public var label: String

    public init(days: Int?, label: String) {
        self.days = days
        self.label = label
    }

    public static let all: [LastJobChoice] = [
        LastJobChoice(days: nil, label: "Any Time"),
        LastJobChoice(days: 30, label: "Last 30 Days"),
        LastJobChoice(days: 90, label: "Last 90 Days"),
        LastJobChoice(days: 365, label: "Last Year"),
    ]

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(days, forKey: .days)  // null, as the TypeScript has it
        try c.encode(label, forKey: .label)
    }
}

/// The server's count: who gets it, and who is left out.
public struct MassEmailCount: Codable, Hashable, Sendable {
    public var recipients: Int
    public var noEmail: Int
    public var unsubscribed: Int

    public init(recipients: Int, noEmail: Int, unsubscribed: Int) {
        self.recipients = recipients
        self.noEmail = noEmail
        self.unsubscribed = unsubscribed
    }

    enum CodingKeys: String, CodingKey {
        case recipients
        case noEmail = "no_email"
        case unsubscribed
    }
}

private func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

/// Under the To group: "42 customers with an email." and "5 left out: 3 without an email, 2
/// unsubscribed." when anyone is.
public struct MassEmailCountText: Codable, Hashable, Sendable {
    public var count: String
    public var skipped: String?

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(count, forKey: .count)
        try c.encode(skipped, forKey: .skipped)
    }

    enum CodingKeys: String, CodingKey { case count, skipped }
}

public func massEmailCountText(_ c: MassEmailCount) -> MassEmailCountText {
    var parts: [String] = []
    if c.noEmail > 0 { parts.append("\(c.noEmail) without an email") }
    if c.unsubscribed > 0 { parts.append("\(c.unsubscribed) unsubscribed") }
    return MassEmailCountText(
        count: "\(plural(c.recipients, "customer", "customers")) with an email.",
        skipped: parts.isEmpty
            ? nil : "\(c.noEmail + c.unsubscribed) left out: \(parts.joined(separator: ", "))."
    )
}

/// "Send to 42 Customers", "Send to 1 Customer", or "Send" for nobody.
public func massEmailSendLabel(_ recipients: Int) -> String {
    recipients <= 0 ? "Send" : "Send to \(recipients) \(recipients == 1 ? "Customer" : "Customers")"
}

public struct MassEmailConfirm: Codable, Hashable, Sendable {
    public var title: String
    public var message: String
    public var confirmLabel: String
}

/// The alert before sending.
public func massEmailConfirm(_ recipients: Int, subject: String, shop: String) -> MassEmailConfirm {
    var name = shop.trimmingCharacters(in: .whitespacesAndNewlines)
    if name.hasSuffix(".") { name.removeLast() }
    return MassEmailConfirm(
        title: "Send to \(plural(recipients, "customer", "customers"))?",
        message:
            "“\(subject.trimmingCharacters(in: .whitespacesAndNewlines))” goes out now from \(name). It can’t be unsent.",
        confirmLabel: "Send")
}

/// After sending.
public func massEmailSentText(sent: Int, failed: Int) -> String {
    if sent == 0 { return "It didn’t go. Check the addresses and try again." }
    return "Sent to \(plural(sent, "customer", "customers")).\(failed > 0 ? " \(failed) didn’t go." : "")"
}

/// A history row's line after the date.
public func massEmailHistoryText(status: String, sent: Int, failed: Int, recipients: Int) -> String {
    if status == "sending" { return "Sending to \(recipients)…" }
    if status == "failed" || sent == 0 { return "Didn’t go" }
    return "Sent to \(sent)\(failed > 0 ? " · \(failed) didn’t go" : "")"
}

/// When the list is bigger than what's left of today's mass email allowance (its own, apart from
/// reports and invoices; owner, 2026-10-22: "Give mass email its own limit").
public func massEmailLimitText(_ left: Int) -> String {
    left <= 0
        ? "Your shop has reached today’s limit for emailing customers. It resets tomorrow."
        : "Your shop can email \(plural(left, "more customer", "more customers")) today. Narrow the list or send the rest tomorrow."
}

/// The customer's one email setting: one unsubscribe covers mass, reminder and review emails
/// (`CUSTOMER_EMAILS_LABEL`, `CUSTOMER_EMAILS_OFF_LABEL`; owner, 2026-10-22).
public enum CustomerEmailsText {
    /// Its row on the customer page, On or Off.
    public static let label = "Reminder, review and shop emails"
    /// Its switch in Contact Details.
    public static let offLabel = "No reminder, review or shop emails"
}

/// Field errors before sending (empty when it can go), keyed "subject" and "body".
public func massEmailErrors(subject: String, body: String) -> [String: String] {
    var errors: [String: String] = [:]
    let s = subject.trimmingCharacters(in: .whitespacesAndNewlines)
    let b = body.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.isEmpty {
        errors["subject"] = "Add a subject."
    } else if s.utf16.count > MassEmailText.subjectLimit {
        errors["subject"] = "Keep the subject under \(MassEmailText.subjectLimit) characters."
    }
    if b.isEmpty {
        errors["body"] = "Write a message."
    } else if b.utf16.count > MassEmailText.bodyLimit {
        errors["body"] = "This message is too long. Keep it under 10,000 characters."
    }
    return errors
}
