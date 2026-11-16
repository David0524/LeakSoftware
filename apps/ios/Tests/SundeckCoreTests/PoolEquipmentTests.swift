import Foundation
import SundeckCore
import Testing

/// pool-equipment.ts: sanitizer, heater and solar heater on the pool (owner, 2026-11-16).
@Suite struct PoolEquipmentTests {
    let module = "pool-equipment"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["SANITIZER_LABELS", "HEATER_LABELS", "poolSummary"] as Set)
    }

    @Test func labels() {
        checkRule(module, "SANITIZER_LABELS") { _ in labelTable(\Sanitizer.label) }
        checkRule(module, "HEATER_LABELS") { _ in labelTable(\Heater.label) }
    }

    @Test func summary() {
        checkRule(module, "poolSummary") { c in poolSummary(try c.arg(0, as: PoolSummaryInput.self)) }
    }
}
