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

/// Parse a user-entered dollar amount ("1,234.5", "$12") into cents. Returns nil if invalid.
public func parseDollars(_ input: String) -> Cents? {
    let cleaned = String(input.filter { $0 != "$" && $0 != "," && !$0.isWhitespace })
    guard cleaned.wholeMatch(of: /-?\d+(\.\d{0,2})?/) != nil else { return nil }
    let negative = cleaned.hasPrefix("-")
    let parts = cleaned.drop(while: { $0 == "-" }).split(separator: ".", omittingEmptySubsequences: false)
    let whole = parts.first.map(String.init) ?? "0"
    var fraction = parts.count > 1 ? String(parts[1]) : ""
    while fraction.count < 2 { fraction.append("0") }
    guard let wholeValue = Int(whole), let fractionValue = Int(fraction) else { return nil }
    // Too large for integer cents ("999999999999999999"): refused rather than overflowing.
    let (hundreds, over) = wholeValue.multipliedReportingOverflow(by: 100)
    let (cents, over2) = hundreds.addingReportingOverflow(fractionValue)
    guard !over, !over2 else { return nil }
    return negative ? -cents : cents
}
