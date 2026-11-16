import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Service issues on the phone (docs/design/2026-11-16-service-issues.md): reported on a visit,
/// resolved, reopened and made into a job, all as synced rows written offline (as the Android app's
/// apps/mobile/test/service-issues.test.ts).
@Suite @MainActor struct ServiceIssuesAppTests {
    @Test func reportResolveReopenAndMakeAJobWithThePhotos() throws {
        let shell = try Shell()
        let sync = shell.sync
        try IssueWrites.save(
            sync, companyId: "c1", id: "i1", customerId: "cust", propertyId: "pool", jobId: "visit",
            description: " Cracked skimmer throat ", suggested: .repair, userId: "tech")
        let saved = try #require(findIssue(sync.store, id: "i1"))
        #expect(saved.description == "Cracked skimmer throat")
        #expect(saved.status == .open && saved.reportedBy == "tech" && saved.suggestedType == .repair)
        #expect(jobIssues(sync.store, jobId: "visit").map(\.id) == ["i1"])
        #expect(openIssueCount(shopIssues(sync.store, companyId: "c1"), userId: "tech", role: "tech") == 1)

        // A photo taken on the visit, linked to the issue.
        try sync.write(
            "media", id: "m1", companyId: "c1",
            [
                "job_id": "visit", "service_issue_id": "i1", "kind": "photo", "storage_path": "c1/visit/m1.jpg",
                "upload_state": "pending", "captured_at": "2026-11-16T15:00:00Z",
            ])
        #expect(issueMedia(sync.store, saved).map(\.id) == ["m1"])

        try IssueWrites.resolve(sync, saved, companyId: "c1", userId: "owner", note: " Customer will call ")
        let resolved = try #require(findIssue(sync.store, id: "i1"))
        #expect(resolved.status == .resolved && resolved.resolutionNote == "Customer will call")
        try IssueWrites.reopen(sync, resolved, companyId: "c1")
        let reopened = try #require(findIssue(sync.store, id: "i1"))
        #expect(reopened.status == .open && reopened.resolvedBy == nil)

        let jobId = try IssueWrites.convert(sync, reopened, type: .repair, companyId: "c1", userId: "owner")
        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["type"]?.string == "repair" && job["status"]?.string == "unscheduled")
        #expect(job["property_id"]?.string == "pool" && job["bill_to_customer_id"]?.string == "cust")
        #expect(job["summary_notes"]?.string == "Cracked skimmer throat")
        let converted = try #require(findIssue(sync.store, id: "i1"))
        #expect(converted.status == .converted && converted.convertedJobId == jobId)
        let copies = try sync.store.list("media", jobId: jobId)
        #expect(copies.count == 1)
        #expect(copies.first?["storage_path"]?.string == "c1/visit/m1.jpg")
        #expect(copies.first?["service_issue_id"]?.string == "i1")
        #expect(copies.first?.id != "m1")
    }
}
