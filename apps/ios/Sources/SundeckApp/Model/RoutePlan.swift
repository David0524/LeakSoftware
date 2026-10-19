import Foundation
import SundeckCore

// Routes and scheduling help: the parts of packages/core routing.ts, route-plan.ts and office.ts
// the phone's Today and Schedule need. Pure: no network, no clock. Times of day are minutes after
// midnight in the shop's time zone (8:00 AM = 480); days are "YYYY-MM-DD".
//
// These live in the app target (not SundeckCore) because SundeckCore's Routing.swift only has the
// maps links so far; when the rules move there they get the fixture checks every core port has.

/// Minutes of driving from a to b. Unknown locations count as 0.
public typealias DriveFn = (LatLng?, LatLng?) -> Int

// MARK: - Distances and the built-in estimate

public func haversineMeters(_ a: LatLng, _ b: LatLng) -> Double {
    let rad = { (d: Double) in d * .pi / 180 }
    let dLat = rad(b.lat - a.lat)
    let dLng = rad(b.lng - a.lng)
    let h = pow(sin(dLat / 2), 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * pow(sin(dLng / 2), 2)
    return 2 * 6_371_000 * asin(sqrt(h))
}

/// The drive-time estimate without a routing service: roads 1.35 times the straight line, 40 km/h
/// for the first 10 km and 75 km/h after, plus 3 minutes to get going and park.
public func estimateDriveMinutes(_ a: LatLng?, _ b: LatLng?) -> Int {
    guard let a, let b else { return 0 }
    let km = haversineMeters(a, b) * 1.35 / 1000
    if km < 0.05 { return 0 }
    let city = min(km, 10)
    let freeway = max(0, km - 10)
    return Int((3 + city / 40 * 60 + freeway / 75 * 60).rounded())
}

/// Rounded to 4 decimals, the key the shop's drive-time cache uses (`pointKey`).
public func pointKey(_ p: LatLng) -> String {
    String(format: "%.4f,%.4f", p.lat, p.lng)
}

/// Drive times: cached live times from the server where known, else the estimate.
public struct DriveTimes: Sendable {
    /// "from>to" (point keys) to minutes.
    public var known: [String: Int]

    public init(known: [String: Int] = [:]) { self.known = known }

    public func minutes(_ a: LatLng?, _ b: LatLng?) -> Int {
        guard let a, let b else { return 0 }
        return known["\(pointKey(a))>\(pointKey(b))"] ?? estimateDriveMinutes(a, b)
    }

    public var drive: DriveFn { { minutes($0, $1) } }
}

// MARK: - Timing a route

public struct RouteStop: Equatable, Sendable {
    public var id: String
    public var location: LatLng?
    public var durationMin: Int
    /// The customer was told this time: the stop can't move.
    public var fixedStartMin: Int?
    /// Can't start before this (on today's route, now).
    public var earliestMin: Int?
    /// Planning may move it.
    public var movable = true
    /// This tech is the job's main tech, so its route order is theirs to save.
    public var own = true

    public init(
        id: String, location: LatLng?, durationMin: Int, fixedStartMin: Int? = nil, earliestMin: Int? = nil,
        movable: Bool = true, own: Bool = true
    ) {
        self.id = id
        self.location = location
        self.durationMin = durationMin
        self.fixedStartMin = fixedStartMin
        self.earliestMin = earliestMin
        self.movable = movable
        self.own = own
    }
}

public struct WorkDay: Equatable, Sendable {
    public var startMin: Int
    public var endMin: Int
}

public struct TimedStop: Equatable, Sendable {
    public var id: String
    public var driveMin: Int
    public var arriveMin: Int
    public var startMin: Int
    public var endMin: Int
    public var lateMin: Int
    public var unlocated: Bool
}

public struct TimedRoute: Equatable, Sendable {
    public var stops: [TimedStop]
    public var driveMin: Int
    public var backMin: Int
    public var overtimeMin: Int
    public var lateMin: Int
}

/// Times for stops visited in the given order, from the shop and back.
public func timeRoute(_ stops: [RouteStop], depot: LatLng?, day: WorkDay, drive: DriveFn) -> TimedRoute {
    var clock = day.startMin
    var at = depot
    var driveTotal = 0
    var lateTotal = 0
    let timed = stops.map { s -> TimedStop in
        let d = drive(at, s.location)
        driveTotal += d
        let arrive = clock + d
        let start = max(arrive, max(s.fixedStartMin ?? 0, s.earliestMin ?? 0))
        let late = s.fixedStartMin.map { max(0, arrive - $0) } ?? 0
        lateTotal += late
        clock = start + s.durationMin
        if let l = s.location { at = l }
        return TimedStop(
            id: s.id, driveMin: d, arriveMin: arrive, startMin: start, endMin: clock, lateMin: late,
            unlocated: s.location == nil)
    }
    let back = drive(at, depot)
    driveTotal += back
    let backMin = clock + back
    return TimedRoute(
        stops: timed, driveMin: driveTotal, backMin: backMin, overtimeMin: max(0, backMin - day.endMin),
        lateMin: lateTotal)
}

/// Driving, plus heavy penalties for being late or working over.
public func routeCost(_ r: TimedRoute) -> Int { r.driveMin + r.lateMin * 20 + r.overtimeMin * 5 }

/// Heap's permutations, in the TypeScript's order.
private func permutations(_ n: Int) -> [[Int]] {
    var a = Array(0..<n)
    var c = Array(repeating: 0, count: n)
    var out = [a]
    var i = 0
    while i < n {
        if c[i] < i {
            let j = i % 2 == 0 ? 0 : c[i]
            a.swapAt(j, i)
            out.append(a)
            c[i] += 1
            i = 0
        } else {
            c[i] = 0
            i += 1
        }
    }
    return out
}

/// The order to visit a tech's stops: least driving, keeping fixed appointments and the working
/// day. Exact for up to 8 stops; for more, nearest first and then improving swaps. Ties keep the
/// current order.
public func optimizeRoute(_ stops: [RouteStop], depot: LatLng?, day: WorkDay, drive: DriveFn) -> (
    order: [Int], route: TimedRoute
) {
    func cost(_ order: [Int]) -> Int {
        routeCost(timeRoute(order.map { stops[$0] }, depot: depot, day: day, drive: drive))
    }
    let n = stops.count
    var best = Array(0..<n)
    var bestCost = cost(best)
    if n <= 8 {
        for order in permutations(n) {
            let c = cost(order)
            if c < bestCost {
                best = order
                bestCost = c
            }
        }
    } else if n > 1 {
        var left = Array(0..<n)
        var greedy: [Int] = []
        var at = depot
        while !left.isEmpty {
            var pick = left[0]
            var pickScore = Int.max
            for i in left {
                let s = stops[i]
                let score = s.fixedStartMin.map { $0 - day.startMin } ?? drive(at, s.location)
                if score < pickScore {
                    pick = i
                    pickScore = score
                }
            }
            greedy.append(pick)
            left.removeAll { $0 == pick }
            at = stops[pick].location ?? at
        }
        if cost(greedy) < bestCost {
            best = greedy
            bestCost = cost(greedy)
        }
        var improved = true
        while improved {
            improved = false
            for i in 0..<(n - 1) {
                for k in (i + 1)..<n {
                    let reversed = Array(best[..<i]) + best[i...k].reversed() + Array(best[(k + 1)...])
                    let c = cost(reversed)
                    if c < bestCost {
                        best = reversed
                        bestCost = c
                        improved = true
                    }
                }
            }
            for i in 0..<n {
                for k in 0..<n where i != k {
                    var moved = best
                    let x = moved.remove(at: i)
                    moved.insert(x, at: k)
                    let c = cost(moved)
                    if c < bestCost {
                        best = moved
                        bestCost = c
                        improved = true
                    }
                }
            }
        }
    }
    return (best, timeRoute(best.map { stops[$0] }, depot: depot, day: day, drive: drive))
}

// MARK: - Suggesting a slot

public struct TechDay: Sendable {
    public var date: String
    public var techId: String
    public var techName: String
    /// That tech's jobs that day, in route order.
    public var stops: [RouteStop]
    /// Customer names by stop id, for "after Grace Holloway".
    public var labels: [String: String] = [:]
    /// On today's route, nothing can start before now.
    public var notBeforeMin: Int?
}

public struct SlotSuggestion: Equatable, Sendable, Identifiable {
    public var date: String
    public var techId: String
    public var techName: String
    /// Where in the day's order (0 = first stop).
    public var position: Int
    public var startMin: Int
    public var addedDriveMin: Int
    public var driveInMin: Int
    /// "after Grace Holloway", "first stop", "only job that day".
    public var near: String

    public var id: String { "\(techId)-\(date)" }
}

/// The best places to fit a job into existing routes: for each tech and day the position that adds
/// the least driving without making the day run late or over. Sooner days win small ties.
public func suggestSlots(
    location: LatLng?, durationMin: Int, days: [TechDay], depot: LatLng?, day: WorkDay, drive: DriveFn,
    limit: Int = 5
) -> [SlotSuggestion] {
    let first = days.map(\.date).min() ?? ""
    var found: [(SlotSuggestion, Int)] = []
    for td in days {
        let base = timeRoute(td.stops, depot: depot, day: day, drive: drive)
        var best: (SlotSuggestion, Int)?
        for p in 0...td.stops.count {
            let candidate = RouteStop(
                id: "__new", location: location, durationMin: durationMin, earliestMin: td.notBeforeMin)
            var stops = td.stops
            stops.insert(candidate, at: p)
            let r = timeRoute(stops, depot: depot, day: day, drive: drive)
            if r.overtimeMin > base.overtimeMin || r.lateMin > base.lateMin { continue }
            let added = r.driveMin - base.driveMin
            let score = added + daysBetween(first, td.date) * 2
            if best == nil || score < best!.1 {
                let near =
                    td.stops.isEmpty
                    ? "only job that day"
                    : p > 0 ? "after \(td.labels[td.stops[p - 1].id] ?? "the job before")" : "first stop"
                best = (
                    SlotSuggestion(
                        date: td.date, techId: td.techId, techName: td.techName, position: p,
                        startMin: r.stops[p].startMin, addedDriveMin: added, driveInMin: r.stops[p].driveMin,
                        near: near), score
                )
            }
        }
        if let best { found.append(best) }
    }
    return
        found
        .enumerated()
        .sorted { a, b in
            let (x, y) = (a.element, b.element)
            if x.1 != y.1 { return x.1 < y.1 }
            if x.0.date != y.0.date { return x.0.date < y.0.date }
            if x.0.startMin != y.0.startMin { return x.0.startMin < y.0.startMin }
            return a.offset < b.offset
        }
        .prefix(limit)
        .map(\.element.0)
}

// MARK: - A saved day, as the schedule shows it

public struct SavedStop: Sendable {
    public var id: String
    public var location: LatLng?
    public var startMin: Int?
    public var endMin: Int?
}

public struct DaySummary: Equatable, Sendable {
    /// Driving into each stop, from the shop or the stop before.
    public var legs: [Int]
    /// Minutes each stop is short of the drive from the stop before.
    public var short: [Int]
    /// The whole day's driving, back to the shop included.
    public var driveMin: Int
    public var backMin: Int?
    public var overtimeMin: Int
    public var unlocated: Int

    /// The drive back to the shop.
    public var backLegMin: Int { driveMin - legs.reduce(0, +) }
}

/// Drive times and problems for a day as saved (not a re-plan).
public func daySummary(_ stops: [SavedStop], depot: LatLng?, day: WorkDay, drive: DriveFn) -> DaySummary {
    var at = depot
    var prevEnd: Int?
    var total = 0
    var legs: [Int] = []
    var short: [Int] = []
    for s in stops {
        let leg = drive(at, s.location)
        legs.append(leg)
        total += leg
        if let prevEnd, let start = s.startMin {
            short.append(max(0, prevEnd + leg - start))
        } else {
            short.append(0)
        }
        if let l = s.location { at = l }
        if let end = s.endMin { prevEnd = end }
    }
    let back = stops.isEmpty ? 0 : drive(at, depot)
    total += back
    let backMin = prevEnd.map { $0 + back }
    return DaySummary(
        legs: legs, short: short, driveMin: total, backMin: backMin,
        overtimeMin: backMin.map { max(0, $0 - day.endMin) } ?? 0, unlocated: stops.filter { $0.location == nil }.count)
}

// MARK: - Settings › Scheduling

public struct RoutingSettings: Equatable, Sendable {
    public var dayStart = "08:00"
    public var dayEnd = "17:00"
    /// The arrival window customers are told, in minutes; 0 = an exact time.
    public var windowMin = 0
    /// How long a job takes without an end time.
    public var jobMinutes = 150
    /// Days suggestions may use (0 = Sunday).
    public var workDays = [1, 2, 3, 4, 5]

    public var workDay: WorkDay { WorkDay(startMin: clockToMinutes(dayStart), endMin: clockToMinutes(dayEnd)) }
}

/// The shop's scheduling settings from company.settings.routing, with defaults filled in.
public func routingSettings(_ settings: JSONValue?) -> RoutingSettings {
    let raw = settings?["routing"]
    var s = RoutingSettings()
    let clock = { (v: JSONValue?) -> String? in
        guard let text = v?.string, text.wholeMatch(of: /([01]\d|2[0-3]):[0-5]\d/) != nil else { return nil }
        return text
    }
    s.dayStart = clock(raw?["day_start"]) ?? s.dayStart
    s.dayEnd = clock(raw?["day_end"]) ?? s.dayEnd
    if clockToMinutes(s.dayEnd) <= clockToMinutes(s.dayStart) { s.dayEnd = "17:00" }
    if let w = raw?["arrival_window_minutes"]?.number, [0, 60, 120, 240].contains(Int(w)), w == w.rounded() {
        s.windowMin = Int(w)
    }
    if let m = raw?["job_minutes"]?.number, m == m.rounded(), m >= 15, m <= 720 { s.jobMinutes = Int(m) }
    if let days = raw?["work_days"]?.array {
        let valid = Set(
            days.compactMap { $0.number }.filter { $0 == $0.rounded() && $0 >= 0 && $0 <= 6 }.map { Int($0) })
        if !valid.isEmpty { s.workDays = valid.sorted() }
    }
    return s
}

/// How On My Way texts go out: from the company number ("messages", the default) or the tech's phone.
public func onMyWayFromPhone(_ settings: JSONValue?) -> Bool { settings?["on_my_way"]?.string == "phone" }

// MARK: - Locks

public enum LockReason: String, Sendable {
    case fixed, started, twoTechs

    public var label: String {
        switch self {
        case .fixed: "Fixed time"
        case .started: "Started"
        case .twoTechs: "Two techs"
        }
    }
}

/// Why planning keeps a job where it is, or nil when it may move.
public func lockReason(status: JobStatus, arrivalFixed: Bool, secondTech: String?) -> LockReason? {
    if status != .scheduled && status != .unscheduled { return .started }
    if arrivalFixed { return .fixed }
    if secondTech != nil { return .twoTechs }
    return nil
}

/// Any job but a canceled one can be moved by hand.
public func canMoveJob(_ status: JobStatus) -> Bool { status != .canceled }

/// Only a job that hasn't started can go back to Needs a Time.
public func canUnschedule(_ status: JobStatus) -> Bool { status == .scheduled || status == .unscheduled }

// MARK: - Times and words

/// "08:30" → 510
public func clockToMinutes(_ hhmm: String) -> Int {
    let parts = hhmm.split(separator: ":").map { Int($0) ?? 0 }
    return (parts.first ?? 0) * 60 + (parts.count > 1 ? parts[1] : 0)
}

/// 510 → "08:30"
public func minutesToClock(_ min: Int) -> String {
    let m = max(0, min)
    return String(format: "%02d:%02d", (m / 60) % 24, m % 60)
}

/// 510 → "8:30 AM"
public func minutesLabel(_ min: Int) -> String {
    let m = max(0, min)
    let h = (m / 60) % 24
    return "\((h + 11) % 12 + 1):\(String(format: "%02d", m % 60)) \(h < 12 ? "AM" : "PM")"
}

/// "1 hr 5 min", "25 min".
public func durationLabel(_ min: Int) -> String {
    let m = max(0, min)
    if m < 60 { return "\(m) min" }
    return m % 60 != 0 ? "\(m / 60) hr \(m % 60) min" : "\(m / 60) hr"
}

public func arrivalText(_ startMin: Int, windowMin: Int) -> String {
    guard windowMin > 0 else { return "at \(minutesLabel(startMin))" }
    let from = startMin / 30 * 30
    return "between \(minutesLabel(from)) and \(minutesLabel(from + windowMin))"
}

/// The text a tech sends when they leave for a job. The arrival rounds up to the next 5 minutes.
public func onMyWayText(customer: String?, tech: String, shop: String, arriveMin: Int, windowMin: Int = 0) -> String {
    let hi = customer.map { "Hi \($0.split(separator: " ").first.map(String.init) ?? $0), " } ?? "Hi, "
    let shopName = shop.hasSuffix(".") ? String(shop.dropLast()) : shop
    let arrive = Int((Double(arriveMin) / 5).rounded(.up)) * 5
    let when = windowMin > 0 ? arrivalText(arrive, windowMin: windowMin) : "about \(minutesLabel(arrive))"
    let first = tech.split(separator: " ").first.map(String.init) ?? tech
    return "\(hi)this is \(first) from \(shopName). I’m on my way and should be there \(when)."
}

// MARK: - Maps

/// Which maps app directions open in (More › Directions open in; Apple Maps until changed).
public enum MapsApp: String, Sendable, CaseIterable {
    case apple, google

    /// More › On This Device › Directions open in (`app_kv`): "auto", "apple" or "google".
    /// Automatic is Apple Maps on an iPhone.
    public static let key = "directions_open_in"

    public init(_ kv: KeyValue) { self = kv.get(Self.key).flatMap(MapsApp.init(rawValue:)) ?? .apple }
}

private func destination(_ p: MapPlace) -> String {
    p.location.map { "\(coordinate($0.lat)),\(coordinate($0.lng))" } ?? p.address
}

private func coordinate(_ v: Double) -> String {
    v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : String(v)
}

private let query: CharacterSet = {
    var set = CharacterSet.alphanumerics
    set.insert(charactersIn: "-_.!~*'()")
    return set
}()

private func encode(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: query) ?? s }

/// Directions to one place.
public func directionsURL(_ p: MapPlace, app: MapsApp) -> URL? {
    switch app {
    case .apple: URL(string: nativeMapsUrl(p, "ios"))
    case .google:
        URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(encode(destination(p)))&travelmode=driving")
    }
}

/// A whole day in Google Maps: from the shop, through the stops (up to 10), and back.
public func routeLink(origin: MapPlace?, stops: [MapPlace]) -> URL? {
    guard !stops.isEmpty else { return nil }
    let shown = Array(stops.prefix(10))
    let last = origin ?? shown[shown.count - 1]
    let middle = origin != nil ? shown : Array(shown.dropLast())
    var parts = ["api=1", "travelmode=driving", "destination=\(encode(destination(last)))"]
    if let origin { parts.append("origin=\(encode(destination(origin)))") }
    if !middle.isEmpty { parts.append("waypoints=\(encode(middle.map(destination).joined(separator: "|")))") }
    return URL(string: "https://www.google.com/maps/dir/?\(parts.joined(separator: "&"))")
}

/// The day's directions: Google Maps takes the whole route; Apple Maps the next stop not done.
public func dayDirections(app: MapsApp, origin: MapPlace?, stops: [(place: MapPlace, done: Bool)]) -> URL? {
    switch app {
    case .google: return routeLink(origin: origin, stops: stops.map(\.place))
    case .apple: return stops.first { !$0.done }.flatMap { directionsURL($0.place, app: .apple) }
    }
}

// MARK: - Days

private let utc = TimeZone(identifier: "UTC")!

private func gregorian(_ zone: TimeZone) -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c
}

/// Noon UTC on a "YYYY-MM-DD" day.
func dayInstant(_ date: String) -> Date? {
    let p = date.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return gregorian(utc).date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
}

private func dayString(_ d: Date) -> String {
    let c = gregorian(utc).dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

public func isDateString(_ s: String) -> Bool {
    s.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) != nil && dayInstant(s) != nil
}

public func addDays(_ date: String, _ days: Int) -> String {
    guard let d = dayInstant(date) else { return date }
    return dayString(d.addingTimeInterval(Double(days) * 86_400))
}

/// 0 = Sunday.
public func weekday(_ date: String) -> Int {
    dayInstant(date).map { gregorian(utc).component(.weekday, from: $0) - 1 } ?? 0
}

/// Monday of the week containing `date`.
public func weekStart(_ date: String) -> String { addDays(date, -((weekday(date) + 6) % 7)) }

/// The same day of the month, `months` later (clamped).
public func addMonths(_ date: String, _ months: Int) -> String {
    let p = date.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return date }
    let total = p[0] * 12 + (p[1] - 1) + months
    let (y, m) = (total / 12, total % 12 + 1)
    let firstNext = String(format: "%04d-%02d-01", (m == 12 ? y + 1 : y), m == 12 ? 1 : m + 1)
    let last = Int(addDays(firstNext, -1).suffix(2)) ?? 28
    return String(format: "%04d-%02d-%02d", y, m, min(p[2], last))
}

public func daysBetween(_ a: String, _ b: String) -> Int {
    guard let x = dayInstant(a), let y = dayInstant(b) else { return 0 }
    return Int((y.timeIntervalSince(x) / 86_400).rounded())
}

public enum ScheduleView: String, CaseIterable, Hashable, Sendable {
    case day, week, month

    public var title: String {
        switch self {
        case .day: "Day"
        case .week: "Week"
        case .month: "Month"
        }
    }
}

/// The month's calendar: whole weeks, Monday first.
public func monthGrid(_ date: String) -> [String] {
    let first = "\(date.prefix(8))01"
    let last = addDays(addMonths(first, 1), -1)
    var days: [String] = []
    var d = weekStart(first)
    while d <= last || days.count % 7 != 0 {
        days.append(d)
        d = addDays(d, 1)
    }
    return days
}

/// The dates a schedule view covers.
public func scheduleDays(_ view: ScheduleView, _ date: String) -> [String] {
    switch view {
    case .day: [date]
    case .month: monthGrid(date)
    case .week: (0..<7).map { addDays(weekStart(date), $0) }
    }
}

private func formatter(_ pattern: String, _ zone: TimeZone) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zone
    f.dateFormat = pattern
    return f
}

/// "Sun, Oct 18" or, long, "Sunday, October 18".
public func formatDay(_ date: String, long: Bool = false) -> String {
    guard let d = dayInstant(date) else { return date }
    return formatter(long ? "EEEE, MMMM d" : "EEE, MMM d", utc).string(from: d)
}

/// "October 2026"
public func formatMonth(_ date: String) -> String {
    dayInstant(date).map { formatter("MMMM yyyy", utc).string(from: $0) } ?? date
}

/// An instant the rows hold ("2026-10-12T16:00:00.000Z", "…+00:00", "2026-10-12 16:00:00+00").
public func parseInstant(_ text: String?) -> Date? {
    guard var s = text?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
    if s.count > 10, s[s.index(s.startIndex, offsetBy: 10)] == " " {
        s.replaceSubrange(s.index(s.startIndex, offsetBy: 10)...s.index(s.startIndex, offsetBy: 10), with: "T")
    }
    if s.range(of: #"[+-]\d{2}$"#, options: .regularExpression) != nil { s += ":00" }
    let plain = ISO8601DateFormatter()
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: s) ?? plain.date(from: s)
}

public func isoString(_ date: Date) -> String {
    isoTimestamp(milliseconds: (date.timeIntervalSince1970 * 1000).rounded())
}

/// "9:00 AM" in the shop's time zone.
public func formatTime(_ iso: String?, timeZone: String) -> String {
    guard let d = parseInstant(iso) else { return "" }
    return formatter("h:mm a", TimeZone(identifier: timeZone) ?? utc).string(from: d)
}

/// "Oct 15, 2026" in the shop's time zone.
public func formatShortDate(_ iso: String?, timeZone: String) -> String {
    guard let d = parseInstant(iso) else { return "" }
    return formatter("MMM d, yyyy", TimeZone(identifier: timeZone) ?? utc).string(from: d)
}

/// Minutes after midnight in the zone.
public func localMinutes(_ date: Date, timeZone: String) -> Int {
    let c = gregorian(TimeZone(identifier: timeZone) ?? utc).dateComponents([.hour, .minute], from: date)
    return (c.hour ?? 0) * 60 + (c.minute ?? 0)
}

/// "YYYY-MM-DD" of an instant in the zone.
public func localDay(_ date: Date, timeZone: String) -> String {
    let c = gregorian(TimeZone(identifier: timeZone) ?? utc).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// The instant of `min` minutes after midnight on `date` in the zone (capped at 23:59).
public func zonedInstant(_ date: String, _ minutes: Int, timeZone: String) -> Date? {
    let p = date.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    let m = Swift.min(Swift.max(0, minutes), 24 * 60 - 1)
    return gregorian(TimeZone(identifier: timeZone) ?? utc).date(
        from: DateComponents(year: p[0], month: p[1], day: p[2], hour: m / 60, minute: m % 60))
}
