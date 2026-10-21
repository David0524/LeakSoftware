import Foundation

// Routes and scheduling help. Port of routing.ts and route-plan.ts. Pure: no network, no clock.
// The caller supplies drive times as a function, so the same code plans a day, re-times it
// after a drag, and suggests slots. Times of day are minutes after midnight in the shop's time
// zone (8:00 AM = 480); days are "YYYY-MM-DD".

/// A point on the map.
public struct LatLng: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double

    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// Minutes of driving from a to b. Unknown locations count as 0 (and are flagged).
public typealias DriveFn = (LatLng?, LatLng?) -> Int

// MARK: - Distances and the built-in estimate

private let earthMeters = 6_371_000.0
private func rad(_ d: Double) -> Double { d * .pi / 180 }

public func haversineMeters(_ a: LatLng, _ b: LatLng) -> Double {
    let dLat = rad(b.lat - a.lat)
    let dLng = rad(b.lng - a.lng)
    let h = pow(sin(dLat / 2), 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * pow(sin(dLng / 2), 2)
    return 2 * earthMeters * asin(sqrt(h))
}

/// A drive-time estimate when no routing service is set up: roads are about 1.35 times the
/// straight line; city streets average 40 km/h for the first 10 km and freeways 75 km/h after
/// that; plus 3 minutes to get going and park.
public func estimateDriveMinutes(_ a: LatLng?, _ b: LatLng?) -> Int {
    guard let a, let b else { return 0 }
    let km = haversineMeters(a, b) * 1.35 / 1000
    if km < 0.05 { return 0 }
    let city = min(km, 10)
    let freeway = max(0, km - 10)
    return Int(ECMA.round(3 + city / 40 * 60 + freeway / 75 * 60))
}

/// Rounded to 4 decimals (about 11 m), the key drive times are cached under between two points.
public func pointKey(_ p: LatLng) -> String { "\(ECMA.toFixed(p.lat, 4)),\(ECMA.toFixed(p.lng, 4))" }

/// The same drive times, each pair of points worked out once (planning asks for the same legs
/// many thousands of times; `DriveTimes` builds two point keys per question). Not for sharing
/// between threads: one per planning run.
public func rememberingDrive(_ drive: @escaping DriveFn) -> DriveFn {
    final class Memo { var minutes: [Leg: Int] = [:] }
    struct Leg: Hashable {
        var from: LatLng?
        var to: LatLng?
    }
    let memo = Memo()
    return { a, b in
        let leg = Leg(from: a, to: b)
        if let m = memo.minutes[leg] { return m }
        let m = drive(a, b)
        memo.minutes[leg] = m
        return m
    }
}

/// Drive times: known times (from the server's cache) where there are some, else the estimate.
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

/// A stop in a route (route-plan.ts's `PlannedStop`; plain `RouteStop`s may always move).
public struct RouteStop: Codable, Equatable, Sendable {
    public var id: String
    public var location: LatLng?
    public var durationMin: Int
    /// It keeps this time (a time lock, or a job that started): the stop can't move.
    public var fixedStartMin: Int?
    /// Can't start before this (for example, now on today's route).
    public var earliestMin: Int?
    /// Planning may move it.
    public var movable: Bool
    /// This tech is the job's main tech, so the job's route order is theirs to save.
    public var own: Bool

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

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        location = try c.decodeIfPresent(LatLng.self, forKey: .location)
        durationMin = try c.decode(Int.self, forKey: .durationMin)
        fixedStartMin = try c.decodeIfPresent(Int.self, forKey: .fixedStartMin)
        earliestMin = try c.decodeIfPresent(Int.self, forKey: .earliestMin)
        movable = try c.decodeIfPresent(Bool.self, forKey: .movable) ?? true
        own = try c.decodeIfPresent(Bool.self, forKey: .own) ?? true
    }
}

public struct WorkDay: Codable, Equatable, Sendable {
    /// Leave the shop.
    public var startMin: Int
    /// Back at the shop by.
    public var endMin: Int

    public init(startMin: Int, endMin: Int) {
        self.startMin = startMin
        self.endMin = endMin
    }
}

public struct TimedStop: Codable, Equatable, Sendable {
    public var id: String
    public var driveMin: Int
    public var arriveMin: Int
    public var startMin: Int
    public var endMin: Int
    /// Minutes after a fixed appointment time.
    public var lateMin: Int
    public var unlocated: Bool
}

public struct TimedRoute: Codable, Equatable, Sendable {
    public var stops: [TimedStop]
    /// Including the drive back to the shop.
    public var driveMin: Int
    public var backMin: Int
    /// Minutes past the end of the working day.
    public var overtimeMin: Int
    /// Total minutes late for fixed appointments.
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

/// What a plan costs: driving, plus heavy penalties for being late or working over.
public func routeCost(_ r: TimedRoute) -> Int { r.driveMin + r.lateMin * 20 + r.overtimeMin * 5 }

// MARK: - Ordering a day

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
/// day. Exact for up to 8 stops (every order is tried); for more, the nearest stop first and then
/// improving swaps (2-opt and moving single stops) until nothing helps. Ties keep the current
/// order, so planning twice gives the same answer.
public func optimizeRoute(_ stops: [RouteStop], depot: LatLng?, day: WorkDay, drive: DriveFn) -> (
    order: [Int], route: TimedRoute
) {
    let n = stops.count
    // Every order of 8 stops is 40,320 routes, so each leg's drive is looked up once (stops 0..<n,
    // the shop at n) and an order is costed with plain arithmetic: the same sums as
    // `routeCost(timeRoute(…))`, which turned each leg into two point keys (owner, 2026-10-20:
    // "The Liquid Glass literally freezes up when I press 'plan route'").
    let points = stops.map(\.location) + [depot]
    let width = n + 1
    var legs = [Int](repeating: 0, count: width * width)
    for a in 0..<width {
        for b in 0..<width { legs[a * width + b] = drive(points[a], points[b]) }
    }
    func cost(_ order: [Int]) -> Int {
        var clock = day.startMin
        var at = n
        var driveTotal = 0
        var lateTotal = 0
        for i in order {
            let s = stops[i]
            let d = legs[at * width + i]
            driveTotal += d
            let arrive = clock + d
            let start = max(arrive, max(s.fixedStartMin ?? 0, s.earliestMin ?? 0))
            if let fixed = s.fixedStartMin { lateTotal += max(0, arrive - fixed) }
            clock = start + s.durationMin
            if s.location != nil { at = i }
        }
        let back = legs[at * width + n]
        driveTotal += back
        return driveTotal + lateTotal * 20 + max(0, clock + back - day.endMin) * 5
    }
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
    } else {
        // Nearest stop first, fixed appointments by time.
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

// MARK: - Suggesting a slot for a new job

public struct TechDay: Codable, Sendable {
    public var date: String
    public var techId: String
    public var techName: String
    /// That tech's jobs that day, in route order.
    public var stops: [RouteStop]
    /// Labels for the stops (customer names), by id, for "after Grace Holloway".
    public var labels: [String: String]?
    /// On today's route, nothing can start before now.
    public var notBeforeMin: Int?
    /// Where this tech's day starts and ends (`startFor`), when not the shop passed as `depot`.
    /// nil: the shop; `.some(nil)`: no location.
    public var start: LatLng??

    public init(
        date: String, techId: String, techName: String, stops: [RouteStop], labels: [String: String]? = nil,
        notBeforeMin: Int? = nil, start: LatLng?? = nil
    ) {
        self.date = date
        self.techId = techId
        self.techName = techName
        self.stops = stops
        self.labels = labels
        self.notBeforeMin = notBeforeMin
        self.start = start
    }

    enum CodingKeys: String, CodingKey { case date, techId, techName, stops, labels, notBeforeMin, start }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decode(String.self, forKey: .date)
        techId = try c.decode(String.self, forKey: .techId)
        techName = try c.decode(String.self, forKey: .techName)
        stops = try c.decode([RouteStop].self, forKey: .stops)
        labels = try c.decodeIfPresent([String: String].self, forKey: .labels)
        notBeforeMin = try c.decodeIfPresent(Int.self, forKey: .notBeforeMin)
        start = try c.contains(.start) ? .some(c.decodeIfPresent(LatLng.self, forKey: .start)) : nil
    }
}

public struct SlotSuggestion: Codable, Equatable, Sendable, Identifiable {
    public var date: String
    public var techId: String
    public var techName: String
    /// Where in the day's order (0 = first stop).
    public var position: Int
    public var startMin: Int
    /// Extra driving this job adds to that day.
    public var addedDriveMin: Int
    /// Driving from the stop before (or the shop) to this job.
    public var driveInMin: Int
    /// "after Grace Holloway", "first stop", "only job that day".
    public var near: String

    public init(
        date: String, techId: String, techName: String, position: Int, startMin: Int, addedDriveMin: Int,
        driveInMin: Int, near: String
    ) {
        self.date = date
        self.techId = techId
        self.techName = techName
        self.position = position
        self.startMin = startMin
        self.addedDriveMin = addedDriveMin
        self.driveInMin = driveInMin
        self.near = near
    }

    public var id: String { "\(techId)-\(date)" }
}

/// Whole days from the first of `days` to `td`, by noon UTC (NaN for a date that isn't one).
private func daysOut(_ days: [TechDay], _ td: TechDay) -> Double {
    let first = days.reduce(td.date) { min, d in d.date < min ? d.date : min }
    let ms = { (date: String) in ECMA.parseDate("\(date)T12:00:00Z") ?? .nan }
    return ECMA.round((ms(td.date) - ms(first)) / 86_400_000)
}

/// The best places to fit a job into existing routes: for each tech and day, every position in
/// the route is tried and the one that adds the least driving without making the day run late
/// or over is kept. Sooner days win small ties (2 minutes of driving per day out).
public func suggestSlots(
    location: LatLng?, durationMin: Int, days: [TechDay], depot: LatLng?, day: WorkDay, drive: DriveFn,
    limit: Int = 5
) -> [SlotSuggestion] {
    var found: [(slot: SlotSuggestion, score: Double)] = []
    for td in days {
        let from = td.start ?? depot
        let base = timeRoute(td.stops, depot: from, day: day, drive: drive)
        var best: (slot: SlotSuggestion, score: Double)?
        for p in 0...td.stops.count {
            let candidate = RouteStop(
                id: "__new", location: location, durationMin: durationMin, earliestMin: td.notBeforeMin)
            var stops = td.stops
            stops.insert(candidate, at: p)
            let r = timeRoute(stops, depot: from, day: day, drive: drive)
            if r.overtimeMin > base.overtimeMin || r.lateMin > base.lateMin { continue }
            let added = r.driveMin - base.driveMin
            let score = Double(added) + daysOut(days, td) * 2
            if best == nil || score < best!.score {
                let near =
                    td.stops.isEmpty
                    ? "only job that day"
                    : p > 0 ? "after \(td.labels?[td.stops[p - 1].id] ?? "the job before")" : "first stop"
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
    let sorted = ECMA.sort(found) { a, b in
        let s = a.score - b.score
        if s != 0 && !s.isNaN { return s }
        let d = ECMA.localeCompare(a.slot.date, b.slot.date)
        if d != 0 { return Double(d) }
        return Double(a.slot.startMin - b.slot.startMin)
    }
    // `slice(0, limit)`: a negative limit counts from the end.
    let end = limit < 0 ? max(0, sorted.count + limit) : min(limit, sorted.count)
    return sorted[..<end].map(\.slot)
}

// MARK: - Times and words

/// "08:30" → 510
public func clockToMinutes(_ hhmm: String) -> Int {
    let parts = hhmm.split(separator: ":", omittingEmptySubsequences: false).map { ECMA.number(String($0)) }
    let h = parts[0]
    let m = parts.count > 1 ? parts[1] : 0
    let total = h * 60 + m
    return total.isFinite ? Int(total) : 0
}

/// 510 → "08:30"
public func minutesToClock(_ min: Int) -> String {
    let m = max(0, min)
    return "\(ECMA.pad(String(m / 60 % 24), 2)):\(ECMA.pad(String(m % 60), 2))"
}

/// 510 → "8:30 AM"
public func minutesLabel(_ min: Int) -> String {
    let m = max(0, min)
    let h = m / 60 % 24
    return "\((h + 11) % 12 + 1):\(ECMA.pad(String(m % 60), 2)) \(h < 12 ? "AM" : "PM")"
}

/// "1 hr 5 min", "25 min".
public func durationLabel(_ min: Int) -> String {
    let m = max(0, min)
    if m < 60 { return "\(m) min" }
    return m % 60 != 0 ? "\(m / 60) hr \(m % 60) min" : "\(m / 60) hr"
}

public struct ArrivalWindow: Codable, Equatable, Sendable {
    public var from: Int
    public var to: Int
}

/// The window a customer is told, when the shop uses arrival windows: it starts at the planned
/// time rounded down to the half hour. 0 means an exact time.
public func arrivalWindow(_ startMin: Int, windowMin: Int) -> ArrivalWindow {
    if windowMin == 0 { return ArrivalWindow(from: startMin, to: startMin) }
    let from = Int((Double(startMin) / 30).rounded(.down)) * 30
    return ArrivalWindow(from: from, to: from + windowMin)
}

public func arrivalText(_ startMin: Int, windowMin: Int) -> String {
    let w = arrivalWindow(startMin, windowMin: windowMin)
    return windowMin != 0
        ? "between \(minutesLabel(w.from)) and \(minutesLabel(w.to))" : "at \(minutesLabel(startMin))"
}

/// The first word, as JavaScript's `split(" ")[0]` gives it (empty when the text starts with a space).
private func firstWord(_ s: String) -> String {
    String(s.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
}

/// The text a tech sends from their phone when they leave for a job. The arrival time rounds up
/// to the next 5 minutes ("about 10:45 AM", not "10:42 AM"; owner, 2026-10-14).
public func onMyWayText(customer: String?, tech: String, shop: String, arriveMin: Int, windowMin: Int = 0) -> String {
    let hi = customer.map { $0.isEmpty ? "Hi, " : "Hi \(firstWord($0)), " } ?? "Hi, "
    let shopName = shop.hasSuffix(".") ? String(shop.dropLast()) : shop
    let arrive = Int((Double(arriveMin) / 5).rounded(.up)) * 5
    let when = windowMin != 0 ? arrivalText(arrive, windowMin: windowMin) : "about \(minutesLabel(arrive))"
    return "\(hi)this is \(firstWord(tech)) from \(shopName). I’m on my way and should be there \(when)."
}

// MARK: - Maps

/// A place to give directions to: its address, and its point when known.
public struct MapPlace: Codable, Equatable, Sendable {
    public var address: String
    public var location: LatLng?

    public init(address: String, location: LatLng? = nil) {
        self.address = address
        self.location = location
    }
}

/// Which maps app directions open in.
public enum MapsApp: String, Codable, CaseIterable, Sendable {
    case apple, google
}

/// A property's point, when it has both coordinates.
public func propertyLocation(_ p: Property?) -> LatLng? {
    guard let lat = p?.latitude, let lng = p?.longitude else { return nil }
    return LatLng(lat: lat, lng: lng)
}

/// What the "not on the map" warning says, everywhere it shows (owner, 2026-10-20). Port of
/// `NOT_ON_MAP`.
public enum NotOnMap {
    public static let title = "Not found on the map"
    public static let detail =
        "Routes and drive times leave this stop out until its address is found. Check the address, pick one of the suggestions as you type it, or mark the spot at the pool."
    public static let short = "Not on map"
}

/// Whether a pool's address was found on the map (owner, 2026-10-20: "we need an indicator for
/// when address doesn't register"): found when it has coordinates for its current address,
/// missing when it has an address but no coordinates for it (not found, or changed since), nil
/// when there's no address or no routing service to look it up with. Port of `mapStatus`.
public enum MapStatus: String, Codable, Sendable {
    case found, missing
}

public func mapStatus(_ p: Property?, geocodedAddress: String?, routing: Bool) -> MapStatus? {
    guard let p, routing else { return nil }
    let address = formatAddress(p)
    if p.addressLine1.trimmingWhitespace().isEmpty || address.isEmpty { return nil }
    // Pools located before lookups were kept with their address count as found.
    if propertyLocation(p) != nil && (geocodedAddress == nil || geocodedAddress == address) { return .found }
    return .missing
}

private func point(_ l: LatLng) -> String { "\(ECMA.numberString(l.lat)),\(ECMA.numberString(l.lng))" }

private func destination(_ p: MapPlace) -> String { p.location.map(point) ?? p.address }

public struct MapsLinks: Codable, Equatable, Sendable {
    public var apple: String
    public var google: String
}

/// Directions to one place in Apple Maps and Google Maps (each opens the app on a phone).
public func mapsLinks(_ p: MapPlace) -> MapsLinks {
    let to = ECMA.encodeURIComponent(destination(p))
    let q = ECMA.encodeURIComponent(p.address)
    return MapsLinks(
        apple: "https://maps.apple.com/?daddr=\(to)&q=\(q)&dirflg=d",
        google: "https://www.google.com/maps/dir/?api=1&destination=\(to)&travelmode=driving")
}

/// Directions from the phone app: Apple Maps on iPhone; on Android a geo: link, which opens
/// the phone's own maps app (Google Maps, Waze, …) at the pool.
public func nativeMapsUrl(_ p: MapPlace, _ os: String) -> String {
    if os == "ios" { return mapsLinks(p).apple }
    if os == "android" {
        let q = p.location.map { "\(point($0))(\(p.address))" } ?? p.address
        return "geo:0,0?q=\(ECMA.encodeURIComponent(q))"
    }
    return mapsLinks(p).google
}

/// A whole day in Google Maps: from the shop, through the stops in order (Google takes up to 9
/// stops between), and back. Apple Maps links take one destination, so phones that prefer Apple
/// Maps open each stop on its own.
public func routeLink(_ origin: MapPlace?, _ stops: [MapPlace]) -> String? {
    guard !stops.isEmpty else { return nil }
    let shown = Array(stops.prefix(10))
    let last = origin ?? shown[shown.count - 1]
    let middle = origin != nil ? shown : Array(shown.dropLast())
    var params = [("api", "1"), ("travelmode", "driving"), ("destination", destination(last))]
    if let origin { params.append(("origin", destination(origin))) }
    if !middle.isEmpty { params.append(("waypoints", middle.map(destination).joined(separator: "|"))) }
    return "https://www.google.com/maps/dir/?\(ECMA.searchParams(params))"
}

public struct DayDirections: Codable, Equatable, Sendable {
    public var href: String
    public var app: MapsApp
}

/// The day's directions in the chosen maps app. Google Maps takes the whole route (from the
/// shop, through the stops, and back). Apple Maps links take one destination, so Apple Maps
/// opens the next stop not yet done; the others are a tap away on their addresses.
public func dayDirections(_ app: MapsApp, _ origin: MapPlace?, _ stops: [(place: MapPlace, done: Bool)])
    -> DayDirections?
{
    if app == .google {
        return routeLink(origin, stops.map(\.place)).map { DayDirections(href: $0, app: app) }
    }
    return stops.first { !$0.done }.map { DayDirections(href: mapsLinks($0.place).apple, app: app) }
}

// MARK: - Settings › Scheduling (route-plan.ts)

public struct RoutingSettings: Codable, Equatable, Sendable {
    /// Techs leave the shop ("08:00").
    public var dayStart = "08:00"
    /// Back at the shop by ("17:00").
    public var dayEnd = "17:00"
    /// Arrival window customers are told, in minutes; 0 = an exact time.
    public var windowMin = 0
    /// How long a job takes when it has no end time.
    public var jobMinutes = 150
    /// Days suggestions may use (0 = Sunday … 6 = Saturday).
    public var workDays = [1, 2, 3, 4, 5]

    public init() {}

    public var workDay: WorkDay { SundeckCore.workDay(self) }
}

/// `ROUTING_DEFAULTS`
public let routingDefaults = RoutingSettings()

/// `ARRIVAL_WINDOWS`
public let arrivalWindows = [0, 60, 120, 240]

private func isClock(_ v: JSONValue?) -> String? {
    guard case .string(let text)? = v, text.wholeMatch(of: /([01][0-9]|2[0-3]):[0-5][0-9]/) != nil else {
        return nil
    }
    return text
}

/// The shop's scheduling settings from company.settings.routing, with defaults filled in.
public func routingSettings(_ settings: JSONValue?) -> RoutingSettings {
    let raw: JSONValue? = {
        guard case .object(let o)? = settings, let r = o["routing"], r != .null else { return nil }
        return r
    }()
    let field = { (key: String) -> JSONValue? in
        guard case .object(let o)? = raw else { return nil }
        return o[key]
    }
    var s = RoutingSettings()
    s.dayStart = isClock(field("day_start")) ?? routingDefaults.dayStart
    s.dayEnd = isClock(field("day_end")) ?? routingDefaults.dayEnd
    if clockToMinutes(s.dayEnd) <= clockToMinutes(s.dayStart) { s.dayEnd = routingDefaults.dayEnd }
    let window = ECMA.toNumber(field("arrival_window_minutes"))
    let minutes = ECMA.toNumber(field("job_minutes"))
    s.windowMin = arrivalWindows.contains { Double($0) == window } ? Int(window) : 0
    s.jobMinutes = minutes == minutes.rounded() && minutes >= 15 && minutes <= 720 ? Int(minutes) : 150
    if case .array(let list)? = field("work_days") {
        var days: [Int] = []
        for case .number(let d) in list where d == d.rounded() && d >= 0 && d <= 6 && !days.contains(Int(d)) {
            days.append(Int(d))
        }
        // `sort()` compares as strings, which for 0-6 is the number order.
        if !days.isEmpty { s.workDays = days.sorted() }
    }
    return s
}

public func workDay(_ s: RoutingSettings) -> WorkDay {
    WorkDay(startMin: clockToMinutes(s.dayStart), endMin: clockToMinutes(s.dayEnd))
}

/// Day of the week for "2026-10-13" (0 = Sunday); nil when it isn't a date.
public func weekday(_ date: String) -> Int? {
    ECMA.parseDate("\(date)T12:00:00Z").map { ECMA.utcClock($0).weekday }
}

/// Minutes after midnight, in the shop's time zone, of an instant.
public func localMinutes(_ iso: String, _ timeZone: String) throws -> Int {
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.wallClock(ms, zone)
    return wall.hour * 60 + wall.minute
}

// MARK: - Jobs as stops

/// The parts of a job routing reads (route-plan.ts's `PlanJob`).
public protocol PlanJobFields {
    var id: String { get }
    var status: JobStatus { get }
    var assignedUserId: String? { get }
    var secondTechId: String? { get }
    var scheduledStart: String? { get }
    var scheduledEnd: String? { get }
    var routeOrder: Int? { get }
    /// Kept equal to both locks for old builds; a job saved before locks with it is locked both ways.
    var arrivalFixed: Bool { get }
    /// Locks (owner, 2026-10-20): stays on its day / keeps its clock time.
    var lockDay: Bool { get }
    var lockTime: Bool { get }
    /// The pool's point (`propertyLocation(job.property)`).
    var location: LatLng? { get }
    /// The customer's name, for "after Grace Holloway" in suggestions.
    var label: String? { get }
}

extension PlanJobFields {
    public var label: String? { nil }
}

/// A job as planning reads it, in the rows' shape (`PlanJob & { label?: string }`).
public struct PlanJob: PlanJobFields, Codable, Equatable, Sendable {
    public struct Located: Codable, Equatable, Sendable {
        public var latitude: Double?
        public var longitude: Double?
    }

    public var id: String
    public var status: JobStatus
    public var assignedUserId: String?
    public var secondTechId: String?
    public var scheduledStart: String?
    public var scheduledEnd: String?
    public var routeOrder: Int?
    public var arrivalFixed: Bool
    public var lockDay: Bool
    public var lockTime: Bool
    public var property: Located?
    public var label: String?

    public var location: LatLng? {
        guard let lat = property?.latitude, let lng = property?.longitude else { return nil }
        return LatLng(lat: lat, lng: lng)
    }

    enum CodingKeys: String, CodingKey {
        case id, status, property, label
        case assignedUserId = "assigned_user_id"
        case secondTechId = "second_tech_id"
        case scheduledStart = "scheduled_start"
        case scheduledEnd = "scheduled_end"
        case routeOrder = "route_order"
        case arrivalFixed = "arrival_fixed"
        case lockDay = "lock_day"
        case lockTime = "lock_time"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decode(JobStatus.self, forKey: .status)
        assignedUserId = try c.decodeIfPresent(String.self, forKey: .assignedUserId)
        secondTechId = try c.decodeIfPresent(String.self, forKey: .secondTechId)
        scheduledStart = try c.decodeIfPresent(String.self, forKey: .scheduledStart)
        scheduledEnd = try c.decodeIfPresent(String.self, forKey: .scheduledEnd)
        routeOrder = try c.decodeIfPresent(Int.self, forKey: .routeOrder)
        arrivalFixed = try c.decodeIfPresent(Bool.self, forKey: .arrivalFixed) ?? false
        lockDay = try c.decodeIfPresent(Bool.self, forKey: .lockDay) ?? false
        lockTime = try c.decodeIfPresent(Bool.self, forKey: .lockTime) ?? false
        property = try c.decodeIfPresent(Located.self, forKey: .property)
        label = try c.decodeIfPresent(String.self, forKey: .label)
    }
}

public enum LockReason: String, Codable, CaseIterable, Sendable {
    case fixed, time, started
    case twoTechs = "two_techs"

    /// `LOCK_LABELS`
    public var label: String {
        switch self {
        case .fixed: "Locked"
        case .time: "Time locked"
        case .started: "Started"
        case .twoTechs: "Two techs"
        }
    }
}

/// A job's locks (owner, 2026-10-20: "locks for jobs whether that's day, time, or both").
public enum JobLock: String, Codable, CaseIterable, Sendable {
    case none, day, time, both

    /// `JOB_LOCK_LABELS[lock].segment`: the lock picker's segment.
    public var segment: String {
        switch self {
        case .none: "None"
        case .day: "Day"
        case .time: "Time"
        case .both: "Both"
        }
    }

    /// `JOB_LOCK_LABELS[lock].tag`: what a locked card says (nil when it isn't locked).
    public var tag: String? {
        switch self {
        case .none: nil
        case .day: "Day locked"
        case .time: "Time locked"
        case .both: "Locked"
        }
    }

    /// `JOB_LOCK_HELP`: what each lock keeps, for the picker's footnote.
    public var help: String {
        switch self {
        case .none: "Planning may move it to another day and time."
        case .day: "Stays on its day. Planning may change its time that day."
        case .time: "Keeps its time. Planning may move it to another day at that time."
        case .both: "Stays on its day and time."
        }
    }

    /// It keeps its clock time (a time lock or both).
    public var keepsTime: Bool { self == .time || self == .both }
}

/// `JOB_LOCKS`, in the picker's order.
public let jobLocks: [JobLock] = [.none, .day, .time, .both]

/// Which lock a job has. A job saved before locks with a fixed time is locked both ways.
public func jobLock(lockDay: Bool, lockTime: Bool, arrivalFixed: Bool) -> JobLock {
    let day = lockDay || arrivalFixed
    let time = lockTime || arrivalFixed
    return day && time ? .both : day ? .day : time ? .time : .none
}

public func jobLock<J: PlanJobFields>(_ job: J) -> JobLock {
    jobLock(lockDay: job.lockDay, lockTime: job.lockTime, arrivalFixed: job.arrivalFixed)
}

/// The columns a lock sets (`lockColumns`).
public struct LockColumns: Codable, Equatable, Sendable {
    public var lockDay: Bool
    public var lockTime: Bool
    public var arrivalFixed: Bool

    enum CodingKeys: String, CodingKey {
        case lockDay = "lock_day"
        case lockTime = "lock_time"
        case arrivalFixed = "arrival_fixed"
    }

    /// The row's new values, by column.
    public var values: [String: JSONValue] {
        ["lock_day": .bool(lockDay), "lock_time": .bool(lockTime), "arrival_fixed": .bool(arrivalFixed)]
    }
}

public func lockColumns(_ lock: JobLock) -> LockColumns {
    let day = lock == .day || lock == .both
    let time = lock == .time || lock == .both
    return LockColumns(lockDay: day, lockTime: time, arrivalFixed: day && time)
}

/// Whether someone may drag this job to another day or tech by hand: any job but a canceled one
/// (owner, 2026-10-18). Plan Route still leaves started and finished jobs where they are.
public func canMoveJob(_ status: JobStatus) -> Bool { status != .canceled }

/// Whether a job can go back to Needs a Time: only one that hasn't started.
public func canUnschedule(_ status: JobStatus) -> Bool { status == .scheduled || status == .unscheduled }

private func present(_ s: String?) -> Bool { !(s ?? "").isEmpty }

/// Why planning a day keeps this job's time, or nil when it may move. A started or finished job
/// has happened; a time lock was promised; a two-tech job is in two routes, so moving it in one
/// would strand the other tech (move it by hand to change both). A day lock alone doesn't hold a
/// time within the day, so it's not a reason here (Plan Week keeps it on its day).
public func lockReason<J: PlanJobFields>(_ job: J) -> LockReason? {
    if job.status != .scheduled && job.status != .unscheduled { return .started }
    switch jobLock(job) {
    case .both: return .fixed
    case .time: return .time
    case .none, .day: break
    }
    if present(job.secondTechId) { return .twoTechs }
    return nil
}

/// A day's jobs in route order. Times decide it (they are what techs and customers see, and
/// someone may have changed one by hand); the saved place breaks ties, and jobs without a time
/// go last.
public func inRouteOrder<J: PlanJobFields>(_ jobs: [J]) -> [J] {
    // `Date.parse(…) || Infinity`, then `a - b || …`: NaN and 0 fall through to the next key.
    let time = { (s: String?) -> Double in
        let t = ECMA.parseDate(s ?? "") ?? 0
        return t == 0 ? .infinity : t
    }
    let order = { (o: Int?) in o.map(Double.init) ?? .infinity }
    return ECMA.sort(jobs) { a, b in
        let t = time(a.scheduledStart) - time(b.scheduledStart)
        if t != 0 && !t.isNaN { return t }
        let o = order(a.routeOrder) - order(b.routeOrder)
        if o != 0 && !o.isNaN { return o }
        return Double(ECMA.localeCompare(a.id, b.id))
    }
}

/// How long a job takes: its saved times, else the shop's default.
public func jobMinutes<J: PlanJobFields>(_ job: J, _ settings: RoutingSettings) -> Int {
    if present(job.scheduledStart), present(job.scheduledEnd), let a = ECMA.parseDate(job.scheduledStart!),
        let b = ECMA.parseDate(job.scheduledEnd!)
    {
        let m = ECMA.round((b - a) / 60_000)
        if m > 0 && m <= 24 * 60 { return Int(m) }
    }
    return settings.jobMinutes
}

/// A job as a stop in `techId`'s route. On today's route nothing moves before `nowMin`.
public func stopFor<J: PlanJobFields>(
    _ job: J, timeZone: String, settings: RoutingSettings, techId: String, nowMin: Int? = nil
) throws -> RouteStop {
    let movable = lockReason(job) == nil
    let fixed = !movable && present(job.scheduledStart) ? try localMinutes(job.scheduledStart!, timeZone) : nil
    return RouteStop(
        id: job.id, location: job.location, durationMin: jobMinutes(job, settings), fixedStartMin: fixed,
        earliestMin: movable ? nowMin : nil, movable: movable, own: job.assignedUserId == techId)
}

/// A row to save on a job: only the fields that change (route-plan.ts's `JobUpdate` and
/// schedule-moves.ts's `JobChange`). An outer nil leaves a field alone; an inner nil saves null.
public struct JobChange: Encodable, Equatable, Sendable {
    public var id: String
    public var routeOrder: Int??
    public var scheduledStart: String??
    public var scheduledEnd: String??
    public var status: JobStatus?
    public var assignedUserId: String??
    public var arrivalFixed: Bool?

    public init(
        id: String, routeOrder: Int?? = nil, scheduledStart: String?? = nil, scheduledEnd: String?? = nil,
        status: JobStatus? = nil, assignedUserId: String?? = nil, arrivalFixed: Bool? = nil
    ) {
        self.id = id
        self.routeOrder = routeOrder
        self.scheduledStart = scheduledStart
        self.scheduledEnd = scheduledEnd
        self.status = status
        self.assignedUserId = assignedUserId
        self.arrivalFixed = arrivalFixed
    }

    /// The row's new values, by column.
    public var values: [String: JSONValue] {
        var v: [String: JSONValue] = [:]
        if let routeOrder { v["route_order"] = routeOrder.map { .number(Double($0)) } ?? .null }
        if let scheduledStart { v["scheduled_start"] = scheduledStart.map(JSONValue.string) ?? .null }
        if let scheduledEnd { v["scheduled_end"] = scheduledEnd.map(JSONValue.string) ?? .null }
        if let status { v["status"] = .string(status.rawValue) }
        if let assignedUserId { v["assigned_user_id"] = assignedUserId.map(JSONValue.string) ?? .null }
        if let arrivalFixed { v["arrival_fixed"] = .bool(arrivalFixed) }
        return v
    }

    public func encode(to encoder: Encoder) throws {
        var values = self.values
        values["id"] = .string(id)
        try JSONValue.object(values).encode(to: encoder)
    }
}

/// The instant of `min` minutes after midnight on `date` in the zone (capped at 23:59).
public func zonedMinutesToIso(_ date: String, _ min: Int, _ timeZone: String) throws -> String {
    try zonedTimeToIso(date, minutesToClock(Swift.min(Swift.max(0, min), 24 * 60 - 1)), timeZone)
}

/// `new Date(Date.parse(iso) + minutes * 60_000).toISOString()`.
func isoPlusMinutes(_ iso: String, _ minutes: Int) throws -> String {
    try ECMA.isoString((ECMA.parseDate(iso) ?? .nan) + Double(minutes) * 60_000)
}

/// Rows to save for a timed route: every stop of this tech's gets its place, and stops that may
/// move get the route's times. Locked stops keep their times.
public func routeUpdates(_ date: String, _ timeZone: String, _ stops: [RouteStop], _ route: TimedRoute) throws
    -> [JobChange]
{
    var updates: [JobChange] = []
    for (i, s) in stops.enumerated() where s.own {
        var u = JobChange(id: s.id, routeOrder: .some(i + 1))
        if s.movable {
            let start = try zonedMinutesToIso(date, route.stops[i].startMin, timeZone)
            u.scheduledStart = .some(start)
            u.scheduledEnd = .some(try isoPlusMinutes(start, s.durationMin))
        }
        updates.append(u)
    }
    return updates
}

// MARK: - A saved day, as the schedule shows it

public struct SavedStop: Codable, Sendable {
    public var id: String
    public var location: LatLng?
    /// Saved times, minutes after midnight (nil when the job has no time).
    public var startMin: Int?
    public var endMin: Int?

    public init(id: String, location: LatLng?, startMin: Int?, endMin: Int?) {
        self.id = id
        self.location = location
        self.startMin = startMin
        self.endMin = endMin
    }
}

public struct DaySummary: Codable, Equatable, Sendable {
    /// Driving into each stop, from the shop or the stop before.
    public var legs: [Int]
    /// Minutes each stop is short of the drive from the stop before (0 = it fits).
    public var short: [Int]
    /// Driving for the whole day, back to the shop included.
    public var driveMin: Int
    public var backMin: Int?
    public var overtimeMin: Int
    public var unlocated: Int

    /// The drive back to the shop.
    public var backLegMin: Int { driveMin - legs.reduce(0, +) }
}

/// Drive times and problems for a day as saved: the times the techs and customers have, not a
/// re-plan. A stop is short when the job before ends too late to drive there in time.
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
        overtimeMin: backMin.map { max(0, $0 - day.endMin) } ?? 0,
        unlocated: stops.filter { $0.location == nil }.count)
}
