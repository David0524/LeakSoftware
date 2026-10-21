/// Money is stored and calculated as integer cents. Convert only at the edges.
/// Port of packages/core/src/money.ts.
public typealias Cents = Int

/// Format cents as US dollars, e.g. 123456 -> "$1,234.56".
public func formatCents(_ cents: Cents) -> String {
    let magnitude = cents.magnitude
    let dollars = String(magnitude / 100)
    var grouped = ""
    for (index, digit) in dollars.enumerated() {
        if index > 0, (dollars.count - index) % 3 == 0 { grouped.append(",") }
        grouped.append(digit)
    }
    let remainder = magnitude % 100
    return "\(cents < 0 ? "-" : "")$\(grouped).\(remainder < 10 ? "0" : "")\(remainder)"
}

/// The largest amount a person can type: $9,999,999.99 (it fits the database's integer cents).
public let maxEnteredCents: Cents = 999_999_999

/// Parse a user-entered dollar amount ("1,234.5", "$12") into cents. Returns nil if invalid.
/// Commas only group thousands, so "1,5" (a decimal comma) is refused rather than read as $15.
/// Amounts over `maxEnteredCents` are refused.
public func parseDollars(_ input: String) -> Cents? {
    let trimmed = String(input.filter { $0 != "$" && !$0.isWhitespace })
    guard trimmed.wholeMatch(of: /-?(\d{1,3}(,\d{3})+|\d+)(\.\d{0,2})?/) != nil else { return nil }
    let cleaned = String(trimmed.filter { $0 != "," })
    let negative = cleaned.hasPrefix("-")
    let parts = cleaned.drop(while: { $0 == "-" }).split(separator: ".", omittingEmptySubsequences: false)
    let whole = parts.first.map(String.init) ?? "0"
    var fraction = parts.count > 1 ? String(parts[1]) : ""
    while fraction.count < 2 { fraction.append("0") }
    guard let wholeValue = Int(whole), let fractionValue = Int(fraction) else { return nil }
    // Too large for integer cents ("999999999999999999"): refused rather than overflowing.
    let (hundreds, over) = wholeValue.multipliedReportingOverflow(by: 100)
    let (cents, over2) = hundreds.addingReportingOverflow(fractionValue)
    guard !over, !over2, cents <= maxEnteredCents else { return nil }
    return negative ? -cents : cents
}
