import Foundation
import SundeckCore
import Testing

/// activity.ts: the Activity list's rows, times, and day headers.
@Suite struct ActivityTests {
    let module = "activity"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "constants", "activityButtonLabel", "firstName", "activityTime", "activityDay", "movedTo", "activityRow",
            "groupActivity", "activityEmpty",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func words() {
        checkRule(module, "constants") { _ in
            JSONValue.object([
                "ACTIVITY_TITLE": .string(ActivityText.title),
                "ACTIVITY_PAGE_SIZE": .number(Double(ActivityText.pageSize)),
                "ACTIVITY_DASHBOARD_COUNT": .number(Double(ActivityText.dashboardCount)),
                "ACTIVITY_OFFLINE": .string(ActivityText.offline),
                "ACTIVITY_EMPTY": .string(ActivityText.empty),
                "ACTIVITY_DETAIL": .string(ActivityText.detail),
                "ACTIVITY_NEW": .string(ActivityText.newActivity),
            ])
        }
        checkRule(module, "firstName") { c in firstName(try c.arg(0, as: String?.self)) }
        checkRule(module, "activityButtonLabel") { c in ActivityText.buttonLabel(unread: try c.arg(0)) }
        checkRule(module, "activityEmpty") { c in
            activityEmpty(jobTypeFilter(try c.arg(0, as: String.self), .both))
        }
    }

    @Test func times() {
        checkRule(module, "activityTime") { c in
            try activityTime(c.arg(0), now: SearchTests.date(c.arg(1)), timeZone: c.arg(2))
        }
        checkRule(module, "activityDay") { c in
            try activityDay(c.arg(0), now: SearchTests.date(c.arg(1)), timeZone: c.arg(2))
        }
        checkRule(module, "movedTo") { c in
            try movedTo(c.arg(0), now: SearchTests.date(c.arg(1)), timeZone: c.arg(2))
        }
    }

    @Test func rows() {
        checkRule(module, "activityRow") { c in
            try activityRow(c.arg(0, as: ActivityEvent.self), now: SearchTests.date(c.arg(1)), timeZone: c.arg(2))
        }
        checkRule(module, "groupActivity") { c in
            try groupActivity(
                c.arg(0, as: [ActivityEvent].self), now: SearchTests.date(c.arg(1)), timeZone: c.arg(2))
        }
    }
}
