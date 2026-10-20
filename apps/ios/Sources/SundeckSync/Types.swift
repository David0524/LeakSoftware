import SundeckCore

/// Wire types shared with the sync_push / sync_pull Postgres functions. Port of types.ts.

/// A synced row as phones store it: JSON, with at least `id` and `company_id`.
public typealias Row = [String: JSONValue]

extension Dictionary where Key == String, Value == JSONValue {
    public var id: String { self["id"]?.string ?? "" }
    public var companyId: String { self["company_id"]?.string ?? "" }
}

public struct FieldChange: Codable, Equatable, Sendable {
    public var v: JSONValue
    public var hlc: String

    public init(v: JSONValue, hlc: String) {
        self.v = v
        self.hlc = hlc
    }
}

public struct Mutation: Codable, Equatable, Sendable {
    public var id: String
    public var table: String
    public var rowId: String
    public var companyId: String
    public var fields: [String: FieldChange]

    enum CodingKeys: String, CodingKey {
        case id, table, fields
        case rowId = "row_id"
        case companyId = "company_id"
    }
}

public enum MutationStatus: String, Codable, Sendable {
    case applied, partial, stale, duplicate, rejected
}

public struct MutationResult: Codable, Equatable, Sendable {
    public var id: String
    public var status: MutationStatus
    public var lost: [String]?
    public var code: String?
    public var error: String?

    public init(id: String, status: MutationStatus, lost: [String]? = nil, code: String? = nil, error: String? = nil) {
        self.id = id
        self.status = status
        self.lost = lost
        self.code = code
        self.error = error
    }
}

public struct PushResponse: Codable, Equatable, Sendable {
    public var serverHLC: String
    public var results: [MutationResult]

    public init(serverHLC: String, results: [MutationResult]) {
        self.serverHLC = serverHLC
        self.results = results
    }

    enum CodingKeys: String, CodingKey {
        case results
        case serverHLC = "server_hlc"
    }
}

/// The server's pull cursor (`{from, high, after}`), passed back as it came.
public typealias PullCursor = JSONValue

public struct PulledRow: Codable, Equatable, Sendable {
    public var table: String
    public var xid: String
    public var row: Row

    public init(table: String, xid: String, row: Row) {
        self.table = table
        self.xid = xid
        self.row = row
    }
}

public struct PullPage: Codable, Equatable, Sendable {
    public var rows: [PulledRow]
    public var done: Bool
    public var cursor: PullCursor
    public var serverHLC: String

    public init(rows: [PulledRow], done: Bool, cursor: PullCursor, serverHLC: String) {
        self.rows = rows
        self.done = done
        self.cursor = cursor
        self.serverHLC = serverHLC
    }

    enum CodingKeys: String, CodingKey {
        case rows, done, cursor
        case serverHLC = "server_hlc"
    }
}

/// How the engine reaches the server. The app uses Supabase RPC; tests use Postgres directly.
public protocol SyncTransport: Sendable {
    func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse
    func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage
    /// What this user may see (public.sync_scope), or nil when the transport can't tell. When it
    /// changes, for example a job was taken away from them, the engine pulls everything again
    /// and drops what is no longer theirs.
    func scope() async throws -> String?
    /// Rows per table this user would download from the start (public.sync_pull_count), for the
    /// first download's progress; nil when the transport can't tell.
    func pullCount() async throws -> [String: Int]?
}

extension SyncTransport {
    public func pullCount() async throws -> [String: Int]? { nil }
}

/// How far the first download has come (owner, 2026-10-20: "Give a more interesting loading
/// bar"): rows applied per table, against the server's count per table (nil when unknown).
public struct PullProgress: Equatable, Sendable {
    public var totals: [String: Int]?
    public var pulled: [String: Int]
    public var finished: Bool

    public init(totals: [String: Int]?, pulled: [String: Int] = [:], finished: Bool = false) {
        self.totals = totals
        self.pulled = pulled
        self.finished = finished
    }
}
