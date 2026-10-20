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
/// website's `requireCompletable` counts them. A pool inspection counts only the questions its
/// gates leave open (`inspectionProgress().toDo`, 2026-10-20).
public func jobChecklistToDo(_ store: LocalStore, jobId: String) -> Int {
    if let job = try? store.get("job", jobId), job["type"]?.string == JobType.inspection.rawValue,
        let companyId = job["company_id"]?.string
    {
        return checklistToDo(
            config: InspectionConfig(store, companyId: companyId), inspection: JobInspection(store, jobId: jobId),
            jobType: .inspection)
    }
    return ((try? store.list("checklist_item_result", jobId: jobId)) ?? [])
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

/// Mark Complete on a Today stop's words (owner, 2026-10-19).
public enum MarkStopText {
    public static let complete = "Mark Complete"
    public static let notComplete = TodayUndo.markNotComplete.label
    public static let reopenVisit = TodayUndo.reopenVisit.label
    public static let openJob = "Open Job"

    /// What VoiceOver reads: "Mark Complete for Maria Lopez", "Reopen Visit for Maria Lopez".
    public static func spoken(_ title: String, _ customer: String) -> String { "\(title) for \(customer)" }
}

/// What a done stop on Today offers (core `todayUndo`, owner 2026-10-20): Reopen Visit on a
/// completed maintenance visit, Mark Not Complete on a leak or repair stop done today, else nil.
public func todayUndo(_ job: ScheduleJob, day: String) -> TodayUndo? {
    todayUndo(type: job.type.rawValue, status: job.status.rawValue, stopDoneOn: job.stopDoneOn, day: day)
}

/// The stop's button: Mark Complete, or what a done stop offers (Reopen Visit, Mark Not
/// Complete); nil when a done stop offers nothing (a job further on).
public func markStopTitle(_ job: ScheduleJob, day: String) -> String? {
    job.doneOn(day) ? todayUndo(job, day: day)?.label : MarkStopText.complete
}

@MainActor
public enum StopWrites {
    /// Mark Complete (`complete`), or Reopen Visit and Mark Not Complete, on a Today stop, through
    /// the sync layer (website `markStop`): a maintenance visit is completed (Complete Job, with
    /// the shop's rules) or reopened (back to in progress); a leak or repair job keeps its status
    /// and its stop is marked done for `day` (core `markCompleteValues`), or cleared. Returns
    /// why it was stopped, or nil.
    @discardableResult
    public static func mark(
        _ sync: SyncService, companyId: String, settings: JSONValue?, jobId: String, complete: Bool, day: String,
        visitReports: VisitReportQueue? = nil
    ) throws -> String? {
        guard let row = try sync.store.get("job", jobId) else { return "Job not found." }
        let type = row["type"]?.string ?? "detection"
        if type == "maintenance" {
            if !complete {
                // Reopen Visit (owner, 2026-10-20), as on the visit's page.
                try sync.write("job", id: jobId, companyId: companyId, jobStatusValues(.inProgress, job: row))
                return nil
            }
            if let block = statusChangeBlock(.done, sync.store, settings: settings, jobId: jobId) { return block }
            try sync.write("job", id: jobId, companyId: companyId, jobStatusValues(.done, job: row))
            visitReports?.completed(jobType: .maintenance, jobId: jobId, settings: settings)
            return nil
        }
        try sync.write(
            "job", id: jobId, companyId: companyId,
            complete ? markCompleteValues(type: type, day: day) : ["stop_done_on": .null])
        return nil
    }

    /// On My Way, kept on the job (owner, 2026-10-20: Today's card; website `recordOnMyWay`):
    /// when it was sent and the arrival it promised (now plus the drive, at least 5 minutes),
    /// through the sync layer, so the website, the office and a second phone show "On the way,
    /// arriving 9:42".
    public static func recordOnMyWay(
        _ sync: SyncService, companyId: String, jobId: String, driveMinutes: Int, now: Date = Date()
    ) throws {
        try sync.write("job", id: jobId, companyId: companyId, onMyWayValues(now: now, driveMinutes: driveMinutes))
    }
}

/// The job's On My Way columns: sent now, arriving after the drive (at least 5 minutes).
public func onMyWayValues(now: Date, driveMinutes: Int) -> Row {
    [
        "on_my_way_at": .string(isoString(now)),
        "arrive_at": .string(isoString(now.addingTimeInterval(TimeInterval(max(5, driveMinutes) * 60)))),
    ]
}
