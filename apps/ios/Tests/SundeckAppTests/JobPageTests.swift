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
            JobPageSection.sections(for: .maintenance).map(\.title) == ["Details", "Checklist", "Photos"])
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
        // Buttons from core's jobActionLabel (owner, 2026-10-19).
        #expect(scheduled.map { jobActionLabel(from: .scheduled, to: $0) } == ["Unschedule", "Start Job"])
        #expect(
            jobHeaderActions(.canceled, type: .detection).map { jobActionLabel(from: .canceled, to: $0) } == [
                "Reopen Job"
            ])
        #expect(
            jobHeaderActions(.done, type: .maintenance).map { jobActionLabel(from: .done, to: $0) } == ["Reopen Visit"])
        #expect(jobActionLabel(from: .inProgress, to: .scheduled) == "Move Back to Scheduled")

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
        #expect(d.tech == "Tony Tech" && d.with == "Teammate")
        #expect(d.fee == "$649.00")
        #expect(d.feeLabel == "Detection fee" && d.marksLeakLocation)
        #expect(d.feeFooter == "The detection fee is shown on the report.")
        // Off leak detection the fee is a price and there's no leak checkbox (owner, 2026-10-19).
        for type in ["repair", "maintenance"] {
            let other = JobDetails(job: view(type: type), team: [], settings: .null)
            #expect(other.feeLabel == "Price" && !other.marksLeakLocation)
            #expect(other.feeFooter == "Billed on the invoice.")
        }
        #expect(
            d.intake == [
                IntakeAnswer(question: "Why they called", answer: "Pool water level dropping"),
                IntakeAnswer(question: "Spa parts", answer: "Jets, Heater"),
            ])

        let bare = JobDetails(job: view(), team: [], settings: .null)
        #expect(bare.customerName == nil && bare.contactLine == nil && bare.address == nil)
        #expect(bare.tech == "Nobody yet" && bare.with == nil && bare.fee == nil && bare.intake.isEmpty)

        let emailOnly = JobDetails(
            job: view(customer: ["id": "cu1", "name": "Sam", "email": "sam@example.com"]), team: [], settings: .null)
        #expect(emailOnly.contactLine == "sam@example.com" && emailOnly.contactDetail == nil)
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

    @Test func theNextStepBarOffersTheNextThing() {
        func steps(
            _ section: JobPageSection, type: String = "detection", status: String = "in_progress",
            tests: Bool = true, next: WrapUpNext? = nil, visit: VisitReportBarAction? = nil
        ) -> [String] {
            nextStepActions(
                view(type: type, status: status), section: section, hasTestTypes: tests, wrapUp: next,
                visitAction: visit
            ).map(\.title)
        }
        let review = wrapUp(
            WrapUpInput(
                jobType: "detection", customer: "Maria Alvarez", reportOn: true, hasDraft: true, sentVersion: nil,
                unsignedReason: nil, findings: 2, tests: 5, signers: [], quotes: [], invoices: [])
        ).next
        // Start Job wins while the job can be started, on any section.
        #expect(steps(.findings, status: "scheduled") == ["Start Job"])
        #expect(steps(.details, status: "unscheduled") == ["Start Job"])
        #expect(steps(.checklist, type: "maintenance", status: "scheduled") == ["Start Job"])
        #expect(steps(.checklist, type: "maintenance") == ["Complete Job"])
        #expect(steps(.checklist).isEmpty)
        #expect(steps(.checklist, type: "maintenance", status: "done").isEmpty)
        #expect(steps(.findings) == ["Add Test", "Add Finding"])
        #expect(steps(.findings, tests: false) == ["Add Finding"])
        #expect(steps(.photos) == ["Add Photo", "Add Video"])
        // Wrap-Up's next step (owner, 2026-10-22), until every step is done.
        #expect(review?.action == "Review with Customer")
        #expect(steps(.wrapUp, next: review) == ["Next Step"])
        #expect(steps(.wrapUp).isEmpty)
        #expect(steps(.details, next: review).isEmpty)
        // A done visit's report, on every section.
        for section in JobPageSection.allCases {
            #expect(steps(section, type: "maintenance", status: "done", visit: .view) == ["Visit Report"])
        }
        #expect(steps(.checklist, type: "maintenance", visit: .send) == ["Complete Job"])
        #expect(steps(.details).isEmpty)

        // On the phone the header drops Start Job (it's on the bar) and keeps the rest.
        #expect(
            jobHeaderPhoneActions(.scheduled, type: .detection).map { jobActionLabel(from: .scheduled, to: $0) } == [
                "Unschedule"
            ])
        #expect(jobHeaderPhoneActions(.done, type: .maintenance) == [.inProgress])  // Reopen Visit
    }
}
