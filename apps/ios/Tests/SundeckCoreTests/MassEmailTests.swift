import Foundation
import SundeckCore
import Testing

/// mass-email: Email Customers' words (owner, 2026-10-22: "send mass email (with some filtering)").
@Suite struct MassEmailTests {
    let module = "mass-email"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "LAST_JOB_CHOICES", "massEmailCountText", "massEmailSendLabel", "massEmailConfirm",
                "massEmailSentText", "massEmailHistoryText", "massEmailLimitText", "massEmailErrors",
            ])
    }

    @Test func choices() {
        checkRule(module, "LAST_JOB_CHOICES") { _ in LastJobChoice.all }
    }

    @Test func counts() {
        checkRule(module, "massEmailCountText") { c in
            massEmailCountText(
                MassEmailCount(recipients: try c.arg(0), noEmail: try c.arg(1), unsubscribed: try c.arg(2)))
        }
        checkRule(module, "massEmailSendLabel") { c in massEmailSendLabel(try c.arg(0)) }
        checkRule(module, "massEmailLimitText") { c in massEmailLimitText(try c.arg(0)) }
    }

    @Test func sending() {
        checkRule(module, "massEmailConfirm") { c in
            massEmailConfirm(try c.arg(0), subject: try c.arg(1), shop: try c.arg(2))
        }
        checkRule(module, "massEmailSentText") { c in massEmailSentText(sent: try c.arg(0), failed: try c.arg(1)) }
        checkRule(module, "massEmailHistoryText") { c in
            massEmailHistoryText(
                status: try c.arg(0), sent: try c.arg(1), failed: try c.arg(2), recipients: try c.arg(3))
        }
        checkRule(module, "massEmailErrors") { c in massEmailErrors(subject: try c.arg(0), body: try c.arg(1)) }
    }
}
