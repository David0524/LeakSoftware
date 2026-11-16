import Foundation
import SundeckCore
import Testing

/// skip-visit.ts: Skip a Visit for maintenance visits (owner, 2026-11-16).
@Suite struct SkipVisitTests {
    let module = "skip-visit"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "SKIP_TEXTS", "pickableSkipReasons", "canSkipVisit", "skipValues", "skipNeedsOffice", "skipBadge",
                "skipActions", "skipCustomerText", "skipNotification", "autoSkipNotification",
                "skipsUnfinishedVisits", "skipSummary", "statusAfterMove",
            ] as Set)
    }

    @Test func words() {
        checkRule(module, "SKIP_TEXTS") { _ -> [String: JSONValue] in
            [
                "SKIP_VISIT_LABEL": .string(skipVisitLabel), "SKIP_UNDO_LABEL": .string(skipUndoLabel),
                "SKIP_DISMISS_LABEL": .string(skipDismissLabel),
                "SKIP_RESCHEDULE_LABEL": .string(skipRescheduleLabel), "SKIP_TEXT_LABEL": .string(skipTextLabel),
                "SKIP_NOTE_MAX": .number(Double(skipNoteMax)), "NOT_DONE_REASON": .string(notDoneReason),
                "SKIP_BANNER": .string(skipBanner), "SKIP_REASON_REQUIRED": .string(skipReasonRequired),
                "SKIP_UNFINISHED_LABEL": .string(skipUnfinishedLabel),
                "SKIP_UNFINISHED_HINT": .string(skipUnfinishedHint),
            ]
        }
        checkRule(module, "skipCustomerText") { c in
            skipCustomerText(
                customer: try c.arg(0, as: String?.self), tech: try c.arg(1), shop: try c.arg(2), reason: try c.arg(3))
        }
        checkRule(module, "skipNotification") { c in
            skipNotification(customer: try c.arg(0), reason: try c.arg(1), by: try c.arg(2, as: String?.self))
        }
        checkRule(module, "autoSkipNotification") { c in autoSkipNotification(try c.arg(0)) }
        checkRule(module, "skipSummary") { c in
            skipSummary(
                try c.arg(0), by: try c.arg(1, as: String?.self), when: try c.arg(2, as: String?.self))
        }
    }

    @Test func rules() {
        checkRule(module, "pickableSkipReasons") { c in pickableSkipReasons(try c.arg(0)) }
        checkRule(module, "canSkipVisit") { c in canSkipVisit(try c.arg(0)) }
        checkRule(module, "skipValues") { c in
            skipValues(reason: try c.arg(0), note: try c.arg(1, as: String?.self), at: try c.arg(2))
        }
        checkRule(module, "skipNeedsOffice") { c in skipNeedsOffice(try c.arg(0)) }
        checkRule(module, "skipBadge") { c in skipBadge(try c.arg(0)) }
        checkRule(module, "skipActions") { c in skipActions(try c.arg(0), isManager: try c.arg(1)) }
        checkRule(module, "skipsUnfinishedVisits") { c in skipsUnfinishedVisits(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "statusAfterMove") { c in
            let status = try c.arg(0, as: String.self)
            guard let known = JobStatus(rawValue: status) else { return status }
            return statusAfterMove(known).rawValue
        }
    }
}
