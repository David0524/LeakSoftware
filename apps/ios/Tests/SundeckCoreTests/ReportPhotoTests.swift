import Foundation
import SundeckCore
import Testing

/// report-photo: Require a Photo to send a visit's report (owner, 2026-10-25).
@Suite struct ReportPhotoTests {
    let module = "report-photo"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "requiresReportPhoto", "REPORT_PHOTO_TEXT", "reportPhotoHint", "reportPhotoBlock",
            ])
    }

    @Test func rules() {
        checkRule(module, "requiresReportPhoto") { c in requiresReportPhoto(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "REPORT_PHOTO_TEXT") { _ in ReportPhotoText.all }
        checkRule(module, "reportPhotoHint") { c in reportPhotoHint(try c.arg(0, as: VisitReportMode.self)) }
        checkRule(module, "reportPhotoBlock") { c in
            reportPhotoBlock(try c.arg(0, as: JSONValue?.self), photos: try c.arg(1))
        }
    }
}
