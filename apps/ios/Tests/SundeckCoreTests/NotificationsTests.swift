import Foundation
import SundeckCore
import Testing

/// notifications: the push texts and the Live Activity's content.
@Suite struct NotificationsTests {
    let module = "notifications"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "NOTIFICATION_KINDS", "SHOP_KINDS", "notificationOn", "textNotification", "jobNotification",
            "quoteNotification", "paymentNotification", "reportNotification", "liveStopContent", "liveStopRuns",
            "accessLine",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func kinds() {
        checkRule(module, "NOTIFICATION_KINDS") { _ in
            notificationKinds.map { ["key": $0.key.rawValue, "label": $0.label, "hint": $0.hint] }
        }
        checkRule(module, "SHOP_KINDS") { _ in shopNotificationKinds.map(\.rawValue) }
        checkRule(module, "notificationOn") { c in
            guard let kind = NotificationKind(rawValue: try c.arg(1)) else { throw NotRepresentable() }
            return notificationOn(try c.arg(0, as: JSONValue?.self), kind)
        }
    }

    @Test func texts() {
        checkRule(module, "textNotification") { c in textNotification(try c.arg(0), try c.arg(1)) }
        checkRule(module, "jobNotification") { c in
            jobNotification(
                moved: try c.arg(0), customer: try c.arg(1), address: try c.arg(2, as: String?.self),
                when: try c.arg(3, as: String?.self))
        }
        checkRule(module, "quoteNotification") { c in quoteNotification(try c.arg(0), try c.arg(1)) }
        checkRule(module, "paymentNotification") { c in
            paymentNotification(try c.arg(0), try c.arg(1), try c.arg(2))
        }
        checkRule(module, "reportNotification") { c in reportNotification(try c.arg(0)) }
    }

    @Test func liveStop() {
        checkRule(module, "liveStopContent") { c in liveStopContent(try c.arg(0)) }
        checkRule(module, "accessLine") { c in accessLine(try c.arg(0, as: String?.self)) }
        checkRule(module, "liveStopRuns") { c in
            liveStopRuns(settings: try c.arg(0), date: try c.arg(1), nowMin: try c.arg(2), stopsLeft: try c.arg(3))
        }
    }
}
