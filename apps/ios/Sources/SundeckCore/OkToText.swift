import Foundation

// OK to Text (owner, 2026-11-28): a customer said it's OK to text them, recorded with the date
// and who marked it. Texts still go to customers not marked; the message screens remind the
// sender. Port of ok-to-text.ts (the website and Android say the same).

public enum OkToText {
    public static let label = "OK to Text"
    public static let hint = "They said it’s OK to text them about their service."
    public static let reminder = "Not marked OK to Text yet. Text only customers who said it’s OK."
    public static let mark = "Mark OK to Text"

    /// "Replied STOP", "Yes · Nov 28, 2026", or "Not yet".
    public static func value(_ at: String?, repliedStop: Bool, timeZone: String) -> String {
        if repliedStop { return "Replied STOP" }
        guard let at, let ms = ECMA.parseDate(at) else { return "Not yet" }
        let date = Date(timeIntervalSince1970: ms / 1000)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: timeZone) ?? .current
        f.dateFormat = "MMM d, yyyy"
        return "Yes · \(f.string(from: date))"
    }

    /// Whether a message screen reminds the sender: a known customer, not marked, not STOP.
    public static func needsMark(textOkAt: String?, isCustomer: Bool, repliedStop: Bool) -> Bool {
        isCustomer && (textOkAt ?? "").isEmpty && !repliedStop
    }
}
