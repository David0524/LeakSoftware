import Foundation
import SundeckCore
import Testing

/// quote.ts, invoice.ts, chemistry.ts and getting-started.ts.
@Suite struct PricingTests {
    let module = "pricing"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "QUOTE_STATUS_LABELS", "lineTotal", "quoteTotals", "discountAllowed", "suggestItems", "lineFromItem",
            "quoteShareText", "INVOICE_STATUS_LABELS", "invoiceTotals", "invoiceBalance", "invoiceShareText",
            "CHLORINE_PRODUCTS", "ACID_PRODUCTS", "targets", "fluidAmount", "gallonMeasure", "dryMeasure",
            "weightAmount", "saturationIndex", "calculateChemistry", "doseSummary", "gettingStarted", "READING_LABELS",
            "READING_LIMITS", "readingSummary",
            "waterTestRows", "INVOICE_FILTERS", "INVOICE_SORTS", "invoiceOverdue", "filterInvoices",
            "monthLabel", "acceptanceRate", "dashboardTotals",
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
        checkRule(module, "READING_LABELS") { _ in labelTable(\ReadingKey.label) }
        checkRule(module, "READING_LIMITS") { _ in
            Dictionary(uniqueKeysWithValues: ReadingKey.allCases.map { ($0.rawValue, $0.limit) })
        }
        checkRule(module, "readingSummary") { c in readingSummary(try c.arg(0)) }
        checkRule(module, "waterTestRows") { c in waterTestRows(try c.arg(0)) }
    }

    /// pricing.ts' `invoiceList`.
    static let invoiceList: [InvoiceFilterItem] = [
        .init(
            number: 5, status: .draft, totalCents: 9000, amountPaidCents: 0, dueDate: nil, sentAt: nil,
            customer: "Cole Izhaky", jobNumber: 1105),
        .init(
            number: 4, status: .sent, totalCents: 20000, amountPaidCents: 0, dueDate: "2026-10-10",
            sentAt: "2026-10-01", customer: "Sam Sample", jobNumber: 1104),
        .init(
            number: 3, status: .partiallyPaid, totalCents: 50000, amountPaidCents: 45000, dueDate: "2026-10-30",
            sentAt: "2026-09-30", customer: "Ann Lee", jobNumber: 1103),
        .init(
            number: 2, status: .paid, totalCents: 30000, amountPaidCents: 30000, dueDate: "2026-09-01",
            sentAt: "2026-08-20", customer: "Bo Diaz", jobNumber: 1102),
        .init(
            number: 1, status: .void, totalCents: 1000, amountPaidCents: 0, dueDate: nil, sentAt: nil, customer: nil,
            jobNumber: nil),
    ]

    @Test func dashboard() {
        checkRule(module, "monthLabel") { c in monthLabel(try c.arg(0), long: try c.arg(1)) }
        checkRule(module, "acceptanceRate") { c in acceptanceRate(try c.arg(0), try c.arg(1)) }
        checkRule(module, "dashboardTotals") { c in dashboardTotals(try c.arg(0)) }
    }

    @Test func invoiceFilters() {
        checkRule(module, "INVOICE_FILTERS") { _ in
            InvoiceFilter.allCases.map { ["key": $0.rawValue, "label": $0.label] }
        }
        checkRule(module, "INVOICE_SORTS") { _ in InvoiceSort.allCases.map { ["key": $0.rawValue, "label": $0.label] } }
        checkRule(module, "invoiceOverdue") { c in invoiceOverdue(try c.arg(0), try c.arg(1)) }
        checkRule(module, "filterInvoices") { c in
            filterInvoices(
                Self.invoiceList, filter: try c.arg(0), sort: try c.arg(1), q: try c.arg(2), today: "2026-10-20"
            )
            .map(\.number)
        }
        checkRule(module, "targets") { c in targets(try c.arg(0, as: Double?.self)) }
        checkRule(module, "fluidAmount") { c in fluidAmount(try c.arg(0)) }
        checkRule(module, "gallonMeasure") { c in gallonMeasure(try c.arg(0)) }
        checkRule(module, "dryMeasure") { c in dryMeasure(try c.arg(0), try c.arg(1, as: Double?.self)) }
        checkRule(module, "weightAmount") { c in weightAmount(try c.arg(0)) }
        checkRule(module, "saturationIndex") { c in saturationIndex(try c.arg(0)) }
        checkRule(module, "calculateChemistry") { c in calculateChemistry(try c.arg(0)) }
        checkRule(module, "doseSummary") { c in doseSummary(calculateChemistry(try c.arg(0)), try c.arg(1)) }
    }

    @Test func gettingStartedSteps() {
        checkRule(module, "gettingStarted") { c in gettingStarted(try c.arg(0), try c.arg(1, as: Progress.self).value) }
    }

    /// gettingStarted's progress object.
    struct Progress: Decodable {
        let people, openInvites, customers, visitPlans, leakJobs, reportsSent, invoicesSent: Int
        let hasLogo, paymentsReady: Bool
        let sample: SampleProgress?

        var value: ShopProgress {
            ShopProgress(
                people: people, openInvites: openInvites, hasLogo: hasLogo, paymentsReady: paymentsReady,
                customers: customers, visitPlans: visitPlans, leakJobs: leakJobs, reportsSent: reportsSent,
                invoicesSent: invoicesSent, sample: sample)
        }
    }
}
