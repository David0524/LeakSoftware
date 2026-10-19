import Foundation
import SundeckCore
import SundeckSync

// Completing a job (owner settings, 2026-10-19: "Finish the checklist first", "Take a pool photo
// first"; website server/reports.ts `requireFinishPhoto` and `requireCompletable`). A client
// check on purpose: a database trigger would reject an offline status change that syncs before
// its photo or answers.

/// The job's photos on this phone: `media` rows of kind photo, not deleted. Photos still
/// waiting to upload count (their row is there, in the outbox).
public func jobPhotoCount(_ store: LocalStore, jobId: String) -> Int {
    ((try? store.list("media", jobId: jobId)) ?? [])
        .filter { $0["job_id"]?.string == jobId && $0["kind"]?.string == "photo" && $0["deleted_at"]?.string == nil }
        .count
}

/// Why the job can't be finished yet (`finishPhotoMessage`), or nil when it can: the shop's
/// setting is off, or the job has a photo. Checked before Complete Job on a visit and before a
/// report is finished or a draft sent.
public func finishPhotoBlock(_ store: LocalStore, settings: JSONValue?, jobId: String) -> String? {
    guard requiresFinishPhoto(settings), jobPhotoCount(store, jobId: jobId) == 0 else { return nil }
    return finishPhotoMessage
}

/// Checklist items still to do on the job on this phone: its results still pending, as the
/// website's `requireCompletable` counts them.
public func jobChecklistToDo(_ store: LocalStore, jobId: String) -> Int {
    ((try? store.list("checklist_item_result", jobId: jobId)) ?? [])
        .filter {
            $0["job_id"]?.string == jobId && $0["status"]?.string == "pending" && $0["deleted_at"]?.string == nil
        }
        .count
}

/// What stops Complete Job (core `completeJobBlocker`) from what's on this phone: the checklist
/// first, then the pool photo (photos waiting to upload count). Nil when it can be completed.
public func completeJobBlock(_ store: LocalStore, settings: JSONValue?, jobId: String) -> String? {
    completeJobBlocker(
        settings, checklistToDo: jobChecklistToDo(store, jobId: jobId), photos: jobPhotoCount(store, jobId: jobId))
}

/// Whether moving a job to `to` waits for something: any job type moving to Done, as the
/// website's changeJobStatus checks (`requireCompletable`), else nil.
public func statusChangeBlock(
    _ to: JobStatus, _ store: LocalStore, settings: JSONValue?, jobId: String
) -> String? {
    to == .done ? completeJobBlock(store, settings: settings, jobId: jobId) : nil
}

/// Complete Job's words (owner, 2026-10-19).
public enum CompleteJobText {
    public static let title = "Complete Job"
    public static let busy = "Completing…"
    public static let openJob = "Open Job"
    /// Today's pill, for VoiceOver: "Complete Job for Maria Lopez".
    public static func spoken(_ customer: String) -> String { "Complete Job for \(customer)" }
}

/// The photo notice's words.
public enum FinishPhotoText {
    public static let takePhoto = "Take Photo"
    /// After the photo is saved: the tech finishes again.
    public static let taken = "Photo added. You can finish the job now."
}
