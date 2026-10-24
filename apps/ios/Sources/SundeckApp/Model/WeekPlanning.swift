import Foundation
import SundeckCore
import SundeckSync

// Plan Week on the phone (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from
// scratch"): the week's movable jobs on days and techs for the least driving, each day then ordered
// as Plan Route orders it, with one Undo. The rules are core `planWeek`; what's here builds its
// input from the phone's synced jobs exactly as apps/web/src/app/actions/week-plan.ts does on the
// server, and turns the plan into rows saved through the sync layer.

/// "Puts this week’s movable jobs …": the Plan Week sheet's footnote (`PLAN_WEEK_HELP`).
public let planWeekHelp =
    "Puts this week’s movable jobs on days for the least driving. Started, locked, two-tech and maintenance jobs stay where they are."

/// What a job was before Plan Week changed it, for Undo (`WeekUndoRow`).
public struct WeekUndoRow: Equatable, Sendable {
    public var id: String
    public var status: String
    public var assignedUserId: String?
    public var scheduledStart: String?
    public var scheduledEnd: String?
    public var routeOrder: Int?

    init(_ j: ScheduleJob) {
        id = j.id
        status = j.status.rawValue
        assignedUserId = j.assignedUserId
        scheduledStart = j.scheduledStart
        scheduledEnd = j.scheduledEnd
        routeOrder = j.routeOrder
    }

    /// The row's values as they were, every planned column (`restore`).
    public var values: Row {
        [
            "status": .string(status),
            "assigned_user_id": assignedUserId.map(JSONValue.string) ?? .null,
            "scheduled_start": scheduledStart.map(JSONValue.string) ?? .null,
            "scheduled_end": scheduledEnd.map(JSONValue.string) ?? .null,
            "route_order": routeOrder.map { .number(Double($0)) } ?? .null,
        ]
    }
}

/// What core `planWeek` takes, built from the phone's jobs, and what it needs to save the result.
public struct WeekPlanInput {
    public var dates: [String]
    public var techs: [String]
    public var days: [WeekDay]
    public var jobs: [WeekJob]
    /// Stops that stay, by "techId|jobId".
    public var stays: [String: RouteStop]
    /// Each job's values before, for the rows that change and for Undo.
    public var before: [String: WeekUndoRow]
    public var durations: [String: Int]
    /// Jobs from Needs a Time without a map location (they stay there).
    public var unlocated: Int
}

/// The rows Plan Week saves, what to say, and the rows that put it back.
public struct WeekPlanOutcome: Sendable {
    public var updates: [JobUpdate]
    public var message: String
    public var undo: [WeekUndoRow]
    /// How the jobs were split between several techs ("Ana 6 jobs · Ben 5 jobs"), the banner's
    /// second line; nil for one tech.
    public var detail: String? = nil
}

/// The techs a plan covers, in the team's order (owner, 2026-10-20: "select multiple techs when
/// planning a week"): every active tech for "all", else the picked ones on the team, never twice.
public func planTechs(_ picked: [String], team: [TeamMember]) -> [String] {
    if picked.contains("all") { return team.filter(\.active).map(\.id) }
    let want = Set(picked)
    return team.filter { want.contains($0.id) }.map(\.id)
}

/// What Plan Week's "Plan for" reads closed: "Everyone" when every tech is picked, the tech's name
/// for one, else "2 Techs". Empty when none is picked.
public func planForLabel(_ picked: [String], techs: [TeamMember]) -> String {
    let chosen = techs.filter { picked.contains("all") || picked.contains($0.id) }
    if chosen.isEmpty { return "" }
    if chosen.count == techs.count && techs.count > 1 { return "Everyone" }
    if chosen.count == 1 { return chosen[0].name }
    return "\(chosen.count) Techs"
}

/// A tap on a row of the "Plan for" checklist: Everyone selects every tech, or clears them all
/// when all are on; a tech's row turns that tech on or off. The list never holds "all".
public func togglePlanTech(_ picked: [String], _ value: String, techs: [TeamMember]) -> [String] {
    let ids = techs.map(\.id)
    let now = picked.contains("all") ? ids : picked.filter { ids.contains($0) }
    if value == "all" { return now.count == ids.count ? [] : ids }
    return now.contains(value) ? now.filter { $0 != value } : ids.filter { $0 == value || now.contains($0) }
}

/// The days Plan Week may use: the week's days from today on (the Plan Week button shows only
/// when there are some).
public func planWeekDates(_ days: [String], today: String) -> [String] { days.filter { $0 >= today } }

/// The techs Plan Week can plan for: every active member, or only you when you see only your own
/// jobs (website `movers`).
public func planWeekTechs(_ team: [TeamMember], ctx: ScheduleContext) -> [TeamMember] {
    ctx.seesAll ? team.filter(\.active) : team.filter { $0.id == ctx.userId }
}

/// Jobs in Needs a Time with nobody on them that Plan Week may place this week (the switch's
/// "{n} waiting").
public func planWeekWaiting(_ tray: [ScheduleJob], dates: [String], timeZone: String) -> Int {
    tray.filter { j in
        j.assignedUserId == nil && (j.start.map { dates.contains(localDay($0, timeZone: timeZone)) } ?? true)
    }.count
}

/// The plan's input (website `planWeek`, up to the call to core `planWeek`). Started and finished
/// jobs, day locks, two-tech jobs and maintenance visits stay on their days; time locks keep their
/// clock time. A job given to a tech stays that tech's. `tray`: also place the jobs in Needs a
/// Time that nobody has yet; off, only the planned techs' own jobs move.
public func weekPlanInput(
    dates input: [String], techs picked: [String], tray: Bool, jobs all: [ScheduleJob], ctx: ScheduleContext,
    team: [TeamMember], drive: DriveTimes
) throws -> WeekPlanInput {
    let dates = Array(Set(input)).filter { d in
        d >= ctx.today && weekday(d).map { ctx.settings.workDays.contains($0) } == true
    }.sorted()
    if dates.isEmpty { throw ScheduleProblem("No working days left this week to plan.") }
    let routes = loadRoutes(all, ctx: ctx, dates: dates, team: team, drive: drive).routes
    let techs = planTechs(picked, team: team)
    if techs.isEmpty { throw ScheduleProblem("Pick a week and a tech.") }
    // Several techs: a job may go to any of them, split evenly.
    let several = techs.count > 1

    var before: [String: WeekUndoRow] = [:]
    var days: [WeekDay] = []
    var stays: [String: RouteStop] = [:]
    var jobs: [WeekJob] = []
    var durations: [String: Int] = [:]
    func localMin(_ iso: String?) throws -> Int? { try iso.map { try localMinutes($0, ctx.timeZone) } }

    // Each tech's days: what stays, and what may move.
    for techId in techs {
        for date in dates {
            // Each tech's day starts and ends at their start (home or the shop; owner, 2026-10-21).
            var here = WeekDay(
                techId: techId, date: date, stays: [], earliestMin: date == ctx.today ? ctx.nowMin : nil,
                start: .some(ctx.start(for: techId).at))
            for j in routes[routeKey(techId, date)]?.jobs ?? [] {
                let own = j.assignedUserId == techId
                let lock = jobLock(j)
                let movesDay =
                    own && canUnschedule(j.status) && j.secondTechId == nil && j.servicePlanId == nil
                    && lock != .day && lock != .both && j.location != nil
                if movesDay {
                    before[j.id] = WeekUndoRow(j)
                    durations[j.id] = jobMinutes(j, ctx.settings)
                    jobs.append(
                        WeekJob(
                            id: j.id, location: j.location, durationMin: jobMinutes(j, ctx.settings),
                            timeMin: lock == .time ? try localMin(j.scheduledStart) : nil, techId: techId, date: date,
                            techs: several ? techs : [techId]))
                    continue
                }
                let stop = try stopFor(
                    j, timeZone: ctx.timeZone, settings: ctx.settings, techId: techId, nowMin: here.earliestMin)
                if own { before[j.id] = WeekUndoRow(j) }
                stays["\(techId)|\(j.id)"] = stop
                here.stays.append(stop)
            }
            days.append(here)
        }
    }

    // Needs a Time: jobs without a time, and booked jobs with nobody on them this week. A job
    // given to a tech is that tech's (planned only when they are); one with nobody on it is placed
    // only when the office asked for Needs a Time too.
    let considered = needsATime(all, ctx: ctx).filter { j in
        j.assignedUserId.map { techs.contains($0) } ?? tray
    }
    for j in considered {
        if let start = j.start, !dates.contains(localDay(start, timeZone: ctx.timeZone)) { continue }
        if !canUnschedule(j.status) || j.secondTechId != nil || j.location == nil { continue }
        let lock = jobLock(j)
        before[j.id] = WeekUndoRow(j)
        durations[j.id] = jobMinutes(j, ctx.settings)
        jobs.append(
            WeekJob(
                id: j.id, location: j.location, durationMin: jobMinutes(j, ctx.settings),
                timeMin: lock.keepsTime ? try localMin(j.scheduledStart) : nil, techId: nil, date: nil,
                techs: j.assignedUserId.map { [$0] } ?? techs))
    }
    if jobs.isEmpty {
        throw ScheduleProblem("Nothing to plan: every job this week is locked, started, or shared with a second tech.")
    }
    // Past the run's limit, the week's own jobs go first, then the jobs waiting longest (ids are
    // UUIDv7, so they sort by when they were made). A stable sort, as JavaScript's is.
    jobs = jobs.enumerated().sorted { a, b in
        let (x, y) = (a.element, b.element)
        if (x.date == nil) != (y.date == nil) { return x.date != nil }
        if x.date == nil && x.id != y.id { return x.id < y.id }
        return a.offset < b.offset
    }.map(\.element)

    return WeekPlanInput(
        dates: dates, techs: techs, days: days, jobs: jobs, stays: stays, before: before, durations: durations,
        unlocated: considered.filter { $0.location == nil }.count)
}

/// The rows a plan saves (only those that change), its summary, and the rows that undo it.
public func weekPlanOutcome(_ plan: WeekPlan, _ input: WeekPlanInput, ctx: ScheduleContext) throws -> WeekPlanOutcome {
    let moving = Set(input.jobs.map(\.id))
    var updates: [JobUpdate] = []
    var undo: [WeekUndoRow] = []
    for d in plan.days {
        for (i, s) in d.stops.enumerated() {
            let t = d.route.stops[i]
            let stay = input.stays["\(d.techId)|\(s.id)"]
            if let stay, !stay.own { continue }
            var row: Row = ["route_order": .number(Double(i + 1))]
            let moves = moving.contains(s.id)
            let retime = moves ? s.fixedStartMin == nil : stay?.movable ?? false
            let startMin = retime ? t.startMin : moves ? s.fixedStartMin : nil
            if let startMin {
                let start = try zonedMinutesToIso(d.date, startMin, ctx.timeZone)
                let minutes = input.durations[s.id] ?? s.durationMin
                row["scheduled_start"] = .string(start)
                row["scheduled_end"] = .string(
                    parseInstant(start).map { isoString($0.addingTimeInterval(Double(minutes) * 60)) } ?? start)
            }
            if moves {
                row["assigned_user_id"] = .string(d.techId)
                row["status"] = .string(JobStatus.scheduled.rawValue)
            }
            let was = input.before[s.id]
            if let was, row.allSatisfy({ key, value in sameValue(was.values[key], value) }) { continue }
            updates.append(JobUpdate(id: s.id, values: row))
            if let was { undo.append(was) }
        }
    }
    let message =
        planWeekSummary(plan)
        + (input.unlocated > 0 ? " · \(input.unlocated) without a map location left in Needs a Time" : "")
    return WeekPlanOutcome(updates: updates, message: message, undo: undo)
}

/// Plan Week: the whole run, from the phone's jobs to the rows to save.
/// With two or more techs, the open jobs are split evenly by minutes of work (core `planWeek`
/// `even`), and the outcome's `detail` says how ("Ana 6 jobs · Ben 5 jobs").
public func planTheWeek(
    dates: [String], techs: [String], tray: Bool, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember],
    drive: DriveTimes
) throws -> WeekPlanOutcome {
    let input = try weekPlanInput(
        dates: dates, techs: techs, tray: tray, jobs: jobs, ctx: ctx, team: team, drive: drive)
    let several = input.techs.count > 1
    let plan = planWeek(
        days: input.days, jobs: input.jobs, depot: ctx.depot, day: ctx.workDay, drive: drive.drive, even: several)
    var outcome = try weekPlanOutcome(plan, input, ctx: ctx)
    if several {
        let split = planWeekSplit(plan) { id in team.first { $0.id == id }?.name ?? id }
        outcome.detail = split.isEmpty ? nil : split
    }
    return outcome
}

/// Undo Plan Week: each job back as it was.
public func undoWeekPlan(_ rows: [WeekUndoRow]) -> [JobUpdate] { rows.map { JobUpdate(id: $0.id, values: $0.values) } }

/// "Put back as it was." (`undoPlanWeek`)
public let weekPlanUndone = "Put back as it was."

/// Equal values, times compared as instants (rows hold them in more than one form).
func sameValue(_ a: JSONValue?, _ b: JSONValue) -> Bool {
    if case .string(let x)? = a, case .string(let y) = b, x.contains("T"), y.contains("T"),
        let dx = parseInstant(x), let dy = parseInstant(y)
    {
        return dx == dy
    }
    return (a ?? .null) == b
}
