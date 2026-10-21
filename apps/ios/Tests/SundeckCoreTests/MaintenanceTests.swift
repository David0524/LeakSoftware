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
                "CLEANING_MONTHS", "CLEANING_DUE_SOON_DAYS", "cleaningMonthsLabel", "cleaningKind",
                "cleaningCountdown", "cleaningShortLabel", "cleaningDueSpoken", "cleaningCadence", "cleaningSummary",
                "FILTER_REPLACE_KEY", "cleaningDefaultMonths", "filterAge", "VISIT_REPORT_MODES", "visitReportMode",
            ])
    }

    @Test func visitReports() {
        checkRule(module, "VISIT_REPORT_MODES") { _ in
            visitReportModes.map { ["value": $0.rawValue, "label": $0.label, "hint": $0.hint] }
        }
        checkRule(module, "visitReportMode") { c in visitReportMode(try c.arg(0, as: JSONValue?.self)).rawValue }
    }

    struct SummaryCleaning: Decodable {
        let everyMonths: Int
        let priceCents: Int?

        enum CodingKeys: String, CodingKey {
            case everyMonths = "every_months"
            case priceCents = "price_cents"
        }
    }

    struct Due: Decodable {
        let days: Int
        let weeks: Int
    }

    struct CleaningType: Decodable {
        let key: String?
        let name: String?
    }

    @Test func cleanings() throws {
        checkRule(module, "CLEANING_MONTHS") { _ in cleaningMonths }
        checkRule(module, "CLEANING_DUE_SOON_DAYS") { _ in cleaningDueSoonDays }
        checkRule(module, "cleaningMonthsLabel") { c in cleaningMonthsLabel(try c.arg(0)) }
        checkRule(module, "cleaningKind") { c in
            let t = try c.arg(0, as: CleaningType.self)
            return cleaningKind(key: t.key, name: t.name)
        }
        checkRule(module, "cleaningCountdown") { c in
            guard let countdown = cleaningCountdown(try c.arg(0), try c.arg(1)) else { throw NotRepresentable() }
            return countdown
        }
        checkRule(module, "cleaningCadence") { c in cleaningCadence(try c.arg(0)) }
        checkRule(module, "cleaningSummary") { c in
            let cleaning = try c.arg(1, as: SummaryCleaning.self)
            return cleaningSummary(try c.arg(0), everyMonths: cleaning.everyMonths, priceCents: cleaning.priceCents)
        }
        checkRule(module, "FILTER_REPLACE_KEY") { _ in filterReplaceKey }
        checkRule(module, "cleaningDefaultMonths") { c in
            cleaningDefaultMonths(try c.arg(0, as: JSONValue?.self), try c.arg(1, as: String?.self))
        }
        checkRule(module, "filterAge") { c in filterAge(try c.arg(0, as: String?.self), try c.arg(1)) }
        checkRule(module, "cleaningShortLabel") { c in
            let due = try c.arg(0, as: Due.self)
            return cleaningShortLabel(days: due.days, weeks: due.weeks)
        }
        checkRule(module, "cleaningDueSpoken") { c in
            let due = try c.arg(1, as: Due.self)
            return cleaningDueSpoken(try c.arg(0), days: due.days, weeks: due.weeks)
        }
        // The countdown overloads read the same.
        let soon = try #require(cleaningCountdown("2026-10-22", "2026-10-19"))
        #expect(
            cleaningShortLabel(soon) == "3 days"
                && cleaningDueSpoken("Clean filter", soon) == "Clean filter due in 3 days")
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
        #expect(PlanRepeat.allCases.map(\.label) == ["2+ a Week", "Weekly", "Biweekly", "Monthly"])
        #expect(firstVisitHint(.weekly, long: false) == "Repeats on this weekday.")
        #expect(firstVisitHint(.monthly, long: true).hasSuffix("like the 2nd Tuesday."))
    }
}
