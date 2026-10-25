import Foundation
import SundeckCore
import Testing

/// Sorting Jobs › Reports (owner, 2026-10-25); mirrors the "sortReports" block in
/// packages/core/test/job-list.test.ts.
@Suite struct ReportSortTests {
    private func report(_ number: Int, _ customer: String, _ sentAt: String?, _ updatedAt: String)
        -> ReportSortItem
    {
        ReportSortItem(number: number, customer: customer, sentAt: sentAt, updatedAt: updatedAt)
    }

    private var list: [ReportSortItem] {
        [
            report(1, "Zoe", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z"),
            report(3, "adam", nil, "2026-10-05T00:00:00Z"),
            report(2, "Mia", "2026-10-04T00:00:00Z", "2026-10-06T00:00:00Z"),
        ]
    }

    private func sorted(_ sort: ReportSort) -> [ReportSortItem] { sortReports(list, sort: sort) { $0 } }

    @Test func sortsNewestBySentTimeADraftByLastChange() {
        #expect(sorted(.newest).map(\.number) == [3, 2, 1])
        #expect(sorted(.oldest).map(\.number) == [1, 2, 3])
    }

    @Test func sortsByCustomerAndJobNumber() {
        #expect(sorted(.customer).map(\.customer) == ["adam", "Mia", "Zoe"])
        #expect(sorted(.number).map(\.number) == [3, 2, 1])
    }

    @Test func opensOnNewestAndHasNoScheduledDate() {
        #expect(reportSort("scheduled") == .newest)
        #expect(reportSort(nil) == .newest)
        #expect(ReportSort.allCases.map(\.label) == ["Newest", "Oldest", "Customer", "Job Number"])
    }

    @Test func saysWhenATypeHasNoReports() {
        #expect(reportsEmpty(.all) == nil)
        #expect(reportsEmpty(.type(.repair)) == "No repair reports here.")
    }
}
