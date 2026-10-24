import Foundation
import SundeckCore
import Testing

/// office.ts (schedule dates and the timeline) and schedule-moves.ts.
@Suite struct ScheduleMovesTests {
    let module = "schedule"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "constants", "isDateString", "addDays", "addMonths", "monthGrid", "scheduleDays", "formatDay", "formatTime",
            "planDay", "noteSentences", "renumberDay", "moveJobChange", "suggestionDates", "suggestTimes", "timeline",
            "partnerProblem", "keptNote", "nothingMoved",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func dragConstants() {
        checkRule(module, "constants") { _ in
            JSONValue.object([
                "SCHEDULE_DRAG": .object([
                    "gripDwellMs": .number(Double(ScheduleDrag.gripDwellMs)),
                    "holdMs": .number(Double(ScheduleDrag.holdMs)),
                    "slopPt": .number(Double(ScheduleDrag.slopPt)),
                    "scrollSettleMs": .number(Double(ScheduleDrag.scrollSettleMs)),
                ]),
                "OPTIMIZE_WORDS": .object([
                    "alreadyBest": .string(OptimizeWords.alreadyBest),
                    "noChange": .string(OptimizeWords.noChange),
                    "optimized": .string(OptimizeWords.optimized),
                    "rest": .string(OptimizeWords.rest),
                ]),
            ])
        }
    }

    @Test func scheduleDates() {
        checkRule(module, "isDateString") { c in isDateString(try c.arg(0)) }
        checkRule(module, "addDays") { c in try addDays(c.arg(0), c.arg(1)) }
        checkRule(module, "addMonths") { c in try addMonths(c.arg(0), c.arg(1)) }
        checkRule(module, "monthGrid") { c in try monthGrid(c.arg(0)) }
        checkRule(module, "scheduleDays") { c in try scheduleDays(c.arg(0), c.arg(1)) }
        checkRule(module, "formatDay") { c in try formatDay(c.arg(0), style: c.arg(1, as: DayStyle?.self) ?? .short) }
        checkRule(module, "formatTime") { c in try formatTime(c.arg(0), c.arg(1)) }
    }

    struct Move: Decodable {
        let job: PlanJob
        let tech: String?
        let date: String?
        let index: Int
        let targetDay: [PlanJob]
        let fromDay: [PlanJob]
        let seesAll: Bool
        let userId: String
        let partnerDay: [PlanJob]?
        let names: [String: String]?
    }

    struct Partner: Decodable {
        let techId: String
        let jobs: [PlanJob]
    }

    struct PlanOptions: Decodable {
        let partners: [Partner]?
        let names: [String: String]?
    }

    struct Job: Decodable {
        let id: String?
        let location: LatLng?
        let durationMin: Int
    }

    struct Route: Decodable {
        let techId: String
        let techName: String
        let date: String
        let jobs: [PlanJob]
    }

    @Test func moves() {
        checkRule(module, "noteSentences") { c in
            // null, false and undefined all arrive as nothing to say.
            noteSentences(try c.arg(0, as: [JSONValue].self).map(\.string))
        }
        checkRule(module, "planDay") { c in
            let opts = try c.arg(5, as: PlanOptions?.self)
            return try planDay(
                c.arg(0), c.arg(1), c.arg(2), c.arg(3, as: [PlanJob].self), drive: RoutingTests.drive(c, 4),
                partners: (opts?.partners ?? []).map { PartnerDay(techId: $0.techId, jobs: $0.jobs) },
                names: opts?.names ?? [:])
        }
        checkRule(module, "partnerProblem") { c in
            let p = try c.arg(1, as: Partner.self)
            return try partnerProblem(
                c.arg(0), PartnerDay(techId: p.techId, jobs: p.jobs), c.arg(2, as: [PartnerMove].self),
                drive: RoutingTests.drive(c, 3))
        }
        checkRule(module, "keptNote") { c in
            keptNote(try c.arg(0, as: [KeptStop].self), names: try c.arg(1, as: [String: String]?.self) ?? [:])
        }
        checkRule(module, "nothingMoved") { c in
            nothingMoved(try c.arg(0, as: [KeptStop].self), names: try c.arg(1, as: [String: String]?.self) ?? [:])
        }
        checkRule(module, "renumberDay") { c in
            renumberDay(try c.arg(0), try c.arg(1, as: [PlanJob].self), leaving: try c.arg(2))
        }
        checkRule(module, "moveJobChange") { c in
            let m = try c.arg(1, as: Move.self)
            let input = MoveInput(
                job: m.job, tech: m.tech, date: m.date, index: m.index, targetDay: m.targetDay, fromDay: m.fromDay,
                seesAll: m.seesAll, userId: m.userId, partnerDay: m.partnerDay, names: m.names ?? [:])
            return try moveJobChange(c.arg(0), input, drive: RoutingTests.drive(c, 2))
        }
        checkRule(module, "suggestionDates") { c in try suggestionDates(c.arg(0)) }
        checkRule(module, "suggestTimes") { c in
            let job = try c.arg(1, as: Job.self)
            let routes = try c.arg(2, as: [Route].self).map {
                SuggestRoute(techId: $0.techId, techName: $0.techName, date: $0.date, jobs: $0.jobs)
            }
            return try suggestTimes(
                c.arg(0), id: job.id, location: job.location, durationMin: job.durationMin, routes: routes,
                drive: RoutingTests.drive(c, 3), limit: c.arg(4, as: Int?.self) ?? 5)
        }
    }

    @Test func timelineFromTheAuditLog() {
        checkRule(module, "timeline") { c in
            let labels = try c.arg(1, as: [String: String].self)
            return timeline(try c.arg(0)) { table, row in labels["\(table):\(row)"] }
        }
    }
}
