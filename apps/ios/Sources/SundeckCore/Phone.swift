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

/// A US phone number formatted as it's typed (owner, 2026-10-20: "When you type in Phone numbers
/// it should put the parentheses and dash in for you"): "(602", "(602) 555", "(602) 555-0142".
/// A leading 1 is the country code ("+1 (602) 555-0142"). Anything else is left as typed: a "+"
/// number from another country, letters, or more than ten digits. Port of `formatPhoneTyping`.
public func formatPhoneTyping(_ text: String) -> String {
    let trimmed = text.trimmingWhitespace()
    if trimmed.unicodeScalars.contains(where: isASCIILetter) || (trimmed.hasPrefix("+") && !trimmed.hasPrefix("+1")) {
        return text
    }
    var digits = asciiDigits(trimmed)
    var prefix = ""
    if digits.hasPrefix("1") {
        prefix = "+1 "
        digits.removeFirst()
    }
    if digits.count > 10 { return text }
    if digits.isEmpty { return prefix.trimmingWhitespace() }
    let area = String(digits.prefix(3))
    let mid = String(digits.dropFirst(3).prefix(3))
    let last = String(digits.dropFirst(6))
    let body =
        digits.count <= 3 ? "(\(area)" : digits.count <= 6 ? "(\(area)) \(mid)" : "(\(area)) \(mid)-\(last)"
    return prefix + body
}

/// Where the caret goes in a formatted number: just after its `digits`-th digit, in UTF-16 units
/// (JavaScript's string indexes). Port of `phoneCaret`.
public func phoneCaret(_ formatted: String, _ digits: Int) -> Int {
    let units = Array(formatted.utf16)
    if digits <= 0 { return formatted.hasPrefix("+1") ? min(units.count, 2) : 0 }
    var seen = 0
    for (i, unit) in units.enumerated() {
        if (48...57).contains(unit) { seen += 1 }
        if seen == digits { return i + 1 }
    }
    return units.count
}

/// The ASCII digits of `text` (`text.replace(/\D/g, "")`).
func asciiDigits(_ text: String) -> String {
    String(String.UnicodeScalarView(text.unicodeScalars.filter { ("0"..."9").contains($0) }))
}

private func isASCIILetter(_ s: Unicode.Scalar) -> Bool { ("A"..."Z").contains(s) || ("a"..."z").contains(s) }

extension String {
    /// JavaScript's `trim()`.
    func trimmingWhitespace() -> String {
        String(drop(while: \.isWhitespace).reversed().drop(while: \.isWhitespace).reversed())
    }
}
