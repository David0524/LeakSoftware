import Foundation

// Maintenance plans (owner request, 2026-10-13). Port of packages/core/src/maintenance.ts: the
// database makes the visits (app.plan_dates); these describe a plan and preview its dates the
// same way. Also the plan's shape from the repeat choice, as apps/web/src/lib/plan-repeat.ts
// posts it.

/// A `service_plan` row, as the rules read it. Fields left out read as the database defaults.
public struct ServicePlan: Codable, Equatable, Sendable {
    public var id: String?
    public var customerId: String?
    public var propertyId: String?
    public var assignedUserId: String?
    /// The first visit (YYYY-MM-DD).
    public var startsOn: String
    public var intervalWeeks: Int
    /// Several times a week: these days (0 Sunday to 6 Saturday), every week.
    public var weekdays: [Int]?
    /// Once a month: the first visit's weekday, in the same week of the month.
    public var monthly: Bool
    /// "10:00:00", or nil when route planning picks the time.
    public var visitTime: String?
    public var durationMinutes: Int
    /// The price per month (owner, 2026-10-18).
    public var priceCents: Cents?
    public var endsOn: String?
    public var paused: Bool
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case id, weekdays, monthly, paused, notes
        case customerId = "customer_id"
        case propertyId = "property_id"
        case assignedUserId = "assigned_user_id"
        case startsOn = "starts_on"
        case intervalWeeks = "interval_weeks"
        case visitTime = "visit_time"
        case durationMinutes = "duration_minutes"
        case priceCents = "price_cents"
        case endsOn = "ends_on"
    }

    public init(
        id: String? = nil, customerId: String? = nil, propertyId: String? = nil, assignedUserId: String? = nil,
        startsOn: String, intervalWeeks: Int = 1, weekdays: [Int]? = nil, monthly: Bool = false,
        visitTime: String? = nil, durationMinutes: Int = 30, priceCents: Cents? = nil, endsOn: String? = nil,
        paused: Bool = false, notes: String? = nil
    ) {
        self.id = id
        self.customerId = customerId
        self.propertyId = propertyId
        self.assignedUserId = assignedUserId
        self.startsOn = startsOn
        self.intervalWeeks = intervalWeeks
        self.weekdays = weekdays
        self.monthly = monthly
        self.visitTime = visitTime
        self.durationMinutes = durationMinutes
        self.priceCents = priceCents
        self.endsOn = endsOn
        self.paused = paused
        self.notes = notes
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        customerId = try c.decodeIfPresent(String.self, forKey: .customerId)
        propertyId = try c.decodeIfPresent(String.self, forKey: .propertyId)
        assignedUserId = try c.decodeIfPresent(String.self, forKey: .assignedUserId)
        startsOn = try c.decode(String.self, forKey: .startsOn)
        intervalWeeks = try c.decodeIfPresent(Int.self, forKey: .intervalWeeks) ?? 1
        weekdays = try c.decodeIfPresent([Int].self, forKey: .weekdays)
        monthly = try c.decodeIfPresent(Bool.self, forKey: .monthly) ?? false
        visitTime = try c.decodeIfPresent(String.self, forKey: .visitTime)
        durationMinutes = try c.decodeIfPresent(Int.self, forKey: .durationMinutes) ?? 30
        priceCents = try c.decodeIfPresent(Int.self, forKey: .priceCents)
        endsOn = try c.decodeIfPresent(String.self, forKey: .endsOn)
        paused = try c.decodeIfPresent(Bool.self, forKey: .paused) ?? false
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
    }
}

public struct MaintenanceSettings: Codable, Equatable, Sendable {
    /// A new plan's visit length.
    public var visitMinutes: Int
    /// How far ahead visits are put on the schedule.
    public var weeksAhead: Int

    public static let defaults = MaintenanceSettings(visitMinutes: 30, weeksAhead: 4)
}

/// The company settings' maintenance part, with defaults for anything missing or out of range.
public func maintenanceSettings(_ settings: JSONValue?) -> MaintenanceSettings {
    let raw = settings?["maintenance"]
    let minutes = ECMA.toNumber(raw?["visit_minutes"])
    let weeks = ECMA.toNumber(raw?["weeks_ahead"])
    let isInteger = { (x: Double) in x.isFinite && x == x.rounded(.down) }
    return MaintenanceSettings(
        visitMinutes: isInteger(minutes) && minutes >= 10 && minutes <= 240
            ? Int(minutes) : MaintenanceSettings.defaults.visitMinutes,
        weeksAhead: isInteger(weeks) && weeks >= 1 && weeks <= 12 ? Int(weeks) : MaintenanceSettings.defaults.weeksAhead
    )
}

/// How often a plan repeats (owner, 2026-10-18).
public enum PlanRepeat: String, Codable, CaseIterable, Hashable, Sendable {
    case days, weekly, biweekly, monthly

    /// The website's REPEAT_OPTIONS labels.
    public var label: String {
        switch self {
        case .days: "Several Days"
        case .weekly: "Weekly"
        case .biweekly: "Every 2 Weeks"
        case .monthly: "Monthly"
        }
    }
}

public func planRepeat(_ plan: ServicePlan) -> PlanRepeat {
    if let days = plan.weekdays, !days.isEmpty { return .days }
    if plan.monthly || plan.intervalWeeks > 2 { return .monthly }
    return plan.intervalWeeks == 2 ? .biweekly : .weekly
}

private let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
private let ordinals = ["1st", "2nd", "3rd", "4th"]

/// `new Date(`${date}T12:00:00Z`).getUTCDay()`, or nil for a date that isn't one.
private func dayOf(_ date: String) -> Int? {
    ECMA.parseDate("\(date)T12:00:00Z").map { ECMA.utcClock($0).weekday }
}

/// The week of the month a date falls in, 1 to 5.
private func weekOfMonth(_ date: String) -> Int {
    let day = ECMA.number(String(date.utf16.dropFirst(8).prefix(2)) ?? "")
    return day.isFinite ? Int(((day - 1) / 7).rounded(.down)) + 1 : 0
}

/// "Monday and Thursday", "Monday, Wednesday, and Friday".
private func dayList(_ days: [Int]) -> String {
    let names = days.sorted().map { dayNames.indices.contains($0) ? dayNames[$0] : "undefined" }
    return names.count <= 2
        ? names.joined(separator: " and ")
        : "\(names.dropLast().joined(separator: ", ")), and \(names[names.count - 1])"
}

/// "Every Tuesday", "Every 2 weeks on Tuesday", "Every Monday and Thursday", "Monthly on the
/// 2nd Tuesday".
public func cadenceLabel(_ plan: ServicePlan) -> String {
    let day = dayOf(plan.startsOn).map { dayNames[$0] } ?? "undefined"
    switch planRepeat(plan) {
    case .days: return "Every \(dayList(plan.weekdays ?? []))"
    case .monthly:
        let week = min(4, weekOfMonth(plan.startsOn))
        return "Monthly on the \(ordinals.indices.contains(week - 1) ? ordinals[week - 1] : "undefined") \(day)"
    case .biweekly: return "Every 2 weeks on \(day)"
    case .weekly: return "Every \(day)"
    }
}

/// "Every Tuesday · 10:00 AM · 30 min · $180.00 a month"
public func planSummary(_ plan: ServicePlan) -> String {
    let time = plan.visitTime.flatMap { $0.isEmpty ? nil : $0 }
    return [
        cadenceLabel(plan),
        time.map { minutesLabel(clockToMinutes(String($0.utf16.prefix(5)) ?? $0)) } ?? "any time",
        "\(plan.durationMinutes) min",
        plan.priceCents.map { "\(formatCents($0)) a month" },
    ]
    .compactMap { $0 }
    .joined(separator: " · ")
}

/// The plan's next visit dates from `from` on, the same as the database makes them
/// (app.plan_dates in 20261012004800_plan_schedule_and_monthly_price.sql).
public func upcomingVisitDates(_ plan: ServicePlan, from: String, count: Int = 4) throws -> [String] {
    if plan.paused { return [] }
    let repeats = planRepeat(plan)
    let weekday = dayOf(plan.startsOn)
    let week = min(4, weekOfMonth(plan.startsOn))
    let step = 7 * (repeats == .biweekly ? 2 : 1)
    let start = ECMA.parseDate("\(plan.startsOn)T12:00:00Z")
    var out: [String] = []
    var d = plan.startsOn < from ? from : plan.startsOn
    // A year and a half of days is enough for any shape.
    var i = 0
    while i < 550 && out.count < count {
        if let ends = plan.endsOn, !ends.isEmpty, d > ends { break }
        let dow = dayOf(d)
        let on: Bool
        switch repeats {
        case .days: on = dow.map { (plan.weekdays ?? []).contains($0) } ?? false
        case .monthly: on = dow != nil && dow == weekday && weekOfMonth(d) == week
        default:
            if let start, let at = ECMA.parseDate("\(d)T12:00:00Z") {
                on = Int(ECMA.round((at - start) / ECMA.dayMs)) % step == 0
            } else {
                on = false
            }
        }
        if on { out.append(d) }
        i += 1
        d = try addDays(d, 1)
    }
    return out
}

/// What a plan repeats as, in its row's columns (`interval_weeks`, `weekdays`, `monthly`).
public struct PlanShape: Equatable, Sendable {
    public var intervalWeeks: Int
    public var weekdays: [Int]?
    public var monthly: Bool

    public init(intervalWeeks: Int, weekdays: [Int]? = nil, monthly: Bool) {
        self.intervalWeeks = intervalWeeks
        self.weekdays = weekdays
        self.monthly = monthly
    }

    /// The columns as a row fragment for a write or the create_service_plan RPC.
    public var row: [String: JSONValue] {
        [
            "interval_weeks": .number(Double(intervalWeeks)),
            "weekdays": weekdays.map { .array($0.map { .number(Double($0)) }) } ?? .null,
            "monthly": .bool(monthly),
        ]
    }
}

/// Why a repeat choice can't be saved: the field and the message (the website's wording).
public struct PlanShapeProblem: Error, Equatable, Sendable {
    /// "repeat" or "weekdays".
    public var field: String
    public var message: String

    public init(field: String, message: String) {
        self.field = field
        self.message = message
    }
}

/// The plan's shape from the repeat choice and the ticked days. Port of parsePlanRepeat
/// (apps/web/src/lib/plan-repeat.ts).
public func planShape(_ repeats: PlanRepeat?, weekdays: [Int]) -> Result<PlanShape, PlanShapeProblem> {
    switch repeats {
    case .days:
        let days = Array(Set(weekdays.filter { (0...6).contains($0) })).sorted()
        if days.count < 2 { return .failure(PlanShapeProblem(field: "weekdays", message: "Pick two or more days.")) }
        return .success(PlanShape(intervalWeeks: 1, weekdays: days, monthly: false))
    case .weekly: return .success(PlanShape(intervalWeeks: 1, weekdays: nil, monthly: false))
    case .biweekly: return .success(PlanShape(intervalWeeks: 2, weekdays: nil, monthly: false))
    case .monthly: return .success(PlanShape(intervalWeeks: 1, weekdays: nil, monthly: true))
    case nil: return .failure(PlanShapeProblem(field: "repeat", message: "Pick how often."))
    }
}

/// The First visit field's hint for a repeat choice. `long` is the customer page's wording
/// (with "like the 2nd Tuesday"); New Job's is shorter, as on the website.
public func firstVisitHint(_ repeats: PlanRepeat, long: Bool) -> String {
    switch repeats {
    case .days: "Visits start on or after this date."
    case .monthly:
        long
            ? "Repeats on this weekday in the same week each month, like the 2nd Tuesday."
            : "Repeats on this weekday in the same week each month."
    case .weekly, .biweekly: long ? "Visits repeat on this weekday." : "Repeats on this weekday."
    }
}

// MARK: - Scheduled cleanings (owner, 2026-10-19)

/// How often a cleaning can repeat, in months (`CLEANING_MONTHS`).
public let cleaningMonths = [1, 2, 3, 6, 12]

/// "Every 3 months", "Every month", "Every year".
public func cleaningCadence(_ months: Int) -> String {
    months == 1 ? "Every month" : months == 12 ? "Every year" : "Every \(months) months"
}

/// "Clean filter every 3 months · $40.00 each"
public func cleaningSummary(_ name: String, everyMonths: Int, priceCents: Cents?) -> String {
    ["\(name) \(ECMA.lowercase(cleaningCadence(everyMonths)))", priceCents.map { "\(formatCents($0)) each" }]
        .compactMap { $0 }.joined(separator: " · ")
}

/// The checklist item for putting a new filter in (owner, 2026-10-19).
public let filterReplaceKey = "svc_filter_replace"

/// The shop's usual cleaning frequency per checklist item key (Settings › Scheduling),
/// `settings.maintenance.cleaning_months`. When not set: a year for replacing the filter, 3
/// months for anything else.
public func cleaningDefaultMonths(_ settings: JSONValue?, _ key: String?) -> Int {
    let raw = settings?["maintenance"]?["cleaning_months"]
    let months = key.map { ECMA.toNumber(raw?[$0]) } ?? .nan
    if months.isFinite, months == months.rounded(), cleaningMonths.contains(Int(months)) { return Int(months) }
    return key == filterReplaceKey ? 12 : 3
}

/// How old the pool's filter is, from when it was last replaced (plan_cleaning.last_done_on):
/// "New filter" (this week), "Filter 3 weeks old", "Filter 8 months old", "Filter 2 years old".
/// Nil when nobody has said, or the date is after `today`.
public func filterAge(_ lastReplaced: String?, _ today: String) -> String? {
    guard let lastReplaced, !lastReplaced.isEmpty else { return nil }
    guard let now = ECMA.parseDate("\(today)T12:00:00Z"), let then = ECMA.parseDate("\(lastReplaced)T12:00:00Z")
    else { return nil }
    let days = Int(ECMA.round((now - then) / 86_400_000))
    if days < 0 { return nil }
    if days < 7 { return "New filter" }
    // Whole calendar months: Feb 19 to Oct 19 is 8.
    let a = lastReplaced.split(separator: "-").map { Int($0) ?? 0 }
    let b = today.split(separator: "-").map { Int($0) ?? 0 }
    guard a.count >= 3, b.count >= 3 else { return nil }
    let months = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0)
    if months < 1 {
        let weeks = days / 7
        return "Filter \(weeks) \(weeks == 1 ? "week" : "weeks") old"
    }
    if months < 24 { return "Filter \(months) \(months == 1 ? "month" : "months") old" }
    return "Filter \(months / 12) years old"
}

/// A frequency choice's label: "Monthly", "3 Months", "Yearly".
public func cleaningMonthsLabel(_ months: Int) -> String {
    months == 1 ? "Monthly" : months == 12 ? "Yearly" : "\(months) Months"
}

/// A cleaning is called out on Today and the checklist from a week before it's due.
public let cleaningDueSoonDays = 7

/// What a scheduled cleaning is, for its icon: the filter, the salt cell, or something else.
public enum CleaningKind: String, Codable, Sendable {
    case filter
    /// Replace filter (owner, 2026-10-19): separate from cleaning it, and tracks the filter's age.
    case filterReplace = "filter_replace"
    case saltCell = "salt_cell"
    case other
}

/// From the cleaning's checklist item type (its key and name); salt wins over filter.
public func cleaningKind(key: String?, name: String?) -> CleaningKind {
    let text = ECMA.lowercase("\(key ?? "") \(name ?? "")")
    if text.contains("salt") { return .saltCell }
    if text.contains("filter") && text.contains("replace") { return .filterReplace }
    if text.contains("filter") { return .filter }
    return .other
}

/// How far off a cleaning is from a day: days and weeks until it's due, whether that's within a
/// week, and a label ("Due today", "Overdue", "Due in 5 days", "In 3 weeks").
public struct CleaningCountdown: Codable, Equatable, Sendable {
    public var days: Int
    public var weeks: Int
    public var soon: Bool
    public var label: String

    public init(days: Int, weeks: Int, soon: Bool, label: String) {
        self.days = days
        self.weeks = weeks
        self.soon = soon
        self.label = label
    }
}

/// `cleaningCountdown(nextDue, on)`, both local dates ("2026-11-30"); nil when either isn't a date.
public func cleaningCountdown(_ nextDue: String, _ on: String) -> CleaningCountdown? {
    guard let due = ECMA.parseDate("\(nextDue)T12:00:00Z"), let day = ECMA.parseDate("\(on)T12:00:00Z") else {
        return nil
    }
    let days = Int(ECMA.round((due - day) / 86_400_000))
    let weeks = max(0, Int(ECMA.round(Double(days) / 7)))
    let label =
        days < 0
        ? "Overdue"
        : days == 0
            ? "Due today"
            : days < cleaningDueSoonDays
                ? "Due in \(days) \(days == 1 ? "day" : "days")" : "In \(weeks) \(weeks == 1 ? "week" : "weeks")"
    return CleaningCountdown(days: days, weeks: weeks, soon: days <= cleaningDueSoonDays, label: label)
}

/// The few words beside a cleaning's icon on Today (owner, 2026-10-19): "Overdue", "Today",
/// "3 days", "1 week".
public func cleaningShortLabel(days: Int, weeks: Int) -> String {
    if days < 0 { return "Overdue" }
    if days == 0 { return "Today" }
    if days < 7 { return "\(days) \(days == 1 ? "day" : "days")" }
    return "\(weeks) \(weeks == 1 ? "week" : "weeks")"
}

public func cleaningShortLabel(_ due: CleaningCountdown) -> String {
    cleaningShortLabel(days: due.days, weeks: due.weeks)
}

/// The same, read aloud with the cleaning's name: "Clean filter due in 3 days".
public func cleaningDueSpoken(_ name: String, days: Int, weeks: Int) -> String {
    if days < 0 { return "\(name) overdue" }
    if days == 0 { return "\(name) due today" }
    return "\(name) due in \(cleaningShortLabel(days: days, weeks: weeks))"
}

public func cleaningDueSpoken(_ name: String, _ due: CleaningCountdown) -> String {
    cleaningDueSpoken(name, days: due.days, weeks: due.weeks)
}
