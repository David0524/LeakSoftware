import Foundation

// Link previews for quotes, invoices and reports (owner, 2026-10-24): the share sheet hands
// Messages the customer link as a link, so Messages shows its preview card (the shop's logo,
// "Quote", the amount), with the words beside it. Port of splitShareMessage and
// customerLinkToken in link-preview.ts.

/// A text for the customer, split into its words and its link.
public struct SharedMessage: Encodable, Equatable, Sendable {
    /// "Bluefin Pool Co.: your invoice. View and pay it here:" (empty when it was only the link).
    public let text: String
    /// The link at the end, or nil when the text doesn't end with one.
    public let url: String?

    enum CodingKeys: String, CodingKey { case text, url }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encode(url, forKey: .url)
    }
}

/// The words and the link of a text that ends with its link (`splitShareMessage`).
public func splitShareMessage(_ message: String) -> SharedMessage {
    let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let match = trimmed.firstMatch(of: /(https?:\/\/\S+)\s*$/) else {
        return SharedMessage(text: trimmed, url: nil)
    }
    let words = trimmed[..<match.range.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
    return SharedMessage(text: words, url: String(match.output.1))
}

/// The token of a quote, invoice or report link (/q/…, /i/…, /r/…), or nil (`customerLinkToken`).
public func customerLinkToken(_ url: String) -> String? {
    guard let match = url.firstMatch(of: /\/(?:q|i|r)\/([0-9a-f]{32})(?:[\/?#]|$)/) else { return nil }
    return String(match.output.1)
}
