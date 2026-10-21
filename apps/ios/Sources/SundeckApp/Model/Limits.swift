import Foundation

// The website's checks for edge inputs (apps/web/src/lib/limits.ts, break testing 2026-10-20),
// with its words, so the phone refuses the same things before they reach the server.

public enum Limits {
    /// Longest quote or invoice line description.
    public static let lineDescriptionMax = 500
    /// Longest signer's name.
    public static let signerNameMax = 200
    /// Longest price book item name, and unit.
    public static let itemNameMax = 200
    public static let itemUnitMax = 40

    public static let discountTooLargeText = "The discount can’t be more than the subtotal."
    public static let reviewLinkText = "Enter a web address that starts with https://."
    public static let itemNameText = "Keep the name under 200 characters."
    public static let itemUnitText = "Keep the unit short, like each or hour."

    /// A discount can't be more than what it comes off (it would make the total $0).
    public static func discountTooLarge(_ discountCents: Int, subtotal: Int) -> String? {
        discountCents > subtotal ? discountTooLargeText : nil
    }

    public static func lineDescriptionError(_ description: String) -> String? {
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return "Describe the work." }
        if text.utf16.count > lineDescriptionMax {
            return "Keep the description under \(lineDescriptionMax) characters."
        }
        return nil
    }

    /// The signer's name, too long (the website refuses over 200 characters).
    public static func signerNameError(_ name: String) -> String? {
        name.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > signerNameMax
            ? "Keep the name under \(signerNameMax) characters." : nil
    }

    /// Job dates are 2000 through 2100: anything else is a typo (year 0001, 9999); a date that
    /// doesn't exist (February 30) isn't one.
    public static func jobDateError(_ date: String) -> String? {
        guard let m = date.wholeMatch(of: /(\d{4})-(\d{2})-(\d{2})/), let y = Int(m.output.1),
            let mo = Int(m.output.2), let d = Int(m.output.3)
        else { return "Pick a date." }
        if y < 2000 || y > 2100 { return "Pick a date between 2000 and 2100." }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let real = calendar.date(from: DateComponents(year: y, month: mo, day: d)) else { return "Pick a date." }
        let back = calendar.dateComponents([.year, .month, .day], from: real)
        return back.year == y && back.month == mo && back.day == d ? nil : "Pick a date."
    }

    /// Only web links (http or https with a host): a review link goes into customer emails.
    public static func isWebURL(_ value: String) -> Bool {
        guard let parts = URLComponents(string: value.trimmingCharacters(in: .whitespaces)),
            let scheme = parts.scheme?.lowercased(), scheme == "https" || scheme == "http",
            let host = parts.host, !host.isEmpty
        else { return false }
        return true
    }
}
