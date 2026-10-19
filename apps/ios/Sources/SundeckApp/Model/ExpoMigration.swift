import Foundation
import SundeckStorage

#if canImport(Security)
    import Security
#endif

/// Moves a phone's work from the Expo build of the app into the Swift build, on the Swift app's
/// first start after the update (docs/plans/swift-app.md, "Phones that update from the Expo app").
///
/// Both apps share the bundle ID, so the update keeps the Expo app's files and Keychain items.
/// The Expo app kept everything in Documents/SQLite/leakbook.db (SQLCipher, keyed with a hex
/// passphrase saved by expo-secure-store as "leakbook.db-key.v1"), in the same tables the Swift
/// app uses, and its captured files in Documents/media, where the Swift app keeps them too. So
/// the move copies the rows (synced records, unsent changes, the upload queue, the sync cursor,
/// the device id and clock, and the app's saved values), checks the counts, and leaves the
/// Expo file in place; nothing is deleted.
public enum ExpoMigration {
    public static let databaseName = "leakbook.db"
    public static let keychainAccount = "leakbook.db-key.v1"
    /// Set in the Swift app's values once the move has run (or there was nothing to move).
    public static let doneKey = "migration:expo"

    public enum Outcome: Equatable, Sendable {
        /// Nothing to move: no Expo database, or the move already ran.
        case nothingToMove
        /// Moved, with the number of rows per table.
        case moved([String: Int])
        /// The Expo database couldn't be read (no key, or the wrong one). Left untouched.
        case unreadable(String)
    }

    /// The tables moved, in order. `sync_meta` holds the device id, the clock and the cursor.
    static let tables = ["sync_records", "sync_outbox", "sync_meta", "upload_queue", "app_kv"]

    /// Moves the Expo app's data into `database`, which must already have the Swift app's tables
    /// (open `LocalStore` and `KeyValue` on it first, then open `LocalStore` again afterwards so
    /// it reads the moved device id and clock). Runs once.
    public static func run(into database: Database, expoPath: String, expoKey: String?) -> Outcome {
        let done = try? database.query("select value from app_kv where key = ?", [.text(doneKey)]).first
        if done != nil { return .nothingToMove }
        guard FileManager.default.fileExists(atPath: expoPath) else {
            markDone(database)
            return .nothingToMove
        }
        guard let expoKey, !expoKey.isEmpty, expoKey.allSatisfy(\.isHexDigit) else {
            return .unreadable("The Expo app's database key isn't on this phone.")
        }
        let escaped = expoPath.replacingOccurrences(of: "'", with: "''")
        do {
            try database.execute("ATTACH DATABASE '\(escaped)' AS expo KEY '\(expoKey)'")
        } catch {
            return .unreadable(String(describing: error))
        }
        defer { try? database.execute("DETACH DATABASE expo") }
        do {
            _ = try database.query("select count(*) from expo.sqlite_master")
            var moved: [String: Int] = [:]
            try database.transaction {
                for table in tables where try exists(database, table) {
                    let columns = try sharedColumns(database, table)
                    guard !columns.isEmpty else { continue }
                    let list = columns.joined(separator: ", ")
                    // The Expo app's rows win: they are the phone's real history (its device id,
                    // clock, cursor and unsent work); the Swift app's own rows are only defaults.
                    try database.execute(
                        "insert or replace into main.\(table) (\(list)) select \(list) from expo.\(table)")
                    let count = try countRows(database, "expo.\(table)")
                    if try countRows(database, "main.\(table)") < count {
                        throw MigrationCheckFailed("\(table): fewer rows after the move")
                    }
                    moved[table] = count
                }
                try database.query(
                    "insert or replace into app_kv (key, value) values (?, ?)",
                    [.text(doneKey), .text(ISO8601DateFormatter().string(from: Date()))])
            }
            return .moved(moved)
        } catch {
            return .unreadable(String(describing: error))
        }
    }

    /// Where the Expo app kept its database: Documents/SQLite/leakbook.db.
    public static func expoPath(documents: URL) -> String {
        documents.appendingPathComponent("SQLite").appendingPathComponent(databaseName).path
    }

    /// The Expo app's database key, as expo-secure-store saved it in the Keychain.
    public static func expoKeyFromKeychain() -> String? {
        #if canImport(Security)
            let account = Data(keychainAccount.utf8)
            // expo-secure-store 14+ saves under "app:no-auth"; older versions under "app".
            for service in ["app:no-auth", "app", "app:auth"] {
                let query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: service,
                    kSecAttrGeneric as String: account,
                    kSecAttrAccount as String: account,
                    kSecReturnData as String: true,
                    kSecMatchLimit as String: kSecMatchLimitOne,
                ]
                var item: CFTypeRef?
                if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data,
                    let key = String(data: data, encoding: .utf8)
                {
                    return key
                }
            }
        #endif
        return nil
    }

    private static func markDone(_ database: Database) {
        _ = try? database.query(
            "insert or replace into app_kv (key, value) values (?, ?)",
            [.text(doneKey), .text(ISO8601DateFormatter().string(from: Date()))])
    }

    private static func exists(_ database: Database, _ table: String) throws -> Bool {
        try !database.query("select 1 from expo.sqlite_master where type = 'table' and name = ?", [.text(table)])
            .isEmpty
    }

    /// Columns both apps' tables have, so a column only one of them has never breaks the move.
    private static func sharedColumns(_ database: Database, _ table: String) throws -> [String] {
        func columns(_ schema: String) throws -> [String] {
            try database.query("pragma \(schema).table_info(\(table))").compactMap {
                if case .text(let name)? = $0["name"] { return name }
                return nil
            }
        }
        let expo = Set(try columns("expo"))
        return try columns("main").filter { expo.contains($0) }.map { "\"\($0)\"" }
    }

    private static func countRows(_ database: Database, _ table: String) throws -> Int {
        if case .integer(let n)? = try database.query("select count(*) as n from \(table)").first?["n"] {
            return Int(n)
        }
        return 0
    }
}

struct MigrationCheckFailed: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}
