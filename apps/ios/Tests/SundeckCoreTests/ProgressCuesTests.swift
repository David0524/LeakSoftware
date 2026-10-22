import Foundation
import SundeckCore
import Testing

/// progress-cues: Today's ring, and Mark Complete as the last thing.
@Suite struct ProgressCuesTests {
    let module = "progress-cues"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "dayProgress", "aboutLabel", "checklistReady", "COMPLETE_READY_LINE", "techDayProgress",
                "lastDoneLine", "TEAM_TODAY_TITLE",
            ])
    }

    @Test func ring() {
        checkRule(module, "dayProgress") { c in dayProgress(try c.arg(0)) }
        checkRule(module, "aboutLabel") { c in aboutLabel(try c.arg(0)) }
    }

    @Test func markCompleteLast() {
        checkRule(module, "checklistReady") { c in checklistReady(try c.arg(0), try c.arg(1)) }
        checkRule(module, "COMPLETE_READY_LINE") { _ in completeReadyLine }
    }

    @Test func ownersTeam() {
        checkRule(module, "techDayProgress") { c in techDayProgress(try c.arg(0)) }
        checkRule(module, "lastDoneLine") { c in lastDoneLine(try c.arg(0), try c.arg(1)) }
        checkRule(module, "TEAM_TODAY_TITLE") { _ in teamTodayTitle }
    }
}
