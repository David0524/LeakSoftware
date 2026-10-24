import Foundation
import SundeckCore
import Testing

/// password.ts: the password rules (owner, 2026-10-24) and the sign-in limit messages.
@Suite struct PasswordTests {
    let module = "password"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module)
                == [
                    "PASSWORD_RULES", "PASSWORD_HINT", "passwordChecks", "passwordScore", "passwordProblem",
                    "tooManyAttempts",
                ] as Set)
    }

    @Test func rules() {
        checkRule(module, "PASSWORD_RULES") { _ in passwordRules }
        checkRule(module, "PASSWORD_HINT") { _ in passwordHint }
    }

    @Test func checks() {
        checkRule(module, "passwordChecks") { c in passwordChecks(try c.arg(0, as: String.self)) }
        checkRule(module, "passwordScore") { c in passwordScore(try c.arg(0, as: String.self)) }
        checkRule(module, "passwordProblem") { c in passwordProblem(try c.arg(0, as: String.self)) }
        checkRule(module, "tooManyAttempts") { c in tooManyAttempts(try c.arg(0, as: String.self)) }
    }
}
