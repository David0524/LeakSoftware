import Foundation
import SundeckCore
import Testing

/// removal: Undo instead of "Are you sure?" (owner, 2026-10-26).
@Suite struct RemovalTests {
    let module = "removal"

    private struct Haptics: Encodable {
        let moments: [String: String]
        let webMs: Int
    }

    private struct Undo: Encodable {
        let label: String
        let seconds: Int
    }

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == ["HAPTIC_MOMENTS", "REMOVED_TEXT", "removedUndo", "removedKindOfMedia"])
    }

    @Test func rules() {
        checkRule(module, "HAPTIC_MOMENTS") { _ in Haptics(moments: HapticMoment.all, webMs: 10) }
        checkRule(module, "REMOVED_TEXT") { _ in RemovedKind.all }
        checkRule(module, "removedUndo") { _ in Undo(label: RemovedUndo.label, seconds: RemovedUndo.seconds) }
        checkRule(module, "removedKindOfMedia") { c in RemovedKind(media: try c.arg(0, as: MediaKind.self)).rawValue }
    }
}
