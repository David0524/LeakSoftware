import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S7's data layer: quotes built offline with their totals, the price book, and invoices.

@Suite @MainActor struct QuoteDataTests {
    let shell: Shell
    var sync: SyncService { shell.sync }
    let pricing = QuotePricing(["tax_rate_bps": 800, "deposit": ["type": "percent", "value_bps": 5000]])

    init() throws {
        shell = try Shell()
        try shell.seedCompany(userId: "u1")
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "price_book_item", xid: "3",
                        row: [
                            "id": "p1", "company_id": "c1", "name": "Skimmer repair", "description": "Reseal throat",
                            "unit": "each", "price_cents": 45000, "taxable": true, "sort_order": 2, "active": true,
                            "component_type_key": "skimmer",
                        ]),
                    PulledRow(
                        table: "price_book_item", xid: "3",
                        row: [
                            "id": "p2", "company_id": "c1", "name": "Dive fee", "unit": "each", "price_cents": 15000,
                            "taxable": false, "sort_order": 1, "active": true,
                        ]),
                    PulledRow(
                        table: "price_book_item", xid: "3",
                        row: [
                            "id": "p3", "company_id": "c1", "name": "Old item", "unit": "each", "price_cents": 100,
                            "taxable": false, "sort_order": 0, "active": false,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
    }

    func current(_ job: String) throws -> JobQuote {
        try #require(jobQuotes(sync.store, companyId: "c1", jobId: job).first)
    }

    @Test func thePriceBookListsActiveItemsInOrder() {
        #expect(priceBook(sync.store, companyId: "c1").map(\.id) == ["p2", "p1"])
    }

    @Test func linesKeepTheQuoteTotalsCurrent() throws {
        _ = try QuoteWrites.start(sync, companyId: "c1", jobId: "j1")
        let items = priceBook(sync.store, companyId: "c1")
        try QuoteWrites.addItem(
            sync, companyId: "c1", pricing: pricing, quote: try current("j1"), items[1], findingId: "f1")
        try QuoteWrites.addItem(
            sync, companyId: "c1", pricing: pricing, quote: try current("j1"), items[0], findingId: nil)
        var quote = try current("j1")
        #expect(quote.lines.map(\.description) == ["Skimmer repair: Reseal throat", "Dive fee"])
        #expect(quote.lines.map(\.findingId) == ["f1", nil])
        // 450 + 150; tax 8% of the taxable 450; deposit half the total.
        #expect(quote.quote.subtotalCents == 60000)
        #expect(quote.quote.taxCents == 3600)
        #expect(quote.quote.totalCents == 63600)
        #expect(quote.quote.depositCents == 31800)

        let first = try #require(quote.lines.first?.id)
        try QuoteWrites.updateLine(
            sync, companyId: "c1", pricing: pricing, quote: quote, lineId: first,
            .init(quantity: 2))
        quote = try current("j1")
        #expect(quote.quote.subtotalCents == 105000)

        try QuoteWrites.setDiscount(sync, companyId: "c1", pricing: pricing, quote: quote, cents: 5000)
        quote = try current("j1")
        #expect(quote.quote.discountCents == 5000)
        #expect(quote.quote.totalCents == quoteTotals(quote.lines, 5000, 800, pricing.deposit).totalCents)

        try QuoteWrites.removeLine(sync, companyId: "c1", pricing: pricing, quote: quote, lineId: first)
        quote = try current("j1")
        #expect(quote.lines.count == 1)
        #expect(quote.quote.subtotalCents == 15000)
    }

    @Test func aShopWithoutSettingsHasNoTaxOrDeposit() {
        let plain = QuotePricing([:])
        #expect(plain.taxRateBps == 0)
        #expect(depositFor(10000, plain.deposit) == 0)
    }

    @Test func invoicesComeWithTheirLinesPaymentsAndLink() throws {
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "invoice", xid: "4",
                        row: [
                            "id": "i1", "company_id": "c1", "job_id": "j1", "number": 7, "status": "partially_paid",
                            "subtotal_cents": 60000, "discount_cents": 0, "tax_cents": 3600, "credit_cents": 31800,
                            "total_cents": 31800, "amount_paid_cents": 10000,
                        ]),
                    PulledRow(
                        table: "invoice_line_item", xid: "4",
                        row: [
                            "id": "l2", "company_id": "c1", "invoice_id": "i1", "kind": "deposit_credit",
                            "description": "Deposit paid", "quantity": 1, "unit_price_cents": -31800, "taxable": false,
                            "sort_order": 2,
                        ]),
                    PulledRow(
                        table: "invoice_line_item", xid: "4",
                        row: [
                            "id": "l1", "company_id": "c1", "invoice_id": "i1", "kind": "item",
                            "description": "Skimmer repair", "quantity": 1, "unit_price_cents": 60000,
                            "taxable": true, "sort_order": 1,
                        ]),
                    PulledRow(
                        table: "payment", xid: "4",
                        row: [
                            "id": "pay1", "company_id": "c1", "invoice_id": "i1", "amount_cents": 10000,
                            "method": "card", "status": "succeeded",
                        ]),
                    PulledRow(
                        table: "share_link", xid: "4",
                        row: ["id": "s1", "company_id": "c1", "job_id": "j1", "invoice_id": "i1", "token": "tok"]),
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        let invoice = try #require(jobInvoices(sync.store, companyId: "c1", jobId: "j1").first)
        #expect(invoice.lines.map(\.id) == ["l1", "l2"])
        #expect(invoice.payments.map(\.amountCents) == [10000])
        #expect(invoice.token == "tok")
        #expect(invoice.invoice.balanceCents == 21800)
    }
}
