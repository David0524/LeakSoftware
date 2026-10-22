#if os(iOS)
    import Foundation
    import SundeckCore
    import UserNotifications

    /// Schedules the start-of-day notification with iOS (`dayStartAlertNow`): checked with the
    /// Live Activity (launch, coming back, each sync and each minute while open), replaced only
    /// when what it would say changes, and taken down when More › Notifications › Start of the
    /// Day is off.
    @MainActor
    enum DayStartNotifications {
        private static var scheduled: String?

        static func check(_ session: Session) {
            guard NotificationPermission.available else { return }
            let center = UNUserNotificationCenter.current()
            let on = notificationOn(NotificationPrefsForm.cached(session.sync.kv), .day)
            let alert: DayStartAlert? =
                on
                ? session.company.flatMap { company in
                    session.user.flatMap { user in
                        dayStartAlertNow(session.sync.store, kv: session.sync.kv, company: company, userId: user.id)
                    }
                } : nil
            let key = alert.map { "\($0.jobId)|\($0.at)|\($0.text.title)|\($0.text.body)" } ?? ""
            guard key != scheduled else { return }
            scheduled = key
            center.removePendingNotificationRequests(withIdentifiers: [dayStartNotificationId])
            guard let alert, let at = isoDate(alert.at) else { return }
            let seconds = at.timeIntervalSinceNow
            guard seconds > 1 else { return }
            let content = UNMutableNotificationContent()
            content.title = alert.text.title
            content.body = alert.text.body
            content.sound = .default
            content.userInfo = ["kind": "day", "job": alert.jobId]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            center.add(UNNotificationRequest(identifier: dayStartNotificationId, content: content, trigger: trigger))
        }
    }

    /// "2026-10-22T15:00:00.000Z" (`toISOString`) as a date.
    private func isoDate(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso)
    }
#endif
