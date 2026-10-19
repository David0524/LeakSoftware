import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// The Messages and More tabs' rules (spec 5.7 to 5.12, 6.6): words, order, filters, exports.

@Suite @MainActor struct MessagesModelTests {
    let now = parseISODate("2026-10-19T17:00:00Z")!  // 10:00 AM in Phoenix

    @Test func inboxTimesReadLikeMessages() {
        #expect(inboxTime("2026-10-19T16:41:00Z", now: now, timeZone: "America/Phoenix") == "9:41 AM")
        #expect(inboxTime("2026-10-18T16:41:00Z", now: now, timeZone: "America/Phoenix") == "Yesterday")
        #expect(inboxTime("2026-10-11T16:41:00Z", now: now, timeZone: "America/Phoenix") == "Oct 11")
    }

    @Test func threadHasADayAboveEachDaysFirstMessage() throws {
        let text = { (id: String, at: String, dir: String) -> ThreadItem in
            .text(
                try! JSONValue.object([
                    "id": .string(id), "conversation_id": "cv", "created_at": .string(at), "direction": .string(dir),
                    "body": "Hi", "status": "delivered", "sent_by": "u1",
                ]).decode(TextMessage.self))
        }
        let rows = threadRows(
            [
                text("a", "2026-10-11T16:00:00Z", "in"), text("b", "2026-10-11T17:00:00Z", "out"),
                text("c", "2026-10-12T16:00:00Z", "in"),
            ], timeZone: "America/Phoenix")
        #expect(rows.map(\.day) == ["Sunday, Oct 11", nil, "Monday, Oct 12"])
        if case .text(let t) = rows[1].item {
            #expect(
                textFooter(t, names: ["u1": "Tony Tech"], timeZone: "America/Phoenix")
                    == "Tony Tech · Delivered · 10:00 AM")
        }
    }

    @Test func callsAndNotices() throws {
        let call = try JSONValue.object([
            "id": "k", "created_at": "2026-10-11T16:00:00Z", "direction": "out", "status": "completed",
            "duration_seconds": 180, "user_id": "u1",
        ]).decode(CallLog.self)
        #expect(callLabel(call, names: ["u1": "Tony Tech"]) == "Tony Tech called · 3 min")
        #expect(lineNotice(nil, manager: true)?.link == "Set Up a Number")
        #expect(lineNotice(nil, manager: false)?.text.hasSuffix("Ask an owner to set up a company number.") == true)
        #expect(textPicturePath(companyId: "c1", id: "x", type: "image/png") == "c1/out/x.png")
        #expect(photosAttached(2) == "2 photos attached")
    }
}

@Suite @MainActor struct MoreModelTests {
    @Test func moreListFollowsRoleAndPackage() {
        #expect(moreLinks(role: "tech", services: .leak) == [.customers, .invoices])
        #expect(moreLinks(role: "owner", services: .both) == [.customers, .invoices, .chemicals, .settings])
        #expect(moreLinks(role: "admin", services: .pool) == [.customers, .invoices, .chemicals, .settings])
    }

    @Test func settingsGroupsHideLeakPagesForPoolShops() {
        let pool = settingsGroups(.pool)
        #expect(pool.map(\.title) == ["Your shop", "Money", "Checklists"])
        #expect(pool[2].pages == [.components])
        #expect(settingsGroups(.leak)[2].pages == [.components, .tests, .severities, .exclusions, .reports])
        #expect(SettingsPage.priceBook.detail(.pool) == "Services, chemicals, and repairs for quotes")
    }

    @Test func chemicalFormDosesFromTypedReadings() {
        #expect(gallonsWithCommas("020000x") == "20,000")
        var form = ChemicalForm()
        #expect(form.summary == "Add the gallons and a reading")
        form.gallons = "20,000"
        form.readings[.ph] = "8.0"
        #expect(form.ready)
        #expect(!form.result.steps.isEmpty)
        form.goals[.fc] = "6"
        #expect(form.storedGoals == ["fc": "6"])
        #expect(ChemicalForm(gallons: 15000.4).gallons == "15,000")
    }

    @Test func syncRowSaysAllSavedWhenNothingWaits() {
        var status = SyncStatus()
        status.lastSyncedAt = Date()
        #expect(syncRowDetail(status) == "All changes saved to the office · just now")
        status.pending = 2
        #expect(syncRowDetail(status) == "2 changes waiting to sync")
        #expect(signOutWarning(status) != nil)
        #expect(versionText("1.2.0", "34") == "Version 1.2.0 (34)")
    }

    /// Help's Contact Us and Request a Feature (owner, 2026-10-19) write to the office address.
    @Test func helpMailGoesToTheOffice() {
        #expect(HelpMail.contactEmail == "office@sundeckpro.com")
        #expect(HelpMail.contactURL.absoluteString == "mailto:office@sundeckpro.com")
        #expect(HelpMail.featureRequestURL.absoluteString == "mailto:office@sundeckpro.com?subject=Feature%20request")
    }
}

@Suite @MainActor struct CustomersAndInvoicesTests {
    func seeded() throws -> Shell {
        let s = try Shell()
        try s.seedCompany(userId: "u1", role: "owner")
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "customer", xid: "1",
                        row: [
                            "id": "a", "company_id": "c1", "name": "Alicia Romero", "phone": "(623) 555-0144",
                            "created_at": "2026-10-01T00:00:00Z", "kind": "homeowner",
                        ]),
                    PulledRow(
                        table: "customer", xid: "1",
                        row: [
                            "id": "b", "company_id": "c1", "name": "Blue Wave Pools", "kind": "pool_company",
                            "created_at": "2026-10-10T00:00:00Z",
                        ]),
                    PulledRow(
                        table: "property", xid: "1",
                        row: [
                            "id": "p", "company_id": "c1", "customer_id": "a", "address_line1": "9555 W Van Buren St",
                            "city": "Tolleson", "state": "AZ", "postal_code": "85353", "has_pool": true,
                            "has_spa": false,
                        ]),
                    PulledRow(
                        table: "job", xid: "1",
                        row: [
                            "id": "j", "company_id": "c1", "property_id": "p", "bill_to_customer_id": "a",
                            "type": "detection", "status": "invoiced", "number": 1072,
                            "scheduled_start": "2026-10-15T16:00:00Z",
                        ]),
                    PulledRow(
                        table: "invoice", xid: "1",
                        row: [
                            "id": "i", "company_id": "c1", "job_id": "j", "number": 1026, "status": "sent",
                            "subtotal_cents": 37500, "discount_cents": 0, "tax_cents": 0, "credit_cents": 0,
                            "total_cents": 37500, "amount_paid_cents": 0, "sent_at": "2026-10-17T16:00:00Z",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        return s
    }

    @Test func customersSearchSortAndShow() throws {
        let s = try seeded()
        let now = parseISODate("2026-10-19T17:00:00Z")!
        let all = customerList(s.sync.store, companyId: "c1", now: now)
        #expect(all.map(\.name) == ["Alicia Romero", "Blue Wave Pools"])
        #expect(all[0].addresses == ["9555 W Van Buren St, Tolleson, AZ 85353"])
        #expect(all[1].contactLine == "No contact details")
        #expect(customerList(s.sync.store, companyId: "c1", search: "0144", now: now).map(\.id) == ["a"])
        #expect(customerList(s.sync.store, companyId: "c1", sort: .newest, now: now).map(\.id) == ["b", "a"])
        #expect(customerList(s.sync.store, companyId: "c1", show: "pool_company", now: now).map(\.id) == ["b"])
        let last = customerList(s.sync.store, companyId: "c1", sort: .lastVisit, now: now)
        #expect(customerRowValue(last[0], sort: .lastVisit, now: now, timeZone: "America/Phoenix") == "Oct 15")
        #expect(customerRowValue(last[1], sort: .lastVisit, now: now, timeZone: "America/Phoenix") == "No visits")
        #expect(customersEmptyText(search: "zz", show: "all") == "No customers match “zz”.")
        #expect(customerShows(.leak).map(\.value).prefix(2) == ["all", "homeowner"])

        let detail = try #require(
            customerDetail(s.sync.store, companyId: "c1", customerId: "a", now: now, timeZone: "America/Phoenix"))
        #expect(detail.subtitle == "Homeowner")
        #expect(detail.pools.first?.jobs.first?.title == "Job #1072")
        #expect(detail.pools.first?.jobs.first?.typeLabel == "Leak detection")
    }

    @Test func invoicesListAndExport() throws {
        let s = try seeded()
        let list = invoiceList(s.sync.store, companyId: "c1")
        #expect(invoicesSubtitle(list) == "1 open · $375.00 owed")
        let lines = invoiceRowLines(list[0], timeZone: "America/Phoenix")
        #expect(lines.0 == "#1026 · Job #1072")
        #expect(lines.1 == "Sent · sent Oct 17, 2026 · $375.00 due")
        let csv = invoicesCSV(s.sync.store, companyId: "c1")
        #expect(csv.contains("1026,1072,Alicia Romero,Sent,2026-10-17,,,375.00,0.00,0.00,0.00,375.00,0.00,375.00"))
        #expect(csvText([["a,b", "c\"d"]]) == "\"a,b\",\"c\"\"d\"\r\n")
    }

    @Test func settingsListsReadSyncedRows() throws {
        let s = try seeded()
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "price_book_item", xid: "1",
                        row: [
                            "id": "pb", "company_id": "c1", "name": "Leak detection", "price_cents": 64900,
                            "unit": "each", "active": true, "sort_order": 0,
                        ]),
                    PulledRow(
                        table: "exclusion_reason", xid: "1",
                        row: ["id": "x", "company_id": "c1", "label": "Locked", "active": false, "sort_order": 1]),
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        let groups = priceBookGroups(s.sync.store, companyId: "c1")
        #expect(groups.count == 1 && groups[0].title == nil)
        #expect(groups[0].items[0].value == "$649.00 / each")
        #expect(exclusionItems(s.sync.store, companyId: "c1")[0].value == "Off")

        var form = ConfigItemForm(exclusionItems(s.sync.store, companyId: "c1")[0])
        form.active = true
        try ConfigWrites.saveItem(s.sync, companyId: "c1", page: .exclusions, id: "x", form)
        #expect(try s.sync.store.get("exclusion_reason", "x")?["active"] == true)
        var price = PriceItemForm()
        price.name = "Reseal skimmer"
        price.price = "250"
        #expect(price.error == nil)
        try ConfigWrites.savePriceItem(s.sync, companyId: "c1", id: nil, price)
        #expect(priceBookGroups(s.sync.store, companyId: "c1")[0].items.count == 2)
    }
}
