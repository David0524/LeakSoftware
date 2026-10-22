import Foundation
import SundeckCore
import Testing

/// answer-icons: checklist answers as one-tap icons on phones.
@Suite struct AnswerIconsTests {
    let module = "answer-icons"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["verdictIcon", "choiceIcons", "CHOOSE_LABEL", "CHOOSE_HINT"])
    }

    @Test func icons() {
        checkRule(module, "verdictIcon") { c in
            verdictIcon(try c.arg(0) as ComponentAnswer?, try c.arg(1) as Verdict)
        }
        checkRule(module, "choiceIcons") { c in choiceIcons(try c.arg(0)) }
        checkRule(module, "CHOOSE_LABEL") { _ in chooseLabel }
        checkRule(module, "CHOOSE_HINT") { _ in chooseHint }
    }
}
