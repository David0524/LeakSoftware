import Foundation
import SQLCipher

/// A value read from or bound to SQLite.
public enum SQLValue: Equatable, Sendable {
    case null
    case integer(Int64)
    case real(Double)
    case text(String)
    case blob(Data)
}

public struct DatabaseError: Error, CustomStringConvertible, Sendable {
    public let code: Int32
    public let message: String
    public var description: String { "SQLite error \(code): \(message)" }
}

/// One SQLite connection, encrypted with SQLCipher. The store is one JSON table (DECISIONS,
/// M2), so a thin wrapper over the C API is all the app needs. Safe to share between threads:
/// each call, and each transaction as a whole, holds the connection's lock.
public final class Database: @unchecked Sendable {
    private var handle: OpaquePointer?
    private let lock = NSRecursiveLock()
    private var depth = 0

    /// Opens (or creates) the database at `path`. `key` is the hex passphrase from the
    /// Keychain, the same scheme as the Expo app (`apps/mobile/src/lib/database.ts`), so the
    /// Swift app can later read a database the Expo app wrote. Throws if the file was written
    /// with a different key.
    public init(path: String, key: String) throws {
        guard key.allSatisfy(\.isHexDigit), !key.isEmpty else {
            throw DatabaseError(code: SQLITE_MISUSE, message: "The database key must be hex.")
        }
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        let rc = sqlite3_open_v2(path, &handle, flags, nil)
        guard rc == SQLITE_OK else {
            let error = DatabaseError(code: rc, message: String(cString: sqlite3_errstr(rc)))
            sqlite3_close(handle)
            handle = nil
            throw error
        }
        do {
            // The key must be the first statement. Hex only, so it is safe to inline.
            try execute("PRAGMA key = '\(key)'")
            // Fails here when the key doesn't match the file.
            _ = try query("SELECT count(*) FROM sqlite_master")
            _ = try query("PRAGMA journal_mode = WAL")
        } catch {
            sqlite3_close(handle)
            handle = nil
            throw error
        }
    }

    deinit {
        sqlite3_close(handle)
    }

    /// The SQLCipher version, or nil if this SQLite has no encryption.
    public func cipherVersion() throws -> String? {
        guard case .text(let version)? = try query("PRAGMA cipher_version").first?["cipher_version"]
        else { return nil }
        return version
    }

    /// Runs one or more statements with no parameters and no results.
    public func execute(_ sql: String) throws {
        lock.lock()
        defer { lock.unlock() }
        var message: UnsafeMutablePointer<CChar>?
        let rc = sqlite3_exec(handle, sql, nil, nil, &message)
        guard rc == SQLITE_OK else {
            let text = message.map { String(cString: $0) } ?? lastMessage
            sqlite3_free(message)
            throw DatabaseError(code: rc, message: text)
        }
    }

    /// Runs one statement and returns its rows as column name to value.
    @discardableResult
    public func query(_ sql: String, _ parameters: [SQLValue] = []) throws -> [[String: SQLValue]] {
        lock.lock()
        defer { lock.unlock() }
        var statement: OpaquePointer?
        try check(sqlite3_prepare_v2(handle, sql, -1, &statement, nil))
        defer { sqlite3_finalize(statement) }
        for (index, value) in parameters.enumerated() {
            try bind(value, at: Int32(index + 1), in: statement)
        }
        var rows: [[String: SQLValue]] = []
        while true {
            let rc = sqlite3_step(statement)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else { throw DatabaseError(code: rc, message: lastMessage) }
            var row: [String: SQLValue] = [:]
            for column in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, column))
                row[name] = value(at: column, in: statement)
            }
            rows.append(row)
        }
        return rows
    }

    /// Runs `body` in one transaction: committed if it returns, rolled back if it throws.
    /// Transactions nest: an inner one is a savepoint, so a caller can catch an inner failure
    /// and keep the outer work (same as `nestedTransactions` in packages/sync).
    public func transaction<T>(_ body: () throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        let name = "sp_\(depth)"
        try execute(depth == 0 ? "BEGIN IMMEDIATE" : "SAVEPOINT \(name)")
        depth += 1
        do {
            let result = try body()
            depth -= 1
            try execute(depth == 0 ? "COMMIT" : "RELEASE \(name)")
            return result
        } catch {
            depth -= 1
            try? execute(depth == 0 ? "ROLLBACK" : "ROLLBACK TO \(name)")
            if depth > 0 { try? execute("RELEASE \(name)") }
            throw error
        }
    }

    /// The number of rows the last INSERT, UPDATE or DELETE changed.
    public var changes: Int {
        lock.lock()
        defer { lock.unlock() }
        return Int(sqlite3_changes(handle))
    }

    private var lastMessage: String { String(cString: sqlite3_errmsg(handle)) }

    private func check(_ rc: Int32) throws {
        guard rc == SQLITE_OK else { throw DatabaseError(code: rc, message: lastMessage) }
    }

    private func bind(_ value: SQLValue, at index: Int32, in statement: OpaquePointer?) throws {
        // SQLITE_TRANSIENT: SQLite copies the bytes before this call returns.
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        switch value {
        case .null: try check(sqlite3_bind_null(statement, index))
        case .integer(let v): try check(sqlite3_bind_int64(statement, index, v))
        case .real(let v): try check(sqlite3_bind_double(statement, index, v))
        case .text(let v): try check(sqlite3_bind_text(statement, index, v, -1, transient))
        case .blob(let v):
            try v.withUnsafeBytes { bytes in
                try check(sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(v.count), transient))
            }
        }
    }

    private func value(at column: Int32, in statement: OpaquePointer?) -> SQLValue {
        switch sqlite3_column_type(statement, column) {
        case SQLITE_INTEGER: return .integer(sqlite3_column_int64(statement, column))
        case SQLITE_FLOAT: return .real(sqlite3_column_double(statement, column))
        case SQLITE_TEXT: return .text(String(cString: sqlite3_column_text(statement, column)))
        case SQLITE_BLOB:
            let count = Int(sqlite3_column_bytes(statement, column))
            guard count > 0, let bytes = sqlite3_column_blob(statement, column) else { return .blob(Data()) }
            return .blob(Data(bytes: bytes, count: count))
        default: return .null
        }
    }
}
