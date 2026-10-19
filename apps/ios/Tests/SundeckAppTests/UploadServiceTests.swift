import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// The sync service's side of uploads (S5): a capture's row and ticket together, uploads after
// each sync, transcripts for voice notes, the bar's counts, retries, and sign-out.

/// Uploads without a server: succeeds, or fails with a chosen error.
final class FakeUploader: Uploader, @unchecked Sendable {
    let lock = NSLock()
    var failure: Error?
    var uploaded: [String] = []

    func upload(_ job: UploadJob, saveResumeUrl: (String?) throws -> Void) async throws -> UploadResult {
        try lock.withLock {
            if let failure { throw failure }
            uploaded.append(job.mediaId)
            return .uploaded
        }
    }
}

@MainActor
struct UploadShell {
    let transport = FakeTransport()
    let uploader = FakeUploader()
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("uploads-\(UUID())")
    let sync: SyncService

    init() throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let db = try Database(
            path: folder.appendingPathComponent("app.db").path, key: String(repeating: "ab", count: 32))
        let auth = FakeAuth()
        auth.stored = SignInResult(user: SignedInUser(id: "u1", email: "tech@shop.test"), needsCode: false)
        sync = SyncService(
            store: try LocalStore.open(db), kv: try KeyValue(db), transport: transport, auth: auth,
            uploader: uploader, media: MediaFiles(root: folder))
    }

    /// Captures a small file of `kind` on a new job; returns the media id.
    func capture(_ kind: MediaKind, job: String = "j1") throws -> String {
        let temp = folder.appendingPathComponent("temp-\(UUID())")
        try Data("capture \(kind)".utf8).write(to: temp)
        let mime = kind == .photo ? "image/jpeg" : kind == .video ? "video/mp4" : "audio/mp4"
        return try MediaWrites.saveCapture(
            sync, companyId: "c1", target: MediaTarget(jobId: job),
            CapturedFile(kind: kind, url: temp, mime: mime, capturedAt: "2026-10-19T10:00:00.000Z"), at: nil)
    }

    func queued() throws -> Int {
        Int(try sync.store.database.query("select count(*) as n from upload_queue").first?["n"]?.integerValue ?? 0)
    }
}

extension SQLValue {
    fileprivate var integerValue: Int64? {
        if case .integer(let n) = self { return n }
        return nil
    }
}

@Suite @MainActor struct UploadServiceTests {
    @Test func aCaptureIsSavedWithItsTicketAndUploadsAfterTheNextSync() async throws {
        let s = try UploadShell()
        let id = try s.capture(.photo)
        #expect(try s.queued() == 1)
        #expect(s.sync.status.uploadsWaiting == 1)
        #expect(s.sync.status.uploadsAllPhotos)
        #expect(try s.sync.store.get("media", id)?["upload_state"] == "pending")

        await s.sync.syncNow()
        #expect(s.uploader.uploaded == [id])
        #expect(try s.queued() == 0)
        #expect(s.sync.status.uploadsWaiting == 0)
        let row = try #require(try s.sync.store.get("media", id))
        #expect(row["upload_state"] == "uploaded")
        #expect(row["storage_path"] == .string(try mediaStoragePath("c1", "j1", id, "image/jpeg")))
        // The "uploaded" mark is a normal change, sent on the next sync.
        #expect(s.sync.status.pending > 0)
        await s.sync.syncNow()
        #expect(s.sync.status.pending == 0)
    }

    @Test func aRowThatFailsToSaveLeavesNoTicket() throws {
        let s = try UploadShell()
        let temp = s.folder.appendingPathComponent("temp")
        try Data([1]).write(to: temp)
        // An unknown MIME type fails before anything is written.
        #expect(throws: (any Error).self) {
            try MediaWrites.saveCapture(
                s.sync, companyId: "c1", target: MediaTarget(jobId: "j1"),
                CapturedFile(kind: .photo, url: temp, mime: "image/tiff", capturedAt: "2026-10-19T10:00:00.000Z"),
                at: nil)
        }
        #expect(try s.queued() == 0)
        #expect(try s.sync.store.list("media").isEmpty)
    }

    @Test func theBarSaysPhotosOnlyWhenEveryWaitingFileIsAPhoto() async throws {
        let s = try UploadShell()
        try s.capture(.photo)
        #expect(s.sync.status.uploadsAllPhotos)
        try s.capture(.video)
        #expect(s.sync.status.uploadsWaiting == 2)
        #expect(!s.sync.status.uploadsAllPhotos)
    }

    @Test func aFailedUploadWaitsWithItsErrorAndRetriesOnReconnect() async throws {
        let s = try UploadShell()
        s.uploader.failure = UploadError("Storage is busy")
        let id = try s.capture(.photo)
        await s.sync.syncNow()
        #expect(s.sync.status.uploadsWaiting == 1)
        #expect(s.sync.status.lastUploadError == "Storage is busy")

        // Backing off: the next sync doesn't retry yet.
        s.uploader.failure = nil
        await s.sync.syncNow()
        #expect(s.uploader.uploaded.isEmpty)

        // The network comes back while the app runs: everything waiting is due now. (Stopped again
        // before awaiting, so no background sync races this one.)
        s.sync.start()
        s.sync.networkChanged(online: false)
        s.sync.networkChanged(online: true)
        s.sync.stop()
        await s.sync.syncNow()
        #expect(s.uploader.uploaded == [id])
        #expect(s.sync.status.uploadsWaiting == 0)
        #expect(s.sync.status.lastUploadError == nil)
    }

    @Test func nothingUploadsWhileTheSyncFails() async throws {
        let s = try UploadShell()
        try s.capture(.photo)
        s.transport.failure = SyncFailure("Network request failed")
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .offline)
        #expect(s.uploader.uploaded.isEmpty)
    }

    @Test func onlyVoiceNotesAskForATranscript() async throws {
        let s = try UploadShell()
        var asked: [String] = []
        s.sync.voiceNoteUploaded = { asked.append($0) }
        try s.capture(.photo)
        let voice = try s.capture(.audio)
        try s.capture(.video)
        await s.sync.syncNow()
        #expect(s.uploader.uploaded.count == 3)
        #expect(asked == [voice])
    }

    @Test func signingOutRemovesCapturedFiles() async throws {
        let s = try UploadShell()
        let id = try s.capture(.photo)
        let file = try #require(s.sync.media?.localURL(id, mime: "image/jpeg"))
        #expect(FileManager.default.fileExists(atPath: file.path))
        s.sync.clearLocalData()
        #expect(!FileManager.default.fileExists(atPath: file.path))
        #expect(try s.queued() == 0)
        #expect(s.sync.status.uploadsWaiting == 0)
    }
}
