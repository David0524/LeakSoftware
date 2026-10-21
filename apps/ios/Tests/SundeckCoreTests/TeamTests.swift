import Foundation
import SundeckCore
import Testing

/// team.ts (Team colors, Team's order, moving a plan visit) and routing.ts's Maps wording.
@Suite struct TeamTests {
    let module = "team"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "TECH_COLORS", "techColor", "nextTechColor", "teamOrder", "asksPlanMove", "PLAN_MOVE_CHOICES",
                "planMovedBanner", "visitMovedBanner", "MAPS_LABELS", "dayMapsLabel",
            ])
    }

    /// A member as the fixtures give them, kept whole so the result is the same objects.
    struct Member: TeamOrdered, Encodable {
        let raw: JSONValue
        var orderName: String? { raw["name"]?.string }
        var orderStatus: String { raw["status"]?.string ?? "" }
        var orderDisabledAt: String? { raw["disabled_at"]?.string }

        func encode(to encoder: any Encoder) throws { try raw.encode(to: encoder) }
    }

    struct Order: Encodable {
        let active: [Member]
        let off: [Member]
    }

    struct Job: Decodable {
        let servicePlanId: String?
        let status: String

        enum CodingKeys: String, CodingKey {
            case status
            case servicePlanId = "service_plan_id"
        }
    }

    struct Move: Decodable {
        let from: VisitSlot
        let to: VisitSlot
    }

    @Test func colors() {
        checkRule(module, "TECH_COLORS") { _ in techColorOptions }
        checkRule(module, "techColor") { c in techColor(try c.arg(0, as: JSONValue.self)) }
        checkRule(module, "nextTechColor") { c in nextTechColor(try c.arg(0, as: [String?].self)) }
    }

    @Test func order() {
        checkRule(module, "teamOrder") { c in
            let members = try c.arg(0, as: [JSONValue].self).map(Member.init)
            let order = teamOrder(members)
            return Order(active: order.active, off: order.off)
        }
    }

    @Test func planMoves() {
        checkRule(module, "asksPlanMove") { c in
            let job = try c.arg(0, as: Job.self)
            let move = try c.arg(1, as: Move?.self)
            return asksPlanMove(
                servicePlanId: job.servicePlanId, status: job.status, move: move.map { ($0.from, $0.to) })
        }
        checkRule(module, "PLAN_MOVE_CHOICES") { c in
            [
                "title": PlanMoveChoices.title(try c.arg(0)), "changeSchedule": PlanMoveChoices.changeSchedule,
                "justThisVisit": PlanMoveChoices.justThisVisit, "cancel": PlanMoveChoices.cancel,
            ]
        }
        checkRule(module, "planMovedBanner") { c in try planMovedBanner(c.arg(0), c.arg(1), c.arg(2)) }
        checkRule(module, "visitMovedBanner") { _ in visitMovedBanner }
    }

    @Test func maps() {
        checkRule(module, "MAPS_LABELS") { _ in MapsLabels.all }
        checkRule(module, "dayMapsLabel") { c in dayMapsLabel(try c.arg(0)) }
    }
}
