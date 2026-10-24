import Foundation
import SundeckCore
import SundeckStorage

/// One file to upload. Port of packages/sync/src/uploads.ts.
public struct UploadJob: Equatable, Sendable {
    /// Which row the file belongs to: media rows are marked uploaded when done; signature rows
    /// already hold their path.
    public enum RecordTable: String, Sendable {
        case media
        case signature
    }

    /// The row the file belongs to: a media id, or a signature id when `recordTable` says so.
    public var mediaId: String
    public var recordTable: RecordTable
    public var companyId: String
    public var localPath: String
    /// media/{company_id}/{job_id}/{media_id}.{ext} without the bucket name.
    public var storagePath: String
    public var mimeType: String
    /// Saved TUS upload URL from an earlier, interrupted attempt.
    public var resumeUrl: String?

    public init(
        mediaId: String, recordTable: RecordTable = .media, companyId: String, localPath: String,
        storagePath: String, mimeType: String, resumeUrl: String? = nil
    ) {
        self.mediaId = mediaId
        self.recordTable = recordTable
        self.companyId = companyId
        self.localPath = localPath
        self.storagePath = storagePath
        self.mimeType = mimeType
        self.resumeUrl = resumeUrl
    }
}

/// How an upload ended. `exists` means the object was already there (an earlier attempt
/// finished but the app died before recording it); that counts as success.
public enum UploadResult: Equatable, Sendable {
    case uploaded
    case exists
}

/// Uploads one file.
public protocol Uploader: Sendable {
    func upload(_ job: UploadJob, saveResumeUrl: (String?) throws -> Void) async throws -> UploadResult
}

public struct UploadSummary: Equatable, Sendable {
    public var uploaded: Int
    /// Media ids confirmed in this run (signatures are counted in `uploaded` only).
    public var uploadedIds: [String]
    public var failed: Int
    public var waiting: Int

    public init(uploaded: Int, uploadedIds: [String], failed: Int, waiting: Int) {
        self.uploaded = uploaded
        self.uploadedIds = uploadedIds
        self.failed = failed
        self.waiting = waiting
    }
}

/// A file still waiting, with its last error (for the sync screen).
public struct WaitingUpload: Equatable, Sendable {
    public var mediaId: String
    public var attempts: Int
    public var lastError: String?

    public init(mediaId: String, attempts: Int, lastError: String?) {
        self.mediaId = mediaId
        self.attempts = attempts
        self.lastError = lastError
    }
}

private let baseDelayMs: Int64 = 30_000
private let maxDelayMs: Int64 = 60 * 60_000

/// Background media upload queue (BUILD_PLAN 4.5). Files stay on the device until the upload
/// is confirmed; the media row is then marked uploaded through normal sync.
public final class UploadQueue: @unchecked Sendable {
    private let store: LocalStore
    private let uploader: any Uploader
    private let now: () -> Int64
    private let lock = NSLock()
    private var running: Task<UploadSummary, Error>?

    /// `now` is milliseconds since 1970 (tests set it).
    public init(
        store: LocalStore, uploader: any Uploader,
        now: @escaping () -> Int64 = { Int64((Date().timeIntervalSince1970 * 1000).rounded(.down)) }
    ) {
        self.store = store
        self.uploader = uploader
        self.now = now
    }

    private var database: Database { store.database }

    /// Adds a file. Safe to call twice for the same media id. `resumeUrl` is ignored.
    public func enqueue(_ job: UploadJob) throws {
        try database.query(
            """
            insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type, record_table)
            values (?, ?, ?, ?, ?, ?) on conflict (media_id) do nothing
            """,
            [
                .text(job.mediaId), .text(job.companyId), .text(job.localPath), .text(job.storagePath),
                .text(job.mimeType), .text(job.recordTable.rawValue),
            ])
    }

    public func waitingCount() throws -> Int {
        Int(try database.query("select count(*) as n from upload_queue").first?["n"]?.integer ?? 0)
    }

    /// Files still waiting, oldest first, with the last error (for the sync screen).
    public func waiting() throws -> [WaitingUpload] {
        try database.query("select media_id, attempts, last_error from upload_queue order by rowid").map {
            WaitingUpload(
                mediaId: $0["media_id"]?.text ?? "", attempts: Int($0["attempts"]?.integer ?? 0),
                lastError: $0["last_error"]?.text)
        }
    }

    /// Tries everything now, ignoring backoff (Retry button, reconnect).
    public func retryNow() throws {
        try database.execute("update upload_queue set next_attempt_at = 0")
    }

    /// Uploads everything that is due. One run at a time: a call during a run gets that run's
    /// result.
    public func process() async throws -> UploadSummary {
        let task: Task<UploadSummary, Error> = lock.withLock {
            if let running { return running }
            let task = Task<UploadSummary, Error> {
                defer { self.lock.withLock { self.running = nil } }
                return try await self.run()
            }
            running = task
            return task
        }
        return try await task.value
    }

    private func run() async throws -> UploadSummary {
        let due = try database.query(
            "select * from upload_queue where next_attempt_at <= ? order by rowid", [.integer(now())])

        var uploadedIds: [String] = []
        var done = 0
        var failed = 0
        // Signing out clears the phone (`LocalStore.clearAll`) and may do so mid-upload: the
        // files left in this run, and the marks for ones that finish, belong to the sign-in that
        // left.
        let generation = store.generation
        for row in due {
            if store.generation != generation { break }
            let job = UploadJob(
                mediaId: row["media_id"]?.text ?? "",
                recordTable: UploadJob.RecordTable(rawValue: row["record_table"]?.text ?? "") ?? .media,
                companyId: row["company_id"]?.text ?? "",
                localPath: row["local_path"]?.text ?? "",
                storagePath: row["storage_path"]?.text ?? "",
                mimeType: row["mime_type"]?.text ?? "",
                resumeUrl: row["resume_url"]?.text)
            let attempts = row["attempts"]?.integer ?? 0
            do {
                _ = try await uploader.upload(job) { url in
                    try self.database.query(
                        "update upload_queue set resume_url = ? where media_id = ?",
                        [url.map(SQLValue.text) ?? .null, .text(job.mediaId)])
                }
                try database.transaction {
                    try store.checkGeneration(generation)
                    if job.recordTable == .media {
                        try store.write(
                            "media", id: job.mediaId, companyId: job.companyId,
                            ["upload_state": .string("uploaded"), "storage_path": .string(job.storagePath)])
                    }
                    try database.query("delete from upload_queue where media_id = ?", [.text(job.mediaId)])
                }
                if job.recordTable == .media { uploadedIds.append(job.mediaId) }
                done += 1
            } catch is SyncCancelled {
                break
            } catch {
                if store.generation != generation { break }
                // 30 s doubling per attempt, at most an hour (2^7 × 30 s is already past it).
                let delay = attempts >= 7 ? maxDelayMs : min(baseDelayMs << attempts, maxDelayMs)
                try database.query(
                    "update upload_queue set attempts = attempts + 1, next_attempt_at = ?, last_error = ? where media_id = ?",
                    [.integer(now() + delay), .text(errorMessage(error)), .text(job.mediaId)])
                failed += 1
            }
        }
        return UploadSummary(uploaded: done, uploadedIds: uploadedIds, failed: failed, waiting: try waitingCount())
    }
}

/// The error's message, like `e.message` in TypeScript.
private func errorMessage(_ error: Error) -> String {
    if let error = error as? LocalizedError, let text = error.errorDescription { return text }
    return String(describing: error)
}
