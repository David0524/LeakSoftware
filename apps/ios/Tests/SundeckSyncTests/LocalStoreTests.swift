import SundeckCore
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/store.test.ts.
@Suite struct LocalStoreTests {
    let c = testCompany

    @Test func keepsTheDeviceIdAndClockAcrossReopen() throws {
        let db = try memoryDatabase()
        let a = try LocalStore.open(db, now: { 5 })
        try a.insert("customer", companyId: c, ["name": .string("A")])
        let b = try LocalStore.open(db, now: { 1 })
        #expect(b.deviceId == a.deviceId)
        #expect(b.clock.state.ms == 5)
    }

    @Test func writesRowsAndOutboxEntriesTogether() throws {
        let s = try steppingStore()
        let id = try s.insert("customer", companyId: c, ["name": .string("Maria")])
        try s.write("customer", id: id, companyId: c, ["phone": .string("555")])
        let row = try #require(try s.get("customer", id))
        #expect(row["id"] == .string(id))
        #expect(row["company_id"] == .string(c))
        #expect(row["name"] == .string("Maria"))
        #expect(row["phone"] == .string("555"))
        #expect(try s.pendingCount() == 2)
    }

    @Test func dropsJobsThatAgedOffPhonesWithEverythingUnderThemUnlessUnsent() throws {
        let s = try steppingStore()
        func row(_ table: String, _ fields: Row) -> PulledRow {
            var r: Row = ["company_id": .string(c)]
            r.merge(fields) { _, new in new }
            return pulled(table, r)
        }
        try s.applyPage(
            PullPage(
                rows: [
                    row("job", ["id": .string("old"), "status": .string("done")]),
                    row("job_component", ["id": .string("jc"), "job_id": .string("old")]),
                    row("quote", ["id": .string("q"), "job_id": .string("old")]),
                    row("quote_line_item", ["id": .string("ql"), "quote_id": .string("q")]),
                    row("invoice", ["id": .string("i"), "job_id": .string("old")]),
                    row("payment", ["id": .string("pay"), "invoice_id": .string("i")]),
                    row("customer", ["id": .string("cu")]),
                    row("job", ["id": .string("kept"), "status": .string("done")]),
                    row("job_component", ["id": .string("jc2"), "job_id": .string("kept")]),
                ], done: true, cursor: cursor(), serverHLC: fakeServerHLC))
        // An unsent change inside the second job keeps it on the phone.
        try s.write("job_component", id: "jc2", companyId: c, ["label": .string("Edited offline")])

        #expect(try s.pruneJobs { _ in false } == 1)
        for (table, id) in [
            ("job", "old"), ("job_component", "jc"), ("quote", "q"), ("quote_line_item", "ql"), ("invoice", "i"),
            ("payment", "pay"),
        ] {
            #expect(try s.get(table, id) == nil, "\(table) \(id)")
        }
        #expect(try s.get("customer", "cu") != nil)
        #expect(try s.get("job", "kept") != nil)
        #expect(try s.get("job_component", "jc2") != nil)
    }

    @Test func tellsScreensWhichTablesChangedSoOthersAreNotReRead() throws {
        let s = try steppingStore()
        let jobs = s.tableVersion("job")
        let results = s.tableVersion("checklist_item_result")
        try s.insert(
            "checklist_item_result", companyId: c, ["job_id": .string("j"), "status": .string("inspected")])
        #expect(s.tableVersion("job") == jobs)
        #expect(s.tableVersion("checklist_item_result") != results)

        try s.applyPage(
            PullPage(
                rows: [
                    pulled("job", ["id": .string("j1"), "company_id": .string(c), "status": .string("done")])
                ], done: true, cursor: cursor(), serverHLC: fakeServerHLC))
        #expect(s.tableVersion("job") != jobs)

        let customers = s.tableVersion("customer")
        try s.clearAll()
        #expect(s.tableVersion("customer") != customers)
    }

    @Test func refusesServerManagedColumns() throws {
        let s = try steppingStore()
        let error = #expect(throws: SyncStoreError.self) {
            try s.insert("customer", companyId: c, ["company_id": .string("x")])
        }
        #expect(error?.description.contains("managed by the server") == true)
    }

    @Test func mergesOutboxEntriesPerRowKeepingTheNewestValuePerField() throws {
        let s = try steppingStore()
        let id = try s.insert("customer", companyId: c, ["name": .string("First"), "phone": .string("1")])
        try s.write("customer", id: id, companyId: c, ["name": .string("Second")])
        let job = try s.insert("job", companyId: c, ["property_id": .string("p")])
        let batch = try s.pendingBatch(maxMutations: 10)
        #expect(batch.mutations.map(\.table) == ["customer", "job"])
        let m = batch.mutations[0]
        #expect(m.fields["name"]?.v == .string("Second"))
        #expect(m.fields["phone"]?.v == .string("1"))
        #expect(batch.seqsByMutation[m.id]?.count == 2)
        #expect(batch.mutations[1].rowId == job)
    }

    @Test func limitsABatchByRowsNeverSplittingOneRowAcrossBatches() throws {
        let s = try steppingStore()
        let a = try s.insert("customer", companyId: c, ["name": .string("a")])
        try s.insert("customer", companyId: c, ["name": .string("b")])
        try s.write("customer", id: a, companyId: c, ["phone": .string("later")])
        let batch = try s.pendingBatch(maxMutations: 1)
        #expect(batch.mutations.count == 1)
        #expect(batch.mutations[0].fields.keys.sorted() == ["name", "phone"])
    }

    @Test func acknowledgedChangesLeaveTheOutboxRejectedOnesAreKeptAsProblems() throws {
        let s = try steppingStore()
        try s.insert("customer", companyId: c, ["name": .string("a")])
        try s.insert("quote", companyId: c, ["status": .string("accepted")])
        let b = try s.pendingBatch(maxMutations: 10)
        try s.acknowledge(try #require(b.seqsByMutation[b.mutations[0].id]))
        try s.reject(
            try #require(b.seqsByMutation[b.mutations[1].id]), error: "42501 field quote.status is not writable")
        #expect(try s.pendingCount() == 0)
        let problems = try s.problems()
        #expect(problems.count == 1)
        #expect(problems.first?.table == "quote")
        #expect(problems.first?.fields == ["status"])
        #expect(problems.first?.error.contains("42501") == true)
        #expect(try s.pendingBatch(maxMutations: 10).mutations.isEmpty)
    }

    @Test func laysUnpushedLocalEditsOverPulledRows() throws {
        let s = try steppingStore()
        let id = try s.insert("customer", companyId: c, ["name": .string("Local")])
        let page = PullPage(
            rows: [
                pulled(
                    "customer",
                    ["id": .string(id), "company_id": .string(c), "name": .string("Server"), "phone": .string("555")],
                    xid: "9")
            ], done: true, cursor: cursor(["from": "10"]), serverHLC: "1900000000000-0000-server")
        try s.applyPage(page)
        let row = try #require(try s.get("customer", id))
        #expect(row["name"] == .string("Local"))
        #expect(row["phone"] == .string("555"))
        #expect(try s.cursor() == cursor(["from": "10"]))
        #expect(s.clock.state.ms == 1_900_000_000_000)
    }

    @Test func softDeletesHideRowsFromListsButKeepThem() throws {
        let s = try steppingStore()
        let id = try s.insert("customer", companyId: c, ["name": .string("Gone")])
        try s.softDelete("customer", id)
        #expect(try s.list("customer").isEmpty)
        #expect(try s.list("customer", includeDeleted: true).count == 1)
    }
}
