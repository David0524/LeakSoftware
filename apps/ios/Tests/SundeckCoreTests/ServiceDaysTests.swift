import Foundation
import SundeckCore
import Testing

/// service-days.ts (Routes: a pool customer's service day).
@Suite struct ServiceDaysTests {
    let module = "service-days"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["serviceDays", "moveServiceDay", "suggestServiceDays"])
    }

    struct Input: Decodable {
        let place: [RoutePlan]
        let keep: [RoutePlan]
        let techs: [String]
        let workDays: [Int]
        let depot: LatLng?
        let day: WorkDay
    }

    @Test func serviceDayRules() {
        checkRule(module, "serviceDays") { c in serviceDays(try c.arg(0)) }
        checkRule(module, "moveServiceDay") { c in
            try moveServiceDay(c.arg(0), from: c.arg(1), to: c.arg(2), today: c.arg(3))
        }
        checkRule(module, "suggestServiceDays") { c in
            let i = try c.arg(0, as: Input.self)
            return suggestServiceDays(
                place: i.place, keep: i.keep, techs: i.techs, workDays: i.workDays, depot: i.depot, day: i.day,
                drive: try RoutingTests.drive(c, 1))
        }
    }
}
