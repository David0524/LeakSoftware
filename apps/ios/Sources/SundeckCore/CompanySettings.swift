import Foundation

// Settings › Company and Branding (settings.ts, followups.ts), for the phone's own screen
// (owner, 2026-10-20: "From the app, do not link to the website").

/// `#RRGGBB` (`isHexColor`).
public func isHexColor(_ v: JSONValue?) -> Bool {
    guard case .string(let s)? = v else { return false }
    return s.wholeMatch(of: /#[0-9a-fA-F]{6}/) != nil
}

public func isHexColor(_ s: String) -> Bool { isHexColor(.string(s)) }

/// Reminder days ("3, 7") in order without repeats, each 1 to 365; nil when any isn't
/// (`parseReminderDays`). Empty: none.
public func parseReminderDays(_ input: String) -> [Int]? {
    let parts = input.split(whereSeparator: { $0 == "," || $0.isWhitespace }).map(String.init).filter { !$0.isEmpty }
    if parts.contains(where: { $0.wholeMatch(of: /[0-9]{1,3}/) == nil }) { return nil }
    let days = parts.compactMap { Int($0) }
    if days.contains(where: { $0 < 1 || $0 > 365 }) { return nil }
    return Array(Set(days)).sorted()
}
