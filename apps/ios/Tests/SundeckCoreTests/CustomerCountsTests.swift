import Foundation
import SundeckCore
import Testing

/// customer-counts: the Customers Show menu's counts and the Dashboard's customer trackers
/// (owner, 2026-10-22).
@Suite struct CustomerCountsTests {
    let module = "customer-counts"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "planIsCurrent", "customersOnPlan", "customersAddedSince", "countCustomers", "customerShowOptions",
                "formatCount", "customersAddedNote", "onPlanShareNote",
            ])
    }

    @Test func counts() {
        checkRule(module, "planIsCurrent") { c in
            planIsCurrent(try c.arg(0, as: PlanForCount.self), today: try c.arg(1))
        }
        checkRule(module, "customersOnPlan") { c in
            customersOnPlan(try c.arg(0, as: [PlanForCount].self), today: try c.arg(1))
        }
        checkRule(module, "customersAddedSince") { c in
            customersAddedSince(try isoInstant(c.arg(0)))
        }
        checkRule(module, "countCustomers") { c in
            countCustomers(
                try c.arg(0, as: [CustomerForCount].self), onPlan: try c.arg(1), addedSince: try c.arg(2))
        }
    }

    @Test func words() {
        checkRule(module, "customerShowOptions") { c in
            customerShowOptions(offersPool: try c.arg(0), counts: try c.arg(1, as: CustomerCounts?.self))
        }
        checkRule(module, "formatCount") { c in formatCount(try c.arg(0)) }
        checkRule(module, "customersAddedNote") { c in customersAddedNote(try c.arg(0)) }
        checkRule(module, "onPlanShareNote") { c in onPlanShareNote(try c.arg(0), try c.arg(1)) }
    }
}

private func isoInstant(_ text: String) throws -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: text) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: text) else { throw NotRepresentable() }
    return date
}
