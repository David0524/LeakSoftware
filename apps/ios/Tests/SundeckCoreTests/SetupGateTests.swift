import Foundation
import SundeckCore
import Testing

/// setup-gate.ts: a new shop's owner finishes setup (the card) before working (owner, 2026-10-24).
@Suite struct SetupGateTests {
    let module = "setup-gate"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "mustFinishSetup", "FINISH_SETUP_TITLE", "FINISH_SETUP_BODY", "FINISH_SETUP_STILL",
                "FINISH_SETUP_OFFLINE", "FINISH_SETUP_FAILED",
            ] as Set)
    }

    @Test func gate() {
        checkRule(module, "mustFinishSetup") { c in
            mustFinishSetup(try c.arg(0, as: SetupAccess?.self), role: try c.arg(1, as: String?.self))
        }
    }

    @Test func wording() {
        checkRule(module, "FINISH_SETUP_TITLE") { _ in finishSetupTitle }
        checkRule(module, "FINISH_SETUP_BODY") { _ in finishSetupBody }
        checkRule(module, "FINISH_SETUP_STILL") { _ in finishSetupStill }
        checkRule(module, "FINISH_SETUP_OFFLINE") { _ in finishSetupOffline }
        checkRule(module, "FINISH_SETUP_FAILED") { _ in finishSetupFailed }
    }
}
