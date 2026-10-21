import Foundation

// Planning a day, moving a job, and suggesting times, worked out on the phone (spec 5.6 and 6.3:
// the native apps plan from their own database and save through the sync layer). Port of
// schedule-moves.ts: time-locked jobs keep their clock time (`jobLock`, as the website's moveJob
// does), started jobs stay on the schedule, and stops after a moved job move later only when
// they must. Pure: callers load the jobs and drive times and save the rows.

public struct PlanContext: Codable, Sendable {
    public var timeZone: String
    public var settings: RoutingSettings
    /// The shop, where routes start and end.
    public var depot: LatLng?
    /// The shop's today ("2026-10-19") and minutes after midnight now.
    public var today: String
    public var nowMin: Int

    public init(timeZone: String, settings: RoutingSettings, depot: LatLng?, today: String, nowMin: Int) {
        self.timeZone = timeZone
        self.settings = settings
        self.depot = depot
        self.today = today
        self.nowMin = nowMin
    }
}

public struct ScheduleChange: Encodable, Equatable, Sendable {
    public var updates: [JobChange]
    /// What happened, one short line for the banner ("Moved to 9:15 AM.").
    public var message: String?
    /// What to watch for, a second smaller line (owner, 2026-10-20: the banner at the top).
    public var detail: String?
    public var error: String?

    static func fail(_ error: String) -> ScheduleChange { ScheduleChange(updates: [], error: error) }
}

/// "Runs 20 min past the end of the day. A fixed time can’t be met." from notes, or nil.
public func noteSentences(_ notes: [String?]) -> String? {
    let list = notes.compactMap { $0 }.filter { !$0.isEmpty }
    guard !list.isEmpty else { return nil }
    return list.map { "\($0.prefix(1).uppercased())\($0.dropFirst())." }.joined(separator: " ")
}

private func dayStops<J: PlanJobFields>(_ ctx: PlanContext, _ techId: String, _ date: String, _ jobs: [J]) throws
    -> [RouteStop]
{
    try jobs.map {
        try stopFor(
            $0, timeZone: ctx.timeZone, settings: ctx.settings, techId: techId,
            nowMin: date == ctx.today ? ctx.nowMin : nil)
    }
}

/// Optimize (once Plan Route): order a tech's day (its jobs in route order) for the least
/// driving, keep promised times, and say what changed.
public func planDay<J: PlanJobFields>(
    _ ctx: PlanContext, _ techId: String, _ date: String, _ jobs: [J], drive: DriveFn
) throws -> ScheduleChange {
    if date < ctx.today { return .fail("Past days can’t be planned.") }
    if jobs.isEmpty { return .fail("Nothing scheduled for this tech that day.") }
    let stops = try dayStops(ctx, techId, date, jobs)
    let hours = workDay(ctx.settings)
    let before = timeRoute(stops, depot: ctx.depot, day: hours, drive: drive)
    let (order, route) = optimizeRoute(stops, depot: ctx.depot, day: hours, drive: drive)
    let planned = order.map { stops[$0] }
    let updates = try routeUpdates(date, ctx.timeZone, planned, route)
    let saved = before.driveMin - route.driveMin
    // One short line for the banner at the top of the screen (owner, 2026-10-20: the note under
    // the button "looks horrible"), and what to watch for as a second line.
    let message = [
        "Optimized",
        saved > 0 ? "\(durationLabel(saved)) less driving" : "\(durationLabel(route.driveMin)) driving",
    ].joined(separator: " · ")
    let detail = noteSentences([
        stops.contains { $0.location == nil } ? "driving to pools not on the map isn’t counted" : nil,
        ctx.depot == nil ? "the shop has no location (Settings › Scheduling)" : nil,
    ])
    return ScheduleChange(updates: updates, message: message, detail: detail)
}

/// Close up the order numbers of the day a job left (times stay as they are).
public func renumberDay<J: PlanJobFields>(_ techId: String, _ jobs: [J], leaving: String) -> [JobChange] {
    let left = jobs.filter { $0.id != leaving && $0.assignedUserId == techId }
    return left.enumerated().compactMap { i, j in
        j.routeOrder == i + 1 ? nil : JobChange(id: j.id, routeOrder: .some(i + 1))
    }
}

public struct MoveInput<J: PlanJobFields> {
    public var job: J
    /// nil: nobody assigned (waits in Needs a Time).
    public var tech: String?
    /// nil: take the job off the schedule.
    public var date: String?
    /// Place in the tech's route that day (0 = first). Past the end: last.
    public var index: Int
    /// The target tech's jobs that day, in route order (the moved job may be among them).
    public var targetDay: [J]
    /// The tech's day the job is leaving, in route order, for renumbering.
    public var fromDay: [J]
    /// False for a tech the owner limits to their own jobs.
    public var seesAll: Bool
    /// The person moving it.
    public var userId: String

    public init(
        job: J, tech: String?, date: String?, index: Int, targetDay: [J], fromDay: [J], seesAll: Bool, userId: String
    ) {
        self.job = job
        self.tech = tech
        self.date = date
        self.index = index
        self.targetDay = targetDay
        self.fromDay = fromDay
        self.seesAll = seesAll
        self.userId = userId
    }
}

/// The shop's date of an instant ("2026-10-19").
private func dateIn(_ iso: String, _ timeZone: String) throws -> String {
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.wallClock(ms, zone)
    return "\(wall.year)-\(ECMA.pad(String(wall.month), 2))-\(ECMA.pad(String(wall.day), 2))"
}

private func present(_ s: String?) -> Bool { !(s ?? "").isEmpty }

/// Move…: put a job on a tech's day at a place in the route, with nobody, or off the schedule.
/// Returns the rows to save, the moved job first.
public func moveJobChange<J: PlanJobFields>(_ ctx: PlanContext, _ input: MoveInput<J>, drive: DriveFn) throws
    -> ScheduleChange
{
    let job = input.job
    let tech = input.tech.flatMap { $0.isEmpty ? nil : $0 }
    let date = input.date.flatMap { $0.isEmpty ? nil : $0 }
    if !canMoveJob(job.status) { return .fail("This job was canceled, so it stays off the schedule.") }
    if date == nil && !canUnschedule(job.status) {
        return .fail("This job has started, so it stays on the schedule. Move it to another day instead.")
    }
    if let date, date < ctx.today { return .fail("Pick today or a later day.") }
    if !input.seesAll && input.tech != input.userId && date != nil {
        return .fail("You can schedule only your own jobs. Ask an owner to move it to someone else.")
    }
    if let tech, tech == job.secondTechId { return .fail("This tech is already the second tech on this job.") }
    let status: JobStatus = canUnschedule(job.status) ? .scheduled : job.status
    let from: (tech: String?, date: String)? =
        present(job.scheduledStart) ? (job.assignedUserId, try dateIn(job.scheduledStart!, ctx.timeZone)) : nil
    let leaving = { (stayed: Bool) -> [JobChange] in
        guard let t = from?.tech, !t.isEmpty, !stayed else { return [] }
        return renumberDay(t, input.fromDay, leaving: job.id)
    }

    guard let date else {
        let off = JobChange(
            id: job.id, routeOrder: .some(nil), scheduledStart: .some(nil), scheduledEnd: .some(nil),
            status: .unscheduled, arrivalFixed: false)
        return ScheduleChange(updates: [off] + leaving(false), message: "Taken off the schedule.")
    }

    let duration = jobMinutes(job, ctx.settings)
    // A time lock keeps its clock time on the new day (owner, 2026-10-20).
    let fixedMin =
        jobLock(job).keepsTime && present(job.scheduledStart)
        ? try localMinutes(job.scheduledStart!, ctx.timeZone) : nil

    guard let tech else {
        let startMin =
            present(job.scheduledStart)
            ? try localMinutes(job.scheduledStart!, ctx.timeZone) : workDay(ctx.settings).startMin
        let start = try zonedMinutesToIso(date, startMin, ctx.timeZone)
        let change = JobChange(
            id: job.id, routeOrder: .some(nil), scheduledStart: .some(start),
            scheduledEnd: .some(try isoPlusMinutes(start, duration)), status: status, assignedUserId: .some(nil))
        return ScheduleChange(
            updates: [change] + leaving(false),
            message: "No tech yet, so it’s in Needs a Time, still booked for \(minutesLabel(startMin)).")
    }

    let others = input.targetDay.filter { $0.id != job.id }
    var stops = try zip(others, dayStops(ctx, tech, date, others)).map { j, s -> RouteStop in
        // Stops already on the day keep their times unless the new order pushes them later.
        guard s.movable, present(j.scheduledStart) else { return s }
        var moved = s
        moved.earliestMin = max(s.earliestMin ?? 0, try localMinutes(j.scheduledStart!, ctx.timeZone))
        return moved
    }
    let moved = RouteStop(
        id: job.id, location: job.location, durationMin: duration, fixedStartMin: fixedMin,
        earliestMin: date == ctx.today ? ctx.nowMin : nil, movable: fixedMin == nil, own: true)
    let index = max(0, min(input.index, others.count))
    stops.insert(moved, at: index)
    let route = timeRoute(stops, depot: ctx.depot, day: workDay(ctx.settings), drive: drive)
    var updates = try routeUpdates(date, ctx.timeZone, stops, route)
    let mineAt = updates.firstIndex { $0.id == job.id }!
    var mine = updates.remove(at: mineAt)
    mine.assignedUserId = .some(tech)
    mine.status = status
    if let fixedMin {
        let start = try zonedMinutesToIso(date, fixedMin, ctx.timeZone)
        mine.scheduledStart = .some(start)
        mine.scheduledEnd = .some(try isoPlusMinutes(start, duration))
    }
    let stayed = from?.tech == tech && from?.date == date
    // No times and no lateness (owner, 2026-10-21: "times are pretty irrelevant").
    return ScheduleChange(updates: [mine] + updates + leaving(stayed), message: "Moved.")
}

/// The next 7 working days for suggestions, today included while there's time left in it.
public func suggestionDates(_ ctx: PlanContext) throws -> [String] {
    let hours = workDay(ctx.settings)
    var dates: [String] = []
    let end = try addDays(ctx.today, 21)
    var d = ctx.today
    while dates.count < 7 && d < end {
        defer { d = (try? addDays(d, 1)) ?? end }
        guard let day = weekday(d), ctx.settings.workDays.contains(day) else { continue }
        if d == ctx.today && ctx.nowMin > hours.endMin - 60 { continue }
        dates.append(d)
    }
    return dates
}

public struct SuggestedTime: Encodable, Equatable, Sendable, Identifiable {
    public var slot: SlotSuggestion
    /// "Today", "Tue, Oct 20"
    public var dayLabel: String
    /// "9:00 AM"
    public var timeLabel: String

    public init(slot: SlotSuggestion, dayLabel: String, timeLabel: String) {
        self.slot = slot
        self.dayLabel = dayLabel
        self.timeLabel = timeLabel
    }

    public var id: String { slot.id }

    /// Flat, as the TypeScript spreads the slot into it.
    public func encode(to encoder: Encoder) throws {
        try slot.encode(to: encoder)
        var c = encoder.container(keyedBy: Labels.self)
        try c.encode(dayLabel, forKey: .dayLabel)
        try c.encode(timeLabel, forKey: .timeLabel)
    }

    private enum Labels: String, CodingKey {
        case dayLabel, timeLabel
    }
}

public struct SuggestRoute<J: PlanJobFields> {
    public var techId: String
    public var techName: String
    public var date: String
    /// In route order; each job's `label` is its customer's name for "after …".
    public var jobs: [J]

    public init(techId: String, techName: String, date: String, jobs: [J]) {
        self.techId = techId
        self.techName = techName
        self.date = date
        self.jobs = jobs
    }
}

public struct SuggestedTimes: Encodable, Equatable, Sendable {
    public var suggestions: [SuggestedTime]
    public var note: String?
}

/// Suggest Times: the places a job fits best in the routes already planned on `dates`, without
/// moving anyone's time or running late. `job` is left out of the routes it's already on.
public func suggestTimes<J: PlanJobFields>(
    _ ctx: PlanContext, id: String?, location: LatLng?, durationMin: Int, routes: [SuggestRoute<J>],
    drive: DriveFn, limit: Int = 5
) throws -> SuggestedTimes {
    let days: [TechDay] = try routes.map { r in
        let jobs = r.jobs.filter { $0.id != id }
        let stops = try zip(jobs, dayStops(ctx, r.techId, r.date, jobs)).map { j, s -> RouteStop in
            guard present(j.scheduledStart) else { return s }
            var fixed = s
            fixed.fixedStartMin = try localMinutes(j.scheduledStart!, ctx.timeZone)
            fixed.earliestMin = nil
            return fixed
        }
        var labels: [String: String] = [:]
        for j in jobs { labels[j.id] = j.label ?? "the job before" }
        return TechDay(
            date: r.date, techId: r.techId, techName: r.techName, stops: stops, labels: labels,
            notBeforeMin: r.date == ctx.today ? ctx.nowMin : nil)
    }
    let found = suggestSlots(
        location: location, durationMin: durationMin, days: days, depot: ctx.depot, day: workDay(ctx.settings),
        drive: drive, limit: limit)
    let suggestions = try found.map {
        SuggestedTime(
            slot: $0, dayLabel: $0.date == ctx.today ? "Today" : try formatDay($0.date, style: .short),
            timeLabel: minutesLabel($0.startMin))
    }
    let note =
        location == nil
        ? "This pool has no location yet, so these don’t count driving to it."
        : found.isEmpty ? "No gaps in the next working days. Use Move… to pick a day." : nil
    return SuggestedTimes(suggestions: suggestions, note: note)
}
