import Foundation
import SundeckCore
import Testing

/// terms-consent.ts: the line under every sign-up's create button (owner, 2026-10-24).
@Suite struct TermsConsentTests {
    let module = "terms-consent"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["TERMS_CONSENT", "termsConsentText"] as Set)
    }

    @Test func wording() {
        checkRule(module, "TERMS_CONSENT") { _ in termsConsent }
        checkRule(module, "termsConsentText") { _ in termsConsentText() }
    }
}
