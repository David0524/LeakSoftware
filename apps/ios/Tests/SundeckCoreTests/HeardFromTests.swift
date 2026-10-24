import Foundation
import SundeckCore
import Testing

/// heard-from.ts: "How did you hear about us?" on sign-up (owner, 2026-10-24).
@Suite struct HeardFromTests {
    let module = "heard-from"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["HEARD_FROM_OPTIONS", "parseHeardFrom", "heardFromOther"] as Set)
    }

    @Test func options() {
        checkRule(module, "HEARD_FROM_OPTIONS") { _ in heardFromOptions }
    }

    @Test func answers() {
        checkRule(module, "parseHeardFrom") { c in parseHeardFrom(try c.arg(0, as: String?.self)) }
        checkRule(module, "heardFromOther") { c in
            heardFromOther(parseHeardFrom(try c.arg(0, as: String?.self)), try c.arg(1, as: String?.self))
        }
    }
}
