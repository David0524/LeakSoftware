import Foundation
import SundeckCore
import Testing

/// maintenance.ts: plan settings, how often, the plan in one line, and its next visit dates.
@Suite struct MaintenanceTests {
    let module = "maintenance"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "maintenanceSettings", "planRepeat", "cadenceLabel", "planSummary", "upcomingVisitDates",
            ])
    }

    @Test func settings() {
        checkRule(module, "maintenanceSettings") { c in maintenanceSettings(c.args.first) }
    }

    @Test func plans() {
        checkRule(module, "planRepeat") { c in planRepeat(try c.arg(0)) }
        checkRule(module, "cadenceLabel") { c in cadenceLabel(try c.arg(0)) }
        checkRule(module, "planSummary") { c in planSummary(try c.arg(0)) }
        checkRule(module, "upcomingVisitDates") { c in
            try upcomingVisitDates(c.arg(0), from: c.arg(1), count: c.arg(2, as: Int?.self) ?? 4)
        }
    }

    /// parsePlanRepeat in apps/web/src/lib/plan-repeat.ts (not in packages/core, so no fixtures).
    @Test func shapeFromTheRepeatChoice() {
        #expect(
            planShape(.days, weekdays: [4, 1, 1, 9, -1])
                == .success(PlanShape(intervalWeeks: 1, weekdays: [1, 4], monthly: false)))
        #expect(
            planShape(.days, weekdays: [3, 3])
                == .failure(PlanShapeProblem(field: "weekdays", message: "Pick two or more days.")))
        #expect(planShape(.weekly, weekdays: [1, 2]) == .success(PlanShape(intervalWeeks: 1, monthly: false)))
        #expect(planShape(.biweekly, weekdays: []) == .success(PlanShape(intervalWeeks: 2, monthly: false)))
        #expect(planShape(.monthly, weekdays: []) == .success(PlanShape(intervalWeeks: 1, monthly: true)))
        #expect(planShape(nil, weekdays: []) == .failure(PlanShapeProblem(field: "repeat", message: "Pick how often.")))
        #expect(
            PlanShape(intervalWeeks: 1, weekdays: [1, 4], monthly: false).row == [
                "interval_weeks": 1, "weekdays": [1, 4], "monthly": false,
            ])
        #expect(PlanRepeat.allCases.map(\.label) == ["Several Days", "Weekly", "Every 2 Weeks", "Monthly"])
        #expect(firstVisitHint(.weekly, long: false) == "Repeats on this weekday.")
        #expect(firstVisitHint(.monthly, long: true).hasSuffix("like the 2nd Tuesday."))
    }
}
