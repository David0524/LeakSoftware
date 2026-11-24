import Foundation
import SundeckCore
import Testing

/// refunds: who sees Refund, how much it takes, and the Refund Payment sheet's words (owner,
/// 2026-11-24: "how would we reverse a charge?").
@Suite struct RefundTests {
    let module = "refunds"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "constants", "refundableCents", "canRefund", "refundAmount", "refundExplainer", "refundButtonText",
                "refundDoneText", "refundedText",
            ])
    }

    @Test func words() {
        checkRule(module, "constants") { _ in
            JSONValue.object([
                "REFUNDABLE_METHODS": .array(RefundText.methods.map(JSONValue.string)),
                "REFUND_BUTTON": .string(RefundText.button),
                "REFUND_TITLE": .string(RefundText.title),
                "REFUND_FULL": .string(RefundText.full),
                "REFUND_PART": .string(RefundText.part),
                "REFUND_AMOUNT_LABEL": .string(RefundText.amountLabel),
                "REFUND_OFFLINE": .string(RefundText.offline),
            ])
        }
        checkRule(module, "refundExplainer") { c in refundExplainer(try c.arg(0)) }
        checkRule(module, "refundButtonText") { c in refundButtonText(try c.arg(0)) }
        checkRule(module, "refundDoneText") { c in refundDoneText(try c.arg(0)) }
        checkRule(module, "refundedText") { c in refundedText(try c.arg(0)) }
    }

    @Test func rules() {
        checkRule(module, "refundableCents") { c in refundableCents(try c.arg(0)) }
        checkRule(module, "canRefund") { c in
            canRefund(role: try c.arg(0, as: String?.self), invoiceStatus: try c.arg(1), try c.arg(2))
        }
        checkRule(module, "refundAmount") { c in
            refundAmount(part: try c.arg(0), typed: try c.arg(1), refundable: try c.arg(2))
        }
    }
}
