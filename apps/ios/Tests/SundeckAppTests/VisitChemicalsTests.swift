import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// A visit's Chemicals (owner, 2026-10-24): readings saved as typed into one row per visit,
/// added chemicals as their own rows, all through the sync layer (row plus outbox), offline.
@Suite @MainActor struct VisitChemicalsTests {
    let now = parseISODate("2026-10-19T17:00:00Z")!  // 10:00 AM in Phoenix

    /// Alicia's pool and a visit to it, the shop's chemicals, and a sent invoice.
    func seeded() throws -> Shell {
        let s = try CustomersAndInvoicesTests().seeded()
        func item(_ id: String, _ name: String, _ unit: String, _ cents: Int, _ chemical: String?, _ order: Int)
            -> PulledRow
        {
            PulledRow(
                table: "price_book_item", xid: "3",
                row: [
                    "id": .string(id), "company_id": "c1", "name": .string(name), "unit": .string(unit),
                    "price_cents": .number(Double(cents)), "sort_order": .number(Double(order)), "active": true,
                    "category": "Chemicals", "chemical": chemical.map { .string($0) } ?? .null,
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
                            "scheduled_start": "2026-10-19T16:00:00Z",
                        ]),
                    item("cl", "Liquid chlorine", "gal", 800, "liquid_chlorine", 110),
                    item("acid", "Muriatic acid", "gal", 1500, "muriatic_acid", 120),
                    item("tabs", "Chlorine tabs (3″)", "tab", 250, "tabs", 122),
                    PulledRow(
                        table: "price_book_item", xid: "3",
                        row: [
                            "id": "pump", "company_id": "c1", "name": "Pump motor", "unit": "each",
                            "price_cents": 65000, "category": "Repair", "active": true,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        return s
    }

    func form(_ readings: [ReadingKey: String], gallons: String = "20,000") -> ChemicalForm {
        var f = ChemicalForm()
        f.gallons = gallons
        f.readings = readings
        return f
    }

    @Test func readingsSaveIntoOneRowPerVisit() throws {
        let s = try seeded()
        let store = s.sync.store
        let pending = try store.pendingCount()
        var f = form([.fc: "1", .ph: "7.8"])
        f.goals = [.fc: "4", .cya: "x"]
        f.notes = "  Gate code 1234 "
        #expect(
            try VisitChemicalWrites.saveReading(
                s.sync, companyId: "c1", jobId: "v", propertyId: "p", form: f, now: now) == nil)
        // The row's id is the visit's, so a second phone writes the same row.
        let row = try #require(try store.get("chemical_reading", "v"))
        #expect(row["job_id"] == "v" && row["property_id"] == "p")
        #expect(row["fc"] == 1 && row["ph"] == 7.8 && row["ta"] == nil && row["gallons"] == 20000)
        #expect(row["goals"] == ["fc": 4])
        #expect(row["notes"] == "Gate code 1234")
        // The pool had no gallons: they fill in.
        #expect(try store.get("property", "p")?["approx_gallons"] == 20000)
        #expect(try store.pendingCount() == pending + 2)

        // Typed again: the same row, only what changed.
        f.readings[.ta] = "90"
        try VisitChemicalWrites.saveReading(s.sync, companyId: "c1", jobId: "v", propertyId: "p", form: f, now: now)
        #expect(try store.get("chemical_reading", "v")?["ta"] == 90)
        #expect(try store.list("chemical_reading", jobId: "v").count == 1)

        // The form opens from the visit's row.
        let back = visitChemicalForm(store, jobId: "v", poolGallons: nil, rememberedGoals: [:])
        #expect(back.readings[.fc] == "1" && back.readings[.ph] == "7.8" && back.readings[.ta] == "90")
        #expect(back.goals[.fc] == "4" && back.gallons == "20,000" && back.notes == "Gate code 1234")

        // Something that isn't a reading yet isn't saved, and says why.
        #expect(
            try VisitChemicalWrites.saveReading(
                s.sync, companyId: "c1", jobId: "v", propertyId: "p", form: form([.ph: "15"]), now: now)
                == "pH should be between 0 and 14.")
        #expect(try store.get("chemical_reading", "v")?["ph"] == 7.8)

        // Every reading cleared: the row is removed, and comes back when typed again.
        try VisitChemicalWrites.saveReading(
            s.sync, companyId: "c1", jobId: "v", propertyId: "p", form: form([:]), now: now)
        #expect(try store.get("chemical_reading", "v")?["deleted_at"]?.string != nil)
        #expect(visitReading(store, jobId: "v") == nil)
        try VisitChemicalWrites.saveReading(
            s.sync, companyId: "c1", jobId: "v", propertyId: "p", form: form([.fc: "2"]), now: now)
        #expect(try store.get("chemical_reading", "v")?["deleted_at"]?.string == nil)
        #expect(visitReading(store, jobId: "v")?.reading.fc == 2)
    }

    @Test func addingChangingAndRemovingChemicals() throws {
        let s = try seeded()
        let store = s.sync.store
        let items = visitChemicalItems(store, companyId: "c1")
        // The Chemicals category and items with a chemical, in price book order; no repairs.
        #expect(items.map(\.id) == ["cl", "acid", "tabs"])

        let rows = chemicalRows(form([.fc: "1", .ph: "7.8"]).result, [], items)
        let open = openSuggestions(rows.rows)
        #expect(open.map(\.priceBookItemId) == ["cl", "acid"])
        let pending = try store.pendingCount()
        // Mark All Added: one row each, in one go.
        try VisitChemicalWrites.add(s.sync, companyId: "c1", jobId: "v", propertyId: "p", open, firstSort: 0, now: now)
        try VisitChemicalWrites.add(
            s.sync, companyId: "c1", jobId: "v", propertyId: "p", [itemAddition(items[2], quantity: 3)],
            customerSupplied: true, note: " In the floater ", firstSort: 2, now: now)
        #expect(try store.pendingCount() == pending + 3)
        var added = visitAdditions(store, jobId: "v", items: items)
        #expect(added.count == 3)
        let tabs = try #require(added.first { $0.priceBookItemId == "tabs" })
        #expect(tabs.quantity == 3 && tabs.customerSupplied && tabs.note == "In the floater" && tabs.readingKey == nil)
        // The phone never writes the price: it shows the price book's until the server's arrives.
        #expect(try store.get("chemical_addition", tabs.id)?["unit_price_cents"] == nil)
        #expect(tabs.unitPriceCents == 250)
        let suggested = chemicalRows(form([.fc: "1", .ph: "7.8"]).result, added, items)
        #expect(openSuggestions(suggested.rows).isEmpty)
        #expect(suggested.extras.map(\.id) == [tabs.id])
        #expect(chemicalCardLine("FC 1 · pH 7.8", added) == "3 added · FC 1 · pH 7.8")

        // The Added Chemical sheet: another amount, no longer customer supplied.
        var changed = tabs
        changed.quantity = 4
        changed.customerSupplied = false
        changed.note = ""
        try VisitChemicalWrites.update(s.sync, companyId: "c1", changed)
        let row = try #require(try store.get("chemical_addition", tabs.id))
        #expect(row["quantity"] == 4 && row["customer_supplied"] == false && row["note"]?.string == nil)
        added = visitAdditions(store, jobId: "v", items: items)
        #expect(additionsCents(added) == 4 * 250 + lineTotal(open[0]) + lineTotal(open[1]))

        // Remove: soft deleted, so it leaves every phone.
        try VisitChemicalWrites.remove(s.sync, id: tabs.id)
        #expect(visitAdditions(store, jobId: "v", items: items).count == 2)
        #expect(try store.get("chemical_addition", tabs.id)?["deleted_at"]?.string != nil)

        // The pool's log: what it took this month.
        let months = monthlyUsage(
            poolAdditions(store, companyId: "c1", propertyId: "p"), timeZone: "America/Phoenix")
        #expect(months.map(\.label) == ["October"])
    }

    @Test func chemicalsOnASentInvoiceAreLocked() throws {
        let s = try seeded()
        let store = s.sync.store
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "invoice", xid: "4",
                        row: ["id": "draft", "company_id": "c1", "status": "draft", "total_cents": 0]),
                    PulledRow(
                        table: "chemical_addition", xid: "4",
                        row: [
                            "id": "x1", "company_id": "c1", "job_id": "v", "property_id": "p",
                            "name": "Liquid chlorine",
                            "unit": "gal", "quantity": "0.5", "unit_price_cents": 800, "billed_invoice_id": "i",
                            "added_at": "2026-10-01T16:00:00Z", "sort_order": 0,
                        ]),
                    PulledRow(
                        table: "chemical_addition", xid: "4",
                        row: [
                            "id": "x2", "company_id": "c1", "job_id": "v", "property_id": "p",
                            "name": "Liquid chlorine",
                            "unit": "gal", "quantity": 1, "unit_price_cents": 800, "billed_invoice_id": "draft",
                            "added_at": "2026-10-01T16:00:00Z", "sort_order": 1,
                        ]),
                    PulledRow(
                        table: "chemical_addition", xid: "4",
                        row: [
                            "id": "x3", "company_id": "c1", "job_id": "v", "property_id": "p",
                            "name": "Liquid chlorine",
                            "unit": "gal", "quantity": 1, "unit_price_cents": 800, "billed_invoice_id": "not-here",
                            "added_at": "2026-10-01T16:00:00Z", "sort_order": 2,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000004-0000-srv"))
        let added = visitAdditions(store, jobId: "v", items: [])
        // Numeric columns arrive as text from Postgres.
        #expect(added.first { $0.id == "x1" }?.quantity == 0.5)
        // Sent ("i") and not on this phone yet are locked; a draft follows its additions.
        #expect(lockedAdditions(store, added) == ["x1", "x3"])
    }

    @Test func billedOnTheCustomersInvoice() throws {
        let s = try seeded()
        #expect(visitCustomerFirstName(s.sync.store, jobId: "v", propertyId: "p") == "Alicia")
        #expect(visitCustomerFirstName(s.sync.store, jobId: nil, propertyId: "p") == "Alicia")
        #expect(visitCustomerFirstName(s.sync.store, jobId: nil, propertyId: "gone") == "the customer")
    }

    @Test func chargeForChemicalsKeepsTheMonthItStarted() throws {
        let s = try seeded()
        let company = CompanyContext(
            id: "c1", name: "Demo Leak Co.", timeZone: "America/Phoenix", settings: ["services": "pool"],
            role: "owner")
        try ChargeChemicalsWrites.set(s.sync, company: company, on: true, now: now)
        let on = try #require(try s.sync.store.get("company", "c1")?["settings"])
        #expect(on["charge_chemicals"] == true && on["charge_chemicals_from"] == "2026-10-01")
        #expect(on["services"] == "pool")
        #expect(chargesChemicals(on))
        // Off keeps everything else.
        var current = company
        current.settings = on
        try ChargeChemicalsWrites.set(s.sync, company: current, on: false, now: now)
        let off = try #require(try s.sync.store.get("company", "c1")?["settings"])
        #expect(off["charge_chemicals"] == false && !chargesChemicals(off) && off["services"] == "pool")
    }
}
