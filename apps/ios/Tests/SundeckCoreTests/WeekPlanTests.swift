import Foundation
import SundeckCore
import Testing

/// week-plan.ts (Plan Week).
@Suite struct WeekPlanTests {
    let module = "week-plan"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["PLAN_WEEK_LIMIT", "planWeek", "planWeekSplit", "planWeekSummary"])
    }

    struct Input: Decodable {
        let days: [WeekDay]
        let jobs: [WeekJob]
        let depot: LatLng?
        let day: WorkDay
        let even: Bool?
    }

    /// A stop as week-plan.ts returns it (core's `RouteStop`, without the Swift-only flags).
    struct Stop: Encodable {
        let id: String
        let location: LatLng?
        let durationMin: Int
        let fixedStartMin: Int?
        let earliestMin: Int?
    }

    struct Day: Encodable {
        let techId: String
        let date: String
        let stops: [Stop]
        let route: TimedRoute
    }

    struct Plan: Encodable {
        let placed: [WeekPlacement]
        let unplaced: [String]
        let skipped: [String]
        let days: [Day]
        let driveBefore: Int
        let driveAfter: Int
        let moved: Int
        let split: [WeekSplit]
    }

    struct Summary: Decodable {
        let moved: Int
        let driveBefore: Int
        let driveAfter: Int
        let unplaced: [String]
        let skipped: [String]
    }

    @Test func planWeekRules() {
        checkRule(module, "PLAN_WEEK_LIMIT") { _ in planWeekLimit }
        checkRule(module, "planWeek") { c in
            let input = try c.arg(0, as: Input.self)
            let p = planWeek(
                days: input.days, jobs: input.jobs, depot: input.depot, day: input.day,
                drive: try RoutingTests.drive(c, 1), limit: try c.arg(2, as: Int?.self) ?? planWeekLimit,
                even: input.even ?? false)
            return Plan(
                placed: p.placed, unplaced: p.unplaced, skipped: p.skipped,
                days: p.days.map { d in
                    Day(
                        techId: d.techId, date: d.date,
                        stops: d.stops.map {
                            Stop(
                                id: $0.id, location: $0.location, durationMin: $0.durationMin,
                                fixedStartMin: $0.fixedStartMin, earliestMin: $0.earliestMin)
                        }, route: d.route)
                }, driveBefore: p.driveBefore, driveAfter: p.driveAfter, moved: p.moved, split: p.split)
        }
        checkRule(module, "planWeekSplit") { c in
            planWeekSplit(try c.arg(0, as: [WeekSplit].self)) { ["t1": "Ana", "t2": "Ben"][$0] ?? "Tech" }
        }
        checkRule(module, "planWeekSummary") { c in
            let s = try c.arg(0, as: Summary.self)
            return planWeekSummary(
                moved: s.moved, driveBefore: s.driveBefore, driveAfter: s.driveAfter, unplaced: s.unplaced.count,
                skipped: s.skipped.count)
        }
    }
}
