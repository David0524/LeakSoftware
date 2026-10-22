import Foundation
import SundeckCore
import Testing

/// wrap-up: the Wrap-Up finish list (owner, 2026-10-22, option A).
@Suite struct WrapUpTests {
    let module = "wrap-up"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["wrapUp", "WRAP_UP_ACTIONS", "NEW_QUOTE_LABEL"])
    }

    @Test func finishList() {
        checkRule(module, "wrapUp") { c in wrapUp(try c.arg(0)) }
    }

    @Test func words() {
        checkRule(module, "WRAP_UP_ACTIONS") { _ in
            Dictionary(uniqueKeysWithValues: wrapUpActions.map { ($0.key.rawValue, $0.value) })
        }
        checkRule(module, "NEW_QUOTE_LABEL") { _ in newQuoteLabel }
    }
}
