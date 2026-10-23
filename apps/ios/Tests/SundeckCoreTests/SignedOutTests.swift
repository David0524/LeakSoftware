import Foundation
import SundeckCore
import Testing

/// signed-out.ts: the server ended this phone's sign-in (owner, 2026-10-22).
@Suite struct SignedOutTests {
    let module = "signed-out"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "SIGNED_OUT_MESSAGE", "signedOutNote", "looksSignedOut", "isConnectionError", "syncErrorText",
            ] as Set)
    }

    @Test func wording() {
        checkRule(module, "SIGNED_OUT_MESSAGE") { _ in signedOutMessage }
        checkRule(module, "signedOutNote") { c in signedOutNote(pending: try c.arg(0), email: try c.arg(1)) }
    }

    @Test func errors() {
        checkRule(module, "looksSignedOut") { c in looksSignedOut(try c.arg(0, as: String?.self)) }
        checkRule(module, "isConnectionError") { c in isConnectionError(try c.arg(0, as: String?.self)) }
        checkRule(module, "syncErrorText") { c in syncErrorText(try c.arg(0, as: String?.self)) }
    }
}
