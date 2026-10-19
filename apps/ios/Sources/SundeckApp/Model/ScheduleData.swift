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

    public var workDay: WorkDay { settings.workDay }
    public var origin: MapPlace? {
        depot != nil || !depotAddress.isEmpty ? MapPlace(address: depotAddress, location: depot) : nil
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
        nowMin: localMinutes(now, timeZone: company.timeZone), onMyWayFromPhone: onMyWayFromPhone(company.settings))
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
}

/// The shop's members with their names (from the cached profiles), the signed-in person first.
public func teamMembers(_ store: LocalStore, kv: KeyValue, companyId: String, userId: String) -> [TeamMember] {
    let names = Dictionary(kv.team.map { ($0.id, $0.displayName) }, uniquingKeysWith: { a, _ in a })
    let memberships = ((try? store.list("membership", companyId: companyId)) ?? [])
    var seen = Set<String>()
    let members = memberships.compactMap { m -> TeamMember? in
        guard let user = m["user_id"]?.string, seen.insert(user).inserted else { return nil }
        let status = m["status"]?.string ?? "active"
        guard status != "removed" else { return nil }
        return TeamMember(id: user, name: names[user] ?? "Teammate", active: status == "active")
    }
    return members.sorted { a, b in
        if (a.id == userId) != (b.id == userId) { return a.id == userId }
        return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
}

/// A job as the route, Today, and the schedule show it.
public struct ScheduleJob: Equatable, Sendable, Identifiable {
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
    public var createdAt: String?
    public var customerId: String?
    public var customerName: String
    public var customerPhone: String?
    public var address: String
    public var location: LatLng?
    public var accessNotes: String?

    public init(_ v: JobView) {
        let j = v.job
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
        createdAt = j["created_at"]?.string
        customerId = v.customer?.id
        customerName = v.customer?["name"]?.string ?? "Customer"
        customerPhone = v.customer?["phone"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        address = addressText(v.property)
        if let lat = v.property?["latitude"]?.number, let lng = v.property?["longitude"]?.number {
            location = LatLng(lat: lat, lng: lng)
        }
        accessNotes = v.property?["access_notes"]?.string.flatMap {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0
        }
    }

    public var lock: LockReason? { lockReason(status: status, arrivalFixed: arrivalFixed, secondTech: secondTechId) }
    /// Started, finished, or canceled: shown faded on Today.
    public var done: Bool { status != .scheduled && status != .inProgress }
    public var start: Date? { parseInstant(scheduledStart) }
    public var place: MapPlace { MapPlace(address: address, location: location) }
    public var numberText: String { number.map { "#\($0)" } ?? "New" }

    /// The job's length: its saved times, else the shop's default.
    public func minutes(_ settings: RoutingSettings) -> Int {
        if let a = start, let b = parseInstant(scheduledEnd) {
            let m = Int((b.timeIntervalSince(a) / 60).rounded())
            if m > 0 && m <= 24 * 60 { return m }
        }
        return settings.jobMinutes
    }

    public func startMin(_ timeZone: String) -> Int? { start.map { localMinutes($0, timeZone: timeZone) } }
    public func endMin(_ timeZone: String) -> Int? {
        parseInstant(scheduledEnd).map { localMinutes($0, timeZone: timeZone) }
    }
}

/// A day's jobs in route order: times first, then the saved place, jobs without a time last.
public func inRouteOrder(_ jobs: [ScheduleJob]) -> [ScheduleJob] {
    jobs.sorted { a, b in
        let (x, y) = (a.start?.timeIntervalSince1970 ?? .infinity, b.start?.timeIntervalSince1970 ?? .infinity)
        if x != y { return x < y }
        let (p, q) = (a.routeOrder ?? .max, b.routeOrder ?? .max)
        if p != q { return p < q }
        return a.id < b.id
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
            }, depot: ctx.depot, day: ctx.workDay, drive: drive.drive)
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
    var keys: [String] = []
    for p in [depot] + jobs.map(\.location) {
        guard let p else { continue }
        let k = pointKey(p)
        if !keys.contains(k) { keys.append(k) }
    }
    return keys
}

/// The note on a stop: "Second tech, with Tony", "With Sam", "Repair", "Maintenance".
public func stopNote(_ j: ScheduleJob, routeTech: String?, names: [String: String]) -> String? {
    if let routeTech, j.assignedUserId != routeTech {
        return "Second tech, with \(j.assignedUserId.flatMap { names[$0] } ?? "the main tech")"
    }
    if let second = j.secondTechId { return "With \(names[second] ?? "Teammate")" }
    switch j.type {
    case .repair: return "Repair"
    case .maintenance: return "Maintenance"
    case .detection: return nil
    }
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
}

private func stop(_ j: ScheduleJob, ctx: ScheduleContext, techId: String, date: String) -> RouteStop {
    let movable = j.lock == nil
    return RouteStop(
        id: j.id, location: j.location, durationMin: j.minutes(ctx.settings),
        fixedStartMin: !movable ? j.startMin(ctx.timeZone) : nil,
        earliestMin: movable && date == ctx.today ? ctx.nowMin : nil, movable: movable,
        own: j.assignedUserId == techId)
}

private func iso(_ date: String, _ min: Int, _ ctx: ScheduleContext) -> String {
    zonedInstant(date, min, timeZone: ctx.timeZone).map(isoString) ?? ""
}

/// Rows to save for a timed route: every stop of this tech's gets its place, and stops that may
/// move get the route's times.
func routeUpdates(date: String, ctx: ScheduleContext, stops: [RouteStop], route: TimedRoute) -> [JobUpdate] {
    stops.enumerated().compactMap { i, s in
        guard s.own else { return nil }
        var values: Row = ["route_order": .number(Double(i + 1))]
        if s.movable, let start = zonedInstant(date, route.stops[i].startMin, timeZone: ctx.timeZone) {
            values["scheduled_start"] = .string(isoString(start))
            values["scheduled_end"] = .string(isoString(start.addingTimeInterval(Double(s.durationMin) * 60)))
        }
        return JobUpdate(id: s.id, values: values)
    }
}

/// Plan Route: orders a tech's day for the least driving, keeps promised times, and returns the
/// rows to save with the website's message.
public func planRoute(
    techId: String, date: String, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember], drive: DriveTimes
) throws -> (updates: [JobUpdate], message: String) {
    if date < ctx.today { throw ScheduleProblem("Past days can’t be planned.") }
    let day = loadRoutes(jobs, ctx: ctx, dates: [date], team: team, drive: drive).routes[routeKey(techId, date)]
    guard let day, !day.jobs.isEmpty else { throw ScheduleProblem("Nothing scheduled for this tech that day.") }
    let stops = day.jobs.map { stop($0, ctx: ctx, techId: techId, date: date) }
    let before = timeRoute(stops, depot: ctx.depot, day: ctx.workDay, drive: drive.drive)
    let (order, route) = optimizeRoute(stops, depot: ctx.depot, day: ctx.workDay, drive: drive.drive)
    let planned = order.map { stops[$0] }
    let updates = routeUpdates(date: date, ctx: ctx, stops: planned, route: route)
    let saved = before.driveMin - route.driveMin
    let parts = [
        "Planned: \(durationLabel(route.driveMin)) of driving",
        saved > 0 ? "\(durationLabel(saved)) less than before" : nil,
        "back at the shop by \(minutesLabel(route.backMin))",
    ].compactMap { $0 }
    let warnings = [
        route.overtimeMin > 0 ? "runs \(durationLabel(route.overtimeMin)) past the end of the day" : nil,
        route.lateMin > 0 ? "a fixed time can’t be met (\(durationLabel(route.lateMin)) late)" : nil,
        stops.contains { $0.location == nil } ? "some pools have no location, so driving to them isn’t counted" : nil,
        ctx.depot == nil ? "the shop has no location (Settings › Scheduling)" : nil,
    ].compactMap { $0 }
    let message =
        "\(parts.joined(separator: ", "))." + (warnings.isEmpty ? "" : " Note: \(warnings.joined(separator: "; ")).")
    return (updates, message)
}

/// After a job leaves a day, close up the order numbers (times stay).
private func renumber(
    techId: String, date: String, leaving: String, jobs: [ScheduleJob], ctx: ScheduleContext, team: [TeamMember]
) -> [JobUpdate] {
    let left =
        (loadRoutes(jobs, ctx: ctx, dates: [date], team: team, drive: DriveTimes()).routes[
            routeKey(techId, date)]?.jobs ?? [])
        .filter { $0.id != leaving && $0.assignedUserId == techId }
    return left.enumerated().compactMap { i, j in
        j.routeOrder == i + 1 ? nil : JobUpdate(id: j.id, values: ["route_order": .number(Double(i + 1))])
    }
}

/// Move…: puts a job on a tech's day at a place in the route (`tech` nil: nobody yet, it waits in
/// Needs a Time), or with `date` nil takes it off the schedule. Times customers were promised stay.
public func moveJob(
    _ jobId: String, tech: String?, date: String?, index: Int, jobs: [ScheduleJob], ctx: ScheduleContext,
    team: [TeamMember], drive: DriveTimes
) throws -> (updates: [JobUpdate], message: String) {
    guard let job = jobs.first(where: { $0.id == jobId }) else {
        throw ScheduleProblem("This job is gone. Pull down to refresh.")
    }
    if !canMoveJob(job.status) { throw ScheduleProblem("This job was canceled, so it stays off the schedule.") }
    if date == nil && !canUnschedule(job.status) {
        throw ScheduleProblem("This job has started, so it stays on the schedule. Move it to another day instead.")
    }
    let status: JobStatus = canUnschedule(job.status) ? .scheduled : job.status
    if let date, date < ctx.today { throw ScheduleProblem("Pick today or a later day.") }
    if !ctx.seesAll && tech != ctx.userId && date != nil {
        throw ScheduleProblem("You can schedule only your own jobs. Ask an owner to move it to someone else.")
    }
    if let tech, tech == job.secondTechId { throw ScheduleProblem("This tech is already the second tech on this job.") }
    let from = job.start.map { (tech: job.assignedUserId, date: localDay($0, timeZone: ctx.timeZone)) }
    let leaveFrom = { (unless: Bool) -> [JobUpdate] in
        guard let from, let t = from.tech, !unless else { return [] }
        return renumber(techId: t, date: from.date, leaving: jobId, jobs: jobs, ctx: ctx, team: team)
    }

    guard let date else {
        let off: Row = [
            "route_order": .null, "status": .string(JobStatus.unscheduled.rawValue), "scheduled_start": .null,
            "scheduled_end": .null, "arrival_fixed": false,
        ]
        return ([JobUpdate(id: jobId, values: off)] + leaveFrom(false), "Taken off the schedule.")
    }

    let duration = job.minutes(ctx.settings)
    let fixedMin = job.arrivalFixed ? job.startMin(ctx.timeZone) : nil

    guard let tech else {
        let startMin = job.startMin(ctx.timeZone) ?? ctx.workDay.startMin
        let start = zonedInstant(date, startMin, timeZone: ctx.timeZone) ?? Date()
        let values: Row = [
            "route_order": .null, "assigned_user_id": .null, "status": .string(status.rawValue),
            "scheduled_start": .string(isoString(start)),
            "scheduled_end": .string(isoString(start.addingTimeInterval(Double(duration) * 60))),
        ]
        return (
            [JobUpdate(id: jobId, values: values)] + leaveFrom(false),
            "No tech yet, so it’s in Needs a Time, still booked for \(minutesLabel(startMin))."
        )
    }

    let others =
        (loadRoutes(jobs, ctx: ctx, dates: [date], team: team, drive: drive).routes[routeKey(tech, date)]?
        .jobs ?? []).filter { $0.id != jobId }
    var stops = others.map { j -> RouteStop in
        var s = stop(j, ctx: ctx, techId: tech, date: date)
        // Stops already on the day keep their times unless the new order pushes them later.
        if s.movable, let start = j.startMin(ctx.timeZone) { s.earliestMin = max(s.earliestMin ?? 0, start) }
        return s
    }
    let moved = RouteStop(
        id: jobId, location: job.location, durationMin: duration, fixedStartMin: fixedMin,
        earliestMin: date == ctx.today ? ctx.nowMin : nil, movable: fixedMin == nil, own: true)
    let at = max(0, min(index, others.count))
    stops.insert(moved, at: at)
    let route = timeRoute(stops, depot: ctx.depot, day: ctx.workDay, drive: drive.drive)
    var updates = routeUpdates(date: date, ctx: ctx, stops: stops, route: route)
    guard let mineIndex = updates.firstIndex(where: { $0.id == jobId }) else { return ([], "") }
    var mine = updates.remove(at: mineIndex)
    mine.values["assigned_user_id"] = .string(tech)
    mine.values["status"] = .string(status.rawValue)
    if let fixedMin, let start = zonedInstant(date, fixedMin, timeZone: ctx.timeZone) {
        mine.values["scheduled_start"] = .string(isoString(start))
        mine.values["scheduled_end"] = .string(isoString(start.addingTimeInterval(Double(duration) * 60)))
    }
    let t = route.stops[at]
    let notes = [
        t.lateMin > 0 ? "it can’t make its fixed time (\(durationLabel(t.lateMin)) late)" : nil,
        route.overtimeMin > 0 ? "the day runs \(durationLabel(route.overtimeMin)) late" : nil,
        route.lateMin - t.lateMin > 0 ? "a fixed time after it can’t be met" : nil,
    ].compactMap { $0 }
    let sameDay = from.map { $0.tech == tech && $0.date == date } ?? true
    return (
        [mine] + updates + leaveFrom(sameDay),
        "Moved to \(minutesLabel(t.startMin))." + (notes.isEmpty ? "" : " Note: \(notes.joined(separator: "; ")).")
    )
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

public struct Suggestion: Equatable, Sendable, Identifiable {
    public var slot: SlotSuggestion
    /// "Today", "Tue, Oct 20"
    public var dayLabel: String
    public var timeLabel: String

    public var id: String { slot.id }
    /// "Adds 12 min of driving" / "Adds no driving", then where.
    public var detail: String {
        (slot.addedDriveMin > 0 ? "Adds \(durationLabel(slot.addedDriveMin)) of driving" : "Adds no driving")
            + ", \(slot.near)"
    }
}

/// Where a job fits best in the routes already planned for the next 7 working days.
public func suggestTimes(
    location: LatLng?, durationMin: Int, excluding jobId: String?, jobs: [ScheduleJob], ctx: ScheduleContext,
    team: [TeamMember], drive: DriveTimes
) throws -> (suggestions: [Suggestion], note: String?) {
    let hours = ctx.workDay
    var dates: [String] = []
    var d = ctx.today
    while dates.count < 7 && d < addDays(ctx.today, 21) {
        if ctx.settings.workDays.contains(weekday(d)) && !(d == ctx.today && ctx.nowMin > hours.endMin - 60) {
            dates.append(d)
        }
        d = addDays(d, 1)
    }
    if dates.isEmpty { throw ScheduleProblem("No working days are set (Settings › Scheduling).") }
    let loaded = loadRoutes(jobs, ctx: ctx, dates: dates, team: team, drive: drive)
    let techs = team.filter { $0.active && (ctx.seesAll || $0.id == ctx.userId) }
    var days: [TechDay] = []
    for date in dates {
        for t in techs {
            let list = (loaded.routes[routeKey(t.id, date)]?.jobs ?? []).filter { $0.id != jobId }
            let stops = list.map { j -> RouteStop in
                var s = stop(j, ctx: ctx, techId: t.id, date: date)
                if let start = j.startMin(ctx.timeZone) {
                    s.fixedStartMin = start
                    s.earliestMin = nil
                }
                return s
            }
            days.append(
                TechDay(
                    date: date, techId: t.id, techName: t.name, stops: stops,
                    labels: Dictionary(list.map { ($0.id, $0.customerName) }, uniquingKeysWith: { a, _ in a }),
                    notBeforeMin: date == ctx.today ? ctx.nowMin : nil))
        }
    }
    let found = suggestSlots(
        location: location, durationMin: durationMin, days: days, depot: ctx.depot, day: hours, drive: drive.drive)
    let list = found.map {
        Suggestion(
            slot: $0, dayLabel: $0.date == ctx.today ? "Today" : formatDay($0.date),
            timeLabel: minutesLabel($0.startMin))
    }
    let note =
        location == nil
        ? "This pool has no location yet, so these don’t count driving to it."
        : found.isEmpty ? "No gaps in the next working days. Pick a day and time below." : nil
    return (list, note)
}
