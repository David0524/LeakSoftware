import Foundation
import SundeckCore
import Testing

/// end-of-day: Today's wrap-up line once every stop is done (owner, 2026-10-26).
@Suite struct EndOfDayTests {
    let module = "end-of-day"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["endOfDay"])
    }

    @Test func line() {
        checkRule(module, "endOfDay") { c in
            try endOfDay(
                stops: try c.arg(0, as: [EndOfDayStop].self), reports: try c.arg(1, as: [EndOfDayReport].self),
                quotes: try c.arg(2, as: [EndOfDayQuote].self), today: try c.arg(3), timeZone: try c.arg(4))
        }
    }
}
