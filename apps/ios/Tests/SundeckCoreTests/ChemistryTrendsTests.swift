import Foundation
import SundeckCore
import Testing

/// chemistry-trends: the pool's chart series, the out-of-range readings and their alert, and the
/// dose limits (docs/design/2026-11-16-chemistry-trends.md).
@Suite struct ChemistryTrendsTests {
    let module = "chemistry-trends"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "TREND_PERIODS", "OUT_OF_RANGE_MARGIN", "DOSE_LIMITS", "trendWindow", "readingSeries",
                "chemicalCostBars", "costSummary", "outOfRangeReadings", "outOfRangeRows", "outOfRangeLine",
                "outOfRangeNotification", "doseWarning",
            ])
    }

    /// The reading the line and notification cases flag (the same in fixtures/cases/chemistry-trends.ts).
    private func flagged() -> [OutOfRangeReading] {
        outOfRangeReadings(
            ChemicalReading(
                id: "r", propertyId: "p", recordedAt: "2026-11-10T14:00:00Z", fc: 0.5, ph: 8.2, ta: 85, ch: 500,
                cya: 40, salt: 2000))
    }

    @Test func constants() {
        checkRule(module, "TREND_PERIODS") { _ in trendPeriods }
        checkRule(module, "OUT_OF_RANGE_MARGIN") { _ in
            Dictionary(uniqueKeysWithValues: ReadingKey.allCases.map { ($0.rawValue, $0.outOfRangeMargin) })
        }
        checkRule(module, "DOSE_LIMITS") { _ in doseLimits }
    }

    @Test func trends() {
        checkRule(module, "trendWindow") { c in trendWindow(try c.arg(0), now: try c.arg(1)) }
        checkRule(module, "readingSeries") { c in
            readingSeries(try c.arg(0), period: try c.arg(1), now: try c.arg(2))
        }
        checkRule(module, "chemicalCostBars") { c in
            chemicalCostBars(try c.arg(0), period: try c.arg(1), now: try c.arg(2), timeZone: try c.arg(3))
        }
    }

    @Test func costSummaryCases() {
        checkRule(module, "costSummary") { c in
            let bars = chemicalCostBars(
                try c.arg(0, as: [ChemicalAddition].self), period: try c.arg(1), now: "2026-11-16T15:00:00Z",
                timeZone: try c.arg(2))
            return costSummary(bars)
        }
    }

    @Test func outOfRange() {
        checkRule(module, "outOfRangeReadings") { c in outOfRangeReadings(try c.arg(0)) }
        checkRule(module, "outOfRangeRows") { c in
            outOfRangeRows(try c.arg(0), now: try c.arg(1), days: try c.arg(2, as: Int?.self) ?? 30)
        }
        checkRule(module, "outOfRangeLine") { c in outOfRangeLine(flagged()[try c.arg(0, as: Int.self)]) }
        checkRule(module, "outOfRangeNotification") { c in
            outOfRangeNotification(try c.arg(0), Array(flagged().prefix(try c.arg(1, as: Int.self))))
        }
    }

    @Test func doseWarnings() {
        checkRule(module, "doseWarning") { c in
            doseWarning(
                chemical: try c.arg(0, as: String?.self), unit: try c.arg(1), quantity: try c.arg(2),
                gallons: try c.arg(3, as: Double?.self))
        }
    }
}
