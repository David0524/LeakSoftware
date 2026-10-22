import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// "Require a pool photo to finish a job" (owner, 2026-10-19; website server/reports.ts
/// `requireFinishPhoto`): what counts as the job's photo, and when the rule stops a finish.
@Suite @MainActor struct FinishPhotoTests {
    func shell(_ settings: JSONValue) throws -> Shell {
        let s = try Shell()
        try s.seedCompany(userId: "u1", settings: settings)
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "j1", "company_id": "c1", "type": "maintenance", "status": "in_progress"]),
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "j2", "company_id": "c1", "type": "maintenance", "status": "in_progress"]),
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "j3", "company_id": "c1", "type": "detection", "status": "in_progress"]),
                    // Not photos of this job: a video, a voice note, a deleted photo, another job's.
                    PulledRow(
                        table: "media", xid: "1",
                        row: ["id": "v1", "company_id": "c1", "job_id": "j1", "kind": "video"]),
                    PulledRow(
                        table: "media", xid: "1",
                        row: ["id": "a1", "company_id": "c1", "job_id": "j1", "kind": "audio"]),
                    PulledRow(
                        table: "media", xid: "1",
                        row: [
                            "id": "d1", "company_id": "c1", "job_id": "j1", "kind": "photo",
                            "deleted_at": "2026-10-19T12:00:00Z",
                        ]),
                    PulledRow(
                        table: "media", xid: "1",
                        row: ["id": "o1", "company_id": "c1", "job_id": "j2", "kind": "photo"]),
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        return s
    }

    @Test func onlyTheJobsLivePhotosCount() throws {
        let s = try shell(["require_finish_photo": true])
        let store = s.sync.store
        #expect(jobPhotoCount(store, jobId: "j1") == 0)
        #expect(jobPhotoCount(store, jobId: "j2") == 1)  // synced
        #expect(finishPhotoBlock(store, settings: ["require_finish_photo": true], jobId: "j1") == finishPhotoMessage)
        #expect(finishPhotoBlock(store, settings: ["require_finish_photo": true], jobId: "j2") == nil)

        // A photo taken offline counts while it waits in the outbox.
        let pending = try store.pendingCount()
        try s.sync.write(
            "media", id: "m1", companyId: "c1", ["job_id": "j1", "kind": "photo", "upload_state": "pending"])
        #expect(try store.pendingCount() == pending + 1)
        #expect(jobPhotoCount(store, jobId: "j1") == 1)
        #expect(finishPhotoBlock(store, settings: ["require_finish_photo": true], jobId: "j1") == nil)
        // Deleting it brings the rule back.
        try s.sync.softDelete("media", "m1")
        #expect(jobPhotoCount(store, jobId: "j1") == 0)
        #expect(finishPhotoBlock(store, settings: ["require_finish_photo": true], jobId: "j1") != nil)
    }

    /// Any job type moving to Done waits for the photo (website changeJobStatus); other moves don't.
    @Test func everyMoveToDoneIsChecked() throws {
        let on: JSONValue = ["require_finish_photo": true]
        let s = try shell(on)
        for job in ["j1", "j3"] {
            #expect(statusChangeBlock(.done, s.sync.store, settings: on, jobId: job) == finishPhotoMessage)
            for other in JobStatus.allCases where other != .done {
                #expect(statusChangeBlock(other, s.sync.store, settings: on, jobId: job) == nil)
            }
        }
        #expect(statusChangeBlock(.done, s.sync.store, settings: on, jobId: "j2") == nil)
        #expect(statusChangeBlock(.done, s.sync.store, settings: [:], jobId: "j3") == nil)
    }

    /// A repair job has no checklist (owner, 2026-10-22): rows an older one has never hold it up.
    @Test func aRepairJobNeverWaitsForAChecklist() throws {
        let on: JSONValue = ["require_checklist_to_finish": true]
        let s = try shell(on)
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "j4", "company_id": "c1", "type": "repair", "status": "in_progress"]),
                    PulledRow(
                        table: "checklist_item_result", xid: "1",
                        row: [
                            "id": "r4", "company_id": "c1", "job_id": "j4", "job_component_id": "jc4",
                            "status": "pending",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        #expect(jobChecklistToDo(s.sync.store, jobId: "j4") == 1)
        #expect(statusChangeBlock(.done, s.sync.store, settings: on, jobId: "j4") == nil)
    }

    /// Complete Job (owner, 2026-10-19): with "Finish the checklist first", every checklist item
    /// answered, then the photo; Settings › Team › Completing a job writes both rules.
    @Test func completeJobWaitsForTheChecklistThenThePhoto() throws {
        let both: JSONValue = ["require_checklist_to_finish": true, "require_finish_photo": true]
        let s = try shell(both)
        let store = s.sync.store
        try s.sync.write(
            "checklist_item_result", id: "r1", companyId: "c1",
            ["job_id": "j2", "job_component_id": "jc1", "status": "pending"])
        try s.sync.write(
            "checklist_item_result", id: "r2", companyId: "c1",
            ["job_id": "j2", "job_component_id": "jc2", "status": "pass"])
        #expect(jobChecklistToDo(store, jobId: "j2") == 1)
        #expect(statusChangeBlock(.done, store, settings: both, jobId: "j2") == finishChecklistMessage)
        try s.sync.write("checklist_item_result", id: "r1", companyId: "c1", ["status": "pass"])
        #expect(statusChangeBlock(.done, store, settings: both, jobId: "j2") == nil)  // j2 has a photo
        #expect(statusChangeBlock(.done, store, settings: both, jobId: "j1") == finishPhotoMessage)
        #expect(statusChangeBlock(.done, store, settings: ["require_checklist_to_finish": true], jobId: "j1") == nil)
        #expect(CompleteJobText.spoken("Maria Lopez") == "Complete Job for Maria Lopez")

        // Settings: the two switches, with the website's words, keeping the other settings.
        #expect(CompleteJobSetting.allCases.map(\.label) == ["Finish the checklist first", "Take a pool photo first"])
        #expect(CompleteJobSetting.checklist.isOn(both) && !CompleteJobSetting.photo.isOn([:]))
        try ConfigWrites.setCompleteJob(
            s.sync, companyId: "c1", settings: ["services": "pool"], .checklist, on: true)
        let company = try #require(try store.get("company", "c1"))
        #expect(company["settings"] == ["services": "pool", "require_checklist_to_finish": true])
    }

    /// Mark Complete on every Today stop (owner, 2026-10-19): a visit is completed with the
    /// shop's rules; a leak or repair stop is done for the day and can be undone.
    @Test func markCompleteOnTodayStops() throws {
        let s = try shell(["require_finish_photo": true])
        let store = s.sync.store
        let day = "2026-10-19"
        let rules: JSONValue = ["require_finish_photo": true]
        // A leak job: its stop is done for the day, its status kept; then undone.
        #expect(
            try StopWrites.mark(s.sync, companyId: "c1", settings: rules, jobId: "j3", complete: true, day: day) == nil)
        var row = try #require(try store.get("job", "j3"))
        #expect(row["stop_done_on"] == "2026-10-19" && row["status"] == "in_progress")
        func stop(_ id: String) throws -> ScheduleJob {
            ScheduleJob(try #require(try jobViews(store, companyId: "c1").first { $0.id == id }))
        }
        let leak = try stop("j3")
        #expect(leak.doneOn(day) && !leak.doneOn("2026-10-20"))
        #expect(markStopTitle(leak, day: day) == "Mark Not Complete")
        try StopWrites.mark(s.sync, companyId: "c1", settings: rules, jobId: "j3", complete: false, day: day)
        row = try #require(try store.get("job", "j3"))
        let undone = try stop("j3")
        #expect(row["stop_done_on"] == .null && markStopTitle(undone, day: day) == "Mark Complete")
        // A visit waits for its photo, then completes; done, it offers Reopen Visit (owner,
        // 2026-10-20), which puts it back in progress.
        #expect(
            try StopWrites.mark(s.sync, companyId: "c1", settings: rules, jobId: "j1", complete: true, day: day)
                == finishPhotoMessage)
        #expect(try store.get("job", "j1")?["status"] == "in_progress")
        #expect(
            try StopWrites.mark(s.sync, companyId: "c1", settings: rules, jobId: "j2", complete: true, day: day) == nil)
        #expect(try store.get("job", "j2")?["status"] == "done")
        let visit = try stop("j2")
        #expect(markStopTitle(visit, day: day) == "Reopen Visit")
        #expect(todayUndo(visit, day: day) == TodayUndo(label: "Reopen Visit", reopen: true))
        #expect(
            try StopWrites.mark(s.sync, companyId: "c1", settings: rules, jobId: "j2", complete: false, day: day)
                == nil)
        #expect(try store.get("job", "j2")?["status"] == "in_progress")
        let reopened = try stop("j2")
        #expect(!reopened.doneOn(day) && markStopTitle(reopened, day: day) == "Mark Complete")
        #expect(MarkStopText.spoken("Mark Complete", "Maria Lopez") == "Mark Complete for Maria Lopez")
        #expect(MarkStopText.spoken("Reopen Visit", "Maria Lopez") == "Reopen Visit for Maria Lopez")
    }

    @Test func theRuleIsOffUnlessTheShopTurnsItOn() throws {
        let s = try shell([:])
        for settings: JSONValue? in [
            nil, .null, [:], ["require_finish_photo": false], ["require_finish_photo": "true"],
        ] {
            #expect(finishPhotoBlock(s.sync.store, settings: settings, jobId: "j1") == nil)
        }
        #expect(finishPhotoMessage == "Take a photo of the pool before finishing this job.")
        #expect(FinishPhotoText.takePhoto == "Take Photo")
    }
}
