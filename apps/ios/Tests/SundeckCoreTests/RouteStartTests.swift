import Foundation
import SundeckCore
import Testing

/// route-start.ts (start the day from home or from the shop) and the routing rules that take a
/// tech's start.
@Suite struct RouteStartTests {
    let module = "route-start"

    /// The cases' shop and working day (fixtures/cases/route-start.ts).
    static let shop = LatLng(lat: 33.4152, lng: -111.8315)
    static let day = WorkDay(startMin: 480, endMin: 1020)

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "START_FROM_COPY", "endAtOf", "usesHome", "homeLookupAddress", "homeMapStatus", "routeStart",
                "startFor", "startLegLabel", "backLegLabel", "timeRoute", "optimizeRoute", "daySummary", "planDay",
                "moveJobChange", "suggestTimes", "suggestSlots", "planWeek", "suggestServiceDays", "dayMapPins",
                "encodePins", "decodePins",
            ])
    }

    @Test func theSetting() {
        checkRule(module, "START_FROM_COPY") { _ in StartFromCopy.all }
        checkRule(module, "endAtOf") { c in
            let m = try c.arg(0, as: StartAndEnd.self)
            return endAtOf(startFrom: m.startFrom, endAt: m.endAt)
        }
        checkRule(module, "usesHome") { c in usesHome(try c.arg(0), try c.arg(1)) }
        checkRule(module, "homeLookupAddress") { c in homeLookupAddress(try c.arg(0)) }
        checkRule(module, "homeMapStatus") { c in homeMapStatus(try c.arg(0)) }
        checkRule(module, "routeStart") { c in routeStart(try c.arg(0), shop: try c.arg(1)) }
        checkRule(module, "startFor") { c in startFor(try c.arg(0), try c.arg(1), shop: try c.arg(2)) }
        checkRule(module, "startLegLabel") { c in startLegLabel(try c.arg(0)) }
        checkRule(module, "backLegLabel") { c in backLegLabel(try c.arg(0)) }
    }

    struct Job: Decodable {
        let id: String?
        let location: LatLng?
        let durationMin: Int
    }

    struct ServiceDaysInput: Decodable {
        let place: [RoutePlan]
        let keep: [RoutePlan]
        let techs: [String]
        let workDays: [Int]
        let depot: LatLng?
        let starts: [MemberStart]?
        let day: WorkDay
    }

    struct MapInput: Decodable {
        let stops: [MapStop]
        let depot: LatLng?
        let startLabel: RouteStartLabel?
        let end: LatLng?
        let endLabel: RouteStartLabel?
    }

    @Test func routesFromTheStart() {
        checkRule(module, "timeRoute") { c in
            let s = try c.arg(1, as: RouteStart.self)
            return timeRoute(
                try c.arg(0), depot: s.at, day: Self.day, drive: try RoutingTests.drive(c, 2), end: s.end.at)
        }
        checkRule(module, "optimizeRoute") { c in
            let s = try c.arg(1, as: RouteStart.self)
            let r = optimizeRoute(
                try c.arg(0), depot: s.at, day: Self.day, drive: try RoutingTests.drive(c, 2), end: s.end.at)
            return RoutingTests.Optimized(order: r.order, route: r.route)
        }
        checkRule(module, "daySummary") { c in
            let s = try c.arg(1, as: RouteStart.self)
            return daySummary(
                try c.arg(0), depot: s.at, day: Self.day, drive: try RoutingTests.drive(c, 2), end: s.end.at)
        }
        checkRule(module, "planDay") { c in
            try planDay(c.arg(0), c.arg(1), c.arg(2), c.arg(3, as: [PlanJob].self), drive: RoutingTests.drive(c, 4))
        }
        checkRule(module, "moveJobChange") { c in
            let m = try c.arg(1, as: ScheduleMovesTests.Move.self)
            let input = MoveInput(
                job: m.job, tech: m.tech, date: m.date, index: m.index, targetDay: m.targetDay, fromDay: m.fromDay,
                seesAll: m.seesAll, userId: m.userId)
            return try moveJobChange(c.arg(0), input, drive: RoutingTests.drive(c, 2))
        }
        checkRule(module, "suggestTimes") { c in
            let job = try c.arg(1, as: Job.self)
            let routes = try c.arg(2, as: [ScheduleMovesTests.Route].self).map {
                SuggestRoute(techId: $0.techId, techName: $0.techName, date: $0.date, jobs: $0.jobs)
            }
            return try suggestTimes(
                c.arg(0), id: job.id, location: job.location, durationMin: job.durationMin, routes: routes,
                drive: RoutingTests.drive(c, 3))
        }
        checkRule(module, "suggestSlots") { c in
            let job = try c.arg(0, as: Job.self)
            return suggestSlots(
                location: job.location, durationMin: job.durationMin, days: try c.arg(1), depot: Self.shop,
                day: Self.day, drive: try RoutingTests.drive(c, 2))
        }
        checkRule(module, "planWeek") { c in
            let p = planWeek(
                days: try c.arg(0), jobs: try c.arg(1), depot: Self.shop, day: Self.day,
                drive: try RoutingTests.drive(c, 3), even: try c.arg(2, as: Bool?.self) ?? false)
            return WeekPlanTests.Plan(
                placed: p.placed, unplaced: p.unplaced, skipped: p.skipped,
                days: p.days.map { d in
                    WeekPlanTests.Day(
                        techId: d.techId, date: d.date,
                        stops: d.stops.map {
                            WeekPlanTests.Stop(
                                id: $0.id, location: $0.location, durationMin: $0.durationMin,
                                fixedStartMin: $0.fixedStartMin, earliestMin: $0.earliestMin)
                        }, route: d.route)
                }, driveBefore: p.driveBefore, driveAfter: p.driveAfter, moved: p.moved, split: p.split)
        }
        checkRule(module, "suggestServiceDays") { c in
            let i = try c.arg(0, as: ServiceDaysInput.self)
            return suggestServiceDays(
                place: i.place, keep: i.keep, techs: i.techs, workDays: i.workDays, depot: i.depot, starts: i.starts,
                day: i.day, drive: try RoutingTests.drive(c, 1))
        }
    }

    @Test func homeOnTheMap() {
        checkRule(module, "dayMapPins") { c in
            let i = try c.arg(0, as: MapInput.self)
            return dayMapPins(
                stops: i.stops, depot: i.depot, startLabel: i.startLabel, end: i.end, endLabel: i.endLabel)
        }
        checkRule(module, "encodePins") { c in encodePins(try c.arg(0)) }
        checkRule(module, "decodePins") { c in decodePins(try c.arg(0)) }
    }

    @Test func homePinRoundTrip() throws {
        let home = LatLng(lat: 33.69, lng: -112)
        let pins = dayMapPins(
            stops: [MapStop(id: "a", location: LatLng(lat: 33.7, lng: -112), done: false)], depot: home,
            startLabel: .home
        ).pins
        #expect(pins.first?.home == true)
        let back = try #require(decodePins(encodePins(pins)))
        #expect(back.first?.home == true)
        #expect(back.first?.tone == .shop)
    }

    @Test func endsApart() {
        let shop = Self.shop
        let home = LatLng(lat: 33.69, lng: -112)
        let row = MemberStart(
            userId: "t1", startFrom: "shop", endAt: "home", homeAddress: "4 Elm St", homeLatitude: home.lat,
            homeLongitude: home.lng, homeGeocodedAddress: "4 Elm St")
        let r = routeStart(row, shop: shop)
        #expect(r.at == shop && r.label == .shop)
        #expect(r.end == RoutePoint(at: home, label: .home))
        // A row from before end_at ends where it starts.
        var old = row
        old.endAt = nil
        #expect(routeStart(old, shop: shop).end.label == .shop)
        let pins = dayMapPins(
            stops: [MapStop(id: "a", location: LatLng(lat: 33.5, lng: -111.9), done: false)], depot: r.at,
            startLabel: r.label, end: r.end.at, endLabel: r.end.label
        ).pins
        #expect(pins.count == 3)
        #expect(pins.last?.home == true)
    }
}
