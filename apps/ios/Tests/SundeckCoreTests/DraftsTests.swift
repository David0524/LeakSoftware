import Foundation
import SundeckCore
import Testing

/// drafts: typed text kept until saved or discarded (owner, 2026-10-27).
@Suite struct DraftsTests {
    let module = "drafts"

    private struct Constants: Encodable {
        let note: String
        let discard: String
        let days: Int
        let ttlMs: Double
        let delayMs: Int
        let maxFields: Int
        let maxChars: Int
        let prefix: String
    }

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "DRAFT_CONSTANTS", "draftKey", "keepableDraft", "draftRecord", "draftExpired", "readDraft",
                "draftChanges",
            ])
    }

    @Test func rules() {
        checkRule(module, "DRAFT_CONSTANTS") { _ in
            Constants(
                note: Drafts.note, discard: Drafts.discardLabel, days: Drafts.days, ttlMs: Drafts.ttlMs,
                delayMs: Drafts.saveDelayMs, maxFields: Drafts.maxFields, maxChars: Drafts.maxChars,
                prefix: Drafts.prefix)
        }
        checkRule(module, "draftKey") { c in
            let id: String? = try c.arg(2)
            return Drafts.key(user: try c.arg(0), form: try c.arg(1), id: id ?? "new")
        }
        checkRule(module, "keepableDraft") { c in
            // Non-text values are dropped by the caller in Swift: only strings are ever passed in.
            let all = try c.arg(0, as: [String: JSONValue].self)
            var strings: [String: String] = [:]
            for (name, value) in all { if case .string(let s) = value { strings[name] = s } }
            return Drafts.keepable(strings)
        }
        checkRule(module, "draftRecord") { c in
            Drafts.record(try c.arg(0, as: [String: String].self), now: try c.arg(1))
        }
        checkRule(module, "draftExpired") { c in Drafts.expired(savedAt: try c.arg(0), now: try c.arg(1)) }
        checkRule(module, "readDraft") { c in Drafts.read(try c.arg(0, as: String?.self), now: try c.arg(1)) }
        checkRule(module, "draftChanges") { c in
            Drafts.changes(
                current: try c.arg(0, as: [String: String].self), draft: try c.arg(1, as: [String: String].self))
        }
    }
}
