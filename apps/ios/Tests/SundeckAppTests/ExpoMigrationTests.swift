import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// S9: a phone updated from the Expo build keeps its unsent work. The "Expo" database here is a
/// real SQLCipher file with the Expo app's key and tables (the same ones LocalStore makes), and
/// unsent changes, a waiting upload, the sync cursor and the signed-in user.
@Suite @MainActor struct ExpoMigrationTests {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("expo-move-\(UUID())")
    let expoKey = String(repeating: "e1", count: 32)

    func makeExpoDatabase() throws -> (path: String, job: String) {
        try FileManager.default.createDirectory(
            at: folder.appendingPathComponent("SQLite"), withIntermediateDirectories: true)
        let path = ExpoMigration.expoPath(documents: folder)
        let db = try Database(path: path, key: expoKey)
        let store = try LocalStore.open(db, deviceId: "expophone")
        let kv = try KeyValue(db)
        // Synced from the server.
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(table: "customer", xid: "9", row: ["id": "cu1", "company_id": "c1", "name": "Maria"])
                ],
                done: true, cursor: ["customer": "9"], serverHLC: "1760000000000-0000-srv"))
        // Made offline, not sent yet.
        let job = try store.insert("job", companyId: "c1", ["status": "in_progress", "type": "detection"])
        try store.write("customer", id: "cu1", companyId: "c1", ["phone": "(602) 555-0199"])
        try db.query(
            "insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type) values (?, ?, ?, ?, ?)",
            [.text("m1"), .text("c1"), .text("media/m1.jpg"), .text("c1/j1/m1.jpg"), .text("image/jpeg")])
        kv.setJSON(KVKey.user, SignedInUser(id: "u1", email: "tech@shop.test"))
        kv.set(KVKey.lastSyncedAt, "1760000000")
        kv.set("auth:sb-token", "{}")
        return (path, job)
    }

    func swiftDatabase() throws -> (Database, LocalStore, KeyValue) {
        let db = try Database(
            path: folder.appendingPathComponent("sundeck.db").path, key: String(repeating: "5f", count: 32))
        return (db, try LocalStore.open(db), try KeyValue(db))
    }

    @Test func unsentWorkMovesOverAndNothingIsLost() throws {
        let expo = try makeExpoDatabase()
        let (db, fresh, kv) = try swiftDatabase()
        #expect(fresh.deviceId != "expophone")

        let outcome = ExpoMigration.run(into: db, expoPath: expo.path, expoKey: expoKey)
        guard case .moved(let counts) = outcome else {
            Issue.record("Expected a move, got \(outcome)")
            return
        }
        #expect(counts["upload_queue"] == 1)
        #expect((counts["sync_outbox"] ?? 0) >= 2)

        let store = try LocalStore.open(db)
        #expect(store.deviceId == "expophone")
        #expect(try store.pendingCount() >= 2)
        #expect(try store.get("job", expo.job)?["status"] == "in_progress")
        #expect(try store.get("customer", "cu1")?["phone"] == "(602) 555-0199")
        #expect(try store.get("customer", "cu1")?["name"] == "Maria")
        #expect(kv.getJSON(KVKey.user, as: SignedInUser.self)?.id == "u1")
        #expect(kv.get(KVKey.lastSyncedAt) == "1760000000")
        let waiting = try db.query("select local_path from upload_queue").first?["local_path"]
        #expect(waiting == .text("media/m1.jpg"))
        // The Expo file is left in place.
        #expect(FileManager.default.fileExists(atPath: expo.path))
    }

    @Test func itRunsOnce() throws {
        let expo = try makeExpoDatabase()
        let (db, _, _) = try swiftDatabase()
        guard case .moved = ExpoMigration.run(into: db, expoPath: expo.path, expoKey: expoKey) else {
            Issue.record("Expected a move")
            return
        }
        #expect(ExpoMigration.run(into: db, expoPath: expo.path, expoKey: expoKey) == .nothingToMove)
    }

    @Test func aPhoneWithoutTheExpoAppHasNothingToMove() throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let (db, _, kv) = try swiftDatabase()
        #expect(
            ExpoMigration.run(into: db, expoPath: ExpoMigration.expoPath(documents: folder), expoKey: nil)
                == .nothingToMove)
        #expect(kv.get(ExpoMigration.doneKey) != nil)
    }

    @Test func aWrongOrMissingKeyLeavesEverythingAlone() throws {
        let expo = try makeExpoDatabase()
        let (db, store, kv) = try swiftDatabase()
        if case .unreadable = ExpoMigration.run(into: db, expoPath: expo.path, expoKey: nil) {
        } else {
            Issue.record("A missing key should be unreadable")
        }
        let wrong = ExpoMigration.run(into: db, expoPath: expo.path, expoKey: String(repeating: "00", count: 32))
        if case .unreadable = wrong {} else { Issue.record("A wrong key should be unreadable, got \(wrong)") }
        #expect(try store.pendingCount() == 0)
        // Not marked done, so it tries again next start (the key may show up after unlock).
        #expect(kv.get(ExpoMigration.doneKey) == nil)
        #expect(FileManager.default.fileExists(atPath: expo.path))
    }
}
