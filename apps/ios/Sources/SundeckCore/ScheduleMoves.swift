import Foundation

// Planning a day, moving a job, and suggesting times, worked out on the phone (spec 5.6 and 6.3:
// the native apps plan from their own database and save through the sync layer). Port of
// schedule-moves.ts: time-locked jobs keep their clock time (`jobLock`, as the website's moveJob
// does), started jobs stay on the schedule, and stops after a moved job move later only when
// they must. Pure: callers load the jobs and drive times and save the rows.

public struct PlanContext: Codable, Sendable {
    public var timeZone: String
    public var settings: RoutingSettings
    /// The shop, where routes start and end unless a tech starts from home (`starts`).
    public var depot: LatLng?
    /// The shop's today ("2026-10-19") and minutes after midnight now.
    public var today: String
    public var nowMin: Int
    /// The shop's member_start rows this person can read (their own, or everyone's for owners
    /// and admins). Each tech's day starts and ends at startFor(techId, starts, depot).
    public var starts: [MemberStart]?

    public init(
        timeZone: String, settings: RoutingSettings, depot: LatLng?, today: String, nowMin: Int,
        starts: [MemberStart]? = nil
    ) {
        self.timeZone = timeZone
        self.settings = settings
        self.depot = depot
        self.today = today
        self.nowMin = nowMin
        self.starts = starts
    }

    /// Where this tech's routes start and end in this context.
    func startOf(_ techId: String?) -> LatLng? { startFor(techId, starts, shop: depot).at }
}

public struct ScheduleChange: Encodable, Equatable, Sendable {
    public var updates: [JobChange]
    /// What happened, one short line for the banner ("Moved to 9:15 AM.").
    public var message: String?
    /// What to watch for, a second smaller line (owner, 2026-10-20: the banner at the top).
    public var detail: String?
    public var error: String?
    /// Optimize: the order stayed as it was (no Undo).
    public var unchanged: Bool?
    /// A move that also moves a shared job's other tech into a conflict: ask before saving (owner,
    /// 2026-10-24). The rows are the same either way; Cancel saves nothing.
    public var confirm: MoveConfirm?

    public init(
        updates: [JobChange], message: String? = nil, detail: String? = nil, error: String? = nil,
        unchanged: Bool? = nil, confirm: MoveConfirm? = nil
    ) {
        self.updates = updates
        self.message = message
        self.detail = detail
        self.error = error
        self.unchanged = unchanged
        self.confirm = confirm
    }

    static func fail(_ error: String) -> ScheduleChange { ScheduleChange(updates: [], error: error) }
}

/// A plain iOS alert: the title, the body, and the button that saves anyway (beside Cancel).
public struct MoveConfirm: Codable, Equatable, Sendable {
    public var title: String
    public var message: String
    public var action: String
}

/// Optimize's banner words (`OPTIMIZE_WORDS`; owner, 2026-10-22 and 2026-10-24).
public enum OptimizeWords {
    /// Every stop could move and the order stays.
    public static let alreadyBest = "Already the best order"
    public static let noChange = "No change"
    public static let optimized = "Optimized"
    public static let rest = "the rest are already in the best order"
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

// MARK: - Shared jobs (owner, 2026-10-24)

/// The other tech's day on shared jobs: their jobs that day in route order, the shared ones among
/// them. Only pass it when you can see that tech's whole day and where it starts (owners and
/// admins); without it, shared jobs keep their times.
public struct PartnerDay<J: PlanJobFields> {
    public var techId: String
    public var jobs: [J]

    public init(techId: String, jobs: [J]) {
        self.techId = techId
        self.jobs = jobs
    }
}

/// Who else is on a shared job, from `techId`'s side; nil for a job with one tech.
public func partnerOf<J: PlanJobFields>(_ job: J, _ techId: String) -> String? {
    guard present(job.secondTechId) else { return nil }
    return job.assignedUserId == techId ? job.secondTechId : job.assignedUserId
}

/// A shared job at a new time, as the other tech's day would have it.
public struct PartnerMove: Codable, Equatable, Sendable {
    public var id: String
    public var location: LatLng?
    public var startMin: Int
    public var durationMin: Int

    public init(id: String, location: LatLng?, startMin: Int, durationMin: Int) {
        self.id = id
        self.location = location
        self.startMin = startMin
        self.durationMin = durationMin
    }
}

/// What a shared job's new time would do to the other tech's day.
public struct PartnerProblem: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        /// It runs into another of their jobs, travel included.
        case overlap
        /// They can't get there from where their day starts.
        case early
        /// Their day runs past its end.
        case overtime
    }

    /// The shared job whose new time causes it.
    public var jobId: String
    public var kind: Kind
    /// The other job it runs into, and its time (minutes after midnight).
    public var otherId: String?
    public var otherMin: Int?
}

private func savedMin<J: PlanJobFields>(_ j: J, _ timeZone: String) throws -> Int? {
    present(j.scheduledStart) ? try localMinutes(j.scheduledStart!, timeZone) : nil
}

private func byTime(_ stops: [RouteStop]) -> [RouteStop] {
    ECMA.sort(stops) { a, b in
        let t = (a.fixedStartMin.map(Double.init) ?? .infinity) - (b.fixedStartMin.map(Double.init) ?? .infinity)
        if t != 0 && !t.isNaN { return t }
        return Double(ECMA.localeCompare(a.id, b.id))
    }
}

/// Whether shared jobs at new times still fit the other tech's day: each of their jobs keeps its
/// time, from their own start (home or the shop), and none may start later than it does now (an
/// overlap, travel included), nor their day run longer past its end. The first problem in their
/// day's order, or nil. `moves` are the shared jobs with this tech at their new times, checked
/// together.
public func partnerProblem<J: PlanJobFields>(
    _ ctx: PlanContext, _ partner: PartnerDay<J>, _ moves: [PartnerMove], drive: DriveFn
) throws -> PartnerProblem? {
    guard let firstMove = moves.first else { return nil }
    let moving = Set(moves.map(\.id))
    let asStop = { (j: J) throws -> RouteStop in
        RouteStop(
            id: j.id, location: j.location, durationMin: jobMinutes(j, ctx.settings),
            fixedStartMin: try savedMin(j, ctx.timeZone))
    }
    let before = byTime(try partner.jobs.map(asStop))
    let after = byTime(
        try partner.jobs.filter { !moving.contains($0.id) }.map(asStop)
            + moves.map {
                RouteStop(id: $0.id, location: $0.location, durationMin: $0.durationMin, fixedStartMin: $0.startMin)
            })
    let start = ctx.startOf(partner.techId)
    let hours = workDay(ctx.settings)
    let was = timeRoute(before, depot: start, day: hours, drive: drive)
    let now = timeRoute(after, depot: start, day: hours, drive: drive)
    var lateBefore: [String: Int] = [:]
    for t in was.stops { lateBefore[t.id] = t.lateMin }
    for (i, t) in now.stops.enumerated() {
        if t.lateMin <= lateBefore[t.id] ?? 0 { continue }
        let s = after[i]
        if moving.contains(s.id) {
            guard i > 0 else { return PartnerProblem(jobId: s.id, kind: .early) }
            let prev = after[i - 1]
            return PartnerProblem(jobId: s.id, kind: .overlap, otherId: prev.id, otherMin: prev.fixedStartMin)
        }
        // An unmoved job runs late: the shared job moved in ahead of it is the cause.
        let cause = after[..<i].last { moving.contains($0.id) }
        return PartnerProblem(
            jobId: cause?.id ?? firstMove.id, kind: .overlap, otherId: s.id, otherMin: s.fixedStartMin)
    }
    if now.overtimeMin > was.overtimeMin {
        let last = after.last { moving.contains($0.id) }
        return PartnerProblem(jobId: last?.id ?? firstMove.id, kind: .overtime)
    }
    return nil
}

/// Why Optimize kept a stop's time.
public struct KeptStop: Codable, Equatable, Sendable {
    public enum Reason: String, Codable, Sendable {
        /// Started, a time promised to the customer (a Time or Both lock), or shared with `techId`.
        case started, time, shared
    }

    public var id: String
    public var reason: Reason
    public var techId: String?

    public init(id: String, reason: Reason, techId: String? = nil) {
        self.id = id
        self.reason = reason
        self.techId = techId
    }
}

/// Optimize's plan for a tech's day, before it's turned into rows and words.
public struct DayPlan: Sendable {
    /// The day's stops in their given order.
    public var stops: [RouteStop]
    /// The new order (indexes into `stops`) and its times.
    public var order: [Int]
    public var route: TimedRoute
    /// The day as it is, for "less driving".
    public var before: TimedRoute
    /// Stops kept at their time, in the day's order.
    public var kept: [KeptStop]
    /// Shared jobs planning may move (their new times fit the other tech's day).
    public var freed: [String]
}

/// Optimize's plan (owner, 2026-10-24): a shared job may move too when its new time also fits the
/// other tech's day (`partners`; partnerProblem). Every shared job that has a partner day is free
/// at first; after each run, one that doesn't fit is put back at its time and the day is planned
/// again, until every moved one fits. Started jobs and times promised to the customer never move.
/// The same day planned twice gives the same answer.
public func planTechDay<J: PlanJobFields>(
    _ ctx: PlanContext, _ techId: String, _ date: String, _ jobs: [J], drive: DriveFn,
    partners: [PartnerDay<J>] = []
) throws -> DayPlan {
    let base = try dayStops(ctx, techId, date, jobs)
    let hours = workDay(ctx.settings)
    let start = ctx.startOf(techId)
    var days: [String: PartnerDay<J>] = [:]
    for p in partners where days[p.techId] == nil { days[p.techId] = p }
    var sharedIds: [String] = []
    for j in jobs where lockReason(j) == .twoTechs {
        if let partner = partnerOf(j, techId), days[partner] != nil, !sharedIds.contains(j.id) {
            sharedIds.append(j.id)
        }
    }
    let shared = Set(sharedIds)
    var pinned = Set<String>()
    let earliest = date == ctx.today ? ctx.nowMin : nil
    var stops = base
    var plan = (order: [Int](), route: timeRoute([], depot: start, day: hours, drive: drive))
    // Each run that doesn't fit pins one more shared job, so this ends.
    for _ in 0...shared.count {
        stops = base.map { s in
            guard shared.contains(s.id), !pinned.contains(s.id) else { return s }
            var free = s
            free.movable = true
            free.fixedStartMin = nil
            free.earliestMin = earliest
            return free
        }
        plan = optimizeRoute(stops, depot: start, day: hours, drive: drive)
        // The shared jobs that moved, by the other tech.
        var moves: [(partner: String, moves: [PartnerMove])] = []
        for (at, i) in plan.order.enumerated() {
            let s = stops[i]
            guard shared.contains(s.id), !pinned.contains(s.id) else { continue }
            let t = plan.route.stops[at]
            if try savedMin(jobs[i], ctx.timeZone) == t.startMin { continue }
            let partner = partnerOf(jobs[i], techId)!
            let move = PartnerMove(id: s.id, location: s.location, startMin: t.startMin, durationMin: s.durationMin)
            if let k = moves.firstIndex(where: { $0.partner == partner }) {
                moves[k].moves.append(move)
            } else {
                moves.append((partner, [move]))
            }
        }
        var fits = true
        for (partner, list) in moves.sorted(by: { $0.partner < $1.partner }) {
            if let problem = try partnerProblem(ctx, days[partner]!, list, drive: drive) {
                pinned.insert(problem.jobId)
                fits = false
            }
        }
        if fits { break }
    }
    var kept: [KeptStop] = []
    for (i, j) in jobs.enumerated() where !stops[i].movable {
        switch lockReason(j) {
        case .started: kept.append(KeptStop(id: j.id, reason: .started))
        case .fixed, .time: kept.append(KeptStop(id: j.id, reason: .time))
        case .twoTechs: kept.append(KeptStop(id: j.id, reason: .shared, techId: partnerOf(j, techId)))
        case nil: break
        }
    }
    return DayPlan(
        stops: stops, order: plan.order, route: plan.route,
        before: timeRoute(stops, depot: start, day: hours, drive: drive), kept: kept,
        freed: sharedIds.filter { !pinned.contains($0) })
}

private func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

private struct KeptGroup {
    var key: String
    var reason: KeptStop.Reason
    var name: String
    var count: Int
}

/// Kept stops by reason, in the order reasons first appear: started, time, then each tech.
private func keptGroups(_ kept: [KeptStop], _ names: [String: String]) -> [KeptGroup] {
    var groups: [KeptGroup] = []
    for k in kept {
        let key = k.reason == .shared ? "shared|\(k.techId ?? "")" : k.reason.rawValue
        if let i = groups.firstIndex(where: { $0.key == key }) {
            groups[i].count += 1
        } else {
            let name = k.techId.flatMap { names[$0] }.flatMap { $0.isEmpty ? nil : $0 } ?? "another tech"
            groups.append(KeptGroup(key: key, reason: k.reason, name: name, count: 1))
        }
    }
    let rank: (KeptStop.Reason) -> Double = { r in
        switch r {
        case .started: 0
        case .time: 1
        case .shared: 2
        }
    }
    return ECMA.sort(groups) { rank($0.reason) - rank($1.reason) }
}

private func keptLabel(_ g: KeptGroup) -> String {
    switch g.reason {
    case .started: "started"
    case .time: "time promised to the customer"
    case .shared: "shared with \(g.name)"
    }
}

/// Why stops stayed, as a note: "1 stop stayed: shared with Jake Turner", "3 stops stayed: 1
/// started, 2 shared with Jake Turner". Nil when every stop could move.
public func keptNote(_ kept: [KeptStop], names: [String: String] = [:]) -> String? {
    guard !kept.isEmpty else { return nil }
    let groups = keptGroups(kept, names)
    let n = kept.count
    let why =
        groups.count == 1
        ? keptLabel(groups[0]) : groups.map { "\($0.count) \(keptLabel($0))" }.joined(separator: ", ")
    return "\(n) \(plural(n, "stop", "stops")) stayed: \(why)"
}

/// Optimize's line when no stop could move: "No change: all 3 stops are shared with Jake Turner, so
/// their times stay." For several reasons, each with its count.
public func nothingMoved(_ kept: [KeptStop], names: [String: String] = [:]) -> String {
    let groups = keptGroups(kept, names)
    let n = kept.count
    if groups.count != 1 { return "\(OptimizeWords.noChange): \(keptNote(kept, names: names) ?? "")." }
    let g = groups[0]
    let one = n == 1
    let what =
        switch g.reason {
        case .started: one ? "has started" : "have started"
        case .time: one ? "has a time promised to the customer" : "have times promised to the customer"
        case .shared: "\(one ? "is" : "are") shared with \(g.name)"
        }
    return one
        ? "\(OptimizeWords.noChange): the stop \(what), so its time stays."
        : "\(OptimizeWords.noChange): \(n == 2 ? "both" : "all \(n)") stops \(what), so their times stay."
}

/// Optimize (once Plan Route): order a tech's day (its jobs in route order) for the least driving,
/// keep promised times, and say what changed and what stayed (owner, 2026-10-24: "Already the best
/// order" only when every stop could move). `partners`: the other techs' days on shared jobs
/// (planTechDay); `names`: who they are, by user id.
public func planDay<J: PlanJobFields>(
    _ ctx: PlanContext, _ techId: String, _ date: String, _ jobs: [J], drive: DriveFn,
    partners: [PartnerDay<J>] = [], names: [String: String] = [:]
) throws -> ScheduleChange {
    if date < ctx.today { return .fail("Past days can’t be planned.") }
    if jobs.isEmpty { return .fail("Nothing scheduled for this tech that day.") }
    let plan = try planTechDay(ctx, techId, date, jobs, drive: drive, partners: partners)
    let planned = plan.order.map { plan.stops[$0] }
    var updates = try routeUpdates(date, ctx.timeZone, planned, plan.route)
    // A shared job this tech is second on: only its new time (its place is the main tech's).
    let freed = Set(plan.freed)
    for (at, s) in planned.enumerated() where !s.own && freed.contains(s.id) {
        let start = try zonedMinutesToIso(date, plan.route.stops[at].startMin, ctx.timeZone)
        updates.append(
            JobChange(
                id: s.id, scheduledStart: .some(start), scheduledEnd: .some(try isoPlusMinutes(start, s.durationMin)))
        )
    }
    let unchanged = plan.order.enumerated().allSatisfy { $0.offset == $0.element }
    let saved = plan.before.driveMin - plan.route.driveMin
    let start = ctx.startOf(techId)
    let notes: [String?] = [
        plan.stops.contains { $0.location == nil } ? "driving to pools not on the map isn’t counted" : nil,
        start == nil ? "the shop has no location (Settings › Scheduling)" : nil,
    ]
    let stayed = keptNote(plan.kept, names: names)
    // One short line for the banner at the top of the screen (owner, 2026-10-20: the note under
    // the button "looks horrible"), and what stayed and what to watch for as a second line.
    let message: String
    let detail: String?
    if !unchanged {
        message = [
            OptimizeWords.optimized,
            saved > 0
                ? "\(durationLabel(saved)) less driving" : "\(durationLabel(plan.route.driveMin)) driving",
        ].joined(separator: " · ")
        detail = noteSentences([stayed] + notes)
    } else if plan.kept.isEmpty {
        message = OptimizeWords.alreadyBest
        detail = noteSentences(notes)
    } else if plan.kept.count == plan.stops.count {
        message = nothingMoved(plan.kept, names: names)
        detail = noteSentences(notes)
    } else {
        message = OptimizeWords.noChange
        detail = noteSentences([stayed, OptimizeWords.rest] + notes)
    }
    return ScheduleChange(updates: updates, message: message, detail: detail, unchanged: unchanged)
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
    /// The job's second tech's jobs on the new day, in route order, to check a shared job's new time
    /// against (owner, 2026-10-24). Nil when this person can't see that tech's whole day: the move
    /// then doesn't ask.
    public var partnerDay: [J]?
    /// Names by user id, for "Moved. Jake Turner’s visit moved too."
    public var names: [String: String]

    public init(
        job: J, tech: String?, date: String?, index: Int, targetDay: [J], fromDay: [J], seesAll: Bool, userId: String,
        partnerDay: [J]? = nil, names: [String: String] = [:]
    ) {
        self.job = job
        self.tech = tech
        self.date = date
        self.index = index
        self.targetDay = targetDay
        self.fromDay = fromDay
        self.seesAll = seesAll
        self.userId = userId
        self.partnerDay = partnerDay
        self.names = names
    }
}

private func firstName(_ name: String) -> String {
    let first = name.split(separator: " ", omittingEmptySubsequences: false).first.map(String.init) ?? ""
    return first.isEmpty ? name : first
}

/// What a hand move of a shared job says, and the alert to ask first (`sharedMove`).
public struct SharedMove: Equatable, Sendable {
    public var message: String
    public var confirm: MoveConfirm?
}

/// A shared job moved by hand to `startIso` on `date` (owner, 2026-10-24): it's one job, so its
/// second tech moves too. The banner says so ("Moved. Jake Turner’s visit moved too."), and when the
/// new time runs into that tech's day (`partnerDay`, partnerProblem), an alert asks first: "Move Jake
/// Turner’s Visit Too?" with Move Anyway and Cancel. Nil when the job has no second tech or keeps its
/// day and time.
public func sharedMove<J: PlanJobFields>(
    _ ctx: PlanContext, job: J, tech: String, date: String, startIso: String, partnerDay: [J]?,
    names: [String: String], drive: DriveFn
) throws -> SharedMove? {
    guard let partner = job.secondTechId, !partner.isEmpty, partner != tech else { return nil }
    let was = present(job.scheduledStart) ? ECMA.parseDate(job.scheduledStart!) : nil
    if let was, was == ECMA.parseDate(startIso) { return nil }
    let known = names[partner]
    let message = "Moved. \(known ?? "The second tech")’s visit moved too."
    guard let partnerDay else { return SharedMove(message: message) }
    let startMin = try localMinutes(startIso, ctx.timeZone)
    let move = PartnerMove(
        id: job.id, location: job.location, startMin: startMin, durationMin: jobMinutes(job, ctx.settings))
    guard
        let problem = try partnerProblem(ctx, PartnerDay(techId: partner, jobs: partnerDay), [move], drive: drive)
    else { return SharedMove(message: message) }
    let who = known ?? "the second tech"
    // "Jake’s 4:30 PM job": the first name, or "their" without a name.
    let whose = known.map { "\(firstName($0))’s" } ?? "their"
    let sameDay = present(job.scheduledStart) ? try dateIn(job.scheduledStart!, ctx.timeZone) == date : false
    let when =
        sameDay ? minutesLabel(startMin) : "\(try formatDay(date, style: .short)) at \(minutesLabel(startMin))"
    let what: String
    switch (problem.kind, problem.otherMin) {
    case (.overlap, let other?): what = "which overlaps \(whose) \(minutesLabel(other)) job"
    case (.overlap, nil): what = "which overlaps another of \(whose) jobs"
    case (.early, _): what = "earlier than \(known.map(firstName) ?? "they") can get there"
    case (.overtime, _): what = "which runs past the end of \(whose) day"
    }
    return SharedMove(
        message: message,
        confirm: MoveConfirm(
            title: "Move \(known ?? "the Second Tech")’s Visit Too?",
            message: "This also moves \(who) to \(when), \(what).", action: "Move Anyway"))
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
    let route = timeRoute(stops, depot: ctx.startOf(tech), day: workDay(ctx.settings), drive: drive)
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
    // A shared job moves its second tech too: say so, and ask first when it runs into their day.
    let shared = try sharedMove(
        ctx, job: job, tech: tech, date: date, startIso: mine.scheduledStart!!, partnerDay: input.partnerDay,
        names: input.names, drive: drive)
    // No times and no lateness (owner, 2026-10-21: "times are pretty irrelevant").
    return ScheduleChange(
        updates: [mine] + updates + leaving(stayed), message: shared?.message ?? "Moved.", confirm: shared?.confirm)
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
            notBeforeMin: r.date == ctx.today ? ctx.nowMin : nil, start: .some(ctx.startOf(r.techId)))
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
