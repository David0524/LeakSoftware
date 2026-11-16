import Foundation
import SundeckCore
import Testing

/// service-issues.ts: issues reported on a visit (docs/design/2026-11-16-service-issues.md).
@Suite struct ServiceIssuesTests {
    let module = "service-issues"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "ISSUE_TEXT", "ISSUE_STATUS_LABELS", "ISSUE_WORK_LABELS", "ISSUE_FILTERS", "issueWorkOptions",
            "issueDescriptionError", "issueNoteError", "issueActions", "issueList", "openIssueCount",
            "issuesSegmentLabel", "issuesEmpty", "issueDetailLine", "issueTitle",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    private struct FilterRow: Encodable {
        var key: String
        var label: String
    }

    @Test func labels() {
        checkRule(module, "ISSUE_TEXT") { _ in IssueText.all }
        checkRule(module, "ISSUE_STATUS_LABELS") { _ in labelTable(\IssueStatus.label) }
        checkRule(module, "ISSUE_WORK_LABELS") { _ in labelTable(\IssueWork.label) }
        checkRule(module, "ISSUE_FILTERS") { _ in
            IssueFilter.allCases.map { FilterRow(key: $0.rawValue, label: $0.label) }
        }
        checkRule(module, "issueWorkOptions") { c in issueWorkOptions(try c.arg(0)) }
        checkRule(module, "issuesSegmentLabel") { c in issuesSegmentLabel(try c.arg(0)) }
        checkRule(module, "issuesEmpty") { c in
            guard let filter = IssueFilter(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return issuesEmpty(filter, manages: try c.arg(1))
        }
        checkRule(module, "issueDetailLine") { c in
            issueDetailLine(
                suggested: try c.arg(0, as: String?.self).flatMap(IssueWork.init(rawValue:)),
                reporter: try c.arg(1, as: String?.self), reportedOn: try c.arg(2))
        }
        checkRule(module, "issueTitle") { c in
            let max: Int? = try c.arg(1)
            return issueTitle(try c.arg(0), max: max ?? 80)
        }
    }

    @Test func checks() {
        checkRule(module, "issueDescriptionError") { c in issueDescriptionError(try c.arg(0)) }
        checkRule(module, "issueNoteError") { c in issueNoteError(try c.arg(0)) }
        checkRule(module, "issueActions") { c in
            guard let status = IssueStatus(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return issueActions(status, role: try c.arg(1, as: String?.self), services: try c.arg(2)).map(\.rawValue)
        }
    }

    /// The same issues as fixtures/cases/service-issues.ts.
    private static let rows: [(String, IssueStatus, String, String, String?)] = [
        ("a", .open, "tech", "2026-11-14T10:00:00Z", nil),
        ("b", .resolved, "tech", "2026-11-15T10:00:00Z", nil),
        ("c", .open, "other", "2026-11-16T10:00:00Z", nil),
        ("d", .converted, "other", "2026-11-13T10:00:00Z", nil),
        ("f", .open, "other", "2026-11-16T10:00:00Z", nil),
        ("e", .open, "tech", "2026-11-16T11:00:00Z", "2026-11-16T12:00:00Z"),
    ]

    private let issues: [ServiceIssue] = Self.rows.map { id, status, by, at, deleted in
        ServiceIssue(
            id: id, customerId: nil, propertyId: nil, jobId: nil, description: "Issue \(id)", suggestedType: nil,
            status: status, resolutionNote: nil, resolvedBy: nil, resolvedAt: nil, convertedJobId: nil,
            reportedBy: by, reportedAt: at, deletedAt: deleted)
    }

    @Test func list() {
        checkRule(module, "issueList") { c in
            guard let filter = IssueFilter(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return issueList(issues, filter, userId: try c.arg(1), role: try c.arg(2, as: String?.self)).map(\.id)
        }
        checkRule(module, "openIssueCount") { c in
            openIssueCount(issues, userId: try c.arg(0), role: try c.arg(1, as: String?.self))
        }
    }
}
