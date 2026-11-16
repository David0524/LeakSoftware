import Foundation
import SundeckCore
import Testing

/// monthly-billing: charges on a visit, invoice days, and Monthly Billing's Send All (owner,
/// 2026-11-15: "a way to invoice all service customers at once").
@Suite struct MonthlyBillingTests {
    let module = "monthly-billing"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "text", "ordinalDay", "shopInvoiceDay", "parseInvoiceDay", "planInvoiceDayLabel", "chargeCents",
                "chargeDetail", "chargeItems", "chargesFooter", "billingMonthName", "billingMonthDetail", "sendRoute",
                "sendRouteLabel", "linesSummary", "monthBillingSubtitle", "notInvoicedText", "sendAllLabel",
                "sendAllConfirm", "sendAllResult", "autoSendFailed",
            ])
    }

    /// The fixtures' price book (the same in fixtures/cases/monthly-billing.ts).
    private let items: [ChargeItem] = [
        ChargeItem(id: "pump", name: "Replace pump motor", category: "Repair"),
        ChargeItem(id: "basket", name: "Skimmer basket", category: "Parts"),
        ChargeItem(id: "filter", name: "Clean filter", category: "Service"),
        ChargeItem(id: "cl", name: "Liquid chlorine", category: "Chemicals", chemical: "liquid_chlorine"),
        ChargeItem(id: "enzyme", name: "Enzyme", category: "Chemicals"),
        ChargeItem(id: "detect", name: "Leak detection", category: "Detection"),
        ChargeItem(id: "inspect", name: "Pool inspection", category: "Inspection"),
        ChargeItem(id: "tabs", name: "Tabs", chemical: "tabs"),
        ChargeItem(id: "gone", name: "Old part", category: "Parts", deletedAt: "2026-10-01T00:00:00Z"),
        ChargeItem(id: "blank", name: "Uncategorized", chemical: "", deletedAt: ""),
    ]

    @Test func text() {
        checkRule(module, "text") { _ in
            [
                "INVOICE_DAYS": JSONValue.array(invoiceDayChoices.map { .number(Double($0)) }),
                "INVOICE_DAY_FOOTER": .string(MonthlyBillingText.invoiceDayFooter),
                "PLAN_INVOICE_DAY_FOOTER": .string(MonthlyBillingText.planInvoiceDayFooter),
                "CHARGE_LOCKED": .string(MonthlyBillingText.chargeLocked),
                "NO_WAY_TO_SEND": .string(MonthlyBillingText.noWayToSend),
                "SEND_ALL_FOOTER": .string(MonthlyBillingText.sendAllFooter),
                "AUTO_SEND_ON_FOOTER": .string(MonthlyBillingText.autoSendOnFooter),
            ]
        }
    }

    @Test func invoiceDay() {
        checkRule(module, "ordinalDay") { c in ordinalDay(try c.arg(0)) }
        checkRule(module, "shopInvoiceDay") { c in shopInvoiceDay(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "parseInvoiceDay") { c in parseInvoiceDay(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "planInvoiceDayLabel") { c in
            planInvoiceDayLabel(try c.arg(0, as: Int?.self), shopDay: try c.arg(1))
        }
    }

    @Test func charges() {
        checkRule(module, "chargeCents") { c in
            chargeCents(ChargeAmount(quantity: try c.arg(0), unitPriceCents: try c.arg(1)))
        }
        checkRule(module, "chargeDetail") { c in
            chargeDetail(ChargeAmount(quantity: try c.arg(0), unitPriceCents: try c.arg(1)))
        }
        checkRule(module, "chargeItems") { _ in chargeItems(items).map(\.id) }
        checkRule(module, "chargesFooter") { c in
            chargesFooter(
                firstName: try c.arg(0), month: try c.arg(1), sentInvoice: try c.arg(2, as: SentInvoiceRef?.self))
        }
    }

    @Test func months() {
        checkRule(module, "billingMonthName") { c in billingMonthName(try c.arg(0), withYear: try c.arg(1)) }
        checkRule(module, "billingMonthDetail") { c in billingMonthDetail(try c.arg(0)) }
        checkRule(module, "monthBillingSubtitle") { c in monthBillingSubtitle(try c.arg(0)) }
        checkRule(module, "notInvoicedText") { c in notInvoicedText(try c.arg(0)) { "[\($0)]" } }
        checkRule(module, "linesSummary") { c in
            let lines: [MonthBillingLine] = try c.arg(0)
            return try c.arg(1, as: Int?.self).map { linesSummary(lines, shown: $0) } ?? linesSummary(lines)
        }
    }

    @Test func sending() {
        checkRule(module, "sendRoute") { c in
            sendRoute(email: try c.arg(0), phone: try c.arg(1), texting: try c.arg(2))
        }
        checkRule(module, "sendRouteLabel") { c in
            sendRouteLabel(sendRoute(email: try c.arg(0), phone: try c.arg(1), texting: try c.arg(2)))
        }
        checkRule(module, "sendAllLabel") { c in sendAllLabel(try c.arg(0)) }
        checkRule(module, "sendAllConfirm") { c in
            let contacts: [[JSONValue]] = try c.arg(0)
            let routes = contacts.map {
                sendRoute(email: $0[0].string, phone: $0[1].string, texting: $0[2].bool ?? false)
            }
            return sendAllConfirm(routes, monthName: try c.arg(1))
        }
        checkRule(module, "sendAllResult") { c in sendAllResult(sent: try c.arg(0), failed: try c.arg(1)) }
        checkRule(module, "autoSendFailed") { c in autoSendFailed(try c.arg(0)) }
    }
}
