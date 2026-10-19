/// Phone numbers. Port of the number rules in texting.ts.

/// A US phone number as E.164 (+16025550142), or nil when it isn't one. Accepts the ways people
/// type them: (602) 555-0142, 602.555.0142, 1-602-555-0142, +1 602 555 0142.
public func toE164(_ input: String?) -> String? {
    guard let input, !input.isEmpty else { return nil }
    let trimmed = input.trimmingWhitespace()
    let digits = String(trimmed.filter { $0.isASCII && $0.isNumber })
    if trimmed.hasPrefix("+"), !trimmed.hasPrefix("+1") {
        return (8...15).contains(digits.count) ? "+\(digits)" : nil
    }
    let ten = digits.count == 11 && digits.hasPrefix("1") ? String(digits.dropFirst()) : digits
    // North American numbers: area code and exchange can't start with 0 or 1.
    return ten.wholeMatch(of: /[2-9]\d{2}[2-9]\d{6}/) != nil ? "+1\(ten)" : nil
}

/// "(602) 555-0142" for US numbers; others as stored.
public func formatPhone(_ e164: String) -> String {
    guard let match = e164.wholeMatch(of: /\+1(\d{3})(\d{3})(\d{4})/) else { return e164 }
    return "(\(match.1)) \(match.2)-\(match.3)"
}

extension String {
    /// JavaScript's `trim()`.
    func trimmingWhitespace() -> String {
        String(drop(while: \.isWhitespace).reversed().drop(while: \.isWhitespace).reversed())
    }
}
