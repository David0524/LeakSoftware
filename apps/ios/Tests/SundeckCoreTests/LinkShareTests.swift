import Foundation
import SundeckCore
import Testing

/// link-preview.ts: a customer link goes to the share sheet as a link, beside its words.
@Suite struct LinkShareTests {
    let module = "link-share"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["splitShareMessage", "customerLinkToken"] as Set)
    }

    @Test func splitsTheWordsFromTheLink() {
        checkRule(module, "splitShareMessage") { c in splitShareMessage(try c.arg(0)) }
    }

    @Test func findsTheToken() {
        checkRule(module, "customerLinkToken") { c in customerLinkToken(try c.arg(0)) }
    }
}
