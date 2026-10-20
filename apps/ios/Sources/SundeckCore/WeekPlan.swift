import Foundation

// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from scratch"). Port of
// week-plan.ts. Pure: the caller loads the week, these functions put its movable jobs on days and
// techs, then order each day.

/// `PLAN_WEEK_LIMIT`: most jobs one run places (Mapbox's matrix takes 25 points a call).
public let planWeekLimit = 150

/// Minutes of extra driving a day's work counts as, per minute of it (a tie-breaker).
private let balance = 0.02

/// A tech's day the week may use, with what stays on it.
public struct WeekDay: Codable, Equatable, Sendable {
    public var techId: String
    public var date: String
    /// Stops that stay on this day: started or finished jobs, day locks, two-tech jobs, maintenance
    /// visits. Those that also keep their time carry `fixedStartMin`.
    public var stays: [RouteStop]
    /// Can't start before this (now, on today).
    public var earliestMin: Int?

    public init(techId: String, date: String, stays: [RouteStop], earliestMin: Int? = nil) {
        self.techId = techId
        self.date = date
        self.stays = stays
        self.earliestMin = earliestMin
    }
}

/// A job the week may move.
public struct WeekJob: Codable, Equatable, Sendable {
    public var id: String
    public var location: LatLng?
    public var durationMin: Int
    /// A time lock: it keeps this clock time on whatever day it goes to.
    public var timeMin: Int?
    /// Where it is now; nil for a job in Needs a Time.
    public var techId: String?
    public var date: String?
    /// Techs it may go to.
    public var techs: [String]

    public init(
        id: String, location: LatLng?, durationMin: Int, timeMin: Int? = nil, techId: String?, date: String?,
        techs: [String]
    ) {
        self.id = id
        self.location = location
        self.durationMin = durationMin
        self.timeMin = timeMin
        self.techId = techId
        self.date = date
        self.techs = techs
    }
}

public struct WeekPlacement: Codable, Equatable, Sendable {
    public var id: String
    public var techId: String
    public var date: String
}

public struct WeekPlanDay: Codable, Equatable, Sendable {
    public var techId: String
    public var date: String
    /// The day's stops in their new order (stays included).
    public var stops: [RouteStop]
    public var route: TimedRoute
}

public struct WeekPlan: Codable, Equatable, Sendable {
    public var placed: [WeekPlacement]
    /// Jobs from Needs a Time no day had room for: they stay there.
    public var unplaced: [String]
    /// Jobs past the run's limit, left for the next run.
    public var skipped: [String]
    public var days: [WeekPlanDay]
    /// Driving across the week before and after, minutes.
    public var driveBefore: Int
    public var driveAfter: Int
    /// Jobs that changed day or tech.
    public var moved: Int
    /// Each planned tech's share of the movable jobs: how many, and their minutes of work.
    public var split: [WeekSplit] = []
}

/// One tech's share of a planned week (`WeekPlan.split`).
public struct WeekSplit: Codable, Equatable, Sendable {
    public var techId: String
    public var jobs: Int
    public var minutes: Int

    public init(techId: String, jobs: Int, minutes: Int) {
        self.techId = techId
        self.jobs = jobs
        self.minutes = minutes
    }
}

private func dayKey(_ techId: String, _ date: String) -> String { "\(techId)|\(date)" }

private func asStop(_ j: WeekJob, _ earliest: Int?) -> RouteStop {
    RouteStop(
        id: j.id, location: j.location, durationMin: j.durationMin, fixedStartMin: j.timeMin,
        earliestMin: j.timeMin == nil ? earliest : nil)
}

/// JavaScript's default `sort()` on strings: by UTF-16 code units.
private func codeUnitSorted(_ items: [String]) -> [String] {
    items.sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
}

/// Put the week's movable jobs on days for the least driving. Each job, hardest first (time locks,
/// then farthest from the shop), goes where it adds the least driving without running a day late
/// or past its end; a tie keeps it on its own day, then the earlier day. Each day is then ordered
/// as Plan Route orders it. A job no day has room for stays where it was. The same week planned
/// twice gives the same answer.
///
/// `even` (owner, 2026-10-20: "select multiple techs when planning a week. Then it should split
/// the open jobs up evenly"): a job that may go to several techs goes to one whose share of the
/// week's movable work is within one job of the lightest, then where it adds the least driving.
/// When none of those has room, any tech that does.
public func planWeek(
    days input: [WeekDay], jobs inputJobs: [WeekJob], depot: LatLng?, day: WorkDay, drive: DriveFn,
    limit: Int = planWeekLimit, even: Bool = false
) -> WeekPlan {
    // The week tries every job in every place of every day: each leg's drive is worked out once.
    withoutActuallyEscaping(drive) { drive in
        planWeekRun(
            days: input, jobs: inputJobs, depot: depot, day: day, drive: rememberingDrive(drive), limit: limit,
            even: even)
    }
}

private func planWeekRun(
    days input: [WeekDay], jobs inputJobs: [WeekJob], depot: LatLng?, day: WorkDay, drive: DriveFn, limit: Int,
    even: Bool
) -> WeekPlan {
    let days = ECMA.sort(input) { a, b in
        let d = ECMA.localeCompare(a.date, b.date)
        return Double(d != 0 ? d : ECMA.localeCompare(a.techId, b.techId))
    }
    var byKey: [String: WeekDay] = [:]
    for d in days { byKey[dayKey(d.techId, d.date)] = d }
    let jobs = ECMA.sort(inputJobs) { Double(ECMA.localeCompare($0.id, $1.id)) }
    let considered = Array(jobs.prefix(max(0, limit)))
    let skipped = jobs.dropFirst(max(0, limit)).map(\.id)

    // The week as it is now, for "less driving than before".
    var now: [String: [RouteStop]] = [:]
    for d in days { now[dayKey(d.techId, d.date)] = d.stays }
    for j in jobs {
        guard let t = j.techId, let date = j.date, let d = byKey[dayKey(t, date)] else { continue }
        now[dayKey(t, date)]!.append(asStop(j, d.earliestMin))
    }
    func driveOf(_ stops: [RouteStop]) -> Int { timeRoute(stops, depot: depot, day: day, drive: drive).driveMin }
    let driveBefore = now.values.filter { !$0.isEmpty }.reduce(0) { $0 + driveOf($1) }

    // Hardest first: time locks (fewest places fit), then farthest from the shop.
    func away(_ j: WeekJob) -> Int {
        if let depot, let l = j.location { return drive(depot, l) }
        return 0
    }
    let order = ECMA.sort(considered) { a, b in
        let locked = (b.timeMin != nil ? 1 : 0) - (a.timeMin != nil ? 1 : 0)
        if locked != 0 { return Double(locked) }
        let far = away(b) - away(a)
        if far != 0 { return Double(far) }
        return Double(ECMA.localeCompare(a.id, b.id))
    }

    var planned: [String: [RouteStop]] = [:]
    for d in days { planned[dayKey(d.techId, d.date)] = d.stays }
    var placed: [WeekPlacement] = []
    var unplaced: [String] = []
    var techIds: [String] = []
    for d in days where !techIds.contains(d.techId) { techIds.append(d.techId) }
    var load: [String: Int] = Dictionary(uniqueKeysWithValues: techIds.map { ($0, 0) })
    var count: [String: Int] = Dictionary(uniqueKeysWithValues: techIds.map { ($0, 0) })

    /// Where a job adds the least driving, on the days of the techs `ok` allows.
    func cheapest(_ j: WeekJob, _ ok: (String) -> Bool) -> (k: String, at: Int, cost: Double, home: Bool, i: Int)? {
        var best: (k: String, at: Int, cost: Double, home: Bool, i: Int)?
        for (di, d) in days.enumerated() where ok(d.techId) {
            let k = dayKey(d.techId, d.date)
            let stops = planned[k]!
            let was = timeRoute(stops, depot: depot, day: day, drive: drive)
            let stop = asStop(j, d.earliestMin)
            for at in 0...stops.count {
                var next = stops
                next.insert(stop, at: at)
                let r = timeRoute(next, depot: depot, day: day, drive: drive)
                // Never run a day later or longer than it was.
                if r.lateMin > was.lateMin || r.overtimeMin > was.overtimeMin { continue }
                // Driving added, plus a little for how full the day already is, so near-ties
                // spread the work across the week instead of filling the first day.
                let cost =
                    Double(routeCost(r) - routeCost(was))
                    + (stops.isEmpty ? 0 : Double(was.backMin - day.startMin) * balance)
                let home = j.techId == d.techId && j.date == d.date
                let better: Bool
                if let b = best {
                    better = cost < b.cost - 1e-9 || (abs(cost - b.cost) <= 1e-9 && home && !b.home)
                } else {
                    better = true
                }
                if better { best = (k, at, cost, home, di) }
            }
        }
        return best
    }

    for j in order {
        let allowed = j.techs.filter { load[$0] != nil }
        let lightest = allowed.map { load[$0]! }.min() ?? Int.max
        let fair = Set(
            even && allowed.count > 1 ? allowed.filter { load[$0]! < lightest + j.durationMin } : allowed)
        var best = cheapest(j) { fair.contains($0) }
        if best == nil && fair.count < allowed.count { best = cheapest(j) { allowed.contains($0) } }
        guard let b = best else {
            // A scheduled job that fits nowhere stays on its own day, in its cheapest place, so
            // that day's times still count it; one from Needs a Time stays there.
            if let t = j.techId, let date = j.date, let home = byKey[dayKey(t, date)] {
                let k = dayKey(home.techId, home.date)
                var stops = planned[k]!
                let stop = asStop(j, home.earliestMin)
                var at = stops.count
                var cheapest = Double.infinity
                for i in 0...stops.count {
                    var next = stops
                    next.insert(stop, at: i)
                    let c = Double(routeCost(timeRoute(next, depot: depot, day: day, drive: drive)))
                    if c < cheapest - 1e-9 {
                        cheapest = c
                        at = i
                    }
                }
                stops.insert(stop, at: at)
                planned[k] = stops
                placed.append(WeekPlacement(id: j.id, techId: home.techId, date: home.date))
                load[home.techId, default: 0] += j.durationMin
                count[home.techId, default: 0] += 1
            } else {
                unplaced.append(j.id)
            }
            continue
        }
        planned[b.k]!.insert(asStop(j, days[b.i].earliestMin), at: b.at)
        let techId = days[b.i].techId
        placed.append(WeekPlacement(id: j.id, techId: techId, date: days[b.i].date))
        load[techId, default: 0] += j.durationMin
        count[techId, default: 0] += 1
    }

    var out: [WeekPlanDay] = []
    var driveAfter = 0
    for d in days {
        let stops = planned[dayKey(d.techId, d.date)]!
        if stops.isEmpty { continue }
        let (o, route) = optimizeRoute(stops, depot: depot, day: day, drive: drive)
        driveAfter += route.driveMin
        out.append(WeekPlanDay(techId: d.techId, date: d.date, stops: o.map { stops[$0] }, route: route))
    }
    let moved = placed.filter { p in
        let j = jobs.first { $0.id == p.id }!
        return j.techId != p.techId || j.date != p.date
    }.count
    return WeekPlan(
        placed: ECMA.sort(placed) { Double(ECMA.localeCompare($0.id, $1.id)) },
        unplaced: codeUnitSorted(unplaced), skipped: skipped, days: out, driveBefore: driveBefore,
        driveAfter: driveAfter, moved: moved,
        split: techIds.map { WeekSplit(techId: $0, jobs: count[$0]!, minutes: load[$0]!) })
}

/// How Plan Week split the jobs, for the banner's second line when it planned several techs:
/// "Ana 6 jobs · Ben 5 jobs". Empty for one tech.
public func planWeekSplit(_ split: [WeekSplit], name: (String) -> String) -> String {
    if split.count < 2 { return "" }
    return split.map { "\(name($0.techId)) \($0.jobs) \($0.jobs == 1 ? "job" : "jobs")" }.joined(separator: " · ")
}

public func planWeekSplit(_ p: WeekPlan, name: (String) -> String) -> String { planWeekSplit(p.split, name: name) }

/// "Moved 9 jobs · 3 hr 10 min less driving", or why nothing changed.
public func planWeekSummary(
    moved: Int, driveBefore: Int, driveAfter: Int, unplaced: Int, skipped: Int,
    durationLabel label: (Int) -> String = durationLabel
) -> String {
    var parts: [String] = []
    parts.append(moved == 0 ? "Nothing to move" : "Moved \(moved) \(moved == 1 ? "job" : "jobs")")
    let saved = driveBefore - driveAfter
    if saved > 0 { parts.append("\(label(saved)) less driving") }
    if unplaced > 0 {
        parts.append("\(unplaced) didn’t fit and \(unplaced == 1 ? "stays" : "stay") in Needs a Time")
    }
    if skipped > 0 { parts.append("\(skipped) left for the next run") }
    return parts.joined(separator: " · ")
}

public func planWeekSummary(_ p: WeekPlan, durationLabel label: (Int) -> String = durationLabel) -> String {
    planWeekSummary(
        moved: p.moved, driveBefore: p.driveBefore, driveAfter: p.driveAfter, unplaced: p.unplaced.count,
        skipped: p.skipped.count, durationLabel: label)
}
