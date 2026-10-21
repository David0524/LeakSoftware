import Foundation
import SundeckCore
import SundeckSync

// Today and Schedule from the phone's synced rows: each tech's jobs for a day in route order with
// the driving between them, Needs a Time, and the planning writes (Plan Route, Move, Take Off
// Schedule) through the sync layer. Port of apps/web/src/server/route-days.ts and
// apps/web/src/app/actions/routes.ts, which do the same on the server.

/// The shop's routing context: settings, the shop's location, today and now.
public struct ScheduleContext: Sendable {
    public var companyId: String
    public var timeZone: String
    public var settings: RoutingSettings
    public var depot: LatLng?
    public var depotAddress: String
    public var shopName: String
    public var shopZip: String?
    /// Whether this person sees every job (managers, and techs unless limited).
    public var seesAll: Bool
    public var isManager: Bool
    public var userId: String
    public var today: String
    public var nowMin: Int
    /// Sends On My Way from the tech's own phone instead of the company number.
    public var onMyWayFromPhone: Bool
    /// The shop's member_start rows this phone has (owners and admins: everyone's; a tech: their
    /// own). Each tech's day starts and ends at `start(for:)` (owner, 2026-10-21).
    public var starts: [MemberStart] = []

    public var workDay: WorkDay { settings.workDay }
    /// What SundeckCore's planning rules read.
    public var plan: PlanContext {
        PlanContext(timeZone: timeZone, settings: settings, depot: depot, today: today, nowMin: nowMin, starts: starts)
    }
    /// Where this tech's day starts and ends: their home when they start there and it's on the
    /// map, else the shop (core `startFor`).
    public func start(for techId: String?) -> RouteStart { startFor(techId, starts, shop: depot) }
    /// Every place a day can start: the shop, and each home start on the map (for drive times).
    public var startPoints: [LatLng?] {
        [depot] + starts.compactMap { routeStart($0, shop: nil).at }
    }
    public var origin: MapPlace? {
        depot != nil || !depotAddress.isEmpty ? MapPlace(address: depotAddress, location: depot) : nil
    }
    /// Where a tech's day directions start: their home's map point when they start there (never
    /// its street in the link), else the shop.
    public func origin(for techId: String?) -> MapPlace? {
        let start = start(for: techId)
        if start.label == .home, let at = start.at { return MapPlace(address: "", location: at) }
        return origin
    }
}

public func scheduleContext(_ store: LocalStore, company: CompanyContext, userId: String, now: Date = Date())
    -> ScheduleContext
{
    let row = (try? store.get("company", company.id)) ?? [:]
    let depot: LatLng? = {
        guard let lat = row["latitude"]?.number, let lng = row["longitude"]?.number else { return nil }
        return LatLng(lat: lat, lng: lng)
    }()
    let zip = row["postal_code"]?.string?.trimmingCharacters(in: .whitespaces)
    return ScheduleContext(
        companyId: company.id, timeZone: company.timeZone, settings: routingSettings(company.settings), depot: depot,
        depotAddress: addressText(row), shopName: row["name"]?.string ?? company.name,
        shopZip: zip?.isEmpty == false ? zip : nil, seesAll: seesAllJobs(company.role, company.settings),
        isManager: isManagerRole(company.role), userId: userId, today: localDay(now, timeZone: company.timeZone),
        nowMin: localMinutes(now, timeZone: company.timeZone), onMyWayFromPhone: onMyWayFromPhone(company.settings),
        starts: memberStarts(store, companyId: company.id))
}

/// "1423 Palm Ct, Phoenix, AZ 85016" from a row's address columns (formatAddress's rule).
public func addressText(_ row: Row?) -> String {
    guard let row else { return "" }
    let s = { (k: String) in row[k]?.string?.trimmingCharacters(in: .whitespaces) ?? "" }
    let stateZip = [s("state"), s("postal_code")].filter { !$0.isEmpty }.joined(separator: " ")
    let cityLine = [s("city"), stateZip].filter { !$0.isEmpty }.joined(separator: ", ")
    return [s("address_line1"), cityLine].filter { !$0.isEmpty }.joined(separator: ", ")
}

/// A member of the shop, for routes and the Tech pickers.
public struct TeamMember: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var active: Bool
    /// Their color (owner, 2026-10-20: "a dot beside their name"; `membership.color`).
    public var color: TechColor = .slate

    public init(id: String, name: String, active: Bool, color: TechColor = .slate) {
        self.id = id
        self.name = name
        self.active = active
        self.color = color
    }
}

/// Each member's color by user id: `membership.color` (core `techColor`: anything else is
/// Slate).
public func memberColors(_ memberships: [Row]) -> [String: TechColor] {
    var colors: [String: TechColor] = [:]
    for m in memberships {
        guard let user = m["user_id"]?.string, colors[user] == nil else { continue }
        colors[user] = techColor(m["color"])
    }
    return colors
}

/// Each member's color by user id, from the phone's synced memberships.
public func teamColors(_ store: LocalStore, companyId: String) -> [String: TechColor] {
    memberColors((try? store.list("membership", companyId: companyId)) ?? [])
}

/// The shop's members with their names (from the cached profiles), the signed-in person first.
public func teamMembers(_ store: LocalStore, kv: KeyValue, companyId: String, userId: String) -> [TeamMember] {
    let names = Dictionary(kv.team.map { ($0.id, $0.displayName) }, uniquingKeysWith: { a, _ in a })
    let memberships = ((try? store.list("membership", companyId: companyId)) ?? [])
    let colors = memberColors(memberships)
    var seen = Set<String>()
    let members = memberships.compactMap { m -> TeamMember? in
        guard let user = m["user_id"]?.string, seen.insert(user).inserted else { return nil }
        let status = m["status"]?.string ?? "active"
        guard status != "removed" else { return nil }
        return TeamMember(
            id: user, name: names[user] ?? "Teammate", active: status == "active", color: colors[user] ?? .slate)
    }
    return members.sorted { a, b in
        if (a.id == userId) != (b.id == userId) { return a.id == userId }
        return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
}

/// A job as the route, Today, and the schedule show it.
public struct ScheduleJob: Equatable, Sendable, Identifiable, PlanJobFields {
    public var id: String
    public var number: Int?
    public var status: JobStatus
    public var type: JobType
    public var assignedUserId: String?
    public var secondTechId: String?
    public var scheduledStart: String?
    public var scheduledEnd: String?
    public var routeOrder: Int?
    public var arrivalFixed: Bool
    /// Locks (core `jobLock`; synced columns, owner 2026-10-20).
    public var lockDay: Bool
    public var lockTime: Bool
    public var createdAt: String?
    public var customerId: String?
    public var customerName: String
    public var customerPhone: String?
    public var address: String
    public var location: LatLng?
    public var accessNotes: String?
    /// The customer's notes, then the pool's, joined with " · " (Today's card, owner 2026-10-20).
    public var notes: String?
    /// The maintenance plan a visit belongs to, and the plan's day for it (its cleanings).
    public var servicePlanId: String?
    public var planDate: String?
    /// Today's Mark Complete on a leak or repair job: the shop-local day its stop was done.
    public var stopDoneOn: String?
    /// On My Way: when it was sent, and the arrival it promised (synced, owner 2026-10-20).
    public var onMyWayAt: String?
    public var arriveAt: String?
    /// Its pool has an address with no map location for it (core `mapStatus` "missing"), shown as
    /// "Not on map" once the server looks addresses up (`MapLookups`).
    public var mapMissing = false
    /// The job's pool, and whether its address has never been looked up on the map: an address
    /// with no coordinates whose `geocoded_address` isn't this address (a pool made or imported
    /// somewhere that didn't look it up). Today and Schedule ask the server for these.
    public var propertyId: String?
    public var needsLocate = false

    public init(_ v: JobView) {
        let j = v.job
        stopDoneOn = j["stop_done_on"]?.string.map { String($0.prefix(10)) }
        servicePlanId = j["service_plan_id"]?.string
        onMyWayAt = j["on_my_way_at"]?.string
        arriveAt = j["arrive_at"]?.string
        planDate = j["plan_date"]?.string
        id = v.id
        number = v.number
        status = v.status
        type = v.type
        assignedUserId = j["assigned_user_id"]?.string
        secondTechId = j["second_tech_id"]?.string
        scheduledStart = j["scheduled_start"]?.string
        scheduledEnd = j["scheduled_end"]?.string
        routeOrder = j["route_order"]?.number.map { Int($0) }
        arrivalFixed = j["arrival_fixed"]?.bool ?? false
        lockDay = j["lock_day"]?.bool ?? false
        lockTime = j["lock_time"]?.bool ?? false
        createdAt = j["created_at"]?.string
        customerId = v.customer?.id
        customerName = v.customer?["name"]?.string ?? "Customer"
        customerPhone = v.customer?["phone"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        address = addressText(v.property)
        if let lat = v.property?["latitude"]?.number, let lng = v.property?["longitude"]?.number {
            location = LatLng(lat: lat, lng: lng)
        }
        mapMissing = propertyMapStatus(v.property, routing: true) == .missing
        propertyId = v.property?.id
        if location == nil, let row = v.property, let p = decodeProperty(row),
            !p.addressLine1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            let formatted = formatAddress(p)
            needsLocate = !formatted.isEmpty && row["geocoded_address"]?.string != formatted
        }
        accessNotes = v.property?["access_notes"]?.string.flatMap {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0
        }
        let joined = [v.customer?["notes"]?.string, v.property?["notes"]?.string]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        notes = joined.isEmpty ? nil : joined
    }

    public var lock: LockReason? { lockReason(self) }
    /// "after Grace Holloway" in Suggest Times.
    public var label: String? { customerName }
    /// Started, finished, or canceled: shown faded on Today.
    public var done: Bool { status != .scheduled && status != .inProgress }
    /// Past the field work (a report, quote, invoice, or done): the Schedule's stop shows a check.
    public var finished: Bool { isFinished(status) }
    /// Done as a stop on `day`'s route (core `stopDone`): past the field part of its pipeline, or
    /// marked complete that day.
    public func doneOn(_ day: String) -> Bool { stopDone(status: status.rawValue, stopDoneOn: stopDoneOn, day: day) }
    public var start: Date? { parseInstant(scheduledStart) }
    public var place: MapPlace { MapPlace(address: address, location: location) }
    public var numberText: String { number.map { "#\($0)" } ?? "New" }

    /// The job's length: its saved times, else the shop's default.
    public func minutes(_ settings: RoutingSettings) -> Int { jobMinutes(self, settings) }

    public func startMin(_ timeZone: String) -> Int? { start.map { localMinutes($0, timeZone: timeZone) } }
    public func endMin(_ timeZone: String) -> Int? {
        parseInstant(scheduledEnd).map { localMinutes($0, timeZone: timeZone) }
    }
}

/// One tech's day.
public struct DayRoute: Sendable, Identifiable {
    public var techId: String
    public var techName: String
    public var date: String
    /// In route order; includes jobs where this tech is the second tech.
    public var jobs: [ScheduleJob]
    public var summary: DaySummary

    public var id: String { routeKey(techId, date) }
}

/// Past the field work: not waiting, booked, under way, or canceled (website route-board.tsx
/// `finished`).
public func isFinished(_ status: JobStatus) -> Bool {
    ![.unscheduled, .scheduled, .inProgress, .canceled].contains(status)
}

public func routeKey(_ techId: String?, _ date: String) -> String { "\(techId ?? "none")|\(date)" }

/// Every job on the phone that the schedule can show: not deleted, not canceled.
public func scheduleJobs(_ store: LocalStore, companyId: String) -> [ScheduleJob] {
    ((try? jobViews(store, companyId: companyId)) ?? [])
        .filter { $0.job["deleted_at"]?.string == nil }
        .map(ScheduleJob.init)
}

public struct LoadedRoutes: Sendable {
    public var routes: [String: DayRoute]
    /// Jobs on those dates with nobody assigned.
    public var unassigned: [String: [ScheduleJob]]
}

/// Every tech's route for each date, plus that day's jobs with nobody assigned.
public func loadRoutes(
    _ jobs: [ScheduleJob], ctx: ScheduleContext, dates: [String], team: [TeamMember], drive: DriveTimes
) -> LoadedRoutes {
    let wanted = Set(dates)
    let names = Dictionary(team.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    var byKey: [String: (tech: String, date: String, jobs: [ScheduleJob])] = [:]
    var unassigned: [String: [ScheduleJob]] = [:]
    for j in jobs where j.status != .canceled {
        guard let start = j.start else { continue }
        let date = localDay(start, timeZone: ctx.timeZone)
        guard wanted.contains(date) else { continue }
        guard let main = j.assignedUserId else {
            unassigned[date, default: []].append(j)
            continue
        }
        for tech in [main, j.secondTechId].compactMap({ $0 }) {
            let key = routeKey(tech, date)
            byKey[key, default: (tech, date, [])].jobs.append(j)
        }
    }
    var routes: [String: DayRoute] = [:]
    for (key, d) in byKey {
        let ordered = inRouteOrder(d.jobs)
        let summary = daySummary(
            ordered.map {
                SavedStop(
                    id: $0.id, location: $0.location, startMin: $0.startMin(ctx.timeZone),
                    endMin: $0.endMin(ctx.timeZone))
            }, depot: ctx.start(for: d.tech).at, day: ctx.workDay, drive: drive.drive)
        routes[key] = DayRoute(
            techId: d.tech, techName: names[d.tech] ?? "Teammate", date: d.date, jobs: ordered, summary: summary)
    }
    for (date, list) in unassigned {
        unassigned[date] = list.sorted { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }
    }
    return LoadedRoutes(routes: routes, unassigned: unassigned)
}

/// Needs a Time: jobs without a time (oldest first), then booked jobs with nobody assigned from
/// today on (soonest first).
public func needsATime(_ jobs: [ScheduleJob], ctx: ScheduleContext) -> [ScheduleJob] {
    let waiting = jobs.filter { $0.status == .unscheduled && $0.start == nil }
        .sorted { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
    let startOfToday = zonedInstant(ctx.today, 0, timeZone: ctx.timeZone) ?? .distantPast
    let untech = jobs.filter {
        $0.assignedUserId == nil && $0.status != .canceled && ($0.start.map { $0 >= startOfToday } ?? false)
    }
    .sorted { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }
    return waiting + untech
}

/// The distinct points drive times are needed between (the shop and the pools).
public func routePoints(_ jobs: [ScheduleJob], depot: LatLng?) -> [String] {
    routePoints(jobs, starts: [depot])
}

/// The distinct points drive times are needed between: where days start (the shop, and homes
/// for those who start there; `ScheduleContext.startPoints`) and the pools.
public func routePoints(_ jobs: [ScheduleJob], starts: [LatLng?]) -> [String] {
    var keys: [String] = []
    for p in starts + jobs.map(\.location) {
        guard let p else { continue }
        let k = pointKey(p)
        if !keys.contains(k) { keys.append(k) }
    }
    return keys
}

/// The note on a stop: "Second tech, with Tony", "With Sam", "Leak detection", "Repair", "Maintenance"
/// or "Pool inspection". An address not found on the map shows as a symbol after the address
/// instead (`NotOnMapTag`, owner 2026-10-20: "Don't waste space with text").
public func stopNote(_ j: ScheduleJob, routeTech: String?, names: [String: String]) -> String? {
    let note: String? = {
        if let routeTech, j.assignedUserId != routeTech {
            return "Second tech, with \(j.assignedUserId.flatMap { names[$0] } ?? "the main tech")"
        }
        if let second = j.secondTechId { return "With \(names[second] ?? "Teammate")" }
        switch j.type {
        case .repair: return "Repair"
        case .maintenance: return "Maintenance"
        case .inspection: return "Pool inspection"
        case .detection: return "Leak detection"
        }
    }()
    return note
}

// MARK: - Planning writes

/// Why a planning change wasn't made, in the website's words.
public struct ScheduleProblem: Error, Equatable, CustomStringConvertible {
    public let description: String
    public init(_ text: String) { description = text }
}

/// A job's new values; each becomes one write through the sync layer.
public struct JobUpdate: Equatable, Sendable {
    public var id: String
    public var values: Row

    public init(id: String, values: Row) {
        self.id = id
        self.values = values
    }

    public init(_ change: JobChange) { self.init(id: change.id, values: change.values) }
}

/// The rows to save and the status line, or the website's words for why not.
private func result(_ change: ScheduleChange) throws -> (updates: [JobUpdate], message: String) {
    if let error = change.error { throw ScheduleProblem(error) }
    return (change.updates.map(JobUpdate.init), change.message ?? "")
}

/// A tech's day in route order, as planning reads it (second-tech jobs included).
private func dayJobs(
    _ techId: String, _ date: String, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember]
) -> [ScheduleJob] {
    loadRoutes(jobs, ctx: ctx, dates: [date], team: team, drive: DriveTimes()).routes[routeKey(techId, date)]?
        .jobs ?? []
}

/// Plan Route: orders a tech's day for the least driving, keeps promised times, and returns the
/// rows to save with the website's message (`planDay`).
public func planRoute(
    techId: String, date: String, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember], drive: DriveTimes
) throws -> (updates: [JobUpdate], message: String) {
    try result(
        planDay(ctx.plan, techId, date, dayJobs(techId, date, jobs: jobs, ctx: ctx, team: team), drive: drive.drive))
}

/// What Optimize's banner says (owner, 2026-10-20: the inline "Planned: …" note "looks horrible.
/// Display it on a banner on the top of the screen"): core `planDay`'s one line ("Optimized · 1 hr
/// 6 min less driving · Back by 4:28 PM") and its notes as a second line.
public struct OptimizeSummary: Equatable, Sendable {
    public var title: String
    public var warning: String?
}

/// Optimize (Plan Route, renamed by the owner on 2026-10-20): the rows `planRoute` saves, with the
/// banner's words.
public func optimizeDay(
    techId: String, date: String, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember], drive: DriveTimes
) throws -> (updates: [JobUpdate], summary: OptimizeSummary) {
    let change = try planDay(
        ctx.plan, techId, date, dayJobs(techId, date, jobs: jobs, ctx: ctx, team: team), drive: drive.drive)
    let (updates, message) = try result(change)
    return (updates, OptimizeSummary(title: message, warning: change.detail))
}

/// Move…: puts a job on a tech's day at a place in the route (`tech` nil: nobody yet, it waits in
/// Needs a Time), or with `date` nil takes it off the schedule (`moveJobChange`).
public func moveJob(
    _ jobId: String, tech: String?, date: String?, index: Int, jobs: [ScheduleJob], ctx: ScheduleContext,
    team: [TeamMember], drive: DriveTimes
) throws -> (updates: [JobUpdate], message: String) {
    guard let job = jobs.first(where: { $0.id == jobId }) else {
        throw ScheduleProblem("This job is gone. Pull down to refresh.")
    }
    let fromDate = job.start.map { localDay($0, timeZone: ctx.timeZone) }
    let input = MoveInput(
        job: job, tech: tech, date: date, index: index,
        targetDay: tech.flatMap { t in date.map { dayJobs(t, $0, jobs: jobs, ctx: ctx, team: team) } } ?? [],
        fromDay: job.assignedUserId.flatMap { t in fromDate.map { dayJobs(t, $0, jobs: jobs, ctx: ctx, team: team) } }
            ?? [],
        seesAll: ctx.seesAll, userId: ctx.userId)
    return try result(moveJobChange(ctx.plan, input, drive: drive.drive))
}

/// Where a stop is dropped on the phone's Schedule (owner, 2026-10-20: "bring back drag/drop on
/// mobile"). Website components/route-board.tsx `onDragEnd`.
public enum ScheduleDrop: Equatable, Sendable {
    /// A tech's day: on a stop (`index`, its place in the route; the dropped job takes it) or on
    /// the route itself (`index` nil: last).
    case route(tech: String, date: String, index: Int?)
    /// A day in the week strip or the week list: the job's own tech, last on that day.
    case day(String)
    /// Needs a Time: off the schedule (only a job that hasn't started).
    case needsATime
}

/// Drag and drop: the same move as Move… (`moveJob`), so the same rules apply: any job but a
/// canceled one moves, a started or finished job keeps its status, only an unstarted job goes back
/// to Needs a Time, and past days refuse. Nil when the drop leaves the job where it was.
public func dropJob(
    _ jobId: String, on drop: ScheduleDrop, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember],
    drive: DriveTimes
) throws -> (updates: [JobUpdate], message: String)? {
    guard let job = jobs.first(where: { $0.id == jobId }) else {
        throw ScheduleProblem("This job is gone. Pull down to refresh.")
    }
    let move = { (tech: String?, date: String?, index: Int) in
        try moveJob(jobId, tech: tech, date: date, index: index, jobs: jobs, ctx: ctx, team: team, drive: drive)
    }
    switch drop {
    case .needsATime:
        if needsATime(jobs, ctx: ctx).contains(where: { $0.id == jobId }) { return nil }
        return try move(nil, nil, 0)
    case .day(let date):
        let onDay = job.status != .unscheduled && job.start.map { localDay($0, timeZone: ctx.timeZone) } == date
        if onDay { return nil }
        return try move(job.assignedUserId, date, 9_999)
    case .route(let tech, let date, let index):
        let list = dayJobs(tech, date, jobs: jobs, ctx: ctx, team: team)
        let others = list.filter { $0.id != jobId }.count
        let at = list.firstIndex { $0.id == jobId }
        let to = min(index ?? others, others)
        if let at, at == to { return nil }
        return try move(tech, date, to)
    }
}

/// Saves planning changes through the sync layer, all or none.
@MainActor
public func saveJobUpdates(_ sync: SyncService, companyId: String, _ updates: [JobUpdate]) throws {
    guard !updates.isEmpty else { return }
    try sync.batch {
        for u in updates { try sync.store.write("job", id: u.id, companyId: companyId, u.values) }
    }
}

// MARK: - Suggest Times

/// A suggested time (`SuggestedTime` in SundeckCore), with its line for the list.
public typealias Suggestion = SuggestedTime

extension SuggestedTime {
    /// "Adds 12 min of driving" / "Adds no driving", then where.
    public var detail: String {
        (slot.addedDriveMin > 0 ? "Adds \(durationLabel(slot.addedDriveMin)) of driving" : "Adds no driving")
            + ", \(slot.near)"
    }
}

/// Where a job fits best in the routes already planned for the next 7 working days
/// (`suggestTimes`). `jobId` nil is a job not made yet (New Job), whose date and time are on the
/// form, so the note says to pick them there, as the website's New Job does.
public func suggestTimes(
    location: LatLng?, durationMin: Int, excluding jobId: String?, jobs: [ScheduleJob], ctx: ScheduleContext,
    team: [TeamMember], drive: DriveTimes
) throws -> (suggestions: [Suggestion], note: String?) {
    let dates = try suggestionDates(ctx.plan)
    if dates.isEmpty { throw ScheduleProblem("No working days are set (Settings › Scheduling).") }
    let loaded = loadRoutes(jobs, ctx: ctx, dates: dates, team: team, drive: drive)
    // A tech limited to their own jobs gets suggestions on their own route only.
    let techs = team.filter { $0.active && (ctx.seesAll || $0.id == ctx.userId) }
    let routes = dates.flatMap { date in
        techs.map { t in
            SuggestRoute(
                techId: t.id, techName: t.name, date: date, jobs: loaded.routes[routeKey(t.id, date)]?.jobs ?? [])
        }
    }
    let found = try SundeckCore.suggestTimes(
        ctx.plan, id: jobId, location: location, durationMin: durationMin, routes: routes, drive: drive.drive)
    let note =
        jobId == nil && location != nil && found.suggestions.isEmpty
        ? "No gaps in the next working days. Pick a day and time below." : found.note
    return (found.suggestions, note)
}
