import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Monthly billing on the phone (owner, 2026-11-15): a visit's Charges as synced rows written
/// offline, Add Charge's checks (the website's), and a month's drafts changed through the sync
/// layer.
@Suite @MainActor struct MonthlyBillingAppTests {
    let now = parseISODate("2026-10-19T17:00:00Z")!  // 10:00 AM in Phoenix

    /// Alicia's maintenance visit, the price book, and a monthly draft with its lines.
    func seeded() throws -> Shell {
        let s = try CustomersAndInvoicesTests().seeded()
        func item(_ id: String, _ name: String, _ cents: Int, _ category: String?, _ chemical: String?, _ order: Int)
            -> PulledRow
        {
            PulledRow(
                table: "price_book_item", xid: "3",
                row: [
                    "id": .string(id), "company_id": "c1", "name": .string(name), "unit": "each",
                    "price_cents": .number(Double(cents)), "sort_order": .number(Double(order)), "active": true,
                    "taxable": false, "category": category.map { .string($0) } ?? .null,
                    "chemical": chemical.map { .string($0) } ?? .null,
                ])
        }
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "job", xid: "3",
                        row: [
                            "id": "v", "company_id": "c1", "property_id": "p", "customer_id": "a",
                            "type": "maintenance", "status": "scheduled", "number": 1080,
                            "scheduled_start": "2026-10-19T16:00:00Z", "plan_date": "2026-10-19",
                        ]),
                    item("basket", "Skimmer basket", 2400, "Parts", nil, 220),
                    item("filter", "Clean filter", 7500, "Service", nil, 210),
                    item("cl", "Liquid chlorine", 800, "Chemicals", "liquid_chlorine", 110),
                    item("tabs", "Tabs", 250, nil, "tabs", 122),
                    PulledRow(
                        table: "price_book_item", xid: "3",
                        row: [
                            "id": "old", "company_id": "c1", "name": "Old part", "price_cents": 100, "active": false,
                            "category": "Parts",
                        ]),
                    PulledRow(
                        table: "invoice", xid: "3",
                        row: [
                            "id": "d", "company_id": "c1", "job_id": "v", "status": "draft", "subtotal_cents": 16000,
                            "discount_cents": 1000, "tax_cents": 0, "credit_cents": 0, "total_cents": 15000,
                            "amount_paid_cents": 0, "period_month": "2026-10-01",
                        ]),
                    PulledRow(
                        table: "invoice_line_item", xid: "3",
                        row: [
                            "id": "l1", "company_id": "c1", "invoice_id": "d", "kind": "item",
                            "description": "Pool service, October", "quantity": 1, "unit_price_cents": 16000,
                            "taxable": false, "sort_order": 1,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        return s
    }

    @Test func addChargeOffersServicesAndPartsInTheBooksOrder() throws {
        let s = try seeded()
        #expect(visitChargeItems(s.sync.store, companyId: "c1").map(\.id) == ["filter", "basket"])
    }

    @Test func addChargeChecksLikeTheWebsite() {
        let basket = ChargeItem(id: "basket", name: "Skimmer basket", priceCents: 2400, taxable: false)
        #expect(chargeQuantity("") == 1 && chargeQuantity("2,5") == 2.5 && chargeQuantity(" 3 ") == 3)
        for bad in ["0", "-1", "1e3", "abc", "1.005", "100000"] { #expect(chargeQuantity(bad) == nil) }
        #expect(
            checkCharge(mode: .book, item: nil, quantity: "1", description: "", price: "", taxable: true)
                == .failure(ChargeErrors(fields: ["item": "Pick an item from the price book."])))
        #expect(
            checkCharge(mode: .book, item: basket, quantity: "x", description: "", price: "", taxable: true)
                == .failure(ChargeErrors(fields: ["quantity": "Enter a quantity like 1 or 2.5."])))
        #expect(
            checkCharge(mode: .book, item: basket, quantity: "2", description: "", price: "", taxable: true)
                == .success(
                    ChargeDraft(
                        priceBookItemId: "basket", name: "Skimmer basket", quantity: 2, unitPriceCents: 2400,
                        taxable: false)))
        #expect(
            checkCharge(mode: .custom, item: basket, quantity: "", description: " ", price: "-3", taxable: true)
                == .failure(
                    ChargeErrors(fields: ["description": "Describe the work.", "price": "Enter a price like 24."])))
        #expect(
            checkCharge(
                mode: .custom, item: nil, quantity: "1", description: " Salt cell clean ", price: "$45",
                taxable: true)
                == .success(
                    ChargeDraft(
                        priceBookItemId: nil, name: "Salt cell clean", quantity: 1, unitPriceCents: 4500, taxable: true)
                ))
    }

    @Test func chargesSaveOfflineAndLockOnASentInvoice() throws {
        let s = try seeded()
        let store = s.sync.store
        let pending = try store.pendingCount()
        let items = visitChargeItems(store, companyId: "c1")
        let id = try VisitChargeWrites.add(
            s.sync, companyId: "c1", jobId: "v",
            ChargeDraft(
                priceBookItemId: "basket", name: "Skimmer basket", quantity: 1, unitPriceCents: 2400, taxable: false),
            now: now)
        try VisitChargeWrites.add(
            s.sync, companyId: "c1", jobId: "v",
            ChargeDraft(
                priceBookItemId: nil, name: "Salt cell clean", quantity: 2, unitPriceCents: 4500, taxable: true),
            now: now.addingTimeInterval(60))
        #expect(try store.pendingCount() == pending + 2)
        let row = try #require(try store.get("visit_charge", id))
        #expect(row["job_id"] == "v" && row["price_book_item_id"] == "basket" && row["quantity"] == 1)
        #expect(row["added_at"] == "2026-10-19T17:00:00.000Z")

        var charges = visitCharges(store, jobId: "v", items: items)
        #expect(charges.map(\.name) == ["Skimmer basket", "Salt cell clean"])
        #expect(charges.map { chargeDetail($0) } == ["1 × $24.00", "2 × $45.00"])
        #expect(charges.map { chargeCents($0) } == [2400, 9000])
        let job = try #require(try jobView(store, companyId: "c1", jobId: "v"))
        #expect(visitChargesSentInvoice(store, charges, timeZone: "America/Phoenix") == nil)
        #expect(
            visitChargesFooter(job, sent: nil, timeZone: "America/Phoenix")
                == "Billed on Alicia’s October invoice.")

        // On a draft: still open. Once that invoice is sent: locked, with its number and day.
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "visit_charge", xid: "4",
                        row: [
                            "id": .string(id), "company_id": "c1", "job_id": "v", "price_book_item_id": "basket",
                            "name": "Skimmer basket", "quantity": "1.00", "unit_price_cents": 2400, "taxable": false,
                            "billed_invoice_id": "i", "added_at": "2026-10-19T17:00:00Z",
                        ])
                ], done: true, cursor: [:], serverHLC: "1760000000004-0000-srv"))
        charges = visitCharges(store, jobId: "v", items: items)
        let sent = try #require(visitChargesSentInvoice(store, charges, timeZone: "America/Phoenix"))
        #expect(sent == SentInvoiceRef(number: 1026, sentOn: "Oct 17"))
        #expect(
            visitChargesFooter(job, sent: sent, timeZone: "America/Phoenix") == "On invoice #1026, sent Oct 17.")

        // Removed: gone from the visit, through the outbox.
        try VisitChargeWrites.remove(s.sync, id: charges[1].id)
        #expect(visitCharges(store, jobId: "v", items: items).map(\.name) == ["Skimmer basket"])
    }

    @Test func aMonthsDraftChangesThroughTheSyncLayer() throws {
        let s = try seeded()
        let store = s.sync.store
        let server = MonthBilling(
            month: "2026-10-01",
            invoices: [
                MonthBillingInvoice(
                    id: "d", number: nil, status: "draft", jobId: "v", customerId: "a", customer: "Alicia Romero",
                    email: nil, phone: "(623) 555-0144", totalCents: 15000, amountPaidCents: 0, sentAt: nil,
                    dueDate: nil,
                    lines: [
                        MonthBillingLine(
                            id: "l1", description: "Pool service, October", quantity: 1, unitPriceCents: 16000,
                            unit: "month", kind: "item", taxable: false)
                    ]),
                MonthBillingInvoice(
                    id: "elsewhere", number: nil, status: "draft", jobId: "x", customerId: "b", customer: "Blue Wave",
                    email: "b@example.com", phone: nil, totalCents: 9900, amountPaidCents: 0, sentAt: nil,
                    dueDate: nil, lines: []),
            ], notInvoiced: 0, waiting: [])

        let lineId = try MonthBillingWrites.addLine(
            s.sync, companyId: "c1", invoiceId: "d",
            ChargeDraft(priceBookItemId: nil, name: "Salt cell clean", quantity: 2, unitPriceCents: 4500, taxable: true)
        )
        #expect(try store.get("invoice_line_item", lineId)?["sort_order"] == 2)
        // 10% tax on the taxable line; the draft's discount comes off first.
        let local = localMonthBilling(store, companyId: "c1", server, taxRateBps: 1000)
        #expect(local.invoices[0].lines.map(\.description) == ["Pool service, October", "Salt cell clean"])
        #expect(local.invoices[0].lines[0].unit == "month")
        #expect(
            local.invoices[0].totalCents
                == invoiceTotals(
                    [
                        InvoiceLine(kind: .item, quantity: 1, unitPriceCents: 16000, taxable: false),
                        InvoiceLine(kind: .item, quantity: 2, unitPriceCents: 4500, taxable: true),
                    ], 1000, 1000
                ).totalCents)
        // A draft this phone doesn't have stays as the server sent it.
        #expect(local.invoices[1] == server.invoices[1])

        try MonthBillingWrites.removeLine(s.sync, companyId: "c1", lineId: "l1")
        #expect(
            localMonthBilling(store, companyId: "c1", server, taxRateBps: 0).invoices[0].lines.map(\.id) == [lineId])
        #expect(throws: InvoiceWrites.Problem.self) {
            try MonthBillingWrites.addLine(
                s.sync, companyId: "c1", invoiceId: "elsewhere",
                ChargeDraft(priceBookItemId: nil, name: "X", quantity: 1, unitPriceCents: 1, taxable: true))
        }
        #expect(throws: InvoiceWrites.Problem.self) {
            try MonthBillingWrites.addLine(
                s.sync, companyId: "c1", invoiceId: "i",
                ChargeDraft(priceBookItemId: nil, name: "X", quantity: 1, unitPriceCents: 1, taxable: true))
        }
    }

    @Test func theServersRepliesDecode() async throws {
        let months = PlanRPC(
            reply: .success([
                [
                    "month": "2026-10-01", "drafts": 38, "draft_total_cents": 591200, "sent": 2, "not_invoiced": 3,
                    "current": false,
                ]
            ]))
        let rows = try await MonthlyBillingServer.months(months, companyId: "c1")
        #expect(rows.map(billingMonthDetail) == ["38 to send · $5,912.00 · 3 customers not invoiced yet"])
        #expect(months.calls.first?.0 == "billing_months" && months.calls.first?.1 == ["target_company": "c1"])

        let month = PlanRPC(
            reply: .success([
                "month": "2026-10-01", "not_invoiced": 0, "waiting": [],
                "invoices": [
                    [
                        "id": "d", "number": nil, "status": "draft", "job_id": "v", "customer_id": "a",
                        "customer": "Alicia", "email": nil, "phone": nil, "total_cents": 100, "amount_paid_cents": 0,
                        "sent_at": nil, "due_date": nil,
                        "lines": [
                            [
                                "id": "l", "description": "Pool service, October", "quantity": "1.00",
                                "unit_price_cents": 100, "unit": nil, "kind": "item", "taxable": true,
                            ]
                        ],
                    ]
                ],
            ]))
        let b = try await MonthlyBillingServer.month(month, companyId: "c1", month: "2026-10-01")
        #expect(b.drafts.count == 1 && b.invoices[0].lines[0].quantity == 1)
        #expect(monthBillingSubtitle(b) == "1 to send · $1.00")

        let create = PlanRPC(reply: .success(3))
        #expect(
            try await MonthlyBillingServer.createInvoices(create, companyId: "c1", month: "2026-10-01")
                == "3 invoices ready to send.")
        #expect(
            MonthlyBillingServer.message(WebAPI.Failure(description: WebAPI.Failure.noConnection), sending: true)
                == "Sending needs a connection. Try again when you have signal.")
    }
}
