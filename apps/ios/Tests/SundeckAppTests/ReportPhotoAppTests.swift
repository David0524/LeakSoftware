import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// Require a Photo (owner, 2026-10-25): the phone decides from its own copy of the shop's
/// settings and the visit's photos, and the switch saves through sync.
@Suite @MainActor struct ReportPhotoAppTests {
    func shell(_ settings: JSONValue) throws -> Shell {
        let s = try Shell()
        try s.seedCompany(userId: "u1", settings: settings)
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "j1", "company_id": "c1", "type": "maintenance", "status": "done"]),
                    PulledRow(
                        table: "media", xid: "1",
                        row: ["id": "v1", "company_id": "c1", "job_id": "j1", "kind": "video"]),
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        return s
    }

    @Test func aVisitWithNoPhotoWaits() throws {
        let on: JSONValue = ["require_report_photo": true]
        let s = try shell(on)
        let store = s.sync.store
        #expect(visitReportPhotoBlock(store, settings: on, jobId: "j1") == ReportPhotoText.blocked)
        #expect(visitReportPhotoBlock(store, settings: [:], jobId: "j1") == nil)
        // The Complete Job photo rule is its own switch.
        #expect(visitReportPhotoBlock(store, settings: ["require_finish_photo": true], jobId: "j1") == nil)
        // A photo taken offline counts while it waits in the outbox.
        try s.sync.write(
            "media", id: "m1", companyId: "c1", ["job_id": "j1", "kind": "photo", "upload_state": "pending"])
        #expect(visitReportPhotoBlock(store, settings: on, jobId: "j1") == nil)
    }

    @Test func theSwitchKeepsTheOtherSettings() throws {
        let s = try shell(["visit_reports": "auto"])
        try VisitReportSettingsWrites.setRequirePhoto(
            s.sync, companyId: "c1", settings: ["visit_reports": "auto"], true)
        let row = try #require(try s.sync.store.get("company", "c1"))
        #expect(row["settings"]?["require_report_photo"] == .bool(true))
        #expect(row["settings"]?["visit_reports"] == .string("auto"))
    }
}
