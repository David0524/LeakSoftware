import Foundation

/// Why a date rule couldn't run: TypeScript's `Intl` and `Date` throw the same way.
public enum DateRuleError: Error, Equatable, Sendable {
    /// "Invalid time zone specified: …"
    case invalidTimeZone(String)
    /// "Invalid time value": a date that isn't one.
    case invalidTimeValue
}

/// The jobs list's sections. Port of job-list.ts.
public struct JobGroups: Codable, Equatable, Sendable {
    /// Scheduled today, or in progress regardless of date.
    public var today: [Job] = []
    /// Scheduled after today.
    public var upcoming: [Job] = []
    /// Open jobs without a date.
    public var unscheduled: [Job] = []
    /// Past-dated or finished jobs from the last 30 days, newest first.
    public var recent: [Job] = []
}

private let openStatuses: Set<JobStatus> = [.unscheduled, .scheduled, .inProgress]

/// Calendar date (YYYY-MM-DD) of an instant in a time zone.
public func localDate(_ instant: Date, _ timeZone: String) throws -> String {
    let wall = try ECMA.wallClock(ECMA.milliseconds(instant), ECMA.zone(timeZone))
    return "\(ECMA.yearString(wall.year))-\(ECMA.pad(String(wall.month), 2))-\(ECMA.pad(String(wall.day), 2))"
}

private func when(_ j: Job) -> Double {
    (j.scheduledStart ?? j.startedAt ?? j.createdAt).flatMap(ECMA.parseDate) ?? 0
}

/// Sort and bucket jobs for the jobs list, using the shop's time zone for "today".
public func groupJobs(_ jobs: [Job], _ now: Date, _ timeZone: String) throws -> JobGroups {
    let today = try localDate(now, timeZone)
    let recentCutoff = ECMA.milliseconds(now) - 30 * 24 * 60 * 60 * 1000
    var groups = JobGroups()

    for j in jobs where j.deletedAt?.isEmpty ?? true {
        let open = openStatuses.contains(j.status)
        // Only open jobs need their day; finished ones (most of a shop's history) skip the date math.
        var day: String?
        if open, let start = j.scheduledStart, !start.isEmpty {
            guard let ms = ECMA.parseDate(start) else { throw DateRuleError.invalidTimeValue }
            day = try localDate(Date(timeIntervalSince1970: ms / 1000), timeZone)
        }
        if j.status == .inProgress || (open && day == today) {
            groups.today.append(j)
        } else if open, let day, day > today {
            groups.upcoming.append(j)
        } else if open && day == nil {
            groups.unscheduled.append(j)
        } else if when(j) >= recentCutoff || open {
            groups.recent.append(j)
        }
    }

    let byTime = { (a: Job, b: Job) in when(a) - when(b) }
    groups.today = ECMA.sort(groups.today, byTime)
    groups.upcoming = ECMA.sort(groups.upcoming, byTime)
    groups.unscheduled = ECMA.sort(groups.unscheduled) {
        Double(ECMA.localeCompare($1.createdAt ?? "", $0.createdAt ?? ""))
    }
    groups.recent = ECMA.sort(groups.recent) { byTime($1, $0) }
    return groups
}

/// "9:00 AM" today, "Tue Oct 14, 9:00 AM" otherwise, "Not scheduled" without a date.
public func formatSchedule(_ start: String?, _ now: Date, _ timeZone: String) throws -> String {
    guard let start, !start.isEmpty else { return "Not scheduled" }
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(start) else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.wallClock(ms, zone)
    let hour = wall.hour % 12 == 0 ? 12 : wall.hour % 12
    // Node writes a plain space before AM and PM (V8 swaps out ICU's U+202F).
    let time = "\(hour):\(ECMA.pad(String(wall.minute), 2)) \(wall.hour < 12 ? "AM" : "PM")"
    let d = Date(timeIntervalSince1970: ms / 1000)
    if try localDate(d, timeZone) == localDate(now, timeZone) { return time }
    let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return "\(weekdays[wall.weekday]), \(months[wall.month - 1]) \(wall.day), \(time)"
}

// MARK: - JavaScript dates

extension ECMA {
    /// A wall-clock reading in a time zone, to the minute (what `Intl` formats).
    struct WallClock {
        var year: Int
        var month: Int
        var day: Int
        var hour: Int
        var minute: Int
        /// 0 = Sunday.
        var weekday: Int
    }

    static let dayMs = 86_400_000.0

    /// The zone `Intl` would use, or the error it throws.
    static func zone(_ identifier: String) throws -> TimeZone {
        guard let zone = TimeZone(identifier: identifier) else { throw DateRuleError.invalidTimeZone(identifier) }
        return zone
    }

    /// Milliseconds since 1970, whole like a JavaScript Date's.
    static func milliseconds(_ date: Date) -> Double { (date.timeIntervalSince1970 * 1000).rounded() }

    /// Days since 1970-01-01 for a proleptic Gregorian date (month 1-12; day may overflow).
    static func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let mp = (month + 9) % 12
        let doy = (153 * mp + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    static func civilFromDays(_ days: Int) -> (year: Int, month: Int, day: Int) {
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let day = doy - (153 * mp + 2) / 5 + 1
        let month = mp < 10 ? mp + 3 : mp - 9
        return (yoe + era * 400 + (month <= 2 ? 1 : 0), month, day)
    }

    /// The UTC reading of an instant, to the minute.
    static func utcClock(_ ms: Double) -> WallClock {
        let days = Int((ms / dayMs).rounded(.down))
        let minuteOfDay = Int(((ms - Double(days) * dayMs) / 60_000).rounded(.down))
        let date = civilFromDays(days)
        let weekday = ((days % 7) + 11) % 7  // 1970-01-01 was a Thursday
        return WallClock(
            year: date.year, month: date.month, day: date.day, hour: minuteOfDay / 60, minute: minuteOfDay % 60,
            weekday: weekday)
    }

    /// The reading of an instant on a wall clock in `zone`.
    static func wallClock(_ ms: Double, _ zone: TimeZone) -> WallClock {
        utcClock(ms + Double(zone.secondsFromGMT(for: Date(timeIntervalSince1970: ms / 1000))) * 1000)
    }

    /// A year the way `Intl` and `toISOString` write 4-digit years.
    static func yearString(_ year: Int) -> String { pad(String(year), 4) }

    /// `Date.prototype.toISOString`.
    static func isoString(_ ms: Double) throws -> String {
        guard ms.isFinite, abs(ms) <= 8.64e15 else { throw DateRuleError.invalidTimeValue }
        let days = Int((ms / dayMs).rounded(.down))
        let inDay = Int(ms - Double(days) * dayMs)
        let date = civilFromDays(days)
        let year =
            (0...9999).contains(date.year)
            ? pad(String(date.year), 4) : (date.year < 0 ? "-" : "+") + pad(String(abs(date.year)), 6)
        let ms3 = pad(String(inDay % 1000), 3)
        let s = pad(String(inDay / 1000 % 60), 2)
        let m = pad(String(inDay / 60_000 % 60), 2)
        let h = pad(String(inDay / 3_600_000), 2)
        return "\(year)-\(pad(String(date.month), 2))-\(pad(String(date.day), 2))T\(h):\(m):\(s).\(ms3)Z"
    }

    /// `Date.UTC(y, m, d, h, min)`: months from 0, overflow rolls over, years 0-99 mean 19xx.
    static func dateUTC(_ y: Double, _ m: Double, _ d: Double, _ h: Double, _ min: Double) -> Double {
        let values = [y, m, d, h, min]
        guard values.allSatisfy(\.isFinite) else { return .nan }
        var year = y.rounded(.towardZero)
        if (0...99).contains(year) { year += 1900 }
        let month = m.rounded(.towardZero)
        let ym = year + (month / 12).rounded(.down)
        let mn = month - (month / 12).rounded(.down) * 12
        guard abs(ym) < 400_000 else { return .nan }
        let days = Double(daysFromCivil(Int(ym), Int(mn) + 1, 1)) + d.rounded(.towardZero) - 1
        let time = h.rounded(.towardZero) * 3_600_000 + min.rounded(.towardZero) * 60_000
        let result = days * dayMs + time
        return abs(result) <= 8.64e15 ? result : .nan
    }

    /// `Date.parse` for the timestamps rows hold: an ISO date ("2026-10-12"), or a date and
    /// time with an offset ("2026-10-12T16:00:00.000Z", "…+00:00", "… 16:00:00+00"). A time
    /// without an offset is read as UTC (JavaScript would use the device's zone). Milliseconds
    /// since 1970, or nil when it isn't a date.
    static func parseDate(_ text: String) -> Double? {
        let s = Array(text.unicodeScalars)
        var i = 0
        func digits(_ min: Int, _ max: Int) -> Int? {
            var value = 0
            var count = 0
            while count < max, i < s.count, ("0"..."9").contains(s[i]) {
                value = value * 10 + Int(s[i].value - 48)
                i += 1
                count += 1
            }
            return count >= min ? value : nil
        }
        func take(_ c: Unicode.Scalar) -> Bool {
            if i < s.count, s[i] == c {
                i += 1
                return true
            }
            return false
        }
        // Date: YYYY or ±YYYYYY, then optional -MM and -DD.
        var year: Int
        if i < s.count, s[i] == "+" || s[i] == "-" {
            let negative = s[i] == "-"
            i += 1
            guard let y = digits(6, 6) else { return nil }
            year = negative ? -y : y
        } else {
            guard let y = digits(4, 4) else { return nil }
            year = y
        }
        var month = 1
        var day = 1
        if take("-") {
            guard let m = digits(1, 2) else { return nil }
            month = m
            if take("-") {
                guard let d = digits(1, 2) else { return nil }
                day = d
            }
        }
        guard (1...12).contains(month), (1...31).contains(day) else { return nil }
        var ms = Double(daysFromCivil(year, month, day)) * dayMs
        if i == s.count { return ms }
        // Time: T or a space, HH:MM, optional :SS and .fraction.
        guard take("T") || take("t") || take(" "), let hour = digits(2, 2), take(":"), let minute = digits(2, 2),
            hour <= 24, minute <= 59
        else { return nil }
        var second = 0
        var milli = 0
        if take(":") {
            guard let sec = digits(2, 2), sec <= 59 else { return nil }
            second = sec
            if take(".") {
                let start = i
                guard digits(1, Int.max) != nil else { return nil }
                let fraction = String(String.UnicodeScalarView(s[start..<i]))
                milli = Int((fraction + "00").prefix(3))!
            }
        }
        if hour == 24 && (minute > 0 || second > 0 || milli > 0) { return nil }
        ms += Double(hour * 3_600_000 + minute * 60_000 + second * 1000 + milli)
        // Offset: Z, or ±HH, ±HHMM, ±HH:MM.
        if take("Z") || take("z") {
        } else if i < s.count, s[i] == "+" || s[i] == "-" {
            let sign = s[i] == "-" ? -1.0 : 1.0
            i += 1
            guard let oh = digits(2, 2) else { return nil }
            _ = take(":")
            let om = digits(2, 2) ?? 0
            ms -= sign * Double(oh * 60 + om) * 60_000
        }
        return i == s.count && abs(ms) <= 8.64e15 ? ms : nil
    }

}
