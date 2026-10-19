import Foundation
import Logging
import PostgresNIO
import SundeckCore
import SundeckStorage
import SundeckSync

/// The two-device sync test harness against a real database. Port of
/// packages/sync/test/integration/harness.ts. Tests only: phones reach the server through
/// Supabase, never Postgres.
public struct TestUser: Sendable {
    public let id: String
    public let email: String

    public init(id: String, email: String) {
        self.id = id
        self.email = email
    }
}

public struct TestCompany: Sendable {
    public let id: String
    public let owner: TestUser
    public let tech: TestUser
    public let returnTypeId: String
    public let pressureTypeId: String
}

/// The test database from `SYNC_TEST_DATABASE_URL` (`pnpm test:db` sets it).
public final class TestDatabase: Sendable {
    /// Nil when the variable isn't set; integration tests are then skipped.
    public static let shared: TestDatabase? = ProcessInfo.processInfo.environment["SYNC_TEST_DATABASE_URL"]
        .flatMap { URLComponents(string: $0) }
        .map(TestDatabase.init)

    let client: PostgresClient
    let logger = Logger(label: "sync-test")

    init(url: URLComponents) {
        let database = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        client = PostgresClient(
            configuration: .init(
                host: url.host ?? "127.0.0.1", port: url.port ?? 5432, username: url.user ?? "postgres",
                password: url.password, database: database.isEmpty ? nil : database, tls: .disable))
        let client = client
        Task { await client.run() }
    }

    /// One API request as a signed-in user, like PostgREST: a transaction in the authenticated role.
    /// A database error comes back as `SyncFailure` with its code and message, like PostgREST's.
    public func asUser<T: Sendable>(_ user: TestUser, _ body: (PostgresConnection) async throws -> T) async throws -> T
    {
        do { return try await asUserRaw(user, body) } catch { throw readable(error) }
    }

    private func asUserRaw<T: Sendable>(_ user: TestUser, _ body: (PostgresConnection) async throws -> T) async throws
        -> T
    {
        let claims = try String(
            decoding: JSONEncoder().encode(["sub": user.id, "role": "authenticated", "email": user.email]),
            as: UTF8.self)
        return try await client.withTransaction(logger: logger) { connection in
            try await connection.query("set local role authenticated", logger: logger)
            try await connection.query("select set_config('request.jwt.claims', \(claims), true)", logger: logger)
            return try await body(connection)
        }
    }

    /// One connection as the database owner, for tests that hold a transaction open.
    public func withRawConnection<T: Sendable>(_ body: (PostgresConnection) async throws -> T) async throws -> T {
        try await client.withConnection(body)
    }

    /// Runs `query` as the database owner (no RLS) and returns the first column of each row as text.
    @discardableResult
    public func texts(_ query: PostgresQuery) async throws -> [String?] {
        do {
            var out: [String?] = []
            for try await value in try await client.query(query, logger: logger).decode(String?.self) {
                out.append(value)
            }
            return out
        } catch { throw readable(error) }
    }

    public func createUser(_ label: String) async throws -> TestUser {
        let email = "\(label)-\(UUID().uuidString.prefix(8).lowercased())@sync.test"
        let id = try await texts(
            "insert into auth.users (id, email) values (gen_random_uuid(), \(email)) returning id::text")
        return TestUser(id: id[0]!, email: email)
    }

    /// A fresh company through the real signup function, plus a tech.
    public func createCompany() async throws -> TestCompany {
        let owner = try await createUser("owner")
        let tech = try await createUser("tech")
        let id = try await asUser(owner) { c in
            try await firstText(c.query("select create_company('Sync Test Co')::text", logger: logger))
        }
        try await texts(
            "insert into membership (company_id, user_id, role) values (\(id)::uuid, \(tech.id)::uuid, 'tech')")
        var byKey: [String: String] = [:]
        let rows = try await client.query(
            """
            select key, id::text from component_type where company_id = \(id)::uuid
            union all select key, id::text from test_type where company_id = \(id)::uuid
            """, logger: logger)
        for try await (key, typeId) in rows.decode((String, String).self) { byKey[key] = typeId }
        return TestCompany(
            id: id, owner: owner, tech: tech, returnTypeId: byKey["return"]!, pressureTypeId: byKey["pressure"]!)
    }

    /// A server row with bookkeeping removed, as phones store it.
    public func serverRow(_ table: String, _ id: String) async throws -> Row? {
        guard table.wholeMatch(of: /[a-z_]+/) != nil else { throw SyncFailure("Bad table name \(table)") }
        let text = try await texts(
            PostgresQuery(
                unsafeSQL: "select to_jsonb(t)::text from public.\(table) t where id = $1::uuid",
                binds: {
                    var b = PostgresBindings()
                    b.append(id)
                    return b
                }()))
        guard let json = text.first ?? nil else { return nil }
        return try JSONDecoder().decode(Row.self, from: Data(json.utf8)).filter { !serverOnly.contains($0.key) }
    }
}

/// PostgresNIO hides server messages unless asked; PostgREST would pass them on.
func readable(_ error: Error) -> Error {
    var error = error
    if let transaction = error as? PostgresTransactionError, let inner = transaction.closureError { error = inner }
    guard let psql = error as? PSQLError, let info = psql.serverInfo else { return error }
    return SyncFailure("\(info[.sqlState] ?? "") \(info[.message] ?? "")")
}

let serverOnly: Set<String> = ["field_hlc", "sync_xid", "created_at", "updated_at"]

private func firstText(_ rows: PostgresRowSequence) async throws -> String {
    for try await value in rows.decode(String.self) { return value }
    throw SyncFailure("No rows")
}

/// Sync straight to the database as one user: sync_push, sync_pull and sync_scope.
public final class PgTransport: SyncTransport, @unchecked Sendable {
    private let database: TestDatabase
    private let user: TestUser
    private let lock = NSLock()
    private var _offline = false
    private var _loseNextResponse = false

    public init(_ database: TestDatabase, _ user: TestUser) {
        self.database = database
        self.user = user
    }

    /// Fail before reaching the server.
    public var offline: Bool {
        get { lock.withLock { _offline } }
        set { lock.withLock { _offline = newValue } }
    }

    /// Apply the next push on the server, then throw as if the response was lost.
    public var loseNextResponse: Bool {
        get { lock.withLock { _loseNextResponse } }
        set { lock.withLock { _loseNextResponse = newValue } }
    }

    public func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
        if offline { throw SyncFailure("offline") }
        let json = String(decoding: try JSONEncoder().encode(mutations), as: UTF8.self)
        let text = try await database.asUser(user) { c in
            try await firstText(c.query("select sync_push(\(json)::jsonb, \(deviceId))::text", logger: database.logger))
        }
        if lock.withLock({ () -> Bool in
            defer { _loseNextResponse = false }
            return _loseNextResponse
        }) {
            throw SyncFailure("connection reset")
        }
        return try JSONDecoder().decode(PushResponse.self, from: Data(text.utf8))
    }

    public func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
        if offline { throw SyncFailure("offline") }
        let json = String(decoding: try JSONEncoder().encode(cursor), as: UTF8.self)
        let text = try await database.asUser(user) { c in
            try await firstText(
                c.query("select sync_pull(\(json)::jsonb, \(pageSize)::int)::text", logger: database.logger))
        }
        return try JSONDecoder().decode(PullPage.self, from: Data(text.utf8))
    }

    public func scope() async throws -> String? {
        try await database.asUser(user) { c in
            try await firstText(c.query("select sync_scope()::text", logger: database.logger))
        }
    }
}

/// A simulated phone: its own encrypted database, store, transport and engine.
public struct Device: Sendable {
    public let name: String
    public let store: LocalStore
    public let transport: PgTransport
    public let engine: SyncEngine

    public init(_ name: String, _ user: TestUser, database: TestDatabase, pullPage: Int = 500) throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(name)-\(UUID().uuidString).db")
        let db = try Database(path: path.path, key: String(repeating: "5e", count: 32))
        self.name = name
        store = try LocalStore.open(db, deviceId: name)
        transport = PgTransport(database, user)
        engine = SyncEngine(store: store, transport: transport, pullPage: pullPage)
    }

    /// The phone's row in the same shape as `TestDatabase.serverRow`.
    public func localRow(_ table: String, _ id: String) throws -> Row? {
        try store.get(table, id)?.filter { !serverOnly.contains($0.key) }
    }
}
