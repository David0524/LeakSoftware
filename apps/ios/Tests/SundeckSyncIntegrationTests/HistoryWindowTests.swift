import Foundation
import Logging
import SundeckCore
import SundeckStorage
import SundeckSync
import SundeckSyncPostgres
import Testing

/// Phones keep open jobs and the last 90 days (20261012003400_phone_history_window.sql). Port of
/// packages/sync/test/integration/history-window.test.ts.
@Suite(.serialized, .enabled(if: databaseAvailable))
struct HistoryWindowTests {
    struct Setup: Sendable {
        let co: TestCompany
        let customer: String
        let job: String
        let component: String
    }

    actor Fixture {
        private var setup: Task<Setup, Error>?

        func get() async throws -> Setup {
            if setup == nil {
                setup = Task {
                    let db = testDatabase!
                    let co = try await db.createCompany()
                    let customer = try await db.texts(
                        "insert into customer (company_id, name) values (\(co.id)::uuid, 'Old Customer') returning id::text"
                    )[0]!
                    let property = try await db.texts(
                        """
                        insert into property (company_id, customer_id, address_line1)
                        values (\(co.id)::uuid, \(customer)::uuid, '1 Old Way') returning id::text
                        """)[0]!
                    let job = try await db.texts(
                        """
                        insert into job (company_id, property_id, bill_to_customer_id, status)
                        values (\(co.id)::uuid, \(property)::uuid, \(customer)::uuid, 'in_progress') returning id::text
                        """)[0]!
                    let component = try await db.texts(
                        """
                        insert into job_component (company_id, job_id, component_type_id, label)
                        values (\(co.id)::uuid, \(job)::uuid, \(co.returnTypeId)::uuid, 'Return 1') returning id::text
                        """)[0]!
                    // Finished 200 days ago (set directly, as history would be).
                    try await db.withRawConnection { c in
                        let log = Logger(label: "test")
                        try await c.query("set session_replication_role = replica", logger: log)
                        try await c.query(
                            """
                            update job set status = 'done', scheduled_start = now() - interval '201 days',
                                   completed_at = now() - interval '200 days', updated_at = now() - interval '200 days'
                             where id = \(job)::uuid
                            """, logger: log)
                        try await c.query("set session_replication_role = origin", logger: log)
                    }
                    return Setup(co: co, customer: customer, job: job, component: component)
                }
            }
            return try await setup!.value
        }
    }

    static let fixture = Fixture()

    final class Clock: @unchecked Sendable {
        var now = Date()
    }

    func phone(_ name: String, _ co: TestCompany, now: (@Sendable () -> Date)? = nil) throws -> (
        store: LocalStore, engine: SyncEngine
    ) {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("history-\(name)-\(UUID()).db")
        let store = try LocalStore.open(
            Database(path: path.path, key: String(repeating: "7a", count: 32)), deviceId: name)
        let transport = PgTransport(testDatabase!, co.owner)
        return (store, SyncEngine(store: store, transport: transport, now: now ?? { Date() }))
    }

    func ownerUpdate(_ co: TestCompany, status: String, job: String) async throws {
        try await testDatabase!.asUser(co.owner) { c in
            try await c.query(
                "update job set status = \(status) where id = \(job)::uuid", logger: Logger(label: "test"))
            return ()
        }
    }

    @Test func aNewPhoneSkipsAJobFinished200DaysAgoButGetsItsCustomer() async throws {
        let s = try await Self.fixture.get()
        let p = try phone("new", s.co)
        _ = await p.engine.sync()
        #expect(try p.store.get("job", s.job) == nil)
        #expect(try p.store.get("job_component", s.component) == nil)
        #expect(try p.store.get("customer", s.customer) != nil)
    }

    @Test func aReopenedJobComesBackWholeItsUnchangedChecklistIncluded() async throws {
        let s = try await Self.fixture.get()
        let p = try phone("reopen", s.co)
        _ = await p.engine.sync()
        try await ownerUpdate(s.co, status: "in_progress", job: s.job)
        _ = await p.engine.sync()
        #expect(try p.store.get("job", s.job)?["status"] == "in_progress")
        #expect(try p.store.get("job_component", s.component)?["label"] == "Return 1")
    }

    @Test func aPhoneDropsAJobAWeekAfterItAgesOut() async throws {
        let s = try await Self.fixture.get()
        try await ownerUpdate(s.co, status: "done", job: s.job)
        let clock = Clock()
        let p = try phone("ages", s.co, now: { clock.now })
        _ = await p.engine.sync()
        #expect(try p.store.get("job", s.job) != nil)  // finished today: on phones

        clock.now = Date().addingTimeInterval(100 * 86_400)  // past the 90-day window and the week's margin
        _ = await p.engine.sync()
        #expect(try p.store.get("job", s.job) == nil)
        #expect(try p.store.get("job_component", s.component) == nil)
        #expect(try p.store.get("customer", s.customer) != nil)
    }
}
