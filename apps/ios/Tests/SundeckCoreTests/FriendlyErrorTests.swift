import Foundation
import SundeckCore
import Testing

/// friendly-error.ts: errors in plain words (owner, 2026-10-26).
@Suite struct FriendlyErrorTests {
    let module = "friendly-error"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["friendlyError"] as Set)
    }

    @Test func messages() {
        checkRule(module, "friendlyError") { c in friendlyError(try c.arg(0, as: String.self)) }
    }

    @Test func caughtErrors() {
        struct Own: Error, CustomStringConvertible { let description: String }
        #expect(userMessage(Own(description: "Enter the customer’s email.")) == "Enter the customer’s email.")
        #expect(userMessage(Own(description: "JWT expired")) == FriendlyText.signInAgain)
        enum Code: Error { case invalidDate }
        #expect(userMessage(Code.invalidDate) == FriendlyText.genericError)
        let offline = NSError(domain: "NSURLErrorDomain", code: -1009)
        #expect(userMessage(offline) == FriendlyText.noConnection)
    }
}
