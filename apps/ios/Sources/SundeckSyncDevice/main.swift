import Foundation
import SundeckCore
import SundeckSync
import SundeckSyncPostgres

// A Swift phone for packages/sync/test/integration/cross-engine.test.ts, which runs it next to
// a TypeScript phone against the same database (docs/plans/swift-app.md). One JSON command per
// line on stdin, one JSON reply per line on stdout:
//   {"cmd":"open","name":"swiftA","user":{"id":…,"email":…}}       → {}
//   {"cmd":"insert","table":…,"company":…,"values":{…}}           → {"id":…}
//   {"cmd":"write","table":…,"id":…,"company":…,"values":{…}}     → {}
//   {"cmd":"delete","table":…,"id":…}                              → {}
//   {"cmd":"offline","value":true}                                 → {}
//   {"cmd":"sync"}                → {"pushed":…,"rejected":…,"pulled":…,"pending":…,"error":…}
//   {"cmd":"get","table":…,"id":…}                                 → {"row":{…}|null}
// A failure replies {"failed":"message"}.

guard let database = TestDatabase.shared else {
    FileHandle.standardError.write(Data("SYNC_TEST_DATABASE_URL is not set\n".utf8))
    exit(1)
}

/// The one phone; commands run one at a time.
enum Session {
    nonisolated(unsafe) static var phone: Device?
}

func reply(_ value: JSONValue) {
    let data = (try? JSONEncoder().encode(value)) ?? Data("{}".utf8)
    FileHandle.standardOutput.write(data + Data("\n".utf8))
}

func handle(_ command: JSONValue) async throws -> JSONValue {
    func text(_ key: String) throws -> String {
        guard let value = command[key]?.string else { throw SyncFailure("missing \(key)") }
        return value
    }
    func values() throws -> Row {
        guard case .object(let row)? = command["values"] else { throw SyncFailure("missing values") }
        return row
    }
    func device() throws -> Device {
        guard let phone = Session.phone else { throw SyncFailure("open a device first") }
        return phone
    }
    switch try text("cmd") {
    case "open":
        let user = TestUser(id: command["user"]?["id"]?.string ?? "", email: command["user"]?["email"]?.string ?? "")
        Session.phone = try Device(try text("name"), user, database: database)
        return [:]
    case "insert":
        return ["id": .string(try device().store.insert(try text("table"), companyId: try text("company"), values()))]
    case "write":
        try device().store.write(try text("table"), id: try text("id"), companyId: try text("company"), values())
        return [:]
    case "delete":
        try device().store.softDelete(try text("table"), try text("id"))
        return [:]
    case "offline":
        try device().transport.offline = command["value"]?.bool ?? false
        return [:]
    case "sync":
        let s = await try device().engine.sync()
        return [
            "pushed": .number(Double(s.pushed)), "rejected": .number(Double(s.rejected)),
            "pulled": .number(Double(s.pulled)), "pending": .number(Double(s.pending)),
            "error": s.error.map(JSONValue.string) ?? .null,
        ]
    case "get":
        return ["row": try device().localRow(try text("table"), try text("id")).map(JSONValue.object) ?? .null]
    case let other:
        throw SyncFailure("unknown command \(other)")
    }
}

while let line = readLine() {
    guard !line.isEmpty else { continue }
    do {
        let command = try JSONDecoder().decode(JSONValue.self, from: Data(line.utf8))
        reply(try await handle(command))
    } catch {
        reply(["failed": .string(String(describing: error))])
    }
}
