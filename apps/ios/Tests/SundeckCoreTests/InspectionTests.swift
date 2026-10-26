import Foundation
import SundeckCore
import Testing

/// inspection (checklist, tests, findings, diagram), checklist-summary, forms, job-list, and the
/// places half of route-plan and routing.
@Suite struct InspectionTests {
    let module = "inspection"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "CHECKLIST_SECTION_LABELS", "DIAGRAM_SHAPES", "componentApplies", "planComponents", "nextInstance",
            "checklistTally", "calculate", "previewTest", "validateTestData", "normalizeTestData", "validateFinding",
            "poolDiagram",
            "validateNewJob", "formatAddress", "newJobRecords", "localDate", "groupJobs", "formatSchedule",
            "propertyLocation", "nativeMapsUrl", "instanceLabel", "FINDING_STATUS_LABELS", "verdictLabel",
            "verdictOptions", "currentVerdict", "verdictValues", "checklistSectionSummary", "markRemainingLabel",
            "needAttentionText", "inspectionTallyText",
            "checklistTallyText",
            "SPA_SIZES", "SPA_SHAPES", "mirrorPath", "offsetPath", "centerLayout", "POOL_CENTER_OFFSET",
            "parseDiagramLayout", "removeItemConfirm", "LANDMARKS",
            "DRAWING_MAX",
            "LANDMARKS_MAX", "LANDMARK_SIZE", "LANDMARK_MIN", "LANDMARK_MAX", "LINE_SNAP_DEGREES", "clampLandmarkSize",
            "SPA_R_MIN", "SPA_R_MAX", "CLEARED_DIAGRAM", "isDiagramShape",
            "spaSizeFor",
            "clampSpaR", "drawnPath", "drawnShapeFrom",
            // Pool inspection (PoolInspection.swift).
            "INSPECTION_SECTIONS", "NOT_PRESENT_LABEL", "isInspectionAnswer", "choiceOptions", "inspectionValue",
            "inspectionAnswerText", "inspectionAnswerValues", "toggleChoice", "inspectionTone", "foldedItems",
            "isGate", "inspectionProgress", "inspectionProgressText", "intakeQuestionsFor", "optionsToText",
            "optionsFromText",
            // Sorting the Jobs list.
            "JOB_SORTS", "jobSort", "sortJobs",
            // Filtering by job type.
            "JOB_TYPE_FILTER_WORDS", "jobTypeFilters", "jobTypeFilter", "jobTypeFilterLabel", "jobsEmpty",
            "matchesJobType",
            // Landmarks that turn on tap.
            "tapLandmark", "landmarkTurn",
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
        checkRule(module, "removeItemConfirm") { c in removeItemConfirm(try c.arg(0), fromPlan: try c.arg(1)) }
        checkRule(module, "checklistTally") { c in checklistTally(try c.arg(0), try c.arg(1)) }
    }

    @Test func tests() {
        checkRule(module, "calculate") { c in calculate(try c.arg(0), try c.arg(1)) }
        checkRule(module, "previewTest") { c in previewTest(try c.arg(0), try c.arg(1)) }
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
            DiagramShape.tiles.map { ["key": $0.rawValue, "label": $0.label] }
        }
        checkRule(module, "LANDMARKS") { _ in
            try landmarkDrawings.map {
                var o: [String: JSONValue] = [
                    "key": .string($0.key.rawValue), "label": .string($0.label),
                    "parts": try JSONValue(encoding: $0.parts),
                ]
                if let axis = $0.key.mirrorAxis { o["mirror"] = .string(axis) }
                return JSONValue.object(o)
            }
        }
        checkRule(module, "DRAWING_MAX") { _ in drawingMax }
        checkRule(module, "LANDMARKS_MAX") { _ in landmarksMax }
        checkRule(module, "LANDMARK_SIZE") { _ in landmarkSize }
        checkRule(module, "LANDMARK_MIN") { _ in landmarkMin }
        checkRule(module, "LANDMARK_MAX") { _ in landmarkMax }
        checkRule(module, "LINE_SNAP_DEGREES") { _ in lineSnapDegrees }
        checkRule(module, "clampLandmarkSize") { c in clampLandmarkSize(try c.arg(0)) }
        checkRule(module, "SPA_R_MIN") { _ in spaRMin }
        checkRule(module, "SPA_R_MAX") { _ in spaRMax }
        checkRule(module, "CLEARED_DIAGRAM") { _ in
            JSONValue.object([
                "shape": .string(clearedDiagram.shape.rawValue), "hasSpa": .bool(clearedDiagram.hasSpa),
                "layout": try JSONValue(encoding: clearedDiagram.layout),
            ])
        }
        checkRule(module, "isDiagramShape") { c in isDiagramShape(c.args.first) }
        checkRule(module, "spaSizeFor") { c in spaSizeFor(try c.arg(0)) }
        checkRule(module, "clampSpaR") { c in clampSpaR(try c.arg(0)) }
        checkRule(module, "drawnPath") { c in drawnPath(try c.arg(0)) }
        checkRule(module, "drawnShapeFrom") { c in
            let points = try c.arg(1, as: [[String: Double]].self).map { (x: $0["x"] ?? 0, y: $0["y"] ?? 0) }
            return drawnShapeFrom(try c.arg(0), points)
        }
        checkRule(module, "SPA_SIZES") { _ in
            SpaSize.allCases.map {
                JSONValue.object(["key": .string($0.rawValue), "label": .string($0.label), "r": .number($0.r)])
            }
        }
        checkRule(module, "SPA_SHAPES") { _ in
            SpaShape.allCases.map { ["key": $0.rawValue, "label": $0.label] }
        }
        // A shape this app doesn't know reads as no shape: both draw the rectangle.
        checkRule(module, "poolDiagram") { c in
            poolDiagram(
                try c.arg(0, as: String?.self).flatMap(DiagramShape.init(rawValue:)), try c.arg(1),
                try c.arg(2, as: DiagramLayout?.self))
        }
        checkRule(module, "tapLandmark") { c in tapLandmark(try c.arg(0, as: Landmark.self)) }
        checkRule(module, "landmarkTurn") { c in
            let l = try c.arg(0, as: JSONValue.self)
            var turn: Int?
            if case .number(let n) = l["turn"] { turn = Int(exactly: n) }
            return landmarkTurn(
                kind: try #require(l["kind"]?.string.flatMap(LandmarkKind.init(rawValue:))),
                flip: l["flip"] == .bool(true), turn: turn)
        }
        checkRule(module, "mirrorPath") { c in mirrorPath(try c.arg(0)) }
        checkRule(module, "POOL_CENTER_OFFSET") { _ in poolCenterOffset }
        checkRule(module, "offsetPath") { c in offsetPath(try c.arg(0), try c.arg(1)) }
        checkRule(module, "centerLayout") { c in centerLayout(try c.arg(0, as: DiagramLayout.self)) }
        checkRule(module, "parseDiagramLayout") { c in parseDiagramLayout(try c.arg(0, as: JSONValue?.self)) }
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
        checkRule(module, "JOB_SORTS") { _ in JobSort.allCases.map { ["key": $0.rawValue, "label": $0.label] } }
        checkRule(module, "jobSort") { c in jobSort(try c.arg(0, as: String?.self)).rawValue }
        checkRule(module, "JOB_TYPE_FILTER_WORDS") { _ in
            ["JOB_TYPE_FILTER_TITLE": JobTypeFilterText.title, "ALL_JOB_TYPES": JobTypeFilterText.all]
        }
        checkRule(module, "jobTypeFilters") { c in
            jobTypeFilters(try c.arg(0, as: Services.self)).map { ["key": $0.key, "label": $0.label] }
        }
        checkRule(module, "jobTypeFilter") { c in
            jobTypeFilter(try c.arg(0, as: String?.self), try c.arg(1, as: Services.self)).key
        }
        checkRule(module, "jobTypeFilterLabel") { c in
            jobTypeFilter(try c.arg(0, as: String.self), .both).label
        }
        checkRule(module, "jobsEmpty") { c in jobsEmpty(jobTypeFilter(try c.arg(0, as: String.self), .both)) }
        checkRule(module, "matchesJobType") { c in
            matchesJobType(try c.arg(0, as: String?.self), jobTypeFilter(try c.arg(1, as: String.self), .both))
        }
        checkRule(module, "sortJobs") { c in
            func field(_ j: JSONValue, _ k: String) -> JSONValue? {
                if case .object(let o) = j { return o[k] }
                return nil
            }
            func text(_ v: JSONValue?) -> String? {
                if case .string(let s)? = v { return s }
                return nil
            }
            return sortJobs(try c.arg(0, as: [JSONValue].self), sort: jobSort(try c.arg(1, as: String?.self))) { j in
                var number: Int?
                if case .number(let n)? = field(j, "number") { number = Int(n) }
                return JobSortItem(
                    number: number, scheduledStart: text(field(j, "scheduled_start")),
                    createdAt: text(field(j, "created_at")), customer: text(field(j, "customer")))
            }
        }
        checkRule(module, "formatSchedule") { c in
            try formatSchedule(c.arg(0, as: String?.self), instant(c.arg(1)), c.arg(2))
        }
    }

    @Test func routing() {
        checkRule(module, "propertyLocation") { c in propertyLocation(try c.arg(0, as: Property?.self)) }
        checkRule(module, "nativeMapsUrl") { c in nativeMapsUrl(try c.arg(0), try c.arg(1)) }
    }

    struct ResultArg: Decodable {
        var status: ChecklistStatus?
        var outcome: ChecklistOutcome?
        var value: JSONValue?
    }

    @Test func verdicts() {
        checkRule(module, "instanceLabel") { c in instanceLabel(try c.arg(0), try c.arg(1)) }
        checkRule(module, "FINDING_STATUS_LABELS") { _ in labelTable(\FindingStatus.label) }
        checkRule(module, "verdictLabel") { c in
            let r = try c.arg(0, as: ResultArg?.self)
            let answer = try c.arg(1, as: ComponentAnswer?.self) ?? .leak
            return verdictLabel(status: r?.status, outcome: r?.outcome, answer: answer, value: r?.value)
        }
        checkRule(module, "verdictOptions") { c in verdictOptions(try c.arg(0, as: ComponentAnswer?.self)) }
        checkRule(module, "currentVerdict") { c in
            let r = try c.arg(0, as: ResultArg?.self)
            return currentVerdict(status: r?.status, outcome: r?.outcome)
        }
        checkRule(module, "verdictValues") { c in
            let date = try instant(try c.arg(2, as: String.self))
            return verdictValues(try c.arg(0, as: Verdict?.self), userId: try c.arg(1, as: String?.self), now: date)
        }
    }

    @Test func checklistSummary() {
        checkRule(module, "checklistSectionSummary") { c in
            checklistSectionSummary(
                try c.arg(0, as: [ChecklistAnswer?].self), service: try c.arg(1, as: Bool?.self) ?? false)
        }
        checkRule(module, "markRemainingLabel") { c in markRemainingLabel(try c.arg(0, as: [ComponentAnswer?].self)) }
    }

    /// The question's answer kind as a case writes it ("leak" and unknown kinds aren't inspection ones).
    private func answerKind(_ c: FixtureCase, _ index: Int) throws -> ComponentAnswer? {
        try c.arg(index, as: String?.self).flatMap(ComponentAnswer.init(rawValue:))
    }

    struct AnswerType: Decodable {
        var answer: String?
        var options: JSONValue?
    }

    struct ProgressArg: Decodable {
        var answered: Int
        var total: Int
        var attention: Int
        var leaking: Int
    }

    @Test func poolInspection() {
        checkRule(module, "INSPECTION_SECTIONS") { _ in inspectionSections.map(\.rawValue) }
        checkRule(module, "NOT_PRESENT_LABEL") { _ in notPresentLabel }
        checkRule(module, "isInspectionAnswer") { c in isInspectionAnswer(try c.arg(0, as: String?.self)) }
        checkRule(module, "choiceOptions") { c in choiceOptions(c.args.first) }
        checkRule(module, "inspectionValue") { c in inspectionValue(try answerKind(c, 0), c.args[1]) }
        checkRule(module, "inspectionAnswerText") { c in inspectionAnswerText(try answerKind(c, 0), c.args[1]) }
        checkRule(module, "inspectionAnswerValues") { c in
            let type = try c.arg(0, as: AnswerType.self)
            return inspectionAnswerValues(
                answer: type.answer.flatMap(ComponentAnswer.init(rawValue:)), options: type.options,
                value: try c.arg(1, as: InspectionValue?.self), userId: try c.arg(2, as: String?.self),
                now: try instant(try c.arg(3, as: String.self)))
        }
        checkRule(module, "toggleChoice") { c in toggleChoice(try c.arg(0), try c.arg(1), try c.arg(2)) }
        checkRule(module, "inspectionTone") { c in
            let r = try c.arg(0, as: ResultArg?.self)
            return inspectionTone(status: r?.status, outcome: r?.outcome)
        }
        checkRule(module, "foldedItems") { c in foldedItems(try c.arg(0)).sorted() }
        checkRule(module, "isGate") { c in isGate(c.args[0]["options"]) }
        checkRule(module, "inspectionProgress") { c in
            inspectionProgress(try c.arg(0), folded: try c.arg(1, as: [String]?.self).map(Set.init))
        }
        checkRule(module, "inspectionProgressText") { c in
            let p = try c.arg(0, as: ProgressArg.self)
            return inspectionProgressText(
                InspectionProgress(
                    answered: p.answered, total: p.total, toDo: p.total - p.answered, attention: p.attention,
                    leaking: p.leaking))
        }
        checkRule(module, "needAttentionText") { c in needAttentionText(try c.arg(0)) }
        checkRule(module, "inspectionTallyText") { c in
            let p = try c.arg(0, as: ProgressArg.self)
            return inspectionTallyText(
                InspectionProgress(
                    answered: p.answered, total: p.total, toDo: p.total - p.answered, attention: p.attention,
                    leaking: p.leaking))
        }
        checkRule(module, "checklistTallyText") { c in
            checklistTallyText(
                try c.arg(0, as: ChecklistTally.self), maintenance: try c.arg(1),
                pending: try c.arg(2, as: Bool?.self) ?? true)
        }
        checkRule(module, "optionsToText") { c in optionsToText(c.args.first) }
        checkRule(module, "optionsFromText") { c in optionsFromText(try c.arg(0)) }
        checkRule(module, "intakeQuestionsFor") { c in
            intakeQuestionsFor(try c.arg(0, as: [JSONValue].self), try c.arg(1))
        }
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
