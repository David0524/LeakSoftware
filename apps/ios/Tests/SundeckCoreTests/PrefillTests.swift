import Foundation
import SundeckCore
import Testing

/// prefill: hints and defaults from what the app already knows (owner, 2026-10-26).
@Suite struct PrefillTests {
    let module = "prefill"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "lastOtherReading", "readingHints", "usualChemicalIds", "pickList", "lastVisitNote", "usualVisit",
            ])
    }

    @Test func readings() {
        checkRule(module, "lastOtherReading") { c in
            lastOtherReading(try c.arg(0, as: [HintReading].self), jobId: try c.arg(1))
        }
        checkRule(module, "readingHints") { c in readingHints(try c.arg(0, as: Readings?.self)) }
    }

    @Test func chemicals() {
        checkRule(module, "usualChemicalIds") { c in
            let rows = try c.arg(0, as: [HintAddition].self)
            return c.args.count > 1 ? usualChemicalIds(rows, limit: try c.arg(1)) : usualChemicalIds(rows)
        }
        checkRule(module, "pickList") { c in
            pickList(try c.arg(0, as: [ChemicalItem].self), usualIds: try c.arg(1), query: try c.arg(2))
        }
    }

    @Test func visits() {
        checkRule(module, "lastVisitNote") { c in
            try lastVisitNote(
                jobId: try c.arg(0), jobs: try c.arg(1, as: [HintJob].self),
                readings: try c.arg(2, as: [HintReading].self), timeZone: try c.arg(3))
        }
        checkRule(module, "usualVisit") { c in
            try usualVisit(try c.arg(0, as: [HintVisit].self), timeZone: try c.arg(1))
        }
    }
}
