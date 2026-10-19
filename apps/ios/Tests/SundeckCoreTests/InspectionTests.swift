import Foundation
import SundeckCore
import Testing

/// inspection (checklist, tests, findings, diagram), forms, job-list, route-plan and routing.
@Suite struct InspectionTests {
    let module = "inspection"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "CHECKLIST_SECTION_LABELS", "DIAGRAM_SHAPES", "componentApplies", "planComponents", "nextInstance",
            "checklistTally", "calculate", "validateTestData", "normalizeTestData", "validateFinding", "poolDiagram",
            "validateNewJob", "formatAddress", "newJobRecords", "localDate", "groupJobs", "formatSchedule",
            "propertyLocation", "nativeMapsUrl",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func checklist() {
        checkRule(module, "CHECKLIST_SECTION_LABELS") { _ in labelTable(\ChecklistSection.label) }
        checkRule(module, "componentApplies") { c in
            componentApplies(try c.arg(0), try c.arg(1))
        }
        checkRule(module, "planComponents") { c in
            try planComponents(c.arg(0), c.arg(1), c.arg(2, as: JobType?.self) ?? .detection)
        }
        checkRule(module, "nextInstance") { c in nextInstance(try c.arg(0), try c.arg(1)) }
        checkRule(module, "checklistTally") { c in checklistTally(try c.arg(0), try c.arg(1)) }
    }

    @Test func tests() {
        checkRule(module, "calculate") { c in calculate(try c.arg(0), try c.arg(1)) }
        checkRule(module, "validateTestData") { c in validateTestData(try c.arg(0), try c.arg(1)) }
        checkRule(module, "normalizeTestData") { c in normalizeTestData(try c.arg(0), try c.arg(1)) }
    }

    struct FindingDraft: Decodable {
        let title: String
        let severityKey: String

        enum CodingKeys: String, CodingKey {
            case title
            case severityKey = "severity_key"
        }
    }

    @Test func findingsAndDiagram() {
        checkRule(module, "validateFinding") { c in
            let f = try c.arg(0, as: FindingDraft.self)
            return validateFinding(title: f.title, severityKey: f.severityKey)
        }
        checkRule(module, "DIAGRAM_SHAPES") { _ in
            DiagramShape.allCases.map { ["key": $0.rawValue, "label": $0.label] }
        }
        // A shape this app doesn't know reads as no shape: both draw the rectangle.
        checkRule(module, "poolDiagram") { c in
            poolDiagram(try c.arg(0, as: String?.self).flatMap(DiagramShape.init(rawValue:)), try c.arg(1))
        }
    }

    /// New job details as the cases write them: "now" timing carries an ISO instant.
    struct Details: Decodable {
        struct Timing: Decodable {
            let kind: String
            let at: String?
            let date: String?
            let time: String?
            let timeZone: String?
        }
        let poolType: PoolType?
        let hasSpa: Bool
        let accessNotes: String
        let timing: Timing
        let assignedUserId: String?
        let jobType: JobType?

        func details() throws -> NewJobDetails {
            let timing: JobTiming =
                switch timing.kind {
                case "now": .now(at: try instant(timing.at ?? ""))
                case "scheduled":
                    .scheduled(date: timing.date ?? "", time: timing.time ?? "", timeZone: timing.timeZone ?? "")
                default: .later
                }
            return NewJobDetails(
                poolType: poolType, hasSpa: hasSpa, accessNotes: accessNotes, timing: timing,
                assignedUserId: assignedUserId, jobType: jobType)
        }
    }

    // newJobRecords reads no clock and makes no ids ("now" timing carries its instant), so
    // every field of its result is compared.
    @Test func forms() {
        checkRule(module, "validateNewJob") { c in validateNewJob(try c.arg(0)) }
        checkRule(module, "formatAddress") { c in formatAddress(try c.arg(0)) }
        checkRule(module, "newJobRecords") { c in
            try newJobRecords(c.arg(0), c.arg(1, as: Details.self).details())
        }
    }

    struct Ids: Encodable {
        let today: [String]
        let upcoming: [String]
        let unscheduled: [String]
        let recent: [String]
    }

    @Test func jobList() {
        checkRule(module, "localDate") { c in try localDate(instant(c.arg(0)), c.arg(1)) }
        checkRule(module, "groupJobs") { c in
            let g = try groupJobs(c.arg(0), instant(c.arg(1)), c.arg(2))
            return Ids(
                today: g.today.map(\.id), upcoming: g.upcoming.map(\.id), unscheduled: g.unscheduled.map(\.id),
                recent: g.recent.map(\.id))
        }
        checkRule(module, "formatSchedule") { c in
            try formatSchedule(c.arg(0, as: String?.self), instant(c.arg(1)), c.arg(2))
        }
    }

    @Test func routing() {
        checkRule(module, "propertyLocation") { c in propertyLocation(try c.arg(0, as: Property?.self)) }
        checkRule(module, "nativeMapsUrl") { c in nativeMapsUrl(try c.arg(0), try c.arg(1)) }
    }
}

/// An ISO 8601 instant from a case (`new Date(text)` in TypeScript); throws like TypeScript's
/// date rules when it isn't one.
private func instant(_ text: String) throws -> Date {
    for options: ISO8601DateFormatter.Options in [
        [.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime],
    ] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = options
        if let date = formatter.date(from: text) { return date }
    }
    throw NotRepresentable()
}
