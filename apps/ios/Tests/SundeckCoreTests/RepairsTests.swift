import Foundation
import SundeckCore
import Testing

/// repairs: a repair job's repairs (owner, 2026-10-22: "add additional repair").
@Suite struct RepairsTests {
    let module = "repairs"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "REPAIR_LABELS", "jobRepairLines", "checkRepairDraft", "checkRepairDrafts", "pickRepair",
                "repairBookingName", "repairsFee", "addRepairWrites", "removeRepairWrites",
            ])
    }

    @Test func labels() {
        checkRule(module, "REPAIR_LABELS") { _ in
            RepairLabels.all.merging(["custom_value": repairCustom]) { a, _ in a }
        }
    }

    @Test func lines() {
        checkRule(module, "jobRepairLines") { c in
            jobRepairLines(try c.arg(0), try c.arg(1))
        }
    }

    @Test func drafts() {
        checkRule(module, "checkRepairDraft") { c in
            checkRepairDraft(try c.arg(0), try c.arg(1), required: try c.arg(2))
        }
        checkRule(module, "checkRepairDrafts") { c in
            checkRepairDrafts(try c.arg(0), try c.arg(1))
        }
        checkRule(module, "pickRepair") { c in
            pickRepair(try c.arg(0), try c.arg(1), try c.arg(2))
        }
    }

    @Test func booking() {
        checkRule(module, "repairBookingName") { c in repairBookingName(try c.arg(0)) }
        checkRule(module, "repairsFee") { c in repairsFee(try c.arg(0)) }
    }

    @Test func writes() {
        checkRule(module, "addRepairWrites") { c in
            addRepairWrites(try c.arg(0), try c.arg(1), try c.arg(2))
        }
        checkRule(module, "removeRepairWrites") { c in
            removeRepairWrites(try c.arg(0), try c.arg(1), id: try c.arg(2), now: try c.arg(3))
        }
    }
}
