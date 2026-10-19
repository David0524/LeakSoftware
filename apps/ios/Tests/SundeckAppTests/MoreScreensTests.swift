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
        #expect(detail.pools.first?.detail == "Pool")
    }

    /// Pool Details' Gallons (owner, 2026-10-19): typed as "20,000", blank clears it, saved
    /// through sync, and shown as "20,000 gallons" on the pool's row.
    @Test func poolGallonsSaveAndShow() throws {
        #expect(try parsePoolGallons("20,000") == 20000)
        #expect(try parsePoolGallons(" 18 500 ") == 18500)
        #expect(try parsePoolGallons("12000.6") == 12001)
        #expect(try parsePoolGallons("") == .null)
        #expect(try parsePoolGallons("  ") == .null)
        for bad in ["0", "-5", "abc", "10000000", "0.4"] {
            #expect(throws: PoolGallonsError.self) { try parsePoolGallons(bad) }
        }
        #expect(PoolGallonsError().message == "Enter the gallons as a number, like 20,000.")
        #expect(poolGallonsLabel(20000) == "20,000 gallons")
        #expect(poolGallonsLabel(1_250_000) == "1,250,000 gallons")
        #expect(poolGallonsLabel(nil) == nil && poolGallonsLabel(.null) == nil && poolGallonsLabel(0) == nil)
        #expect(poolGallonsField(20000) == "20,000" && poolGallonsField(.null) == "")

        let s = try seeded()
        let now = parseISODate("2026-10-19T17:00:00Z")!
        try CustomerWrites.savePool(
            s.sync, companyId: "c1", propertyId: "p",
            ["pool_type": "gunite_plaster", "approx_gallons": try parsePoolGallons("20,000")])
        #expect(try s.sync.store.get("property", "p")?["approx_gallons"] == 20000)
        #expect(try s.sync.store.pendingCount() > 0)
        let detail = try #require(
            customerDetail(s.sync.store, companyId: "c1", customerId: "a", now: now, timeZone: "America/Phoenix"))
        #expect(detail.pools.first?.detail == "Gunite / plaster · Pool · 20,000 gallons")
        // Blank clears it.
        try CustomerWrites.savePool(
            s.sync, companyId: "c1", propertyId: "p", ["approx_gallons": try parsePoolGallons("")])
        #expect(try s.sync.store.get("property", "p")?["approx_gallons"] == .null)
        let cleared = try #require(
            customerDetail(s.sync.store, companyId: "c1", customerId: "a", now: now, timeZone: "America/Phoenix"))
        #expect(cleared.pools.first?.detail == "Gunite / plaster · Pool")
        // The Chemical screen opened for this pool starts from its gallons.
        #expect(ChemicalForm(gallons: 20000).gallons == "20,000")
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

/// Chemical's Submit and the pool's chemical log (owner, 2026-10-19; website actions/chemicals.ts).
@Suite @MainActor struct ChemicalLogTests {
    let now = parseISODate("2026-10-19T15:15:00Z")!  // 8:15 AM in Phoenix

    func form(_ readings: [ReadingKey: String], gallons: String = "") -> ChemicalForm {
        var f = ChemicalForm()
        f.readings = readings
        f.gallons = gallons
        f.chlorine = .calhypo65
        f.acid = .dryacid
        return f
    }

    @Test func submitChecksReadingsAsTheWebsiteDoes() throws {
        let values = try chemicalSubmitValues(
            form([.fc: "3", .ph: " 7.6 ", .ta: "", .salt: "3,200"], gallons: "20,000"))
        #expect(
            values == [
                "fc": 3, "ph": 7.6, "salt": 3200, "gallons": 20000, "chlorine_product": "calhypo65",
                "acid_product": "dryacid",
            ])
        // Only filled-in readings are saved: no keys for the blank ones, no gallons when blank.
        #expect(
            try chemicalSubmitValues(form([.cya: "40"])).keys.sorted() == ["acid_product", "chlorine_product", "cya"])
        func message(_ f: ChemicalForm) -> String? {
            do {
                _ = try chemicalSubmitValues(f)
                return nil
            } catch { return error.message }
        }
        #expect(message(form([:])) == "Enter at least one reading.")
        #expect(message(form([.fc: " ", .ph: ""])) == "Enter at least one reading.")
        #expect(message(form([.ph: "15"])) == "pH should be between 0 and 14.")
        #expect(message(form([.fc: "-1"])) == "Free chlorine should be between 0 and 100.")
        #expect(message(form([.salt: "20001"])) == "Salt should be between 0 and 20000.")
        #expect(message(form([.ta: "abc"])) == "Alkalinity should be between 0 and 1000.")
        #expect(message(form([.fc: "3"], gallons: "0")) == "Enter the gallons as a number, like 20,000.")
        #expect(message(form([.ch: "5000", .cya: "0"])) == nil)
    }

    @Test func submitWritesOfflineAndRemoveSetsDeletedAt() throws {
        let s = try CustomersAndInvoicesTests().seeded()
        let store = s.sync.store
        let pending = try store.pendingCount()
        let pool = try #require(chemicalPool(store, ChemicalTarget(propertyId: "p", jobId: "j")))
        #expect(pool.name == "Alicia Romero")
        #expect(pool.subtitle == "Alicia Romero · 9555 W Van Buren St, Tolleson, AZ 85353")
        #expect(pool.gallons == nil)
        #expect(ChemicalLogText.submitHint(pool) == "Saves these readings to Alicia Romero’s chemical log.")
        #expect(chemicalPool(store, ChemicalTarget(propertyId: "gone")) == nil)

        // No network: the row and its outbox entry are written locally.
        let id = try ChemicalLogWrites.submit(
            s.sync, companyId: "c1", pool: pool, form: form([.fc: "3", .ph: "7.6", .ta: "90"], gallons: "18,500"),
            now: now)
        #expect(id.count == 36 && id.dropFirst(14).first == "7")  // UUIDv7
        let row = try #require(try store.get("chemical_reading", id))
        #expect(row["property_id"] == "p" && row["job_id"] == "j")
        #expect(row["recorded_at"] == "2026-10-19T15:15:00.000Z")
        #expect(row["fc"] == 3 && row["ph"] == 7.6 && row["ta"] == 90 && row["gallons"] == 18500)
        #expect(row["ch"] == nil && row["recorded_by"] == nil)
        // The first submit with gallons fills in the pool's missing gallons.
        #expect(try store.get("property", "p")?["approx_gallons"] == 18500)
        #expect(try store.pendingCount() == pending + 2)

        // A later submit doesn't change gallons the pool already has.
        let later = parseISODate("2026-10-19T16:00:00Z")!
        let second = try ChemicalLogWrites.submit(
            s.sync, companyId: "c1", pool: pool, form: form([.salt: "3200"], gallons: "30,000"), now: later)
        #expect(try store.get("property", "p")?["approx_gallons"] == 18500)
        #expect(try store.pendingCount() == pending + 3)

        // Newest first, with when and gallons; who once the server fills recorded_by in.
        let log = chemicalLog(
            store, companyId: "c1", propertyId: "p", names: [:], now: later, timeZone: "America/Phoenix")
        #expect(log.map(\.id) == [second, id])
        #expect(log.map(\.summary) == ["Salt 3200", "FC 3 · pH 7.6 · TA 90"])
        #expect(log[0].detail == "9:00 AM · 30,000 gal")
        #expect(log[1].detail == "8:15 AM · 18,500 gal")
        #expect(
            latestChemicalLine(store, companyId: "c1", propertyId: "p", now: later, timeZone: "America/Phoenix")
                == "Last: Salt 3200 · 9:00 AM")
        let detail = try #require(
            customerDetail(store, companyId: "c1", customerId: "a", now: later, timeZone: "America/Phoenix"))
        #expect(detail.pools.first?.chemicalLine == "Last: Salt 3200 · 9:00 AM")

        // Remove: deleted_at through sync, gone from the log.
        try ChemicalLogWrites.remove(s.sync, readingId: second)
        #expect(try store.get("chemical_reading", second)?["deleted_at"]?.string != nil)
        #expect(try store.pendingCount() == pending + 4)
        #expect(
            chemicalLog(store, companyId: "c1", propertyId: "p", names: [:], now: later, timeZone: "America/Phoenix")
                .map(\.id) == [id])
        #expect(
            latestChemicalLine(store, companyId: "c1", propertyId: "p", now: later, timeZone: "America/Phoenix")
                == "Last: FC 3 · pH 7.6 · TA 90 · 8:15 AM")
    }

    @Test func pulledReadingsShowWhoTookThem() throws {
        let s = try CustomersAndInvoicesTests().seeded()
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "chemical_reading", xid: "5",
                        row: [
                            "id": "r1", "company_id": "c1", "property_id": "p", "recorded_at": "2026-10-12T15:15:00Z",
                            "recorded_by": "u1", "fc": "2.50", "ph": "7.40", "gallons": 20000,
                        ]),
                    PulledRow(
                        table: "chemical_reading", xid: "5",
                        row: [
                            "id": "r2", "company_id": "c1", "property_id": "p", "recorded_at": "2026-10-13T15:15:00Z",
                            "fc": 1, "deleted_at": "2026-10-13T16:00:00Z",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
        let log = chemicalLog(
            s.sync.store, companyId: "c1", propertyId: "p", names: ["u1": "Tony Tech"], now: now,
            timeZone: "America/Phoenix")
        #expect(log.map(\.summary) == ["FC 2.5 · pH 7.4"])
        #expect(log.first?.detail == "Mon, Oct 12, 8:15 AM · Tony Tech · 20,000 gal")
    }

    @Test func wordsMatchTheWebsite() {
        #expect(MoreLink.chemicals.title == "Chemicals")
        #expect(
            ChemicalLogText.noPool
                == "To save readings to a pool’s log, open Chemical from a visit or the customer’s pool.")
        #expect(ChemicalLogText.poolRowEmpty == "Readings and the chemical log")
        #expect(ChemicalLogText.removeTitle == "Remove these readings?")
    }
}
