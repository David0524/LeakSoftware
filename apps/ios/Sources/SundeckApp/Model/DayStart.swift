import Foundation
import SundeckCore
import SundeckSync

// The start of the day (owner, 2026-10-22: "Techs: the first stop of the day opens in one tap
// from the notification"; docs/design/2026-10-22-first-win.md). The phone schedules one
// notification for itself at the start of the next working day with stops, so it comes with
// the app closed and no signal; a tap opens that first stop, or Today when it's gone. As
// apps/mobile/src/features/notifications/DayStart.tsx.

/// The identifier of the one scheduled start-of-day notification (replaced on each change).
public let dayStartNotificationId = "day-start"
/// How many days ahead to look for the next working day with stops.
let dayStartDaysAhead = 8

/// The person's days of stops not done, today and the next week, in route order (the sample job
/// left out), and the start-of-day notification to schedule for them, if any.
public func dayStartAlertNow(
    _ store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, now: Date = Date()
) -> DayStartAlert? {
    let jobs = scheduleJobs(store, companyId: company.id).filter { !$0.sample }
    let ctx = scheduleContext(store, company: company, userId: userId, now: now)
    let dates = (0...dayStartDaysAhead).compactMap { try? addDays(ctx.today, $0) }
    let team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
    let routes = loadRoutes(jobs, ctx: ctx, dates: dates, team: team, drive: DriveTimes()).routes
    let days = dates.map { date in
        DayStartDay(
            date: date,
            stops: (routes[routeKey(userId, date)]?.jobs ?? []).filter { !$0.doneOn(date) }.map {
                DayStartDay.Stop(id: $0.id, customer: $0.customerName, address: $0.street)
            })
    }
    return dayStartAlert(
        settings: company.settings, timeZone: ctx.timeZone, today: ctx.today, nowMin: ctx.nowMin, days: days)
}

extension ScheduleJob {
    /// The street only ("123 Palm Ln"), as the website's `address_line1`.
    var street: String? {
        let first = address.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
        return first?.isEmpty == false ? first : nil
    }
}
