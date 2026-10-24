import Foundation

// "How did you hear about us?" on sign-up (owner, 2026-10-24), the same on the website and both
// apps. Optional: it never blocks a sign-up. Port of heard-from.ts; the heard-from fixtures check
// the two lists match.

public let heardFromQuestion = "How did you hear about us?"
/// The menu's first entry while nothing is chosen.
public let heardFromNone = "Choose One"
/// The short text field "Other" reveals.
public let heardFromOtherPlaceholder = "Tell us where"
/// Longest "Other" answer kept, in characters.
public let heardFromOtherMax = 100

public struct HeardFromOption: Codable, Equatable, Sendable {
    public let key: String
    public let label: String
}

/// In the order the owner set. A key is also a sign-up link's `?from=<key>`.
public let heardFromOptions: [HeardFromOption] = [
    ("google", "Google"), ("app_store", "App Store or Google Play"), ("pool_pro", "Another Pool Pro"),
    ("customer_referral", "Customer Referral"), ("pool_supplier", "Pool Supplier"), ("route_broker", "Route Broker"),
    ("social_media", "Social Media"), ("industry_group", "Industry Group or Forum"),
    ("trade_show", "Trade Show or Event"), ("advertisement", "Advertisement"), ("card", "Laminate Card"),
    ("other", "Other"),
].map { HeardFromOption(key: $0.0, label: $0.1) }

/// A known option's key (any case, spaces around ignored), else nil.
public func parseHeardFrom(_ value: String?) -> String? {
    guard let v = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else { return nil }
    return heardFromOptions.first { $0.key == v }?.key
}

/// What "Other" said: one line, trimmed, at most `heardFromOtherMax` characters; else nil.
public func heardFromOther(_ key: String?, _ text: String?) -> String? {
    guard key == "other", let text else { return nil }
    let line = text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    guard !line.isEmpty else { return nil }
    // Characters by Unicode scalar, as the TypeScript counts code points.
    let cut = String(String.UnicodeScalarView(line.unicodeScalars.prefix(heardFromOtherMax)))
    return cut.trimmingCharacters(in: .whitespaces)
}
