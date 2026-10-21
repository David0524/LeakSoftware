import Foundation
import SundeckCore
import Testing

/// routing.ts and route-plan.ts.
@Suite struct RoutingTests {
    let module = "routing"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "haversineMeters", "estimateDriveMinutes", "pointKey", "timeRoute", "routeCost", "optimizeRoute",
            "suggestSlots", "clockToMinutes", "minutesToClock", "minutesLabel", "durationLabel", "arrivalWindow",
            "arrivalText", "onMyWayText", "mapsLinks", "routeLink", "dayDirections", "ROUTING_DEFAULTS",
            "ARRIVAL_WINDOWS", "routingSettings", "workDay", "weekday", "localMinutes", "LOCK_LABELS", "canMoveJob",
            "canUnschedule", "lockReason", "inRouteOrder", "jobMinutes", "stopFor", "zonedMinutesToIso",
            "routeUpdates", "daySummary", "NOT_ON_MAP", "mapStatus", "JOB_LOCKS", "JOB_LOCK_LABELS", "JOB_LOCK_HELP",
            "jobLock", "lockColumns",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func notOnTheMap() {
        checkRule(module, "NOT_ON_MAP") { _ in
            ["title": NotOnMap.title, "detail": NotOnMap.detail, "short": NotOnMap.short]
        }
        checkRule(module, "mapStatus") { c in
            let row = try c.arg(0, as: JSONValue.self)
            guard case .object(var o) = row else {
                return mapStatus(nil, geocodedAddress: nil, routing: try c.arg(1))
            }
            o["has_pool"] = o["has_pool"] ?? true
            o["has_spa"] = o["has_spa"] ?? false
            return mapStatus(
                try JSONValue.object(o).decode(Property.self), geocodedAddress: o["geocoded_address"]?.string,
                routing: try c.arg(1))
        }
    }

    /// The cases' drive times: known minutes between point keys, else the estimate.
    static func drive(_ c: FixtureCase, _ index: Int) throws -> DriveFn {
        DriveTimes(known: try c.arg(index, as: [String: Int]?.self) ?? [:]).drive
    }

    struct Optimized: Encodable {
        let order: [Int]
        let route: TimedRoute
    }

    struct Job: Decodable {
        let location: LatLng?
        let durationMin: Int
    }

    @Test func distancesAndRoutes() {
        checkRule(module, "haversineMeters", tolerance: 1e-12) { c in haversineMeters(try c.arg(0), try c.arg(1)) }
        checkRule(module, "estimateDriveMinutes") { c in
            estimateDriveMinutes(try c.arg(0, as: LatLng?.self), try c.arg(1, as: LatLng?.self))
        }
        checkRule(module, "pointKey") { c in pointKey(try c.arg(0)) }
        checkRule(module, "timeRoute") { c in
            timeRoute(
                try c.arg(0), depot: try c.arg(1, as: LatLng?.self), day: try c.arg(2), drive: try Self.drive(c, 3))
        }
        checkRule(module, "routeCost") { c in routeCost(try c.arg(0)) }
        checkRule(module, "optimizeRoute") { c in
            let r = optimizeRoute(
                try c.arg(0), depot: try c.arg(1, as: LatLng?.self), day: try c.arg(2), drive: try Self.drive(c, 3))
            return Optimized(order: r.order, route: r.route)
        }
        checkRule(module, "suggestSlots") { c in
            let job = try c.arg(0, as: Job.self)
            return suggestSlots(
                location: job.location, durationMin: job.durationMin, days: try c.arg(1),
                depot: try c.arg(2, as: LatLng?.self), day: try c.arg(3), drive: try Self.drive(c, 4),
                limit: try c.arg(5, as: Int?.self) ?? 5)
        }
    }

    struct OnMyWay: Decodable {
        let customer: String?
        let tech: String
        let shop: String
        let arriveMin: Int
        let windowMin: Int?
    }

    @Test func timesAndWords() {
        checkRule(module, "clockToMinutes") { c in clockToMinutes(try c.arg(0)) }
        checkRule(module, "minutesToClock") { c in minutesToClock(try c.arg(0)) }
        checkRule(module, "minutesLabel") { c in minutesLabel(try c.arg(0)) }
        checkRule(module, "durationLabel") { c in durationLabel(try c.arg(0)) }
        checkRule(module, "arrivalWindow") { c in arrivalWindow(try c.arg(0), windowMin: try c.arg(1)) }
        checkRule(module, "arrivalText") { c in arrivalText(try c.arg(0), windowMin: try c.arg(1)) }
        checkRule(module, "onMyWayText") { c in
            let o = try c.arg(0, as: OnMyWay.self)
            return onMyWayText(
                customer: o.customer, tech: o.tech, shop: o.shop, arriveMin: o.arriveMin, windowMin: o.windowMin ?? 0)
        }
    }

    struct Stop: Decodable {
        let address: String
        let location: LatLng?
        let done: Bool?
    }

    @Test func maps() {
        checkRule(module, "mapsLinks") { c in mapsLinks(try c.arg(0)) }
        checkRule(module, "routeLink") { c in routeLink(try c.arg(0, as: MapPlace?.self), try c.arg(1)) }
        checkRule(module, "dayDirections") { c in
            let stops = try c.arg(2, as: [Stop].self).map {
                (place: MapPlace(address: $0.address, location: $0.location), done: $0.done ?? false)
            }
            return dayDirections(try c.arg(0), try c.arg(1, as: MapPlace?.self), stops)
        }
    }

    struct StopContext: Decodable {
        let timeZone: String
        let settings: RoutingSettings
        let techId: String
        let nowMin: Int?
    }

    struct LockLabels: Encodable {
        let segment: String
        let tag: String?
    }

    struct Locks: Decodable {
        let lockDay: Bool?
        let lockTime: Bool?
        let arrivalFixed: Bool?

        enum CodingKeys: String, CodingKey {
            case lockDay = "lock_day"
            case lockTime = "lock_time"
            case arrivalFixed = "arrival_fixed"
        }
    }

    @Test func routePlan() {
        checkRule(module, "ROUTING_DEFAULTS") { _ in routingDefaults }
        checkRule(module, "ARRIVAL_WINDOWS") { _ in arrivalWindows }
        checkRule(module, "routingSettings") { c in routingSettings(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "workDay") { c in workDay(try c.arg(0)) }
        checkRule(module, "weekday") { c in weekday(try c.arg(0)) }
        checkRule(module, "localMinutes") { c in try localMinutes(c.arg(0), c.arg(1)) }
        checkRule(module, "LOCK_LABELS") { _ in labelTable(\LockReason.label) }
        checkRule(module, "canMoveJob") { c in canMoveJob(try c.arg(0)) }
        checkRule(module, "canUnschedule") { c in canUnschedule(try c.arg(0)) }
        checkRule(module, "lockReason") { c in lockReason(try c.arg(0, as: PlanJob.self)) }
        checkRule(module, "JOB_LOCKS") { _ in jobLocks }
        checkRule(module, "JOB_LOCK_LABELS") { _ in
            Dictionary(
                uniqueKeysWithValues: JobLock.allCases.map {
                    ($0.rawValue, LockLabels(segment: $0.segment, tag: $0.tag))
                })
        }
        checkRule(module, "JOB_LOCK_HELP") { _ in labelTable(\JobLock.help) }
        checkRule(module, "jobLock") { c in
            let j = try c.arg(0, as: Locks.self)
            return jobLock(
                lockDay: j.lockDay ?? false, lockTime: j.lockTime ?? false, arrivalFixed: j.arrivalFixed ?? false)
        }
        checkRule(module, "lockColumns") { c in lockColumns(try c.arg(0)) }
        checkRule(module, "inRouteOrder") { c in inRouteOrder(try c.arg(0, as: [PlanJob].self)).map(\.id) }
        checkRule(module, "jobMinutes") { c in jobMinutes(try c.arg(0, as: PlanJob.self), try c.arg(1)) }
        checkRule(module, "stopFor") { c in
            let ctx = try c.arg(1, as: StopContext.self)
            return try stopFor(
                c.arg(0, as: PlanJob.self), timeZone: ctx.timeZone, settings: ctx.settings, techId: ctx.techId,
                nowMin: ctx.nowMin)
        }
        checkRule(module, "zonedMinutesToIso") { c in try zonedMinutesToIso(c.arg(0), c.arg(1), c.arg(2)) }
        checkRule(module, "routeUpdates") { c in
            let stops = try c.arg(2, as: [RouteStop].self)
            let shop = LatLng(lat: 33.4152, lng: -111.8315)
            let route = timeRoute(
                stops, depot: shop, day: WorkDay(startMin: 480, endMin: 1020), drive: try Self.drive(c, 3))
            return try routeUpdates(c.arg(0), c.arg(1), stops, route)
        }
        checkRule(module, "daySummary") { c in
            daySummary(
                try c.arg(0), depot: try c.arg(1, as: LatLng?.self), day: try c.arg(2), drive: try Self.drive(c, 3))
        }
    }
}
