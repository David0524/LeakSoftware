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
            #expect(statusChangePhotoBlock(.done, s.sync.store, settings: on, jobId: job) == finishPhotoMessage)
            for other in JobStatus.allCases where other != .done {
                #expect(statusChangePhotoBlock(other, s.sync.store, settings: on, jobId: job) == nil)
            }
        }
        #expect(statusChangePhotoBlock(.done, s.sync.store, settings: on, jobId: "j2") == nil)
        #expect(statusChangePhotoBlock(.done, s.sync.store, settings: [:], jobId: "j3") == nil)
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
