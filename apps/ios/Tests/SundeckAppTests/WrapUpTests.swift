import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

// S7 and the job page's restyle: the Wrap-Up section's quote builder and invoice (what each state
// shows, who may give which discount, what stays editable once sent), and the Photos section's
// words.

private let hlc = "1760000000000-0000-srv"

/// A database function stand-in that records its calls.
final class WrapUpRPC: RPCClient, @unchecked Sendable {
    var calls: [(String, JSONValue)] = []
    var reply: JSONValue = .null

    func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
        calls.append((function, arguments))
        return reply
    }
}

@MainActor
private struct MoneyJob {
    let shell: Shell
    let host = "m\(UUID().uuidString.prefix(8).lowercased()).test"
    var sync: SyncService { shell.sync }
    var store: LocalStore { shell.sync.store }
    let role: String
    let settings: JSONValue

    init(
        role: String = "tech", type: String = "detection", status: String = "in_progress", fee: Int? = 64900,
        settings: JSONValue = [
            "tax_rate_bps": 800, "tech_discount_limit_bps": 1000,
            "deposit": ["type": "percent", "value_bps": 5000],
        ],
        job extra: Row = [:]
    ) throws {
        shell = try Shell()
        self.role = role
        self.settings = settings
        try shell.seedCompany(userId: "u1", role: role, settings: settings)
        var job: Row = [
            "id": "j1", "company_id": "c1", "property_id": "p1", "type": .string(type), "status": .string(status),
            "number": 1040, "fee_cents": fee.map { .number(Double($0)) } ?? .null,
        ]
        job.merge(extra) { _, new in new }
        try pull([
            ("customer", ["id": "cu1", "company_id": "c1", "name": "Riley Rivera", "email": "riley@example.com"]),
            (
                "property",
                [
                    "id": "p1", "company_id": "c1", "customer_id": "cu1", "address_line1": "1423 Palm Ct",
                    "has_pool": true,
                ]
            ),
            ("job", .object(job)),
            (
                "component_type",
                [
                    "id": "ct1", "company_id": "c1", "key": "skimmer", "name": "Skimmer", "section": "plumbing",
                    "answer": "leak", "on_schedule": false, "allows_multiple": false, "default_count": 1,
                    "applies_to": "pool", "methods": ["Visual"], "sort_order": 1, "active": true,
                ]
            ),
            (
                "job_component",
                [
                    "id": "jc1", "company_id": "c1", "job_id": "j1", "component_type_id": "ct1",
                    "instance_number": 1, "label": "Skimmer", "sort_order": 1,
                ]
            ),
            (
                "finding",
                [
                    "id": "f1", "company_id": "c1", "job_id": "j1", "job_component_id": "jc1",
                    "title": "Skimmer seam leak", "severity_key": "major", "status": "open",
                ]
            ),
            (
                "finding",
                [
                    "id": "f2", "company_id": "c1", "job_id": "j1", "title": "Old crack", "severity_key": "minor",
                    "status": "repaired",
                ]
            ),
            (
                "finding",
                [
                    "id": "f3", "company_id": "c1", "job_id": "j1", "title": "Light niche", "severity_key": "minor",
                    "status": "open",
                ]
            ),
            (
                "price_book_item",
                [
                    "id": "pb1", "company_id": "c1", "name": "Skimmer repair", "unit": "each", "price_cents": 45000,
                    "taxable": true, "sort_order": 1, "active": true, "component_type_key": "skimmer",
                ]
            ),
            (
                "price_book_item",
                [
                    "id": "pb2", "company_id": "c1", "name": "Dive fee", "unit": "each", "price_cents": 15000,
                    "taxable": false, "sort_order": 2, "active": true,
                ]
            ),
        ])
    }

    func pull(_ rows: [(String, JSONValue)]) throws {
        var pulled: [PulledRow] = []
        for (i, (table, row)) in rows.enumerated() {
            guard case .object(let object) = row else { continue }
            pulled.append(PulledRow(table: table, xid: String(i + 10), row: object))
        }
        try store.applyPage(PullPage(rows: pulled, done: true, cursor: [:], serverHLC: hlc))
    }

    var job: JobView { try! jobViews(store, companyId: "c1").first { $0.id == "j1" }! }

    func quotes() -> QuoteSectionModel {
        QuoteSectionModel(
            store: store, companyId: "c1", settings: settings, role: role, job: job, timeZone: "America/Phoenix",
            webURL: URL(string: "https://sundeck.test")!)
    }

    func invoices() -> InvoiceSectionModel {
        InvoiceSectionModel(
            store: store, companyId: "c1", settings: settings, role: role, job: job, timeZone: "America/Phoenix",
            webURL: URL(string: "https://sundeck.test")!)
    }

    func quoteFlow() -> QuoteFlow {
        QuoteFlow(sync: sync, companyId: "c1", jobId: "j1", role: role, settings: settings)
    }

    var server: MoneyServer {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return MoneyServer(sync: sync, api: api)
    }

    var card: InvoiceCardModel? {
        if case .invoice(let card) = invoices().state { return card }
        return nil
    }
}

private func sentQuote(_ status: String, accepted: Bool = false) -> [(String, JSONValue)] {
    [
        (
            "quote",
            [
                "id": "q1", "company_id": "c1", "job_id": "j1", "number": 1006, "status": .string(status),
                "subtotal_cents": 125000, "discount_cents": 0, "tax_cents": 0, "total_cents": 125000,
                "deposit_cents": 62500, "accepted_at": accepted ? "2026-10-14T17:00:00.000Z" : nil,
                "accepted_by_name": accepted ? "Riley Rivera" : nil, "repair_job_id": accepted ? "j2" : nil,
            ]
        ),
        (
            "quote_line_item",
            [
                "id": "ql1", "company_id": "c1", "quote_id": "q1",
                "description": "Repair underground pressure line (per break)", "quantity": 1,
                "unit_price_cents": 125000, "taxable": false, "sort_order": 1,
            ]
        ),
        ("share_link", ["id": "sl1", "company_id": "c1", "job_id": "j1", "quote_id": "q1", "token": "qtok"]),
        (
            "payment",
            [
                "id": "pay1", "company_id": "c1", "quote_id": "q1", "amount_cents": 62500, "method": "card",
                "status": "succeeded",
            ]
        ),
        ("job", ["id": "j2", "company_id": "c1", "property_id": "p1", "type": "repair", "number": 1296]),
    ]
}

@Suite @MainActor struct QuoteBuilderTests {
    @Test func aJobWithNoQuoteOffersStartQuoteAndRepairJobsHaveNoQuotes() throws {
        let s = try MoneyJob()
        let m = s.quotes()
        #expect(m.shows)
        #expect(m.showsStart)
        #expect(m.cards.isEmpty && m.builder == nil)
        #expect(QuoteSectionModel.startText == "No quote yet. Start one to price the repairs for these findings.")
        #expect(!(try MoneyJob(type: "repair")).quotes().shows)
        #expect(try MoneyJob(type: "maintenance").quotes().shows)
    }

    @Test func addingFromFindingsUsesThePriceBookForTheFindingsComponent() throws {
        let s = try MoneyJob()
        let flow = s.quoteFlow()
        let id = try #require(flow.start())
        var m = s.quotes()
        #expect(!m.showsStart)
        #expect(m.cards.map(\.title) == ["Quote · Draft"])
        #expect(m.cards[0].isEditable)
        var builder = try #require(m.builder)
        // Repaired findings are left out; a finding with no item type gets the custom-line hint.
        #expect(builder.findings.map(\.title) == ["Skimmer seam leak", "Light niche"])
        #expect(builder.findings[0].items.map(\.title) == ["+ Skimmer repair · $450.00"])
        #expect(builder.findings[0].items[0].accessibilityLabel == "Add Skimmer repair, $450.00")
        #expect(builder.findings[1].items.isEmpty)
        #expect(FindingSuggestion.noItems == "No price book items for this component. Add a custom line.")
        #expect(builder.priceBook.map(\.menuTitle) == ["Skimmer repair ($450.00)", "Dive fee ($150.00)"])
        #expect(!builder.canSend)

        flow.add(builder.findings[0].items[0].item, findingId: "f1", to: id)
        flow.add(builder.priceBook[1].item, findingId: nil, to: id)
        m = s.quotes()
        builder = try #require(m.builder)
        #expect(builder.findings[0].items.map(\.title) == ["✓ Skimmer repair · $450.00"])
        #expect(builder.findings[0].items[0].added)
        #expect(builder.lines.map(\.findingId) == ["f1", nil])
        // 450 taxed at 8% and 150 untaxed; half the total as deposit.
        #expect(
            builder.totalRows == [
                MoneyRow("Subtotal", "$600.00"), MoneyRow("Tax", "$36.00"),
                MoneyRow("Total", "$636.00", strong: true), MoneyRow("Deposit", "$318.00"),
            ])
        #expect(m.cards[0].totalText == "$636.00")
        #expect(builder.canSend)
        #expect(flow.error == nil)
    }

    @Test func customLinesAndLineEditsUseTheWebsitesChecks() throws {
        let s = try MoneyJob()
        let flow = s.quoteFlow()
        let id = try #require(flow.start())
        #expect(!flow.addCustom(description: "  ", price: "10", to: id))
        #expect(flow.error == "Describe the work.")
        #expect(!flow.addCustom(description: "Replace skimmer lid", price: "ten", to: id))
        #expect(flow.error == "Enter a price like 125 or 125.50.")
        #expect(flow.addCustom(description: "Replace skimmer lid", price: "$85.50", to: id))
        #expect(flow.error == nil)
        var line = try #require(s.quotes().builder?.lines.first)
        #expect(line.description == "Replace skimmer lid" && line.unitPriceCents == 8550 && line.taxable)

        flow.updateLine(try #require(line.id), in: id, quantity: "0")
        #expect(flow.error == "Quantity must be more than 0.")
        flow.updateLine(try #require(line.id), in: id, price: "-3")
        #expect(flow.error == "Enter a price like 125 or 125.50.")
        flow.updateLine(try #require(line.id), in: id, description: "")
        #expect(flow.error == "Describe the work.")
        flow.updateLine(try #require(line.id), in: id, description: String(repeating: "a", count: 501))
        #expect(flow.error == "Keep the description under 500 characters.")
        #expect(!flow.addCustom(description: String(repeating: "a", count: 501), price: "10", to: id))
        #expect(flow.error == "Keep the description under 500 characters.")
        // Exactly 500 is fine.
        #expect(flow.addCustom(description: String(repeating: "a", count: 500), price: "10", to: id))
        flow.removeLine(
            try #require(s.quotes().builder?.lines.first { $0.description?.count == 500 }?.id), from: id)
        flow.updateLine(try #require(line.id), in: id, quantity: "2,5")
        #expect(flow.error == nil)
        line = try #require(s.quotes().builder?.lines.first)
        #expect(line.quantity == 2.5)
        #expect(s.quotes().builder?.totals.subtotalCents == 21375)

        flow.removeLine(try #require(line.id), from: id)
        #expect(s.quotes().builder?.lines.isEmpty == true)
        #expect(QuoteBuilderModel.removeTitle(line) == "Remove “Replace skimmer lid” from the quote?")
    }

    @Test func techsAreHeldToTheDiscountLimitAndManagersAreNot() throws {
        let tech = try MoneyJob()
        let flow = tech.quoteFlow()
        let id = try #require(flow.start())
        #expect(flow.addCustom(description: "Patch", price: "450", to: id))
        #expect(tech.quotes().builder?.discountHint == "Techs can give up to 10% off.")
        flow.setDiscount("50", on: id)
        #expect(flow.error == "Techs can give up to 10% off. Ask an owner for more.")
        #expect(tech.quotes().builder?.discountText == "")
        flow.setDiscount("45", on: id)
        #expect(flow.error == nil)
        #expect(tech.quotes().builder?.discountText == "45.00")
        #expect(tech.quotes().builder?.totalRows.map(\.label) == ["Subtotal", "Discount", "Tax", "Total", "Deposit"])
        #expect(tech.quotes().builder?.totalRows[1].value == "−$45.00")
        flow.setDiscount("abc", on: id)
        #expect(flow.error == "Enter a discount like 50 or 50.00.")
        // More than the $450 subtotal: refused before the tech limit, as on the website.
        flow.setDiscount("450.01", on: id)
        #expect(flow.error == "The discount can’t be more than the subtotal.")
        flow.setDiscount("", on: id)
        #expect(tech.quotes().builder?.discountText == "")

        for role in ["owner", "admin"] {
            let manager = try MoneyJob(role: role)
            let mflow = manager.quoteFlow()
            let mid = try #require(mflow.start())
            #expect(mflow.addCustom(description: "Patch", price: "450", to: mid))
            #expect(manager.quotes().builder?.discountHint == nil)
            // Owners too can't take off more than the subtotal.
            mflow.setDiscount("451", on: mid)
            #expect(mflow.error == "The discount can’t be more than the subtotal.")
            mflow.setDiscount("200", on: mid)
            #expect(mflow.error == nil)
            #expect(manager.quotes().builder?.totals.discountCents == 20000)
        }
    }

    @Test func aSentOrAcceptedQuoteIsLockedAndShowsItsLinkDepositAndRepairJob() throws {
        let s = try MoneyJob()
        try s.pull(sentQuote("accepted", accepted: true))
        let m = s.quotes()
        #expect(!m.showsStart)
        #expect(m.builder == nil)
        let card = try #require(m.cards.first)
        #expect(card.title == "Quote #1006 · Accepted")
        #expect(card.totalText == "$1,250.00")
        #expect(!card.isEditable)
        #expect(card.lines.map(\.description) == ["Repair underground pressure line (per break)"])
        #expect(card.lines.map(\.amount) == ["$1,250.00"])
        #expect(card.depositText == "Deposit $625.00 · paid (card)")
        #expect(card.link?.absoluteString == "https://sundeck.test/q/qtok")
        #expect(card.acceptedText == "Accepted by Riley Rivera on Oct 14, 2026.")
        #expect(card.repairJobId == "j2" && card.repairJobLabel == "Repair job #1296")

        let flow = s.quoteFlow()
        flow.add(try #require(priceBook(s.store, companyId: "c1").first), findingId: nil, to: "q1")
        #expect(flow.error == QuoteFlow.alreadySent)
        flow.setDiscount("10", on: "q1")
        #expect(flow.error == "This quote was already sent.")
        #expect(!flow.addCustom(description: "More", price: "1", to: "q1"))
        #expect(jobQuotes(s.store, companyId: "c1", jobId: "j1").first?.lines.count == 1)
    }

    @Test func aSentQuoteWaitingForTheCustomerStillOffersNoNewQuote() throws {
        let s = try MoneyJob()
        try s.pull(sentQuote("sent"))
        let m = s.quotes()
        // A sent quote isn't a draft or accepted: a new one can be started beside it.
        #expect(m.showsStart)
        #expect(m.cards.first?.title == "Quote #1006 · Sent")
        #expect(m.cards.first?.acceptedText == nil)
    }

    @Test func sendQuoteNeedsALineThenReturnsTheLink() async throws {
        let s = try MoneyJob()
        let flow = s.quoteFlow()
        let id = try #require(flow.start())
        await flow.send(id, shopName: "Demo Leak Co.", server: s.server)
        #expect(flow.error == "Add a line before sending.")

        try s.pull([
            (
                "quote",
                [
                    "id": "q9", "company_id": "c1", "job_id": "j1", "status": "draft", "subtotal_cents": 100,
                    "discount_cents": 0, "tax_cents": 0, "total_cents": 100, "deposit_cents": 0,
                ]
            ),
            (
                "quote_line_item",
                [
                    "id": "l9", "company_id": "c1", "quote_id": "q9", "description": "Lid", "quantity": 1,
                    "unit_price_cents": 100, "taxable": true, "sort_order": 1,
                ]
            ),
        ])
        StubServer.set(s.host, "/api/quotes/q9/send", 200, ["link": "https://sundeck.test/q/new"])
        await flow.send("q9", shopName: "Demo Leak Co.", server: s.server)
        if flow.error == nil {
            #expect(flow.sentQuoteId == "q9")
            #expect(flow.sent?.link == "https://sundeck.test/q/new")
            #expect(flow.sent?.message == quoteShareText("Demo Leak Co.", "https://sundeck.test/q/new"))
        } else {
            // The started draft above is still waiting to sync, so the server isn't asked.
            #expect(flow.error == "The quote hasn’t reached the server yet. Try again with signal.")
        }
    }
}

private func invoiceRows(status: String, paid: Int = 0) -> [(String, JSONValue)] {
    [
        (
            "invoice",
            [
                "id": "i1", "company_id": "c1", "job_id": "j1", "number": 1025, "status": .string(status),
                "subtotal_cents": 75000, "discount_cents": 0, "tax_cents": 2400, "credit_cents": 31800,
                "total_cents": 45600, "amount_paid_cents": .number(Double(paid)),
            ]
        ),
        (
            "invoice_line_item",
            [
                "id": "il1", "company_id": "c1", "invoice_id": "i1", "kind": "item", "description": "Skimmer repair",
                "quantity": 1, "unit_price_cents": 30000, "taxable": true, "sort_order": 1,
            ]
        ),
        (
            "invoice_line_item",
            [
                "id": "il2", "company_id": "c1", "invoice_id": "i1", "kind": "item", "description": "Dive fee",
                "quantity": 3, "unit_price_cents": 15000, "taxable": false, "sort_order": 2,
            ]
        ),
        (
            "invoice_line_item",
            [
                "id": "il3", "company_id": "c1", "invoice_id": "i1", "kind": "deposit_credit",
                "description": "Deposit paid", "quantity": 1, "unit_price_cents": -31800, "taxable": false,
                "sort_order": 3,
            ]
        ),
        ("share_link", ["id": "sl2", "company_id": "c1", "job_id": "j1", "invoice_id": "i1", "token": "itok"]),
    ]
}

@Suite @MainActor struct InvoiceSectionTests {
    @Test func beforeAnInvoiceTheSectionSaysHowOneIsMade() throws {
        #expect(try MoneyJob(status: "scheduled").invoices().state == .empty("Start the job before invoicing it."))
        #expect(
            try MoneyJob().invoices().state
                == .create(hint: "Bills the detection fee of $649.00. You can add lines before sending."))
        #expect(
            try MoneyJob(fee: nil).invoices().state
                == .create(hint: "Starts an empty invoice. Add the lines before sending."))
        #expect(
            try MoneyJob(type: "repair", fee: nil).invoices().state
                == .create(
                    hint:
                        "Copies the accepted quote and credits the deposit already paid. You can change it before sending."
                ))
        #expect(try MoneyJob(type: "maintenance").invoices().state == .empty(InvoiceSectionModel.monthly))
        #expect(
            try MoneyJob(type: "maintenance", job: ["billed_invoice_id": "i9"]).invoices().state
                == .empty("This visit is on the customer’s monthly invoice. Find it on the Invoices page."))
        #expect(try MoneyJob().invoices().voidedText == nil)
    }

    @Test func aDraftShowsItsLinesTotalsAndCanBeEdited() throws {
        let s = try MoneyJob()
        try s.pull(invoiceRows(status: "draft"))
        var card = try #require(s.card)
        #expect(card.title == "Invoice #1025 · Draft")
        #expect(card.isDraft)
        #expect(card.lines.map(\.description) == ["Skimmer repair", "Dive fee × 3", "Deposit paid"])
        #expect(card.lines.map(\.noTax) == [false, true, false])
        // Deposit credits come from the server; only items are removed on the phone.
        #expect(card.lines.map(\.removable) == [true, true, false])
        #expect(card.lines.map(\.amount) == ["$300.00", "$450.00", "-$318.00"])
        #expect(
            card.totalRows == [
                MoneyRow("Subtotal", "$750.00"), MoneyRow("Tax", "$24.00"), MoneyRow("Deposit paid", "−$318.00"),
                MoneyRow("Total", "$456.00", strong: true),
            ])
        #expect(card.customerEmail == "riley@example.com")
        #expect(!card.canRecordPayment && !card.canVoid)

        let invoice = card.invoice
        #expect(throws: InvoiceWrites.Problem(field: "description", description: "Describe the work.")) {
            try InvoiceWrites.addLine(
                s.sync, companyId: "c1", invoice: invoice, description: " ", quantity: "1", price: "5", taxable: true)
        }
        #expect(throws: InvoiceWrites.Problem(field: "quantity", description: "Enter a quantity like 1 or 2.5.")) {
            try InvoiceWrites.addLine(
                s.sync, companyId: "c1", invoice: invoice, description: "Lid", quantity: "1.234", price: "5",
                taxable: true)
        }
        #expect(throws: InvoiceWrites.Problem(field: "price", description: "Enter a price like 125.")) {
            try InvoiceWrites.addLine(
                s.sync, companyId: "c1", invoice: invoice, description: "Lid", quantity: "", price: "x", taxable: true)
        }
        try InvoiceWrites.addLine(
            s.sync, companyId: "c1", invoice: invoice, description: "Lid", quantity: "", price: "25", taxable: false)
        try InvoiceWrites.removeLine(s.sync, companyId: "c1", invoice: invoice, lineId: "il2")
        try InvoiceWrites.saveDetails(
            s.sync, companyId: "c1", invoice: invoice, discount: "10", dueDate: "2026-11-01", notes: " Thanks! ")
        #expect(
            throws: InvoiceWrites.Problem(field: "discount", description: "Enter an amount like 50, or leave it empty.")
        ) {
            try InvoiceWrites.saveDetails(
                s.sync, companyId: "c1", invoice: invoice, discount: "-5", dueDate: nil, notes: "")
        }
        // The website's limits (apps/web/src/lib/limits.ts): no discount over the $750 subtotal, and
        // descriptions up to 500 characters.
        #expect(
            throws: InvoiceWrites.Problem(
                field: "discount", description: "The discount can’t be more than the subtotal.")
        ) {
            try InvoiceWrites.saveDetails(
                s.sync, companyId: "c1", invoice: invoice, discount: "750.01", dueDate: nil, notes: "")
        }
        #expect(
            throws: InvoiceWrites.Problem(
                field: "description", description: "Keep the description under 500 characters.")
        ) {
            try InvoiceWrites.addLine(
                s.sync, companyId: "c1", invoice: invoice, description: String(repeating: "x", count: 501),
                quantity: "1", price: "5", taxable: true)
        }
        card = try #require(s.card)
        // The new line takes the next item number, as on the website.
        #expect(Set(card.lines.map(\.description)) == ["Skimmer repair", "Deposit paid", "Lid"])
        #expect(card.lines.first { $0.description == "Lid" }?.noTax == true)
        #expect(card.discountText == "10.00" && card.dueDate == "2026-11-01" && card.notes == "Thanks!")
        // 300 + 25 − 10 discount; tax on the taxable share; less the deposit.
        #expect(card.totalRows.map(\.label) == ["Subtotal", "Discount", "Tax", "Deposit paid", "Total"])
        #expect(card.totalRows[0].value == "$325.00")
    }

    @Test func aSentInvoiceIsLockedAndManagersRecordPaymentsOrVoid() throws {
        let tech = try MoneyJob()
        try tech.pull(invoiceRows(status: "sent"))
        var card = try #require(tech.card)
        #expect(card.title == "Invoice #1025 · Sent")
        #expect(!card.isDraft)
        #expect(card.lines.allSatisfy { !$0.removable })
        #expect(
            card.totalRows.suffix(2) == [MoneyRow("Paid", "$0.00"), MoneyRow("Balance due", "$456.00", strong: true)])
        #expect(card.link?.absoluteString == "https://sundeck.test/i/itok")
        #expect(!card.canRecordPayment && !card.canVoid)
        #expect(
            throws: InvoiceWrites.Problem(field: "", description: "This invoice has been sent and can’t be changed.")
        ) {
            try InvoiceWrites.removeLine(tech.sync, companyId: "c1", invoice: card.invoice, lineId: "il1")
        }

        let owner = try MoneyJob(role: "owner")
        try owner.pull(invoiceRows(status: "partially_paid", paid: 10000))
        try owner.pull([
            (
                "payment",
                [
                    "id": "pay2", "company_id": "c1", "invoice_id": "i1", "amount_cents": 10000, "method": "other",
                    "status": "succeeded", "paid_at": "2026-10-15T18:00:00.000Z",
                ]
            )
        ])
        card = try #require(owner.card)
        #expect(card.title == "Invoice #1025 · Partly paid")
        #expect(card.payments == ["$100.00 · Recorded by the office · received · Oct 15, 2026"])
        #expect(card.canRecordPayment && card.balanceText == "356.00")
        // Something is paid, so it can't be voided.
        #expect(!card.canVoid)

        let admin = try MoneyJob(role: "admin")
        try admin.pull(invoiceRows(status: "sent"))
        #expect(admin.card?.canVoid == true)
    }

    @Test func voidedInvoicesAreListedUnderTheSection() throws {
        let s = try MoneyJob()
        var rows = invoiceRows(status: "void")
        rows.append(
            (
                "invoice",
                [
                    "id": "i0", "company_id": "c1", "job_id": "j1", "number": 1020, "status": "void",
                    "subtotal_cents": 0, "discount_cents": 0, "tax_cents": 0, "credit_cents": 0, "total_cents": 0,
                    "amount_paid_cents": 0,
                ]
            ))
        try s.pull(rows)
        let m = s.invoices()
        #expect(m.voidedText == "Voided: #1025 ($456.00), #1020 ($0.00)")
        #expect(m.state == .create(hint: "Bills the detection fee of $649.00. You can add lines before sending."))
    }

    @Test func paymentsAndVoidingGoThroughTheDatabaseFunctions() async throws {
        let s = try MoneyJob(role: "owner")
        try s.pull(invoiceRows(status: "sent"))
        let flow = InvoiceFlow(sync: s.sync, companyId: "c1", jobId: "j1")
        let rpc = WrapUpRPC()
        await flow.recordPayment("i1", amount: "0", rpc: rpc)
        #expect(flow.error == "Enter an amount like 649.")
        #expect(rpc.calls.isEmpty)
        rpc.reply = ["status": "paid", "paid_now": true]
        await flow.recordPayment("i1", amount: "456.00", rpc: rpc)
        #expect(flow.error == nil)
        #expect(flow.message == "Paid in full.")
        #expect(rpc.calls.last?.0 == "record_invoice_payment")
        #expect(rpc.calls.last?.1 == ["target_invoice": "i1", "amount": 45600])
        rpc.reply = ["status": "partially_paid"]
        await flow.recordPayment("i1", amount: "10", rpc: rpc)
        #expect(flow.message == "Payment recorded.")

        await flow.void("i1", draft: false, rpc: rpc)
        #expect(rpc.calls.last?.0 == "void_invoice")
        #expect(flow.message == "Invoice voided.")
        await flow.void("i1", draft: true, rpc: rpc)
        #expect(flow.message == "Draft deleted.")
    }

    @Test func sendingByEmailNeedsAnAddressAndWithoutEmailGivesTheText() async throws {
        let s = try MoneyJob()
        try s.pull(invoiceRows(status: "draft"))
        let flow = InvoiceFlow(sync: s.sync, companyId: "c1", jobId: "j1")
        await flow.send("i1", email: "nope", phone: nil, server: s.server)
        #expect(flow.error == "Enter the customer’s email.")
        StubServer.set(
            s.host, "/api/invoices/i1/send", 200,
            [
                "link": "https://sundeck.test/i/itok", "message": "Demo: your invoice https://sundeck.test/i/itok",
                "status": "sent", "emailed": true,
            ])
        await flow.send("i1", email: "riley@example.com", phone: nil, server: s.server)
        #expect(flow.error == nil)
        #expect(flow.message == "Sent to riley@example.com.")
        #expect(StubServer.calls(s.host).last?.body == ["channel": "email", "to": "riley@example.com"])
        await flow.send("i1", email: nil, phone: "(480) 555-0188", server: s.server)
        #expect(flow.message == "Invoice sent. Copy the link for the customer.")
        #expect(flow.shareText == "Demo: your invoice https://sundeck.test/i/itok")
        #expect(StubServer.calls(s.host).last?.body == ["channel": "sms_device", "to": "(480) 555-0188"])
    }
}

@Suite @MainActor struct JobPhotosTests {
    @Test func attachToListsTheJobFindingsItemsAndTests() throws {
        let s = try MoneyJob()
        try s.pull([
            (
                "test_type",
                [
                    "id": "tt1", "company_id": "c1", "key": "pressure", "name": "Pressure Test",
                    "field_schema": ["fields": []], "schema_version": 1, "calculator": "pressure_drop",
                    "result_options": ["pass", "fail"], "sort_order": 10, "active": true,
                ]
            ),
            (
                "test_result",
                [
                    "id": "t1", "company_id": "c1", "job_id": "j1", "test_type_id": "tt1", "schema_version": 1,
                    "data": [:], "computed": [:], "performed_at": "2026-10-19T16:00:00.000Z",
                ]
            ),
        ])
        let inspection = JobInspection(s.store, jobId: "j1")
        let targets = JobPhotos.targets(inspection, InspectionConfig(s.store, companyId: "c1"), jobId: "j1")
        #expect(
            targets.map(\.label) == [
                "Whole job", "Finding: Skimmer seam leak", "Finding: Old crack", "Finding: Light niche", "Skimmer",
                "Test: Pressure Test",
            ])
        #expect(targets[0].target == MediaTarget(jobId: "j1"))
        #expect(targets[1].target == MediaTarget(jobId: "j1", findingId: "f1"))
        #expect(targets[4].target == MediaTarget(jobId: "j1", componentId: "jc1"))
        #expect(targets[5].target == MediaTarget(jobId: "j1", testResultId: "t1"))
        #expect(JobPhotos.showsTargets(targets))
        #expect(!JobPhotos.showsTargets(Array(targets.prefix(1))))
        #expect(Set(targets.map(\.id)).count == targets.count)
    }

    @Test func eachCardSaysWhatItIsWhatItsOnAndWhen() throws {
        let s = try MoneyJob()
        let now = try #require(parseISODate("2026-10-19T20:00:00Z"))
        func media(_ row: Row) throws -> Media {
            var base: Row = [
                "id": "m1", "company_id": "c1", "job_id": "j1", "kind": "photo", "upload_state": "uploaded",
                "transcript_status": "none", "captured_at": "2026-10-19T16:40:00.000Z",
            ]
            base.merge(row) { _, new in new }
            return try JSONValue.object(base).decode(Media.self)
        }
        let inspection = JobInspection(s.store, jobId: "j1")
        let photo = try media(["job_component_id": "jc1", "latitude": 33.4, "longitude": -111.8, "caption": "Seam"])
        var card = JobPhotos.card(photo, inspection, timeZone: "America/Phoenix", now: now)
        #expect(card.heading == "Photo · Skimmer")
        #expect(card.caption == "Seam")
        #expect(card.meta == "9:40 AM · location recorded")
        #expect(card.stillUploading == "Photo still uploading from the phone")
        #expect(card.markupButton == "Mark Up")

        let note = try media([
            "kind": "audio", "finding_id": "f1", "duration_ms": 42000, "transcript_status": "done",
            "transcript": "Water loss at the main drain.", "captured_at": "2026-10-17T16:40:00.000Z",
        ])
        card = JobPhotos.card(note, inspection, timeZone: "America/Phoenix", now: now)
        #expect(card.heading == "Voice Note · Skimmer seam leak · 0:42")
        #expect(card.transcript == "“Water loss at the main drain.”")
        #expect(card.meta == "Sat, Oct 17, 9:40 AM")
        #expect(card.markupButton == nil)

        let test = try media(["kind": "video", "test_result_id": "t1"])
        #expect(JobPhotos.card(test, inspection, timeZone: "America/Phoenix", now: now).heading == "Video · Test")
        #expect(JobPhotos.attached(try media([:]), inspection) == "Job")
        #expect(JobPhotos.empty == "No photos or recordings yet.")
        #expect(JobPhotos.added(.audio) == "Voice note added.")
        #expect(JobPhotos.added(.photo) == "Photo added.")
    }
}

@Suite struct SignatureDrawingTests {
    @Test func aSavedSignatureReadsBackItsBoxAndStrokes() throws {
        let svg = try signatureSvg([[SIMD2(10, 10), SIMD2(40, 30)], [SIMD2(50, 20)]])
        let drawing = try #require(parseSignatureSVG(svg))
        #expect(drawing.viewBox.count == 4)
        #expect(drawing.viewBox[0] == 4 && drawing.viewBox[1] == 4)
        #expect(drawing.paths.count == 2)
        #expect(!svgCommands(drawing.paths[0]).isEmpty)
        #expect(parseSignatureSVG("<svg></svg>") == nil)
        #expect(SignatureDrawing.localPath("s1") == "media/signature-s1.svg")
    }
}
