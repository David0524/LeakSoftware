import Foundation

// Routes: which weekday each pool customer is serviced on, and by whom (owner, 2026-10-20,
// docs/plans/route-maps.md part 3). Port of service-days.ts. A plan's day is its weekday (or
// weekdays); changing it re-makes the plan's coming visits (app.service_plan_changed). Pure.

/// `new Date(`${date}T12:00:00Z`).getUTCDay()`, or nil for a date that isn't one.
private func weekdayOf(_ date: String) -> Int? {
    ECMA.parseDate("\(date)T12:00:00Z").map { ECMA.utcClock($0).weekday }
}

/// The week of the month a date falls in, 1 to 5.
private func monthWeek(_ date: String) -> Int {
    let day = ECMA.number(String(date.utf16.dropFirst(8).prefix(2)) ?? "")
    return day.isFinite ? Int(((day - 1) / 7).rounded(.down)) + 1 : 0
}

/// The weekdays a plan is serviced on (0 Sunday to 6 Saturday).
public func serviceDays(_ plan: ServicePlan) -> [Int] {
    if let days = plan.weekdays, !days.isEmpty { return days.sorted() }
    return weekdayOf(plan.startsOn).map { [$0] } ?? []
}

/// A plan's columns to save for a new service day.
public struct ServiceDayChange: Codable, Equatable, Sendable {
    public var startsOn: String
    public var weekdays: [Int]?

    enum CodingKeys: String, CodingKey {
        case startsOn = "starts_on"
        case weekdays
    }

    /// The row's new values, by column.
    public var values: [String: JSONValue] {
        ["starts_on": .string(startsOn), "weekdays": weekdays.map { .array($0.map { .number(Double($0)) }) } ?? .null]
    }
}

/// The plan's columns to save to service it on `to` instead of `from` (one of its days), from
/// `today` on. Several days a week: that day swaps. Weekly: the first `to` from today. Every 2
/// weeks and monthly: the nearest `to` around the next visit, on or after today, so every 2
/// weeks keeps its week and monthly keeps its week of the month.
public func moveServiceDay(_ plan: ServicePlan, from: Int, to: Int, today: String) throws -> ServiceDayChange {
    let repeats = planRepeat(plan)
    if repeats == .days {
        var seen: [Int] = []
        for d in plan.weekdays ?? [] {
            let x = d == from ? to : d
            if !seen.contains(x) { seen.append(x) }
        }
        return ServiceDayChange(startsOn: plan.startsOn, weekdays: seen.sorted())
    }
    func firstFrom(_ d: String) throws -> String {
        for k in 0..<7 {
            let x = try addDays(d, k)
            if weekdayOf(x) == to { return x }
        }
        throw DateRuleError.invalidTimeValue
    }
    // Weekly: the first `to` from today, so it's serviced this week.
    if repeats == .weekly { return ServiceDayChange(startsOn: try firstFrom(today), weekdays: nil) }
    var active = plan
    active.paused = false
    let base = try upcomingVisitDates(active, from: today, count: 1).first ?? plan.startsOn
    if weekdayOf(base) == to { return ServiceDayChange(startsOn: base, weekdays: plan.weekdays) }
    let monthly = repeats == .monthly
    var candidates: [String] = []
    for k in -6...6 {
        let d = try addDays(base, k)
        if weekdayOf(d) != to || d < today { continue }
        if monthly && monthWeek(d) != min(4, monthWeek(base)) { continue }
        candidates.append(d)
    }
    let baseMs = ECMA.parseDate(base) ?? .nan
    let near = { (d: String) in abs((ECMA.parseDate(d) ?? .nan) - baseMs) }
    let sorted = ECMA.sort(candidates) { a, b in
        let n = near(a) - near(b)
        return n != 0 && !n.isNaN ? n : Double(ECMA.localeCompare(a, b))
    }
    // Nothing that keeps the week: the first `to` from today.
    let pick = try sorted.first ?? firstFrom(today)
    return ServiceDayChange(startsOn: pick, weekdays: plan.weekdays)
}

/// A plan as Routes sees it.
public struct RoutePlan: Codable, Equatable, Sendable {
    public var id: String
    public var techId: String?
    public var days: [Int]
    public var location: LatLng?
    public var durationMin: Int

    public init(id: String, techId: String?, days: [Int], location: LatLng?, durationMin: Int) {
        self.id = id
        self.techId = techId
        self.days = days
        self.location = location
        self.durationMin = durationMin
    }
}

public struct DaySuggestion: Codable, Equatable, Sendable {
    public var id: String
    public var techId: String
    /// 0 Sunday to 6 Saturday.
    public var day: Int
}

public struct ServiceDaySuggestions: Codable, Equatable, Sendable {
    public var suggestions: [DaySuggestion]
    public var left: [String]
}

/// Suggest Days: a service day (and tech, for plans with none) for each plan given, grouping
/// nearby pools on the same day and evening out each tech's days, as Plan Week places jobs.
/// Plans on several days a week, and plans without a map location, are left as they are. The
/// rest of each tech's plans stay on their days and count toward them. Nothing is saved: the
/// owner presses Keep.
public func suggestServiceDays(
    place: [RoutePlan], keep: [RoutePlan], techs: [String], workDays: [Int], depot: LatLng?, day: WorkDay,
    drive: DriveFn
) -> ServiceDaySuggestions {
    let days = techs.flatMap { techId in
        workDays.map { d in
            WeekDay(
                techId: techId, date: String(d),
                stays: keep.filter { $0.techId == techId && $0.days.contains(d) }.map {
                    RouteStop(id: $0.id, location: $0.location, durationMin: $0.durationMin)
                })
        }
    }
    let movable = place.filter { $0.days.count <= 1 && $0.location != nil }
    let plan = planWeek(
        days: days,
        jobs: movable.map { p in
            WeekJob(
                id: p.id, location: p.location, durationMin: p.durationMin, techId: nil, date: nil,
                techs: p.techId.map { techs.contains($0) } == true ? [p.techId!] : techs)
        }, depot: depot, day: day, drive: drive, limit: Int.max)
    let placed = Set(plan.placed.map(\.id))
    return ServiceDaySuggestions(
        suggestions: plan.placed.map { DaySuggestion(id: $0.id, techId: $0.techId, day: Int($0.date) ?? 0) },
        left: place.filter { !placed.contains($0.id) }.map(\.id))
}
