import Foundation
import SundeckCore
import SundeckSync

// "Require a pool photo to finish a job" (owner setting, 2026-10-19; website
// server/reports.ts `requireFinishPhoto`). A client check on purpose: a database trigger would
// reject an offline status change that syncs before its photo row.

/// The job's photos on this phone: `media` rows of kind photo, not deleted. Photos still
/// waiting to upload count (their row is there, in the outbox).
public func jobPhotoCount(_ store: LocalStore, jobId: String) -> Int {
    ((try? store.list("media", jobId: jobId)) ?? [])
        .filter { $0["job_id"]?.string == jobId && $0["kind"]?.string == "photo" && $0["deleted_at"]?.string == nil }
        .count
}

/// Why the job can't be finished yet (`finishPhotoMessage`), or nil when it can: the shop's
/// setting is off, or the job has a photo. Checked before Mark Done on a visit and before a
/// report is finished or a draft sent.
public func finishPhotoBlock(_ store: LocalStore, settings: JSONValue?, jobId: String) -> String? {
    guard requiresFinishPhoto(settings), jobPhotoCount(store, jobId: jobId) == 0 else { return nil }
    return finishPhotoMessage
}

/// Whether moving a job to `to` waits for its pool photo: any job type moving to Done, as the
/// website's changeJobStatus checks (`finishPhotoMessage`), else nil.
public func statusChangePhotoBlock(
    _ to: JobStatus, _ store: LocalStore, settings: JSONValue?, jobId: String
) -> String? {
    to == .done ? finishPhotoBlock(store, settings: settings, jobId: jobId) : nil
}

/// The photo notice's words.
public enum FinishPhotoText {
    public static let takePhoto = "Take Photo"
    /// After the photo is saved: the tech finishes again.
    public static let taken = "Photo added. You can finish the job now."
}
