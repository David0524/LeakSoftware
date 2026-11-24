import Foundation
import SundeckCore
import Testing

/// dashboard: the words under each tech on the Dashboard (owner, 2026-11-24: "Tech specific stats
/// in the dashboard").
@Suite struct DashboardTests {
    let module = "dashboard"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["techJobsNote", "techInvoicedNote", "techFeedbackNote"])
    }

    @Test func words() {
        checkRule(module, "techJobsNote") { c in techJobsNote(try c.arg(0, as: DashboardTech.self)) }
        checkRule(module, "techInvoicedNote") { c in techInvoicedNote(try c.arg(0, as: DashboardTech.self)) }
        checkRule(module, "techFeedbackNote") { c in techFeedbackNote(try c.arg(0, as: DashboardTech.self)) }
    }
}
