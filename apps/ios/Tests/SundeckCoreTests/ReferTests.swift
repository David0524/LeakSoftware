import Foundation
import SundeckCore
import Testing

/// refer.ts: Refer a Pool Company on More, owners only (owner, 2026-11-23).
@Suite struct ReferTests {
    let module = "refer"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == ["REFER_COPY", "referralLink", "referShareMessage", "showsReferRow"] as Set)
    }

    @Test func words() {
        checkRule(module, "REFER_COPY") { _ in ReferCopy.all }
        checkRule(module, "referShareMessage") { c in referShareMessage(try c.arg(0)) }
    }

    @Test func link() {
        checkRule(module, "referralLink") { c in
            referralLink(try c.arg(0, as: String?.self), try c.arg(1, as: String?.self))
        }
    }

    @Test func ownersWithACodeOnly() {
        checkRule(module, "showsReferRow") { c in
            showsReferRow(try c.arg(0, as: String?.self), try c.arg(1, as: String?.self))
        }
    }
}
