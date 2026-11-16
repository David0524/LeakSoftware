import Foundation
import SundeckCore
import Testing

/// autopay.ts: the customer page's Autopay group and an invoice's automatic charge
/// (docs/design/2026-11-16-autopay.md).
@Suite struct AutopayTests {
    let module = "autopay"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "AUTOPAY_TEXT", "savedMethodLabel", "savedMethodDetail", "autopaySettings", "autopayNextTry",
                "autopayStatus", "autopayGroupFooter", "autopayInvoiceLine", "chargeConfirm",
            ])
    }

    @Test func text() {
        checkRule(module, "AUTOPAY_TEXT") { _ in
            [
                "group": AutopayText.group, "shopSwitch": AutopayText.shopSwitch, "shopFooter": AutopayText.shopFooter,
                "retries": AutopayText.retries, "retryEvery": AutopayText.retryEvery,
                "retriesFooter": AutopayText.retriesFooter, "payOverTime": AutopayText.payOverTime,
                "payOverTimeFooter": AutopayText.payOverTimeFooter, "status": AutopayText.status,
                "on": AutopayText.on, "off": AutopayText.off, "turnOff": AutopayText.turnOff,
                "turnOn": AutopayText.turnOn, "request": AutopayText.request, "remove": AutopayText.remove,
                "charge": AutopayText.charge, "noMethod": AutopayText.noMethod,
                "saveForAutopay": AutopayText.saveForAutopay, "requestTitle": AutopayText.requestTitle,
                "removeTitle": AutopayText.removeTitle, "removeMessage": AutopayText.removeMessage,
                "turnOffTitle": AutopayText.turnOffTitle, "turnOffMessage": AutopayText.turnOffMessage,
            ]
        }
    }

    @Test func savedMethods() {
        checkRule(module, "savedMethodLabel") { c in savedMethodLabel(try c.arg(0)) }
        checkRule(module, "savedMethodDetail") { c in savedMethodDetail(try c.arg(0), today: try c.arg(1)) }
    }

    @Test func settings() {
        checkRule(module, "autopaySettings") { c in autopaySettings(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "autopayNextTry") { c in
            autopayNextTry(try c.arg(0), triesMade: try c.arg(1), try c.arg(2, as: AutopaySettings.self))
        }
    }

    @Test func group() {
        checkRule(module, "autopayStatus") { c in autopayStatus(try c.arg(0), try c.arg(1, as: SavedMethod?.self)) }
        checkRule(module, "autopayGroupFooter") { c in
            autopayGroupFooter(
                shopOn: try c.arg(0), customerAutopay: try c.arg(1), method: try c.arg(2, as: SavedMethod?.self))
        }
    }

    @Test func invoices() {
        checkRule(module, "autopayInvoiceLine") { c in autopayInvoiceLine(try c.arg(0, as: AutopayInvoice.self)) }
        checkRule(module, "chargeConfirm") { c in
            chargeConfirm(
                method: try c.arg(0), balanceCents: try c.arg(1), feeBps: try c.arg(2), customer: try c.arg(3))
        }
    }
}
