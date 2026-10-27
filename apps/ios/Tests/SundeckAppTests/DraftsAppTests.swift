import Foundation
import SundeckCore
import SundeckStorage
import Testing

@testable import SundeckApp

/// Drafts: typed text kept in `app_kv` until saved or discarded (owner, 2026-10-27).
@MainActor @Suite struct DraftsAppTests {
    static let now: Double = 1_793_102_400_000
    static let day: Double = 24 * 60 * 60 * 1000

    func makeKV() throws -> KeyValue {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("drafts-\(UUID())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return try KeyValue(
            try Database(path: folder.appendingPathComponent("app.db").path, key: String(repeating: "5e", count: 32)))
    }

    @Test func keepsAndRestoresPerPersonFormAndRecord() throws {
        let kv = try makeKV()
        kv.saveDraft(
            user: "u1", form: "finding", id: "f1", fields: ["title": "Crack", "notes": "Skimmer"], now: Self.now)
        #expect(
            kv.loadDraft(user: "u1", form: "finding", id: "f1", now: Self.now + 1000) == [
                "title": "Crack", "notes": "Skimmer",
            ])
        #expect(kv.loadDraft(user: "u2", form: "finding", id: "f1", now: Self.now) == nil)
        #expect(kv.loadDraft(user: "u1", form: "finding", id: "f2", now: Self.now) == nil)
    }

    @Test func blankAndOldDraftsAreRemoved() throws {
        let kv = try makeKV()
        kv.saveDraft(user: "u1", form: "a", id: "1", fields: ["x": "typed"], now: Self.now)
        kv.saveDraft(user: "u1", form: "a", id: "1", fields: ["x": " "], now: Self.now)
        #expect(kv.get(Drafts.key(user: "u1", form: "a", id: "1")) == nil)
        kv.saveDraft(user: "u1", form: "a", id: "1", fields: ["x": "typed"], now: Self.now)
        #expect(kv.loadDraft(user: "u1", form: "a", id: "1", now: Self.now + 8 * Self.day) == nil)
        #expect(kv.get(Drafts.key(user: "u1", form: "a", id: "1")) == nil)
    }

    @Test func sweepKeepsCurrentAndSignOutClearsAll() throws {
        let kv = try makeKV()
        kv.saveDraft(user: "u1", form: "a", id: "1", fields: ["x": "old"], now: Self.now - 9 * Self.day)
        kv.saveDraft(user: "u1", form: "b", id: "1", fields: ["x": "new"], now: Self.now - Self.day)
        kv.sweepDrafts(now: Self.now)
        #expect(kv.loadDraft(user: "u1", form: "a", id: "1", now: Self.now) == nil)
        #expect(kv.loadDraft(user: "u1", form: "b", id: "1", now: Self.now) == ["x": "new"])
        kv.set("search:recent", "keep")
        kv.dropAllDrafts()
        #expect(kv.get(KVKey.draftIndex) == nil)
        #expect(kv.get(Drafts.key(user: "u1", form: "b", id: "1")) == nil)
        #expect(kv.get("search:recent") == "keep")
    }

    @Test func aFormPutsBackWhatDiffersAndDiscardDraftUndoesIt() throws {
        let kv = try makeKV()
        kv.saveDraft(user: "u1", form: "finding", id: "f1", fields: ["title": "Typed", "notes": ""])
        var held = ["title": "", "notes": ""]
        let handle = DraftHandle()
        handle.open(kv: kv, user: "u1", form: "finding", id: "f1", fields: held) { changes in
            for (key, value) in changes { held[key] = value }
        }
        #expect(handle.restored)
        #expect(held == ["title": "Typed", "notes": ""])
        handle.discard()
        #expect(!handle.restored)
        #expect(held == ["title": "", "notes": ""])
        #expect(kv.loadDraft(user: "u1", form: "finding", id: "f1") == nil)
    }

    @Test func noNoteWhenTheDraftAddsNothing() throws {
        let kv = try makeKV()
        kv.saveDraft(user: "u1", form: "finding", id: "f1", fields: ["title": "Same"])
        let handle = DraftHandle()
        handle.open(kv: kv, user: "u1", form: "finding", id: "f1", fields: ["title": "Same"]) { _ in
            Issue.record("nothing to restore")
        }
        #expect(!handle.restored)
    }

    @Test func typingIsKeptOnFlushAndClearedWhenSaved() async throws {
        let kv = try makeKV()
        let handle = DraftHandle()
        handle.open(kv: kv, user: "u1", form: "mass-email", id: "new", fields: ["subject": ""]) { _ in }
        handle.changed(["subject": "Pool season"])
        handle.flush()
        #expect(kv.loadDraft(user: "u1", form: "mass-email", id: "new") == ["subject": "Pool season"])
        // Saved: the draft goes, and the saved text isn't kept again.
        handle.clear()
        #expect(kv.loadDraft(user: "u1", form: "mass-email", id: "new") == nil)
        handle.flush()
        #expect(kv.loadDraft(user: "u1", form: "mass-email", id: "new") == nil)
        // Typing back to how it opened keeps nothing.
        handle.changed(["subject": "More"])
        handle.flush()
        #expect(kv.loadDraft(user: "u1", form: "mass-email", id: "new") == ["subject": "More"])
        handle.changed(["subject": "Pool season"])
        handle.flush()
        #expect(kv.loadDraft(user: "u1", form: "mass-email", id: "new") == nil)
    }

    @Test func discardingAScreenClearsTheDraftsOfItsParts() throws {
        let kv = try makeKV()
        let edits = UnsavedEdits()
        let line = DraftHandle()
        let other = DraftHandle()
        line.open(kv: kv, user: "u1", form: "invoice-line", id: "i1", fields: ["price": ""]) { _ in }
        other.open(kv: kv, user: "u1", form: "quote-line", id: "q1", fields: ["price": ""]) { _ in }
        line.changed(["price": "125"])
        line.flush()
        other.changed(["price": "40"])
        other.flush()
        edits.track("job:j1:a", drafts: [line])
        edits.track("job:j2:b", drafts: [other])
        edits.clearDrafts(under: "job:j1")
        #expect(kv.loadDraft(user: "u1", form: "invoice-line", id: "i1") == nil)
        #expect(kv.loadDraft(user: "u1", form: "quote-line", id: "q1") == ["price": "40"])
    }
}
