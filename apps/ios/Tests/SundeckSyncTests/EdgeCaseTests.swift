import Foundation
import SundeckCore
import SundeckStorage
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/edge-cases.test.ts. M11 offline edge cases: a revoked sign-in, a
/// full phone, and an app update with changes still waiting to sync. In every case nothing
/// already saved on the phone is lost. The transport test ("the transport reports it as
/// AuthError") belongs with the Supabase transport in the app target.
@Suite struct EdgeCaseTests {
    let c = testCompany

    /// A server whose sign-in can be revoked.
    final class Server: SyncTransport, @unchecked Sendable {
        let signedOut = Locked(false)
        let received = Locked<[[Mutation]]>([])

        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            if signedOut.current { throw AuthError("JWT expired") }
            received.withLock { $0.append(mutations) }
            return PushResponse(
                serverHLC: fakeServerHLC, results: mutations.map { MutationResult(id: $0.id, status: .applied) })
        }

        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
            PullPage(rows: [], done: true, cursor: .object(["from": .string("1")]), serverHLC: fakeServerHLC)
        }

        func scope() async throws -> String? { nil }
    }

    // MARK: A revoked or expired sign-in

    @Test func aRevokedSignInIsToldApartFromANetworkFailure() {
        #expect(isAuthFailure(message: "JWT expired", code: "PGRST303"))
        #expect(isAuthFailure(message: "Invalid Refresh Token: Refresh Token Not Found"))
        #expect(isAuthFailure(message: "whatever", status: 401))
        #expect(!isAuthFailure(message: "TypeError: Network request failed"))
        #expect(!isAuthFailure(message: "permission denied for table job", code: "42501"))
    }

    @Test func keepsEveryChangeUntilTheUserSignsInAgainThenSendsThem() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = Server()
        let engine = SyncEngine(store: store, transport: server)
        try store.insert("customer", companyId: c, ["name": .string("Saved offline")])
        server.signedOut.withLock { $0 = true }
        let first = await engine.sync()
        #expect(first.authFailed)
        #expect(first.pending == 1)
        #expect(first.pushed == 0)
        #expect(try store.problems().isEmpty)
        server.signedOut.withLock { $0 = false }
        let second = await engine.sync()
        #expect(second.pushed == 1)
        #expect(second.pending == 0)
        #expect(!second.authFailed)
    }

    // MARK: A full phone

    /// Makes the database refuse writes to the store's tables, like SQLITE_FULL (the TypeScript
    /// test wraps `run` to throw on insert and update; Database can't be wrapped, so temporary
    /// triggers raise the same message inside SQLite). `false` lifts it.
    func setFull(_ db: Database, _ full: Bool) throws {
        let tables = ["sync_records", "sync_outbox", "sync_meta", "upload_queue"]
        for table in tables {
            for event in ["insert", "update"] {
                let name = "full_\(table)_\(event)"
                if full {
                    try db.execute(
                        """
                        create temp trigger \(name) before \(event) on main.\(table)
                        begin select raise(abort, 'database or disk is full (code 13 SQLITE_FULL)'); end
                        """)
                } else {
                    try db.execute("drop trigger if exists temp.\(name)")
                }
            }
        }
    }

    @Test func aFullPhoneRecognisesTheError() {
        #expect(isStorageFull(TestError("database or disk is full (code 13 SQLITE_FULL)")))
        #expect(isStorageFull(TestError("ENOSPC: no space left on device, write")))
        #expect(!isStorageFull(TestError("UNIQUE constraint failed")))
    }

    /// TypeScript expects the SQLite message (/disk is full/); the Swift store turns it into
    /// StorageFullError, which the app shows as is.
    @Test func aFullPhoneSavesNothingHalfWayAndKeepsWhatWasSavedBefore() throws {
        let db = try memoryDatabase()
        let store = try LocalStore.open(db)
        let id = try store.insert("customer", companyId: c, ["name": .string("Before")])
        try setFull(db, true)
        #expect(throws: StorageFullError.self) {
            try store.write("customer", id: id, companyId: c, ["name": .string("After")])
        }
        #expect(throws: StorageFullError.self) {
            try store.insert("finding", companyId: c, ["title": .string("Lost?")])
        }
        #expect(try store.get("customer", id)?["name"] == .string("Before"))
        #expect(try store.list("finding").isEmpty)
        #expect(try store.pendingCount() == 1)
        try setFull(db, false)
        try store.write("customer", id: id, companyId: c, ["name": .string("After")])
        #expect(try store.get("customer", id)?["name"] == .string("After"))
    }

    // MARK: An app update with changes still waiting

    @Test func opensTheOldDatabaseAndKeepsItsUnsentChangesAndUploads() throws {
        let db = try memoryDatabase()
        // The first released schema (before resumable uploads and signature uploads).
        try db.execute(
            """
            create table sync_records (table_name text not null, id text not null,
              company_id text not null, data text not null, deleted integer not null default 0,
              primary key (table_name, id))
            """)
        try db.execute(
            """
            create table sync_outbox (seq integer primary key autoincrement,
              mutation_id text not null, table_name text not null, row_id text not null,
              company_id text not null, fields text not null, created_at integer not null,
              attempts integer not null default 0, status text not null default 'pending', last_error text)
            """)
        try db.execute("create table sync_meta (key text primary key, value text not null)")
        try db.execute(
            """
            create table upload_queue (media_id text primary key, company_id text not null,
              local_path text not null, storage_path text not null, mime_type text not null,
              attempts integer not null default 0, next_attempt_at integer not null default 0, last_error text)
            """)
        try db.execute(
            "insert into sync_meta (key, value) values ('device_id', 'olddevice'), ('schema_version', '1')")
        try db.query(
            "insert into sync_records (table_name, id, company_id, data) values ('finding', 'f1', ?, ?)",
            [.text(c), .text(#"{"id":"f1","company_id":"\#(c)","title":"Crack at the skimmer"}"#)])
        try db.query(
            """
            insert into sync_outbox (mutation_id, table_name, row_id, company_id, fields, created_at)
            values ('m1', 'finding', 'f1', ?, ?, 1)
            """,
            [.text(c), .text(#"{"title":{"v":"Crack at the skimmer","hlc":"1700000000000-0000-olddevice"}}"#)])
        try db.query(
            """
            insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type)
            values ('p1', ?, 'file:///p1.jpg', 'c1/j1/p1.jpg', 'image/jpeg')
            """, [.text(c)])

        let store = try LocalStore.open(db)
        #expect(store.deviceId == "olddevice")
        #expect(try store.pendingCount() == 1)
        let batch = try store.pendingBatch(maxMutations: 10)
        #expect(batch.mutations.first?.table == "finding")
        #expect(batch.mutations.first?.rowId == "f1")
        #expect(
            try db.query("select record_table from upload_queue where media_id = 'p1'")
                == [["record_table": .text("media")]])
        #expect(try db.query("select value from sync_meta where key = 'schema_version'") == [["value": .text("4")]])
    }
}
