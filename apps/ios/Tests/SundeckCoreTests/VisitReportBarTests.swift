import Foundation
import SundeckCore
import Testing

/// visit-report-bar: the maintenance visit report bar (owner, 2026-10-22).
@Suite struct VisitReportBarTests {
    let module = "visit-report-bar"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["visitReportBar", "VISIT_REPORT_BAR_LABELS"])
    }

    @Test func bar() {
        checkRule(module, "visitReportBar") { c in
            visitReportBar(
                jobType: try c.arg(0), status: try c.arg(1), mode: try c.arg(2), sentAt: try c.arg(3, as: String?.self),
                now: try isoInstant(c.arg(4)), timeZone: try c.arg(5), needsPhoto: try c.arg(6))
        }
        checkRule(module, "VISIT_REPORT_BAR_LABELS") { _ in
            [
                "view": VisitReportBarAction.view.label, "send": VisitReportBarAction.send.label,
                "photo": VisitReportBarAction.photo.label,
            ]
        }
    }
}

private func isoInstant(_ text: String) throws -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: text) else { throw NotRepresentable() }
    return date
}
