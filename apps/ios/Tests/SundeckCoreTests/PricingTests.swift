import Foundation
import SundeckCore
import Testing

/// quote.ts, invoice.ts, chemistry.ts and walkthrough.ts.
@Suite struct PricingTests {
    let module = "pricing"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "QUOTE_STATUS_LABELS", "lineTotal", "quoteTotals", "discountAllowed", "suggestItems", "lineFromItem",
            "quoteShareText", "INVOICE_STATUS_LABELS", "invoiceTotals", "invoiceBalance", "invoiceShareText",
            "CHLORINE_PRODUCTS", "ACID_PRODUCTS", "targets", "fluidAmount", "gallonMeasure", "dryMeasure",
            "weightAmount", "saturationIndex", "calculateChemistry", "doseSummary", "launchCards", "seenTips",
            "tipFor",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    /// `{quantity, unit_price_cents}`, the part of a line `lineTotal` reads.
    struct Amount: PricedLine {
        let quantity: Double
        let unitPriceCents: Int
    }

    @Test func quotes() {
        checkRule(module, "QUOTE_STATUS_LABELS") { _ in labelTable(\QuoteStatus.label) }
        checkRule(module, "lineTotal") { c in
            lineTotal(Amount(quantity: try c.arg(0), unitPriceCents: try c.arg(1)))
        }
        checkRule(module, "quoteTotals") { c in
            quoteTotals(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3))
        }
        checkRule(module, "discountAllowed") { c in
            discountAllowed(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3))
        }
        checkRule(module, "suggestItems") { c in suggestItems(try c.arg(0), try c.arg(1, as: String?.self)) }
        checkRule(module, "lineFromItem") { c in lineFromItem(try c.arg(0), try c.arg(1, as: String?.self)) }
        checkRule(module, "quoteShareText") { c in quoteShareText(try c.arg(0), try c.arg(1)) }
    }

    @Test func invoices() {
        checkRule(module, "INVOICE_STATUS_LABELS") { _ in labelTable(\InvoiceStatus.label) }
        checkRule(module, "invoiceTotals") { c in invoiceTotals(try c.arg(0), try c.arg(1), try c.arg(2)) }
        checkRule(module, "invoiceBalance") { c in
            invoiceBalance(Invoice(totalCents: try c.arg(0), amountPaidCents: try c.arg(1)))
        }
        checkRule(module, "invoiceShareText") { c in invoiceShareText(try c.arg(0), try c.arg(1)) }
    }

    @Test func chemistry() {
        checkRule(module, "CHLORINE_PRODUCTS") { _ in labelTable(\ChlorineProduct.label) }
        checkRule(module, "ACID_PRODUCTS") { _ in labelTable(\AcidProduct.label) }
        checkRule(module, "targets") { c in targets(try c.arg(0, as: Double?.self)) }
        checkRule(module, "fluidAmount") { c in fluidAmount(try c.arg(0)) }
        checkRule(module, "gallonMeasure") { c in gallonMeasure(try c.arg(0)) }
        checkRule(module, "dryMeasure") { c in dryMeasure(try c.arg(0), try c.arg(1, as: Double?.self)) }
        checkRule(module, "weightAmount") { c in weightAmount(try c.arg(0)) }
        checkRule(module, "saturationIndex") { c in saturationIndex(try c.arg(0)) }
        checkRule(module, "calculateChemistry") { c in calculateChemistry(try c.arg(0)) }
        checkRule(module, "doseSummary") { c in doseSummary(calculateChemistry(try c.arg(0)), try c.arg(1)) }
    }

    /// tipFor's options object.
    struct TipOptions: Decodable {
        let platform: TipPlatform
        let screen: String
        let role: String?
        let services: Services
        let seen: [String]
        let pkg: TipPackage?
    }

    @Test func walkthrough() {
        checkRule(module, "launchCards") { c in launchCards(try c.arg(0)) }
        checkRule(module, "seenTips") { c in seenTips(try c.arg(0)) }
        checkRule(module, "tipFor") { c in
            let o = try c.arg(0, as: TipOptions.self)
            return tipFor(
                platform: o.platform, screen: o.screen, role: o.role, services: o.services, seen: o.seen, pkg: o.pkg)
        }
    }
}
