import Foundation
import Logging
import SundeckCore
import SundeckStorage
import SundeckSync
import SundeckSyncPostgres
import Testing

/// A new phone's first download (20261022001900_first_download.sql): it leaves out rows deleted
/// before it, still gets the deletes that come after, and resumes after the app is killed part way
/// without losing or reviving anything. Port of packages/sync/test/integration/first-download.test.ts.
@Suite(.serialized, .enabled(if: databaseAvailable))
struct FirstDownloadTests {
    /// The real transport, which can drop the connection after a page with a test customer in it.
    final class FlakyTransport: SyncTransport, @unchecked Sendable {
        let inner: PgTransport
        private let lock = NSLock()
        private var _failAfterCustomers = false
        private var failing = false
        private var _cursors: [PullCursor] = []

        init(_ inner: PgTransport) { self.inner = inner }

        var cursors: [PullCursor] { lock.withLock { _cursors } }
        func failAfterCustomers() { lock.withLock { _failAfterCustomers = true } }
        func reconnect() {
            lock.withLock {
                failing = false
                _failAfterCustomers = false
            }
        }

        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            try await inner.push(mutations, deviceId: deviceId)
        }
        func scope() async throws -> String? { try await inner.scope() }

        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
            try lock.withLock {
                if failing { throw SyncFailure("connection reset") }
                _cursors.append(cursor)
            }
            let page = try await inner.pull(cursor: cursor, pageSize: pageSize)
            let ours = page.rows.contains {
                $0.table == "customer" && ($0.row["name"]?.string ?? "").hasPrefix("Customer")
            }
            lock.withLock { if _failAfterCustomers, ours { failing = true } }
            return page
        }
    }

    struct Phone {
        let store: LocalStore
        let transport: FlakyTransport
        let engine: SyncEngine
    }

    func phone(_ co: TestCompany, firstPullPage: Int = SyncEngine.firstPullPage) throws -> Phone {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("first-\(UUID()).db")
        let store = try LocalStore.open(
            Database(path: path.path, key: String(repeating: "3c", count: 32)),
            deviceId: "first\(Int.random(in: 1...99999))")
        let transport = FlakyTransport(PgTransport(testDatabase!, co.owner))
        let engine = SyncEngine(
            store: store, transport: transport, firstPullPage: firstPullPage, pullRetryDelays: [0, 0])
        return Phone(store: store, transport: transport, engine: engine)
    }

    func customers(_ co: TestCompany, _ names: [String]) async throws -> [String] {
        var ids: [String] = []
        for name in names {
            ids += try await testDatabase!.texts(
                "insert into customer (company_id, name) values (\(co.id)::uuid, \(name)) returning id::text"
            ).compactMap { $0 }
        }
        return ids
    }

    func remove(_ ids: [String]) async throws {
        for id in ids {
            try await testDatabase!.texts(
                "update customer set deleted_at = now() where id = \(id)::uuid returning id::text")
        }
    }

    func liveOnServer(_ co: TestCompany) async throws -> [String] {
        try await testDatabase!.texts(
            "select id::text from customer where company_id = \(co.id)::uuid and deleted_at is null"
        ).compactMap { $0 }.sorted()
    }

    func live(_ p: Phone) throws -> [String] { try p.store.list("customer").map(\.id).sorted() }
    func everything(_ p: Phone) throws -> Set<String> {
        Set(try p.store.list("customer", includeDeleted: true).map(\.id))
    }

    @Test func leavesOutRowsDeletedBeforeItAndGetsDeletesMadeAfterIt() async throws {
        let co = try await testDatabase!.createCompany()
        let ids = try await customers(co, ["Keep", "Gone", "Later"])
        try await remove([ids[1]])

        let p = try phone(co)
        #expect(await p.engine.sync().error == nil)
        #expect(try p.store.get("customer", ids[0])?["name"] == "Keep")
        #expect(try p.store.get("customer", ids[2])?["name"] == "Later")
        // Never sent, so not even a tombstone on the phone.
        #expect(try !everything(p).contains(ids[1]))
        #expect(try p.store.cursor()["first"] == nil)

        try await remove([ids[2]])
        _ = await p.engine.sync()
        #expect(try p.store.get("customer", ids[2])?["deleted_at"]?.string != nil)
        let server = try await liveOnServer(co)
        #expect(try live(p) == server)
    }

    @Test func resumesAfterTheAppIsKilledPartWayAndEndsMatchingTheServer() async throws {
        let co = try await testDatabase!.createCompany()
        let ids = try await customers(co, (0..<30).map { "Customer \($0)" })
        let deletedBefore = ids.enumerated().filter { $0.offset % 3 == 0 }.map(\.element)
        try await remove(deletedBefore)

        // Small pages, and the connection drops after the first page of customers.
        let p = try phone(co, firstPullPage: 8)
        p.transport.failAfterCustomers()
        let first = await p.engine.sync()
        #expect(first.error?.contains("connection reset") == true)
        let saved = try p.store.cursor()
        #expect(saved["first"] == .bool(true))
        let delivered = try p.store.list("customer").filter { ($0["name"]?.string ?? "").hasPrefix("Customer") }.map(
            \.id)
        #expect(!delivered.isEmpty)
        #expect(delivered.count < ids.count - deletedBefore.count)

        // Meanwhile the office deletes one the phone has and one it doesn't yet, and adds one.
        let notYet = try await liveOnServer(co).first { !delivered.contains($0) }!
        try await remove([delivered[0], notYet])
        let added = try await customers(co, ["Added during the download"])[0]

        // The app opens again: the download carries on from its cursor, still as a first download.
        p.transport.reconnect()
        let before = p.transport.cursors.count
        #expect(await p.engine.sync().error == nil)
        #expect(p.transport.cursors[before] == saved)
        #expect(p.transport.cursors[before...].allSatisfy { $0["first"] == .bool(true) })
        // What changed meanwhile comes with the next pull, deletes included.
        #expect(await p.engine.sync().error == nil)
        #expect(p.transport.cursors.last?["first"] == nil)

        let server = try await liveOnServer(co)
        #expect(try live(p) == server)
        #expect(try p.store.get("customer", added)?["name"] == "Added during the download")
        #expect(try p.store.get("customer", delivered[0])?["deleted_at"]?.string != nil)
        // Rows deleted before the download never reach the phone.
        let onPhone = try everything(p)
        for id in deletedBefore { #expect(!onPhone.contains(id)) }
    }

    @Test func aPhoneThatDiscardsARejectedChangePullsEverythingAgainDeletesIncluded() async throws {
        let co = try await testDatabase!.createCompany()
        let ids = try await customers(co, ["A", "B"])
        let p = try phone(co)
        _ = await p.engine.sync()
        try await remove([ids[1]])
        _ = await p.engine.sync()
        #expect(try p.store.get("customer", ids[1])?["deleted_at"]?.string != nil)

        try p.store.discardProblem(-1)
        #expect(try p.store.cursor() == ["from": "0"])
        _ = await p.engine.sync()
        #expect(try p.store.get("customer", ids[0])?["name"] == "A")
        #expect(try p.store.get("customer", ids[1])?["deleted_at"]?.string != nil)
        #expect(p.transport.cursors.last?["first"] == nil)
    }
}
