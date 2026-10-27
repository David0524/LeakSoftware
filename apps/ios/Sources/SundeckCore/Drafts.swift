import Foundation

// Drafts (owner, 2026-10-27: "Fix the draft text"): typed text in a form that isn't saved yet is
// kept on the device and put back when the same form is opened again, until it is saved, sent,
// or discarded. Only text; per signed-in person; gone after seven days and at sign-out.
// Port of packages/core/src/drafts.ts.

public enum Drafts {
    /// The note under a form whose draft was put back, and its button.
    public static let note = "Draft restored"
    public static let discardLabel = "Discard Draft"
    public static let days = 7
    public static let ttlMs: Double = 7 * 24 * 60 * 60 * 1000
    /// Typing is kept this long after the last keystroke (and at once when the app goes away).
    public static let saveDelayMs = 400
    public static let maxFields = 40
    public static let maxChars = 20_000
    public static let prefix = "draft:"

    /// Where a form's draft lives: per person, per form, per record ("new" for a form that makes one).
    public static func key(user: String, form: String, id: String = "new") -> String {
        func part(_ s: String) -> String { s.replacingOccurrences(of: ":", with: "_") }
        return "\(prefix)\(part(user)):\(part(form)):\(part(id.isEmpty ? "new" : id))"
    }

    /// The fields worth keeping: text only, within the limits.
    public static func keepable(_ fields: [String: String]) -> [String: String] {
        var out: [String: String] = [:]
        for name in fields.keys.sorted() {
            if out.count >= maxFields { break }
            if name.isEmpty { continue }
            out[name] = String(fields[name]!.prefix(maxChars))
        }
        return out
    }

    /// Whether any field holds something typed.
    public static func hasText(_ fields: [String: String]) -> Bool {
        fields.values.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    /// What to store for these fields at time `now` (ms), or nil when there is nothing to keep.
    public static func record(_ fields: [String: String], now: Double) -> DraftRecord? {
        let kept = keepable(fields)
        return hasText(kept) ? DraftRecord(v: 1, at: now, fields: kept) : nil
    }

    /// Whether a draft saved at `savedAt` (ms) has outlived its seven days.
    public static func expired(savedAt: Double, now: Double) -> Bool {
        !(savedAt.isFinite && now - savedAt < ttlMs && savedAt <= now + 60_000)
    }

    /// A stored draft's fields, or nil when it is missing, damaged, expired or empty.
    public static func read(_ raw: String?, now: Double) -> [String: String]? {
        guard let raw, let data = raw.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            (object["v"] as? NSNumber)?.intValue == 1, let at = (object["at"] as? NSNumber)?.doubleValue,
            !expired(savedAt: at, now: now), let raw = object["fields"] as? [String: Any]
        else { return nil }
        var strings: [String: String] = [:]
        for (name, value) in raw { if let s = value as? String { strings[name] = s } }
        let fields = keepable(strings)
        return hasText(fields) ? fields : nil
    }

    /// The fields to put back: those the draft holds that differ from what the form shows now.
    public static func changes(current: [String: String], draft: [String: String]) -> [String: String] {
        draft.filter { name, value in current[name].map { $0 != value } ?? false }
    }
}

public struct DraftRecord: Codable, Equatable, Sendable {
    public let v: Int
    public let at: Double
    public let fields: [String: String]
}
