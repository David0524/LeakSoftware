import Foundation
import SundeckCore
import SundeckStorage

/// The phone's synced data and its outbox. Port of packages/sync/src/store.ts.
///
/// Every synced server table lives in `sync_records` as JSON, so a server schema change never
/// needs a device migration (DECISIONS, M2). Screens read through `get` and `list`. Every local
/// write updates the row and appends to the outbox in one transaction. The tables are the same
/// as the Expo app's, so S9 can carry an Expo database over.
public final class LocalStore: @unchecked Sendable {
    public let clock: HybridClock
    public let deviceId: String
    /// The connection, for the upload queue (same database, same transactions).
    public let database: Database
    private let now: () -> Int64
    /// Changes per table, so screens redo only the lists whose table changed.
    private var changes: [String: Int] = [:]
    private var cleared = 0
    private let lock = NSLock()

    static let schemaVersion = 4
    static let schema = [
        """
        create table if not exists sync_records (
          table_name text not null,
          id text not null,
          company_id text not null,
          data text not null,
          deleted integer not null default 0,
          primary key (table_name, id))
        """,
        "create index if not exists sync_records_company on sync_records (table_name, company_id, deleted)",
        """
        create table if not exists sync_outbox (
          seq integer primary key autoincrement,
          mutation_id text not null,
          table_name text not null,
          row_id text not null,
          company_id text not null,
          fields text not null,
          created_at integer not null,
          attempts integer not null default 0,
          status text not null default 'pending',
          last_error text)
        """,
        "create index if not exists sync_outbox_status on sync_outbox (status, seq)",
        "create index if not exists sync_outbox_row on sync_outbox (table_name, row_id)",
        "create table if not exists sync_meta (key text primary key, value text not null)",
        """
        create table if not exists upload_queue (
          media_id text primary key,
          company_id text not null,
          local_path text not null,
          storage_path text not null,
          mime_type text not null,
          attempts integer not null default 0,
          next_attempt_at integer not null default 0,
          last_error text,
          resume_url text,
          record_table text not null default 'media')
        """,
    ]

    /// Columns the server manages. Devices never send them.
    static let serverColumns: Set<String> = ["id", "company_id", "created_at", "updated_at", "field_hlc", "sync_xid"]

    private init(database: Database, deviceId: String, clockState: HLCState, now: @escaping () -> Int64) throws {
        self.database = database
        self.deviceId = deviceId
        self.now = now
        self.clock = try HybridClock(deviceId: deviceId, state: clockState, now: now)
    }

    /// Creates tables if needed and loads the device id and clock. `now` is milliseconds since
    /// 1970 (tests set it); `deviceId` is used only for a new database.
    public static func open(_ db: Database, now: (() -> Int64)? = nil, deviceId: String? = nil) throws -> LocalStore {
        let now = now ?? { Int64((Date().timeIntervalSince1970 * 1000).rounded(.down)) }
        for sql in schema { try db.execute(sql) }
        // Version 2: resumable uploads remember their upload URL.
        let queueColumns = try db.query("pragma table_info(upload_queue)").compactMap { $0["name"]?.text }
        if !queueColumns.contains("resume_url") {
            try db.execute("alter table upload_queue add column resume_url text")
        }
        // Version 3: the queue also carries signature images.
        if !queueColumns.contains("record_table") {
            try db.execute("alter table upload_queue add column record_table text not null default 'media'")
        }
        // Version 4 (M11): a job index, so a job's screen reads its own rows.
        let recordColumns = try db.query("pragma table_xinfo(sync_records)").compactMap { $0["name"]?.text }
        if !recordColumns.contains("job_id") {
            try db.execute(
                "alter table sync_records add column job_id text generated always as (json_extract(data, '$.job_id')) virtual"
            )
        }
        try db.execute("create index if not exists sync_records_job on sync_records (table_name, job_id, deleted)")

        func meta(_ key: String) throws -> String? {
            try db.query("select value from sync_meta where key = ?", [.text(key)]).first?["value"]?.text
        }
        func set(_ key: String, _ value: String) throws {
            try db.query("insert or replace into sync_meta (key, value) values (?, ?)", [.text(key), .text(value)])
        }
        try set("schema_version", String(schemaVersion))
        var id = try meta("device_id")
        if id == nil {
            let newId = deviceId ?? uuidv7(milliseconds: UInt64(now())).replacingOccurrences(of: "-", with: "")
            try set("device_id", newId)
            id = newId
        }
        let clockState = try (meta("hlc_state")).flatMap {
            try? JSONDecoder().decode(HLCState.self, from: Data($0.utf8))
        }
        return try LocalStore(database: db, deviceId: id!, clockState: clockState ?? HLCState(), now: now)
    }

    // MARK: - Reads

    public func get(_ table: String, _ id: String) throws -> Row? {
        try database.query(
            "select data from sync_records where table_name = ? and id = ?", [.text(table), .text(id)]
        ).first.map { try decodeRow($0["data"]) }
    }

    /// A row by id, left out when deleted (as `list` leaves deleted rows out).
    public func getLive(_ table: String, _ id: String) throws -> Row? {
        try database.query(
            "select data from sync_records where table_name = ? and id = ? and deleted = 0", [.text(table), .text(id)]
        ).first.map { try decodeRow($0["data"]) }
    }

    public func list(_ table: String, companyId: String? = nil, jobId: String? = nil, includeDeleted: Bool = false)
        throws -> [Row]
    {
        var conditions = ["table_name = ?"]
        var parameters: [SQLValue] = [.text(table)]
        // Empty filters are ignored, as in TypeScript (`if (opts.companyId)`).
        if let companyId, !companyId.isEmpty {
            conditions.append("company_id = ?")
            parameters.append(.text(companyId))
        }
        if let jobId, !jobId.isEmpty {
            conditions.append("job_id = ?")
            parameters.append(.text(jobId))
        }
        if !includeDeleted { conditions.append("deleted = 0") }
        // A job's rows come through the job index (SQLite would otherwise pick the company one).
        let index = jobId?.isEmpty == false ? " indexed by sync_records_job" : ""
        return try database.query(
            "select data from sync_records\(index) where \(conditions.joined(separator: " and ")) order by id",
            parameters
        ).map { try decodeRow($0["data"]) }
    }

    // MARK: - Local writes: the row and the outbox in one transaction

    /// Creates a row offline. Returns its new id.
    @discardableResult
    public func insert(_ table: String, companyId: String, _ values: Row) throws -> String {
        let id = uuidv7(milliseconds: UInt64(now()))
        try write(table, id: id, companyId: companyId, values)
        return id
    }

    /// Changes fields on a row (new or existing).
    public func write(_ table: String, id: String, companyId: String, _ values: Row) throws {
        if values.isEmpty { return }
        for key in values.keys where Self.serverColumns.contains(key) {
            throw SyncStoreError("\(table).\(key) is managed by the server")
        }
        try guardFull {
            try database.transaction {
                let hlc = clock.tick()
                let fields = values.mapValues { FieldChange(v: $0, hlc: hlc) }
                let existing = try get(table, id)
                if let existing, existing.companyId != companyId {
                    throw SyncStoreError("\(table) \(id) belongs to another company")
                }
                var row = existing ?? ["id": .string(id), "company_id": .string(companyId)]
                row.merge(values) { _, new in new }
                try putRecord(table, row)
                try database.query(
                    """
                    insert into sync_outbox (mutation_id, table_name, row_id, company_id, fields, created_at)
                    values (?, ?, ?, ?, ?, ?)
                    """,
                    [
                        .text(uuidv7(milliseconds: UInt64(now()))), .text(table), .text(id), .text(companyId),
                        .text(try encode(fields)), .integer(now()),
                    ])
                try saveClock()
            }
        }
    }

    /// Soft delete, so the deletion syncs like any other change.
    public func softDelete(_ table: String, _ id: String) throws {
        guard let row = try get(table, id) else { throw SyncStoreError("\(table) \(id) not found") }
        try write(
            table, id: id, companyId: row.companyId,
            ["deleted_at": .string(isoTimestamp(milliseconds: Double(now())))])
    }

    // MARK: - Outbox

    public func pendingCount() throws -> Int {
        try count("select count(*) as n from sync_outbox where status = 'pending'")
    }

    public func problems() throws -> [OutboxProblem] {
        try database.query("select * from sync_outbox where status = 'rejected' order by seq").map { r in
            OutboxProblem(
                seq: Int(r["seq"]?.integer ?? 0), table: r["table_name"]?.text ?? "", rowId: r["row_id"]?.text ?? "",
                fields: try decodeFields(r["fields"]).keys.sorted(), error: r["last_error"]?.text ?? "")
        }
    }

    /// Pending changes merged per row (latest HLC wins per field), in the order rows were first
    /// touched so parents are created before children.
    public func pendingBatch(maxMutations: Int) throws -> PendingBatch {
        let entries = try database.query(
            "select seq, mutation_id, table_name, row_id, company_id, fields from sync_outbox where status = 'pending' order by seq"
        )
        var order: [String] = []
        var groups: [String: (mutation: Mutation, seqs: [Int])] = [:]
        for e in entries {
            let table = e["table_name"]?.text ?? ""
            let rowId = e["row_id"]?.text ?? ""
            let key = "\(table)\u{0}\(rowId)"
            if groups[key] == nil {
                if groups.count >= maxMutations { continue }
                groups[key] = (
                    Mutation(
                        id: e["mutation_id"]?.text ?? "", table: table, rowId: rowId,
                        companyId: e["company_id"]?.text ?? "", fields: [:]),
                    []
                )
                order.append(key)
            }
            for (name, change) in try decodeFields(e["fields"]) {
                let previous = groups[key]!.mutation.fields[name]
                if previous == nil || compareHLC(change.hlc, previous!.hlc) > 0 {
                    groups[key]!.mutation.fields[name] = change
                }
            }
            // The id of a merged mutation is its newest entry's id: retrying the same merge
            // reuses it, and new edits produce a new id.
            groups[key]!.mutation.id = e["mutation_id"]?.text ?? ""
            groups[key]!.seqs.append(Int(e["seq"]?.integer ?? 0))
        }
        let ordered = order.map { groups[$0]! }
        return PendingBatch(
            mutations: ordered.map(\.mutation),
            seqsByMutation: Dictionary(ordered.map { ($0.mutation.id, $0.seqs) }, uniquingKeysWith: { a, _ in a }))
    }

    /// The server accepted (or already had) these changes.
    public func acknowledge(_ seqs: [Int]) throws {
        if seqs.isEmpty { return }
        try database.query("delete from sync_outbox where seq in (\(placeholders(seqs.count)))", seqs.map(sqlInt))
    }

    /// The server refused these changes. Kept for display; not retried.
    public func reject(_ seqs: [Int], error: String) throws {
        if seqs.isEmpty { return }
        try database.query(
            "update sync_outbox set status = 'rejected', last_error = ? where seq in (\(placeholders(seqs.count)))",
            [.text(error)] + seqs.map(sqlInt))
    }

    /// Network or server failure: keep the changes and count the attempt.
    public func noteFailure(_ seqs: [Int], error: String) throws {
        if seqs.isEmpty { return }
        try database.query(
            "update sync_outbox set attempts = attempts + 1, last_error = ? where seq in (\(placeholders(seqs.count)))",
            [.text(error)] + seqs.map(sqlInt))
    }

    /// Drops a rejected change and restores the server's value on the next pull.
    public func discardProblem(_ seq: Int) throws {
        try database.query("delete from sync_outbox where seq = ? and status = 'rejected'", [sqlInt(seq)])
        try setCursor(.object([:]))
    }

    // MARK: - Pull

    public func cursor() throws -> PullCursor {
        guard let text = try meta("pull_cursor") else { return .object([:]) }
        return try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
    }

    private func setCursor(_ cursor: PullCursor) throws {
        try setMeta("pull_cursor", encode(cursor))
    }

    /// The server's sync scope as of the last complete pull (nil before the first).
    public func scope() throws -> String? { try meta("pull_scope") }

    public func setScope(_ scope: String) throws { try setMeta("pull_scope", scope) }

    /// After a full pull: drops every synced row the server didn't send ("table:id" in `seen`),
    /// except rows with local changes not yet accepted, which stay until sent or discarded.
    @discardableResult
    public func keepOnly(_ seen: Set<String>) throws -> Int {
        try database.transaction {
            let local = Set(
                try database.query("select distinct table_name || ':' || row_id as k from sync_outbox").compactMap {
                    $0["k"]?.text
                })
            let gone = try database.query("select table_name, id from sync_records").filter {
                let key = "\($0["table_name"]?.text ?? ""):\($0["id"]?.text ?? "")"
                return !seen.contains(key) && !local.contains(key)
            }
            for r in gone {
                touched(r["table_name"]?.text ?? "")
                try database.query(
                    "delete from sync_records where table_name = ? and id = ?",
                    [r["table_name"] ?? .null, r["id"] ?? .null])
            }
            return gone.count
        }
    }

    /// Removes jobs that no longer belong on this phone (`keep` says which do), with everything
    /// under them: checklist, tests, findings, photos, reports, quotes and their lines, invoices
    /// and their lines, payments, signatures, links, and messages. A job with unsent changes
    /// anywhere in it stays. Returns the jobs removed.
    @discardableResult
    public func pruneJobs(keep: (Row) -> Bool) throws -> Int {
        try database.transaction {
            let gone = try list("job", includeDeleted: true).filter { !keep($0) }
            var removed = 0
            for job in gone {
                let id = SQLValue.text(job.id)
                let rows = try database.query(
                    """
                    with q as (select id from sync_records where table_name = 'quote' and job_id = ?),
                         i as (select id from sync_records where table_name = 'invoice' and job_id = ?)
                    select table_name, id from sync_records
                     where (table_name = 'job' and id = ?)
                        or job_id = ?
                        or json_extract(data, '$.quote_id') in (select id from q)
                        or json_extract(data, '$.invoice_id') in (select id from i)
                    """, [id, id, id, id])
                let unsent = try rows.contains {
                    try count(
                        "select count(*) as n from sync_outbox where table_name = ? and row_id = ?",
                        [$0["table_name"] ?? .null, $0["id"] ?? .null]) > 0
                }
                if unsent { continue }
                for r in rows {
                    touched(r["table_name"]?.text ?? "")
                    try database.query(
                        "delete from sync_records where table_name = ? and id = ?",
                        [r["table_name"] ?? .null, r["id"] ?? .null])
                }
                removed += 1
            }
            return removed
        }
    }

    /// Applies one page of server rows and its cursor atomically. Pending local edits are laid
    /// back over each row so unpushed work never disappears from the screen.
    public func applyPage(_ page: PullPage) throws {
        try guardFull {
            try database.transaction {
                for pulled in page.rows {
                    let pending = try database.query(
                        "select fields from sync_outbox where table_name = ? and row_id = ? and status = 'pending' order by seq",
                        [.text(pulled.table), .text(pulled.row.id)])
                    var merged = pulled.row
                    for p in pending {
                        for (name, change) in try decodeFields(p["fields"]) { merged[name] = change.v }
                    }
                    try putRecord(pulled.table, merged)
                }
                try setCursor(page.cursor)
                try receiveClock(page.serverHLC)
            }
        }
    }

    public func receiveClock(_ hlc: String) throws {
        try clock.receive(hlc)
        try saveClock()
    }

    /// A token that changes whenever a row of `table` is written, pulled, or removed. Screens
    /// re-read a table only when its token changes.
    public func tableVersion(_ table: String) -> String {
        lock.withLock { "\(cleared).\(changes[table] ?? 0)" }
    }

    /// Removes all synced data, pending changes, uploads, and the pull cursor (sign-out). Keeps
    /// the device id and clock. Callers must warn about unsent changes first.
    public func clearAll() throws {
        lock.withLock { cleared += 1 }
        try database.transaction {
            try database.execute("delete from sync_records")
            try database.execute("delete from sync_outbox")
            try database.execute("delete from upload_queue")
            try database.execute("delete from sync_meta where key in ('pull_cursor', 'pull_scope')")
        }
    }

    // MARK: - Helpers

    private func touched(_ table: String) {
        lock.withLock { changes[table, default: 0] += 1 }
    }

    private func putRecord(_ table: String, _ row: Row) throws {
        touched(table)
        try database.query(
            """
            insert into sync_records (table_name, id, company_id, data, deleted) values (?, ?, ?, ?, ?)
            on conflict (table_name, id) do update set company_id = excluded.company_id, data = excluded.data,
              deleted = excluded.deleted
            """,
            [
                .text(table), .text(row.id), .text(row.companyId), .text(try encode(row)),
                .integer((row["deleted_at"]?.isTruthy ?? false) ? 1 : 0),
            ])
    }

    private func saveClock() throws { try setMeta("hlc_state", encode(clock.state)) }

    private func meta(_ key: String) throws -> String? {
        try database.query("select value from sync_meta where key = ?", [.text(key)]).first?["value"]?.text
    }

    private func setMeta(_ key: String, _ value: String) throws {
        try database.query("insert or replace into sync_meta (key, value) values (?, ?)", [.text(key), .text(value)])
    }

    private func count(_ sql: String, _ parameters: [SQLValue] = []) throws -> Int {
        Int(try database.query(sql, parameters).first?["n"]?.integer ?? 0)
    }

    /// SQLite out of space becomes StorageFullError; the transaction has rolled back.
    private func guardFull<T>(_ body: () throws -> T) throws -> T {
        do { return try body() } catch  where isStorageFull(error) { throw StorageFullError() }
    }
}

public struct OutboxProblem: Equatable, Sendable {
    public var seq: Int
    public var table: String
    public var rowId: String
    public var fields: [String]
    public var error: String
}

/// A batch of coalesced mutations and the outbox entries each one covers.
public struct PendingBatch: Sendable {
    public var mutations: [Mutation]
    public var seqsByMutation: [String: [Int]]
}

public struct SyncStoreError: Error, CustomStringConvertible {
    public let description: String
    init(_ message: String) { description = message }
}

private func encode<T: Encodable>(_ value: T) throws -> String {
    String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
}

private func decodeRow(_ value: SQLValue?) throws -> Row {
    try JSONDecoder().decode(Row.self, from: Data((value?.text ?? "{}").utf8))
}

private func decodeFields(_ value: SQLValue?) throws -> [String: FieldChange] {
    try JSONDecoder().decode([String: FieldChange].self, from: Data((value?.text ?? "{}").utf8))
}

private func placeholders(_ n: Int) -> String { Array(repeating: "?", count: n).joined(separator: ",") }

private func sqlInt(_ n: Int) -> SQLValue { .integer(Int64(n)) }

extension SQLValue {
    var text: String? {
        if case .text(let s) = self { return s }
        return nil
    }

    var integer: Int64? {
        if case .integer(let n) = self { return n }
        return nil
    }
}
