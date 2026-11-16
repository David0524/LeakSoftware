import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Skip a Visit (owner, 2026-11-16): the job page's actions and what Skip writes, without SwiftUI.
/// Matches apps/web/src/components/skip-visit.tsx and apps/mobile/src/features/job/SkipVisit.tsx.
@MainActor @Suite struct SkipVisitAppTests {
    @Test func skipIsOfferedOnOpenVisitsOnly() {
        for status in [JobStatus.unscheduled, .scheduled, .inProgress] {
            #expect(jobCanSkip(status, type: .maintenance))
            #expect(!jobCanSkip(status, type: .detection))
            #expect(!jobCanSkip(status, type: .repair))
        }
        #expect(!jobCanSkip(.done, type: .maintenance))
        #expect(!jobCanSkip(.skipped, type: .maintenance))
    }

    @Test func theHeaderLeavesSkipVisitToTheMenuAndDetails() {
        #expect(!jobHeaderActions(.scheduled, type: .maintenance).contains(.skipped))
        #expect(!jobHeaderActions(.inProgress, type: .maintenance).contains(.skipped))
        // A skipped visit is put back with Undo Skip, in view beside Reschedule; or called off.
        #expect(jobHeaderPhoneActions(.skipped, type: .maintenance) == [.scheduled])
        #expect(jobHeaderPhoneActions(.skipped, type: .maintenance).map { jobActionLabel(from: .skipped, to: $0) } == [
            "Undo Skip"
        ])
        #expect(jobMenuActions(.skipped, type: .maintenance).isEmpty)
        #expect(jobCanCancel(.skipped, type: .maintenance))
        #expect(!jobCanStart(.skipped, type: .maintenance))
    }

    @Test func skipWritesTheReasonTheNoteAndTheTime() {
        let values = skipJobValues(reason: "Dog in Yard", note: "  Two big dogs ", at: Date(timeIntervalSince1970: 0))
        #expect(values["status"] == "skipped")
        #expect(values["skip_reason"] == "Dog in Yard")
        #expect(values["skip_note"] == "Two big dogs")
        #expect(values["skipped_at"]?.string?.hasPrefix("1970-01-01T00:00:00") == true)
        #expect(skipJobValues(reason: "Weather", note: "   ")["skip_note"] == .null)
    }

    @Test func skipReasonsArePickedFromTheShopsRowsWithoutTheSystemOne() {
        let rows = [
            SkipReason(id: "a", label: "Weather", sortOrder: 40, active: true),
            SkipReason(id: "b", label: "Locked Gate", sortOrder: 10, active: true),
            SkipReason(id: "c", label: "Not Done", sortOrder: 900, active: true, system: true),
            SkipReason(id: "d", label: "Off", sortOrder: 30, active: false),
        ]
        #expect(pickableSkipReasons(rows).map(\.label) == ["Locked Gate", "Weather"])
    }

    @Test func settingsHideSkipReasonsFromLeakShops() {
        #expect(!settingsGroups(.leak)[2].pages.contains(.skipReasons))
        #expect(settingsGroups(.pool)[2].pages.contains(.skipReasons))
        #expect(SettingsPage.skipReasons.title == "Skip Reasons")
        #expect(SettingsPage.skipReasons.webPath == "settings/skip-reasons")
        #expect(SettingsPage.skipReasons.isNative)
    }

    @Test func theJobsListHasASkippedFilter() {
        #expect(JobFilter.skipped.title == "Skipped")
        #expect(JobFilter.skipped.statuses == [.skipped])
        #expect(JobFilter.open.statuses?.contains(.skipped) == false)
    }
}
