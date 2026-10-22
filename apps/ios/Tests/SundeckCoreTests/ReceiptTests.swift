import Foundation
import SundeckCore
import Testing

/// receipts: Record Payment's method and check number, and the Send Receipt sheet (owner,
/// 2026-10-22: "A receipt for cash or check").
@Suite struct ReceiptTests {
    let module = "receipts"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "constants", "cleanCheckNumber", "checkNumberError", "paymentMethodLabel", "latestReceiptPayment",
                "canSendReceipt", "canRecordPayment", "receiptBalanceText", "receiptSummary", "receiptPrompt",
                "receiptRecipientError", "receiptSentMessage", "receiptTextMessage",
            ])
    }

    @Test func words() {
        checkRule(module, "constants") { _ in
            JSONValue.object([
                "PAYMENT_METHOD_CHOICES": .array(
                    ManualPaymentMethod.allCases.map {
                        .object(["value": .string($0.rawValue), "label": .string($0.label)])
                    }),
                "PAYMENT_METHOD_LABEL": .string(ReceiptText.methodLabel),
                "CHECK_NUMBER_LABEL": .string(ReceiptText.checkNumberLabel),
                "CHECK_NUMBER_HINT": .string(ReceiptText.checkNumberHint),
                "CHECK_NUMBER_MAX": .number(Double(ReceiptText.checkNumberMax)),
                "SEND_RECEIPT": .string(ReceiptText.send),
                "RECEIPT_NOT_NOW": .string(ReceiptText.notNow),
                "RECEIPT_CHANNELS": .array(
                    ReceiptChannel.allCases.map {
                        .object(["value": .string($0.rawValue), "label": .string($0.label)])
                    }),
                "RECEIPT_EMAIL_LABEL": .string(ReceiptText.emailLabel),
                "RECEIPT_PHONE_LABEL": .string(ReceiptText.phoneLabel),
                "RECEIPT_TEXT_HINT": .string(ReceiptText.textHint),
                "RECEIPT_OFFLINE": .string(ReceiptText.offline),
            ])
        }
        checkRule(module, "cleanCheckNumber") { c in cleanCheckNumber(try c.arg(0, as: String?.self)) }
        checkRule(module, "checkNumberError") { c in checkNumberError(try c.arg(0, as: String?.self)) }
        checkRule(module, "paymentMethodLabel") { c in
            paymentMethodLabel(
                try c.arg(0), checkNumber: try c.arg(1, as: String?.self),
                office: try c.arg(2, as: String.self) == "office")
        }
        checkRule(module, "receiptPrompt") { c in receiptPrompt(status: try c.arg(0)) }
        checkRule(module, "receiptRecipientError") { c in
            receiptRecipientError(try c.arg(0, as: ReceiptChannel.self), try c.arg(1))
        }
        checkRule(module, "receiptSentMessage") { c in
            receiptSentMessage(try c.arg(0, as: ReceiptChannel.self), try c.arg(1))
        }
    }

    @Test func payments() {
        checkRule(module, "latestReceiptPayment") { c in latestReceiptPayment(try c.arg(0))?.id }
        checkRule(module, "canSendReceipt") { c in canSendReceipt(status: try c.arg(0), payments: try c.arg(1)) }
        checkRule(module, "canRecordPayment") { c in
            canRecordPayment(
                role: try c.arg(0, as: String?.self), status: try c.arg(1), totalCents: try c.arg(2),
                amountPaidCents: try c.arg(3))
        }
        checkRule(module, "receiptBalanceText") { c in
            receiptBalanceText(totalCents: try c.arg(0), amountPaidCents: try c.arg(1))
        }
        checkRule(module, "receiptSummary") { c in
            receiptSummary(try c.arg(0), totalCents: try c.arg(1), amountPaidCents: try c.arg(2))
        }
        checkRule(module, "receiptTextMessage") { c in
            struct Inv: Decodable {
                let number: Int?
                let totalCents: Int
                let amountPaidCents: Int

                enum CodingKeys: String, CodingKey {
                    case number
                    case totalCents = "total_cents"
                    case amountPaidCents = "amount_paid_cents"
                }
            }
            let inv = try c.arg(2, as: Inv.self)
            return receiptTextMessage(
                shop: try c.arg(0), payment: try c.arg(1), number: inv.number, totalCents: inv.totalCents,
                amountPaidCents: inv.amountPaidCents, link: "https://x/i/t")
        }
    }
}
