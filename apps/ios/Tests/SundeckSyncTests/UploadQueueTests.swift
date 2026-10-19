import Foundation
import SundeckCore
import SundeckStorage
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/uploads.test.ts.
@Suite struct UploadQueueTests {
    /// Records each job; fails (after saving a resume URL) while `failures` is above zero.
    final class FakeUploader: Uploader, @unchecked Sendable {
        let calls = Locked<[UploadJob]>([])
        let failures = Locked(0)

        func upload(_ job: UploadJob, saveResumeUrl: (String?) throws -> Void) async throws -> UploadResult {
            calls.withLock { $0.append(job) }
            let fail = failures.withLock { n -> Bool in
                guard n > 0 else { return false }
                n -= 1
                return true
            }
            if fail {
                try saveResumeUrl("https://tus/\(job.mediaId)")
                throw TestError("timeout")
            }
            return .uploaded
        }
    }

    struct Setup {
        let store: LocalStore
        let queue: UploadQueue
        let uploader: FakeUploader
        let job: UploadJob
        let clock: Locked<Int64>

        func advance(_ ms: Int64) { clock.withLock { $0 += ms } }
    }

    func setup() throws -> Setup {
        let clock = Locked<Int64>(1_000_000)
        let store = try LocalStore.open(memoryDatabase(), now: { clock.current }, deviceId: "dev1")
        let uploader = FakeUploader()
        let queue = UploadQueue(store: store, uploader: uploader, now: { clock.current })
        let mediaId = try store.insert(
            "media", companyId: testCompany,
            ["job_id": .string("j"), "kind": .string("photo"), "upload_state": .string("pending")])
        let job = UploadJob(
            mediaId: mediaId, companyId: testCompany, localPath: "/x.jpg",
            storagePath: "\(testCompany)/j/\(mediaId).jpg", mimeType: "image/jpeg")
        return Setup(store: store, queue: queue, uploader: uploader, job: job, clock: clock)
    }

    @Test func uploadsAndMarksTheMediaRowUploadedThroughSync() async throws {
        let s = try setup()
        try s.queue.enqueue(s.job)
        try s.queue.enqueue(s.job)
        #expect(try s.queue.waitingCount() == 1)
        #expect(
            try await s.queue.process()
                == UploadSummary(uploaded: 1, uploadedIds: [s.job.mediaId], failed: 0, waiting: 0))
        let row = try s.store.get("media", s.job.mediaId)
        #expect(row?["upload_state"] == .string("uploaded"))
        #expect(row?["storage_path"] == .string(s.job.storagePath))
        #expect(
            try s.store.pendingBatch(maxMutations: 10).mutations[0].fields["upload_state"]?.v == .string("uploaded"))
    }

    @Test func backsOffAfterAFailureAndRetriesLater() async throws {
        let s = try setup()
        try s.queue.enqueue(s.job)
        s.uploader.failures.withLock { $0 = 1 }
        let first = try await s.queue.process()
        #expect(first.failed == 1 && first.waiting == 1)
        let second = try await s.queue.process()
        #expect(second.uploaded == 0 && second.failed == 0 && second.waiting == 1)
        s.advance(30_000)
        let third = try await s.queue.process()
        #expect(third.uploaded == 1 && third.waiting == 0)
        let calls = s.uploader.calls.current
        #expect(calls.count == 2)
        // The second attempt resumes the upload the first one started.
        #expect(calls.map(\.resumeUrl) == [nil, "https://tus/\(s.job.mediaId)"])
    }

    @Test func listsWaitingFilesWithTheirLastErrorAndRetriesOnDemand() async throws {
        let s = try setup()
        try s.queue.enqueue(s.job)
        s.uploader.failures.withLock { $0 = 1 }
        _ = try await s.queue.process()
        #expect(try s.queue.waiting() == [WaitingUpload(mediaId: s.job.mediaId, attempts: 1, lastError: "timeout")])
        try s.queue.retryNow()
        let summary = try await s.queue.process()
        #expect(summary.uploaded == 1 && summary.waiting == 0)
    }

    @Test func addsTheResumeColumnToAVersion1Queue() throws {
        let db = try memoryDatabase()
        try db.execute(
            """
            create table upload_queue (
              media_id text primary key, company_id text not null, local_path text not null,
              storage_path text not null, mime_type text not null,
              attempts integer not null default 0, next_attempt_at integer not null default 0,
              last_error text)
            """)
        _ = try LocalStore.open(db)
        _ = try LocalStore.open(db)
        let columns = try db.query("pragma table_info(upload_queue)").compactMap { row -> String? in
            if case .text(let name)? = row["name"] { return name }
            return nil
        }
        #expect(columns.contains("resume_url"))
        #expect(columns.contains("record_table"))
    }

    @Test func uploadsASignatureImageWithoutTouchingAnyMediaRow() async throws {
        let s = try setup()
        let before = try s.store.pendingCount()
        try s.queue.enqueue(
            UploadJob(
                mediaId: "sig-1", recordTable: .signature, companyId: testCompany, localPath: "/sig-1.svg",
                storagePath: "\(testCompany)/j/signature-sig-1.svg", mimeType: "image/svg+xml"))
        #expect(try await s.queue.process() == UploadSummary(uploaded: 1, uploadedIds: [], failed: 0, waiting: 0))
        let call = s.uploader.calls.current.first
        #expect(call?.recordTable == .signature)
        #expect(call?.mimeType == "image/svg+xml")
        #expect(try s.store.pendingCount() == before)
    }
}
