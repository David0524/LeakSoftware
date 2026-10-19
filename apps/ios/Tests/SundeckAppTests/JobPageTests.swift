import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// The job page (spec 5.4): its sections, header and Details, without SwiftUI. Matches
/// apps/web/src/app/(office)/jobs/[id]/page.tsx and components/customer-links.tsx.
@MainActor @Suite struct JobPageTests {
    func view(
        type: String = "detection", status: String = "scheduled", job extra: Row = [:], property: Row? = nil,
        customer: Row? = nil
    ) -> JobView {
        var job: Row = ["id": "j1", "company_id": "c1", "type": .string(type), "status": .string(status)]
        job.merge(extra) { $1 }
        return JobView(id: "j1", job: job, property: property, customer: customer)
    }

    @Test func maintenanceVisitsHaveNoFindingsSection() {
        #expect(
            JobPageSection.sections(for: .detection).map(\.title) == [
                "Details", "Checklist", "Findings", "Photos", "Wrap-Up",
            ])
        #expect(JobPageSection.sections(for: .repair).count == 5)
        #expect(
            JobPageSection.sections(for: .maintenance).map(\.title) == ["Details", "Checklist", "Photos", "Wrap-Up"])
    }

    @Test func theSectionShownIsRememberedPerJob() {
        let job = "job-\(UUID())"
        #expect(JobSectionMemory.section(for: job, type: .detection) == .details)
        JobSectionMemory.remember(.findings, for: job)
        #expect(JobSectionMemory.section(for: job, type: .detection) == .findings)
        // A part the job doesn't have falls back to Details.
        #expect(JobSectionMemory.section(for: job, type: .maintenance) == .details)
    }

    @Test func theHeaderSaysTypeTimeAndTheNextSteps() throws {
        #expect(jobTypeLabel(view()) == "Leak detection")
        #expect(jobTypeLabel(view(type: "repair")) == "Repair")
        #expect(
            jobTypeLabel(view(type: "maintenance", job: ["service_plan_id": "sp1"], customer: ["id": "cu1"]))
                == "Maintenance plan")
        #expect(jobHeaderTime(view(), now: Date(), timeZone: "America/Phoenix") == "Not scheduled")
        let started = view(status: "in_progress", job: ["started_at": "2026-10-11T16:00:00Z"])
        #expect(
            jobHeaderTime(started, now: Date(timeIntervalSince1970: 1_792_000_000), timeZone: "America/Phoenix")
                .hasPrefix("Started "))

        // Cancel Job sits at the end of Details, not in the header.
        let scheduled = jobHeaderActions(.scheduled, type: .detection)
        #expect(scheduled.contains(.inProgress) && !scheduled.contains(.canceled))
        #expect(jobCanCancel(.scheduled, type: .detection))
        #expect(scheduled.map(jobActionTitle).contains("Start Job"))
        #expect(jobActionTitle(.scheduled) == "Move Back to Scheduled")
        #expect(jobActionTitle(.unscheduled) == "Reopen Job")

        // Starting writes the start time once.
        let values = jobStatusValues(.inProgress, job: [:])
        #expect(values["status"] == "in_progress" && values["started_at"]?.string != nil)
        #expect(jobStatusValues(.inProgress, job: ["started_at": "2026-10-11T16:00:00Z"])["started_at"] == nil)
    }

    @Test func detailsFollowTheWebsite() throws {
        let job = view(
            job: [
                "assigned_user_id": "u1", "second_tech_id": "u9", "fee_cents": 64900,
                "intake": ["reason": "Pool water level dropping", "spa": ["Jets", "Heater"], "blank": ""],
            ],
            property: [
                "id": "p1", "address_line1": "41 Demo Lane", "city": "Mesa", "state": "AZ", "postal_code": "85201",
                "has_pool": true, "has_spa": true, "pool_type": "gunite_plaster", "access_notes": "Gate code 4417",
                "approx_gallons": 20000,
            ],
            customer: ["id": "cu1", "name": "Riley Rivera", "phone": "(480) 555-0188", "email": "riley@example.com"])
        let settings: JSONValue = [
            "intake_questions": [
                ["key": "reason", "label": "Why they called"], ["key": "blank", "label": "Anything else"],
                ["key": "spa", "label": "Spa parts"],
            ]
        ]
        let d = JobDetails(
            job: job, team: [TeamProfile(id: "u1", fullName: "Tony Tech", email: nil)], settings: settings)
        #expect(d.customerName == "Riley Rivera")
        #expect(d.contactLine == "(480) 555-0188" && d.contactDetail == "riley@example.com")
        #expect(d.address == "41 Demo Lane, Mesa, AZ 85201")
        #expect(d.poolDetail == "Gunite / plaster · Pool and spa · 20,000 gallons")
        #expect(d.accessNotes == "Gate code 4417")
        #expect(d.needsMapLocation)
        #expect(d.tech == "Tony Tech" && d.with == "Teammate")
        #expect(d.fee == "$649.00")
        #expect(
            d.intake == [
                IntakeAnswer(question: "Why they called", answer: "Pool water level dropping"),
                IntakeAnswer(question: "Spa parts", answer: "Jets, Heater"),
            ])

        let bare = JobDetails(job: view(), team: [], settings: .null)
        #expect(bare.customerName == nil && bare.contactLine == nil && bare.address == nil)
        #expect(bare.tech == "Nobody yet" && bare.with == nil && bare.fee == nil && bare.intake.isEmpty)
        #expect(!bare.needsMapLocation)

        let emailOnly = JobDetails(
            job: view(customer: ["id": "cu1", "name": "Sam", "email": "sam@example.com"]), team: [], settings: .null)
        #expect(emailOnly.contactLine == "sam@example.com" && emailOnly.contactDetail == nil)
    }

    @Test func markLocationHereSavesTheGPSPosition() throws {
        let row: JSONValue = [
            "address_line1": "41 Demo Lane", "city": "Mesa", "state": "AZ", "postal_code": "85201", "has_pool": true,
            "has_spa": false,
        ]
        let values = poolLocationValues(try row.decode(Property.self), latitude: 33.4, longitude: -111.8)
        #expect(values["latitude"] == .number(33.4) && values["longitude"] == .number(-111.8))
        #expect(values["location_source"] == "gps")
        #expect(values["geocoded_address"] == "41 Demo Lane, Mesa, AZ 85201")
    }

    @Test func customerLinksListOnlyLiveOnesNewestFirst() {
        let now = Date(timeIntervalSince1970: 1_792_000_000)  // 2026-10-15
        let rows: [Row] = [
            [
                "id": "l1", "report_id": "r1", "created_at": "2026-10-13T10:00:00Z", "view_count": 1,
                "last_viewed_at": "2026-10-15T17:00:00Z", "expires_at": "2027-04-13T17:00:00Z",
            ],
            [
                "id": "l2", "invoice_id": "i1", "created_at": "2026-10-14T10:00:00Z", "view_count": 2,
                "last_viewed_at": "2026-10-15T17:00:00Z", "expires_at": "2027-04-13T17:00:00Z",
            ],
            ["id": "l3", "quote_id": "q1", "created_at": "2026-10-12T10:00:00Z", "view_count": 0],
            [
                "id": "l4", "report_id": "r0", "created_at": "2026-10-01T10:00:00Z",
                "revoked_at": "2026-10-02T10:00:00Z",
            ],
            [
                "id": "l5", "report_id": "r0", "created_at": "2026-04-01T10:00:00Z",
                "expires_at": "2026-10-01T10:00:00Z",
            ],
        ]
        let links = customerLinkRows(rows, now: now, timeZone: "America/Phoenix")
        #expect(links.map(\.id) == ["l2", "l1", "l3"])
        #expect(links.map(\.what) == ["Invoice", "Report", "Quote"])
        #expect(links[0].detail == "Opened 2 times, last Oct 15 · Works until Apr 13")
        #expect(links[1].detail == "Opened once, last Oct 15 · Works until Apr 13")
        #expect(links[2].detail == "Not opened yet")
    }
}
