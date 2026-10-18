import Foundation
import Testing

@testable import SundeckStorage

@Suite struct DatabaseTests {
    let path = FileManager.default.temporaryDirectory
        .appendingPathComponent("sundeck-\(UUID().uuidString).db").path
    let key = String(repeating: "ab", count: 32)

    @Test func encryptsAndReopensWithTheSameKey() throws {
        do {
            let db = try Database(path: path, key: key)
            #expect(try db.cipherVersion() != nil)
            try db.execute("CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT)")
            try db.query("INSERT INTO note (body) VALUES (?)", [.text("gate code 4417")])
        }
        let reopened = try Database(path: path, key: key)
        let rows = try reopened.query("SELECT body FROM note")
        #expect(rows == [["body": .text("gate code 4417")]])
    }

    @Test func fileHoldsNoPlaintext() throws {
        do {
            let db = try Database(path: path, key: key)
            try db.execute("CREATE TABLE note (body TEXT); PRAGMA journal_mode = DELETE")
            try db.query("INSERT INTO note (body) VALUES (?)", [.text("gate code 4417")])
        }
        let bytes = try Data(contentsOf: URL(fileURLWithPath: path))
        #expect(!bytes.isEmpty)
        #expect(bytes.range(of: Data("gate code 4417".utf8)) == nil)
        #expect(bytes.range(of: Data("SQLite format 3".utf8)) == nil)
    }

    @Test func wrongKeyIsRefused() throws {
        do {
            let db = try Database(path: path, key: key)
            try db.execute("CREATE TABLE note (body TEXT)")
        }
        #expect(throws: DatabaseError.self) {
            try Database(path: path, key: String(repeating: "cd", count: 32))
        }
    }

    @Test func nonHexKeyIsRefused() {
        #expect(throws: DatabaseError.self) { try Database(path: path, key: "x'; DROP") }
    }

    @Test func transactionRollsBackOnError() throws {
        struct Stop: Error {}
        let db = try Database(path: path, key: key)
        try db.execute("CREATE TABLE note (body TEXT)")
        #expect(throws: Stop.self) {
            try db.transaction {
                try db.query("INSERT INTO note (body) VALUES (?)", [.text("draft")])
                throw Stop()
            }
        }
        #expect(try db.query("SELECT count(*) AS n FROM note") == [["n": .integer(0)]])
    }

    @Test func roundTripsEveryType() throws {
        let db = try Database(path: path, key: key)
        let row = try db.query(
            "SELECT ? AS i, ? AS r, ? AS t, ? AS b, ? AS n",
            [.integer(42), .real(1.5), .text("é"), .blob(Data([0, 1, 2])), .null]
        )
        #expect(
            row == [["i": .integer(42), "r": .real(1.5), "t": .text("é"), "b": .blob(Data([0, 1, 2])), "n": .null]])
    }
}
