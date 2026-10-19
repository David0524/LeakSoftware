import Foundation
import Logging
import PostgresNIO
import SundeckCore
import SundeckSync
import SundeckSyncPostgres
import Testing

/// Two simulated phones syncing through the real database functions. Port of
/// packages/sync/test/integration/sync.test.ts. Runs only when `SYNC_TEST_DATABASE_URL` is set
/// (`pnpm test:db`), one test at a time (`--no-parallel`): a scenario that holds a transaction
/// open makes every phone's pull wait behind it, as the TypeScript tests' `fileParallelism: false`.
let testDatabase = TestDatabase.shared
let databaseAvailable = testDatabase != nil

/// One company shared by the tests in a suite, like the TypeScript `beforeAll`.
actor CompanyFixture {
    private var company: Task<TestCompany, Error>?

    func get() async throws -> TestCompany {
        if company == nil { company = Task { try await testDatabase!.createCompany() } }
        return try await company!.value
    }
}

func device(_ name: String, _ user: TestUser, pullPage: Int = 500) throws -> Device {
    try Device(name, user, database: testDatabase!, pullPage: pullPage)
}

/// A customer, property, and job created offline on a device.
func createJobOffline(_ d: Device, _ co: TestCompany) throws -> (customer: String, property: String, job: String) {
    let customer = try d.store.insert(
        "customer", companyId: co.id, ["name": "Maria Alvarez", "phone": "602-555-0199"])
    let property = try d.store.insert(
        "property", companyId: co.id,
        ["customer_id": .string(customer), "address_line1": "1423 Palm Ct", "has_spa": true])
    let job = try d.store.insert(
        "job", companyId: co.id,
        [
            "property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress",
            "assigned_user_id": .string(co.tech.id),
        ])
    return (customer, property, job)
}

@Suite(.serialized, .enabled(if: databaseAvailable))
struct TwoDeviceTests {
    static let fixture = CompanyFixture()

    @Test func syncsAFullOfflineInspectionToASecondDevice() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let b = try device("devB", co.owner)
        _ = await b.engine.sync()  // B has the company config before anything else happens

        // Device A works with no signal.
        a.transport.offline = true
        let ids = try createJobOffline(a, co)
        let comp = try a.store.insert(
            "job_component", companyId: co.id,
            [
                "job_id": .string(ids.job), "component_type_id": .string(co.returnTypeId), "instance_number": 3,
                "label": "Return 3",
            ])
        let check = try a.store.insert(
            "checklist_item_result", companyId: co.id,
            [
                "job_id": .string(ids.job), "job_component_id": .string(comp), "status": "inspected",
                "method": "Pressure test",
            ])
        let test = try a.store.insert(
            "test_result", companyId: co.id,
            [
                "job_id": .string(ids.job), "job_component_id": .string(comp),
                "test_type_id": .string(co.pressureTypeId), "schema_version": 1,
                "data": ["line_name": "Return 3", "start_psi": 20, "end_psi": 12, "duration_min": 15],
                "outcome": "fail",
            ])
        let finding = try a.store.insert(
            "finding", companyId: co.id,
            [
                "job_id": .string(ids.job), "job_component_id": .string(comp), "title": "Return 3 line break",
                "severity_key": "major", "pin_x": 0.42, "pin_y": 0.18,
            ])
        let offline = await a.engine.sync()
        #expect(offline.error == "offline")
        #expect(offline.pending == 7)

        // Back online.
        a.transport.offline = false
        let online = await a.engine.sync()
        #expect(online.pushed == 7 && online.rejected == 0 && online.pending == 0)
        #expect(online.error == nil)

        _ = await b.engine.sync()
        for (table, id) in [
            ("customer", ids.customer), ("property", ids.property), ("job", ids.job), ("job_component", comp),
            ("checklist_item_result", check), ("test_result", test), ("finding", finding),
        ] {
            let server = try await testDatabase!.serverRow(table, id)
            #expect(server != nil, "\(table) on server")
            #expect(try b.localRow(table, id) == server, "\(table) on device B")
            #expect(try a.localRow(table, id) == server, "\(table) on device A")
        }
        // The server assigned a job number; both devices have it.
        #expect(try b.localRow("job", ids.job)?["number"]?.number != nil)
    }

    @Test func resolvesConflictingOfflineEditsPerFieldNewestWins() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let b = try device("devB", co.owner)
        let job = try createJobOffline(a, co).job
        _ = await a.engine.sync()
        _ = await b.engine.sync()

        // Both offline. A edits notes first, B edits notes later and also the schedule.
        try a.store.write("job", id: job, companyId: co.id, ["summary_notes": "A: shell looks fine"])
        try b.store.write(
            "job", id: job, companyId: co.id,
            ["summary_notes": "B: crack at the light niche", "scheduled_start": "2026-10-20T16:00:00Z"])
        try a.store.write("job", id: job, companyId: co.id, ["started_at": "2026-10-12T15:00:00Z"])

        // B (later edit) reaches the server first; then A's older notes edit arrives.
        #expect(await b.engine.sync().pushed == 1)
        _ = await a.engine.sync()
        _ = await b.engine.sync()

        let server = try await testDatabase!.serverRow("job", job)
        #expect(server?["summary_notes"] == "B: crack at the light niche")
        #expect(server?["started_at"] == "2026-10-12T15:00:00+00:00")
        #expect(server?["scheduled_start"] == "2026-10-20T16:00:00+00:00")
        #expect(try a.localRow("job", job) == server)
        #expect(try b.localRow("job", job) == server)
    }

    @Test func neverAppliesAChangeTwiceWhenAResponseIsLost() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let customer = try createJobOffline(a, co).customer
        _ = await a.engine.sync()

        try a.store.write("customer", id: customer, companyId: co.id, ["notes": "dog in yard"])
        a.transport.loseNextResponse = true
        let lost = await a.engine.sync()
        #expect(lost.error == "connection reset")
        #expect(lost.pending == 1)

        let retry = await a.engine.sync()
        #expect(retry.pushed == 1 && retry.pending == 0)

        let n = try await testDatabase!.texts(
            "select count(*)::text from audit_log where row_id = \(customer)::uuid and field = 'notes'")
        #expect(n == ["1"])
    }

    @Test func doesNotLoseUnpushedEditsWhenPullingANewerServerVersion() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let b = try device("devB", co.owner)
        let customer = try createJobOffline(a, co).customer
        _ = await a.engine.sync()
        _ = await b.engine.sync()

        try a.store.write("customer", id: customer, companyId: co.id, ["notes": "A's unpushed note"])
        try b.store.write("customer", id: customer, companyId: co.id, ["email": "maria@example.com"])
        _ = await b.engine.sync()

        // Pull only (push is blocked); A keeps its note and gains B's email.
        a.transport.offline = true
        _ = await a.engine.sync()
        a.transport.offline = false
        let page = try await a.transport.pull(cursor: try a.store.cursor(), pageSize: 500)
        try a.store.applyPage(page)
        let local = try a.localRow("customer", customer)
        #expect(local?["notes"] == "A's unpushed note")
        #expect(local?["email"] == "maria@example.com")

        _ = await a.engine.sync()
        _ = await b.engine.sync()
        #expect(try b.localRow("customer", customer) == (try await testDatabase!.serverRow("customer", customer)))
        #expect(try await testDatabase!.serverRow("customer", customer)?["notes"] == "A's unpushed note")
    }

    @Test func syncsDeletesAsTombstones() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let b = try device("devB", co.owner)
        let customer = try createJobOffline(a, co).customer
        _ = await a.engine.sync()
        _ = await b.engine.sync()
        #expect(try b.store.list("customer").map(\.id).contains(customer))

        try a.store.softDelete("customer", customer)
        _ = await a.engine.sync()
        _ = await b.engine.sync()
        #expect(try !b.store.list("customer").map(\.id).contains(customer))
        #expect(try b.store.get("customer", customer)?["deleted_at"]?.isTruthy == true)
    }

    @Test func anOfficeEditMadeAfterAnOfflinePhoneEditWins() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let customer = try createJobOffline(a, co).customer
        _ = await a.engine.sync()

        try a.store.write("customer", id: customer, companyId: co.id, ["phone": "phone edit from this morning"])
        try await testDatabase!.asUser(co.owner) { c in
            try await c.query(
                "update customer set phone = 'office edit this afternoon' where id = \(customer)::uuid",
                logger: Logger(label: "test"))
            return ()
        }
        _ = await a.engine.sync()
        #expect(try await testDatabase!.serverRow("customer", customer)?["phone"] == "office edit this afternoon")
        #expect(try a.localRow("customer", customer)?["phone"] == "office edit this afternoon")
    }

    @Test func keepsRejectedChangesAsProblemsAndNeverBlocksOtherWork() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        _ = await a.engine.sync()
        let customer = try createJobOffline(a, co).customer
        let price = try a.store.insert(
            "price_book_item", companyId: co.id, ["name": "Tech's own price", "price_cents": 1])

        let s = await a.engine.sync()
        #expect(s.rejected == 1)
        #expect(s.pending == 0)
        let problems = try a.store.problems()
        #expect(problems.count == 1)
        #expect(problems.first?.table == "price_book_item")
        #expect(problems.first?.rowId == price)
        #expect(problems.first?.error.contains("42501") == true)
        #expect(try await testDatabase!.serverRow("customer", customer) != nil)
        #expect(try await testDatabase!.serverRow("price_book_item", price) == nil)
    }

    @Test func recordsEveryChangeInTheAuditLogWithTheDevice() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        let job = try createJobOffline(a, co).job
        try a.store.write("job", id: job, companyId: co.id, ["summary_notes": "first"])
        _ = await a.engine.sync()
        try a.store.write("job", id: job, companyId: co.id, ["summary_notes": "second"])
        _ = await a.engine.sync()

        let rows = try await testDatabase!.texts(
            """
            select json_build_object('field', field, 'device_id', device_id, 'user_id', user_id,
              'new_value', new_value)::text
            from audit_log where row_id = \(job)::uuid order by id
            """)
        let decoded = try rows.map { try JSONDecoder().decode(JSONValue.self, from: Data($0!.utf8)) }
        #expect(decoded.first?["field"] == .null)
        #expect(decoded.first?["device_id"] == "devA")
        #expect(decoded.first?["user_id"] == .string(co.tech.id))
        #expect(decoded.last?["field"] == "summary_notes")
        #expect(decoded.last?["device_id"] == "devA")
        #expect(decoded.last?["new_value"] == "second")
    }
}

@Suite(.serialized, .enabled(if: databaseAvailable))
struct PullCursorTests {
    static let fixture = CompanyFixture()

    @Test func pagesThroughEverythingExactlyOnce() async throws {
        let co = try await Self.fixture.get()
        let a = try device("devA", co.tech)
        for i in 0..<25 { try a.store.insert("customer", companyId: co.id, ["name": .string("Bulk \(i)")]) }
        _ = await a.engine.sync()

        let small = try device("devS", co.tech, pullPage: 7)
        let s = await small.engine.sync()
        let full = try device("devF", co.tech, pullPage: 5000)
        let f = await full.engine.sync()
        #expect(s.pulled == f.pulled)
        #expect(
            try small.store.list("customer", includeDeleted: true).count
                == full.store.list("customer", includeDeleted: true).count)
    }

    @Test func neverSkipsARowCommittedOutOfOrder() async throws {
        let co = try await Self.fixture.get()
        let d = try device("devW", co.tech)
        _ = await d.engine.sync()

        // Transaction 1 starts and writes, but does not commit yet.
        try await testDatabase!.withRawConnection { slow in
            try await slow.query("begin", logger: Logger(label: "test"))
            var slowId = ""
            for try await id in try await slow.query(
                "insert into customer (company_id, name) values (\(co.id)::uuid, 'slow writer') returning id::text",
                logger: Logger(label: "test")
            ).decode(String.self) { slowId = id }
            // Transaction 2 starts later, writes, and commits first.
            let fastId = try await testDatabase!.texts(
                "insert into customer (company_id, name) values (\(co.id)::uuid, 'fast writer') returning id::text")[0]!

            _ = await d.engine.sync()
            // The fast row has a newer transaction id than the open slow one, so the cursor
            // must stop before both; neither may be marked as seen yet.
            #expect(try d.store.get("customer", slowId) == nil)

            try await slow.query("commit", logger: Logger(label: "test"))
            _ = await d.engine.sync()
            #expect(try d.store.get("customer", slowId)?["name"] == "slow writer")
            #expect(try d.store.get("customer", fastId)?["name"] == "fast writer")
        }
    }

    @Test func onlySendsTheUsersOwnCompany() async throws {
        let co = try await Self.fixture.get()
        let other = try await testDatabase!.createCompany()
        let theirs = try device("devO", other.tech)
        try theirs.store.insert("customer", companyId: other.id, ["name": "Other company customer"])
        _ = await theirs.engine.sync()

        let mine = try device("devM", co.tech)
        _ = await mine.engine.sync()
        var companies = Set<String>()
        for table in ["customer", "job", "component_type", "company"] {
            for row in try mine.store.list(table, includeDeleted: true) { companies.insert(row.companyId) }
        }
        #expect(companies == [co.id])
    }
}
