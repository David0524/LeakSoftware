import Foundation

// MARK: - Row shapes

/// Where an item is listed on the checklist and the report. Port of inspection.ts.
public enum ChecklistSection: String, Codable, CaseIterable, Sendable {
    case visual
    case plumbing
    case bondBeam = "bond_beam"
    case other
    case service

    public var label: String {
        switch self {
        case .visual: "Visual Leak Inspection"
        case .plumbing: "Plumbing Static Test"
        case .bondBeam: "Bond Beam"
        case .other: "Other"
        case .service: "Service"
        }
    }

    /// A section this app doesn't know (added on the server later) lists under Other.
    public init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
    }
}

/// How an item is answered: a leak verdict, yes or no, or a maintenance task.
public enum ComponentAnswer: String, Codable, Sendable {
    case leak
    case yesNo = "yes_no"
    case done

    /// An answer kind this app doesn't know reads as a leak verdict, the default.
    public init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .leak
    }
}

/// Whether an item is for the pool, the spa, or both.
public enum ComponentAppliesTo: String, Codable, Sendable {
    case pool, spa, both

    /// A value this app doesn't know counts as the pool, the default.
    public init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .pool
    }
}

/// A checklist item type (config row from the database).
public struct ComponentType: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var key: String
    public var name: String
    public var section: ChecklistSection?
    /// leak: a verdict (not leaking, leaking, attention, not applicable); yes_no: yes or no;
    /// done: a maintenance task (done, needs attention, skipped).
    public var answer: ComponentAnswer?
    /// Which jobs get the item: leak detection (default) or maintenance visits.
    public var jobType: JobType?
    /// Only for this pool type (vinyl checks); nil for every pool.
    public var appliesToPoolType: String?
    /// Done every few months (filter, salt cell): kept off new visits; a maintenance plan's
    /// cleaning puts it on the visit it's due.
    public var onSchedule: Bool?
    public var allowsMultiple: Bool
    public var defaultCount: Int
    public var appliesTo: ComponentAppliesTo
    public var methods: [String]
    public var sortOrder: Int
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id, key, name, section, answer, methods, active
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case jobType = "job_type"
        case appliesToPoolType = "applies_to_pool_type"
        case onSchedule = "on_schedule"
        case allowsMultiple = "allows_multiple"
        case defaultCount = "default_count"
        case appliesTo = "applies_to"
        case sortOrder = "sort_order"
    }
}

/// One item on a job's checklist.
public struct JobComponent: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var jobId: String
    public var componentTypeId: String
    public var instanceNumber: Int
    public var label: String
    public var locationNote: String?
    public var sortOrder: Int
    /// Put on this visit by a plan's scheduled cleaning (server-set).
    public var planCleaningId: String?

    enum CodingKeys: String, CodingKey {
        case id, label
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case jobId = "job_id"
        case componentTypeId = "component_type_id"
        case instanceNumber = "instance_number"
        case locationNote = "location_note"
        case sortOrder = "sort_order"
        case planCleaningId = "plan_cleaning_id"
    }
}

public enum ChecklistStatus: String, Codable, Sendable {
    case pending, inspected, excluded
}

/// The verdict on an inspected item. Not applicable is status `excluded`.
public enum ChecklistOutcome: String, Codable, Sendable {
    case ok, leaking, attention
}

/// The tech's answer for one checklist item.
public struct ChecklistItemResult: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var jobId: String
    public var jobComponentId: String
    public var status: ChecklistStatus
    public var outcome: ChecklistOutcome?
    /// Where, for a leaking or attention item.
    public var locationText: String?
    public var method: String?
    public var exclusionReason: String?
    public var notes: String?
    public var inspectedAt: String?
    public var inspectedBy: String?

    enum CodingKeys: String, CodingKey {
        case id, status, outcome, method, notes
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case jobId = "job_id"
        case jobComponentId = "job_component_id"
        case locationText = "location_text"
        case exclusionReason = "exclusion_reason"
        case inspectedAt = "inspected_at"
        case inspectedBy = "inspected_by"
    }
}

public enum FieldType: String, Codable, Sendable {
    case text, number, select, textarea
}

/// One field on a test's form.
public struct TestField: Codable, Equatable, Sendable {
    public var key: String
    public var label: String
    public var type: FieldType
    public var unit: String?
    public var required: Bool?
    public var options: [String]?
}

/// A test type's form, plus its calculator settings.
public struct TestFieldSchema: Codable, Equatable, Sendable {
    public var fields: [TestField]
    /// Calculator settings, e.g. {"pass_max_drop_psi": 0.5}.
    public var options: [String: Double]?
}

public enum Calculator: String, Codable, Sendable {
    case pressureDrop = "pressure_drop"
    case bucketEvaporation = "bucket_evaporation"
    /// A calculator added on the server after this app: the test is entered without one.
    case unsupported

    public init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unsupported
    }
}

public enum Outcome: String, Codable, Sendable {
    case pass, fail, inconclusive
}

/// A kind of test (config row from the database).
public struct TestType: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var key: String
    public var name: String
    public var fieldSchema: TestFieldSchema
    public var schemaVersion: Int
    public var calculator: Calculator?
    public var resultOptions: [Outcome]
    public var sortOrder: Int
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id, key, name, calculator, active
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case fieldSchema = "field_schema"
        case schemaVersion = "schema_version"
        case resultOptions = "result_options"
        case sortOrder = "sort_order"
    }
}

/// One value on a test's form: text, a number, or blank.
public enum TestValue: Codable, Equatable, Sendable {
    case null
    case string(String)
    case number(Double)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        }
    }
}

/// A test's form values by field key.
public typealias TestData = [String: TestValue]

/// One test the tech ran.
public struct TestResult: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var jobId: String
    public var jobComponentId: String?
    public var testTypeId: String
    public var schemaVersion: Int
    public var data: TestData
    public var computed: [String: TestValue]
    public var outcome: Outcome?
    public var performedAt: String?
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case id, data, computed, outcome, notes
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case jobId = "job_id"
        case jobComponentId = "job_component_id"
        case testTypeId = "test_type_id"
        case schemaVersion = "schema_version"
        case performedAt = "performed_at"
    }
}

/// A severity a finding can have (config row from the database).
public struct SeverityLevel: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var key: String
    public var name: String
    public var color: String
    public var mustMention: Bool
    public var sortOrder: Int
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id, key, name, color, active
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case mustMention = "must_mention"
        case sortOrder = "sort_order"
    }
}

/// Why an item was not applicable (config row from the database).
public struct ExclusionReason: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var label: String
    public var sortOrder: Int
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id, label, active
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case sortOrder = "sort_order"
    }
}

public enum FindingStatus: String, Codable, CaseIterable, Sendable {
    case open, quoted, repaired, monitor

    public var label: String {
        switch self {
        case .open: "Open"
        case .quoted: "Quoted"
        case .repaired: "Repaired"
        case .monitor: "Monitor"
        }
    }
}

/// Something wrong the tech found, pinned on the pool diagram.
public struct Finding: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var deletedAt: String?
    public var jobId: String
    public var jobComponentId: String?
    public var title: String
    public var locationText: String?
    public var severityKey: String
    public var pinX: Double?
    public var pinY: Double?
    public var status: FindingStatus
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case id, title, status, notes
        case companyId = "company_id"
        case deletedAt = "deleted_at"
        case jobId = "job_id"
        case jobComponentId = "job_component_id"
        case locationText = "location_text"
        case severityKey = "severity_key"
        case pinX = "pin_x"
        case pinY = "pin_y"
    }
}

/// Not deleted. An empty `deleted_at` counts as not deleted, as in TypeScript.
private func isLive(_ deletedAt: String?) -> Bool { deletedAt?.isEmpty ?? true }

// MARK: - Checklist

/// Whether a checklist item belongs on a job at this property.
public func componentApplies(_ type: ComponentType, _ property: Property) -> Bool {
    // Vinyl checks: skipped only when the pool is known to be another type.
    if let only = type.appliesToPoolType, !only.isEmpty, let pool = property.poolType, pool.rawValue != only {
        return false
    }
    switch type.appliesTo {
    case .both: return property.hasPool || property.hasSpa
    case .spa: return property.hasSpa
    case .pool: return property.hasPool
    }
}

/// "Skimmer", then "Skimmer 2" when another is added; numbered from 1 when a job starts with several.
/// "Skimmer", then "Skimmer 2" when another is added; numbered from 1 when a job starts with several.
public func instanceLabel(_ type: ComponentType, _ n: Int) -> String {
    if !type.allowsMultiple { return type.name }
    return n == 1 && type.defaultCount <= 1 ? type.name : "\(type.name) \(n)"
}

/// A checklist item to create on a job.
public struct PlannedComponent: Codable, Equatable, Sendable {
    public var componentTypeId: String
    public var instanceNumber: Int
    public var label: String
    public var sortOrder: Int

    enum CodingKeys: String, CodingKey {
        case label
        case componentTypeId = "component_type_id"
        case instanceNumber = "instance_number"
        case sortOrder = "sort_order"
    }
}

/// Default component instances for a new job at this property: the leak checklist for a
/// detection job, the service checklist for a maintenance visit.
public func planComponents(_ types: [ComponentType], _ property: Property, _ jobType: JobType = .detection)
    -> [PlannedComponent]
{
    // A repair job has no checklist: no item's job_type is "repair".
    let applicable = types.filter {
        isLive($0.deletedAt) && $0.active && $0.onSchedule != true && ($0.jobType ?? .detection) == jobType
            && componentApplies($0, property)
    }
    return ECMA.sort(applicable) { Double($0.sortOrder - $1.sortOrder) }.flatMap { type in
        let count = max(0, type.allowsMultiple ? type.defaultCount : min(type.defaultCount, 1))
        return (0..<count).map { i in
            PlannedComponent(
                componentTypeId: type.id, instanceNumber: i + 1, label: instanceLabel(type, i + 1),
                sortOrder: type.sortOrder * 100 + i + 1)
        }
    }
}

/// The next instance to add for a type ("+ Return" after Return 1-4 gives Return 5).
public func nextInstance(_ type: ComponentType, _ existing: [JobComponent]) -> PlannedComponent {
    let used = existing.filter { isLive($0.deletedAt) && $0.componentTypeId == type.id }.map(\.instanceNumber)
    let n = (used.max() ?? 0) + 1
    return PlannedComponent(
        componentTypeId: type.id, instanceNumber: n, label: instanceLabel(type, n), sortOrder: type.sortOrder * 100 + n)
}

/// The verdict counts on a checklist.
public struct ChecklistTally: Codable, Equatable, Sendable {
    /// Not leaking (or "no" on a yes/no item).
    public var pass = 0
    public var attention = 0
    public var leaking = 0
    public var notApplicable = 0
    public var pending = 0
}

/// The counts at the top of the report: "26 Items Pass · 0 Need Attention · 1 Failed".
public func checklistTally(_ components: [JobComponent], _ results: [ChecklistItemResult]) -> ChecklistTally {
    var byComponent: [String: ChecklistItemResult] = [:]
    for result in results where isLive(result.deletedAt) { byComponent[result.jobComponentId] = result }
    var tally = ChecklistTally()
    for component in components where isLive(component.deletedAt) {
        guard let result = byComponent[component.id], result.status != .pending else {
            tally.pending += 1
            continue
        }
        if result.status == .excluded {
            tally.notApplicable += 1
        } else if result.outcome == .leaking {
            tally.leaking += 1
        } else if result.outcome == .attention {
            tally.attention += 1
        } else {
            tally.pass += 1
        }
    }
    return tally
}

// MARK: - Tests

/// Parse a typed number ("12", "12.5", " 0.25 "); nil when blank or invalid.
private func toNumber(_ value: TestValue?) -> Double? {
    switch value {
    case .number(let n): return n.isFinite ? n : nil
    case .string(let s):
        let trimmed = ECMA.trim(s)
        if trimmed.isEmpty { return nil }
        let n = ECMA.number(trimmed)
        return n.isFinite ? n : nil
    case .null, nil: return nil
    }
}

/// Errors by field key for a test's form.
public func validateTestData(_ schema: TestFieldSchema, _ data: TestData) -> [String: String] {
    var errors: [String: String] = [:]
    for field in schema.fields {
        let value = data[field.key]
        let blank: Bool
        switch value {
        case .null, nil: blank = true
        case .string(let s): blank = ECMA.trim(s).isEmpty
        case .number: blank = false
        }
        if blank {
            if field.required == true { errors[field.key] = "Enter \(ECMA.lowercase(field.label))." }
            continue
        }
        if field.type == .number && toNumber(value) == nil { errors[field.key] = "Enter a number." }
        if field.type == .number && (toNumber(value) ?? 0) < 0 { errors[field.key] = "Can't be negative." }
        if field.type == .select, let options = field.options, let value, !options.contains(ECMA.string(value)) {
            errors[field.key] = "Pick one of the options."
        }
    }
    return errors
}

/// A calculator's result.
public struct Calculation: Codable, Equatable, Sendable {
    public var computed: [String: Double]
    public var suggested: Outcome?
    /// One line for the tech, e.g. "Dropped 8 PSI in 15 min".
    public var summary: String?

    static let empty = Calculation(computed: [:], suggested: nil, summary: nil)
}

/// Math.round to `places` decimals, as TypeScript does it.
private func roundTo(_ n: Double, _ places: Double = 2) -> Double {
    let scale = pow(10, places)
    return ECMA.round(n * scale) / scale
}

private func fmt(_ n: Double) -> String { ECMA.numberString(roundTo(n)) }

/// Whether a JavaScript number is truthy (not 0, not NaN, not null).
private func truthy(_ n: Double?) -> Bool { n.map { $0 != 0 && !$0.isNaN } ?? false }

/// Pressure test: drop = start - end. Passes when the drop is within the allowed
/// tolerance (default 0 PSI; set pass_max_drop_psi on the test type).
private func pressureDrop(_ data: TestData, _ options: [String: Double]) -> Calculation {
    guard let start = toNumber(data["start_psi"]), let end = toNumber(data["end_psi"]) else { return .empty }
    let minutes = toNumber(data["duration_min"])
    let drop = roundTo(start - end)
    var computed = ["drop_psi": drop]
    if let minutes, truthy(minutes), minutes > 0 { computed["drop_psi_per_min"] = roundTo(drop / minutes, 3) }
    let tolerance = options["pass_max_drop_psi"] ?? 0
    let minMinutes = options["min_duration_min"] ?? 0
    var suggested: Outcome = drop <= tolerance ? .pass : .fail
    if drop < 0 { suggested = .inconclusive }  // pressure went up: check the gauge or temperature
    if suggested == .pass, let minutes, minutes < minMinutes { suggested = .inconclusive }
    let over = minutes.map { truthy($0) ? " in \(fmt($0)) min" : "" } ?? ""
    let summary =
        drop < 0
        ? "Rose \(fmt(-drop)) PSI\(over)"
        : drop == 0 ? "Held at \(fmt(start)) PSI\(over)" : "Dropped \(fmt(drop)) PSI\(over)"
    return Calculation(computed: computed, suggested: suggested, summary: summary)
}

/// Bucket test: pool loss minus bucket (evaporation) loss is the unexplained loss.
/// Fails when the unexplained loss per 24 h exceeds the threshold (default 0.25 in/day;
/// set fail_over_in_per_day on the test type).
private func bucketEvaporation(_ data: TestData, _ options: [String: Double]) -> Calculation {
    guard let ps = toNumber(data["pool_start_in"]), let pe = toNumber(data["pool_end_in"]),
        let bs = toNumber(data["bucket_start_in"]), let be = toNumber(data["bucket_end_in"]),
        let hours = toNumber(data["duration_hours"]), truthy(hours), hours > 0
    else { return .empty }
    let poolLoss = roundTo(ps - pe, 3)
    let bucketLoss = roundTo(bs - be, 3)
    let unexplained = roundTo(poolLoss - bucketLoss, 3)
    let perDay = roundTo((unexplained * 24) / hours, 3)
    let threshold = options["fail_over_in_per_day"] ?? 0.25
    return Calculation(
        computed: [
            "pool_loss_in": poolLoss,
            "bucket_loss_in": bucketLoss,
            "unexplained_loss_in": unexplained,
            "unexplained_in_per_day": perDay,
        ],
        suggested: perDay > threshold ? .fail : .pass,
        summary: unexplained <= 0
            ? "No loss beyond evaporation over \(fmt(hours)) h"
            : "\(fmt(unexplained)) in lost beyond evaporation over \(fmt(hours)) h (\(fmt(perDay)) in/day)")
}

/// Run a test type's calculator; types without one only use the tech's chosen outcome.
public func calculate(_ type: TestType, _ data: TestData) -> Calculation {
    let options = type.fieldSchema.options ?? [:]
    switch type.calculator {
    case .pressureDrop: return pressureDrop(data, options)
    case .bucketEvaporation: return bucketEvaporation(data, options)
    case nil, .unsupported: return .empty
    }
}

/// Store numbers as numbers, blanks as null, text trimmed.
public func normalizeTestData(_ schema: TestFieldSchema, _ data: TestData) -> TestData {
    var out: TestData = [:]
    for field in schema.fields {
        let value = data[field.key]
        if field.type == .number {
            out[field.key] = toNumber(value).map(TestValue.number) ?? .null
        } else if let value, value != .null {
            let text = ECMA.trim(ECMA.string(value))
            out[field.key] = text.isEmpty ? .null : .string(text)
        } else {
            out[field.key] = .null
        }
    }
    return out
}

// MARK: - Findings and the pool diagram

/// Errors by field key for a new finding.
public func validateFinding(title: String, severityKey: String) -> [String: String] {
    var errors: [String: String] = [:]
    if ECMA.trim(title).isEmpty { errors["title"] = "Describe the finding, like \"Return 3 line break\"." }
    if severityKey.isEmpty { errors["severity_key"] = "Pick a severity." }
    return errors
}

/// The pool outlines the shape picker offers, in order (`DiagramShape.allCases`).
public enum DiagramShape: String, Codable, CaseIterable, Sendable {
    case rectangle, oval, kidney
    case lShape = "l_shape"
    case freeform, roman, grecian
    case figureEight = "figure_eight"

    public var label: String {
        switch self {
        case .rectangle: "Rectangle"
        case .oval: "Oval"
        case .kidney: "Kidney"
        case .lShape: "L-shape"
        case .freeform: "Freeform"
        case .roman: "Roman"
        case .grecian: "Grecian"
        case .figureEight: "Figure 8"
        }
    }

    /// SVG path for the pool outline, in the diagram's coordinates.
    var path: String {
        switch self {
        case .rectangle: "M16 18 H124 Q130 18 130 24 V76 Q130 82 124 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z"
        case .oval: "M70 15 C102 15 130 30 130 50 C130 70 102 85 70 85 C38 85 10 70 10 50 C10 30 38 15 70 15 Z"
        case .kidney:
            "M30 16 C56 12 70 30 84 28 C100 25 106 14 118 18 C134 24 132 48 126 62 C116 84 88 86 64 84 "
                + "C38 82 12 78 10 54 C8 32 14 19 30 16 Z"
        case .lShape:
            "M14 14 H74 Q80 14 80 20 V48 H124 Q130 48 130 54 V80 Q130 86 124 86 H14 Q8 86 8 80 V20 Q8 14 14 14 Z"
        case .freeform:
            "M24 22 C46 8 70 26 92 16 C114 8 132 26 128 46 C124 62 134 74 116 82 C96 90 76 76 56 84 "
                + "C34 92 10 80 12 60 C14 44 6 34 24 22 Z"
        // Rectangle with a half-round end, where the steps usually are.
        case .roman:
            "M16 18 H104 C120 18 132 32 132 50 C132 68 120 82 104 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z"
        // Rectangle with the corners cut.
        case .grecian: "M26 18 H114 L130 34 V66 L114 82 H26 L10 66 V34 Z"
        case .figureEight:
            "M40 16 C58 16 64 28 70 34 C76 28 82 16 100 16 C120 16 132 32 132 50 C132 68 120 84 100 84 "
                + "C82 84 76 72 70 66 C64 72 58 84 40 84 C20 84 8 68 8 50 C8 32 20 16 40 16 Z"
        }
    }
}

/// The spa's size on the diagram (`SpaSize.allCases`, the `SPA_SIZES` order).
public enum SpaSize: String, Codable, CaseIterable, Sendable {
    case small, medium, large

    public var label: String {
        switch self {
        case .small: "Small"
        case .medium: "Medium"
        case .large: "Large"
        }
    }

    /// Radius in the diagram's units.
    public var r: Double {
        switch self {
        case .small: 10
        case .medium: 13
        case .large: 17
        }
    }
}

/// The spa's shape on the diagram (`SpaShape.allCases`, the `SPA_SHAPES` order).
public enum SpaShape: String, Codable, CaseIterable, Sendable {
    case round, square

    public var label: String {
        switch self {
        case .round: "Round"
        case .square: "Square"
        }
    }
}

/// How a pool's diagram is laid out beyond its shape: mirrored left to right, and the spa's
/// center (0..1 of the diagram), size, and shape. Stored in property.diagram_layout.
public struct DiagramLayout: Codable, Equatable, Sendable {
    public struct Spa: Codable, Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var size: SpaSize?
        public var shape: SpaShape?

        public init(x: Double, y: Double, size: SpaSize? = nil, shape: SpaShape? = nil) {
            self.x = x
            self.y = y
            self.size = size
            self.shape = shape
        }
    }

    /// True or absent (TypeScript leaves the key out unless it's true).
    public var mirror: Bool?
    public var spa: Spa?

    public init(mirror: Bool? = nil, spa: Spa? = nil) {
        self.mirror = mirror
        self.spa = spa
    }
}

/// A top-down pool diagram.
public struct PoolDiagram: Codable, Equatable, Sendable {
    /// The spa: a circle of radius r, or with `square`, a rounded square r from its center.
    public struct Spa: Codable, Equatable, Sendable {
        public var cx: Double
        public var cy: Double
        public var r: Double
        public var square: Bool
    }

    public var width: Double
    public var height: Double
    /// SVG path for the pool outline, in the diagram's coordinates.
    public var pool: String
    public var spa: Spa?
}

private let diagramWidth = 160.0
private let diagramHeight = 100.0
/// Pools are drawn in x 8..132; mirroring flips them about the middle of that.
private let mirrorAxis = 140.0

/// The tokens of `/[A-Za-z]|-?\d*\.?\d+/g` in order; anything else is skipped.
private func pathTokens(_ path: String) -> [String] {
    let s = Array(path.unicodeScalars)
    func isDigit(_ i: Int) -> Bool { i < s.count && ("0"..."9").contains(s[i]) }
    func isLetter(_ i: Int) -> Bool { i < s.count && (("A"..."Z").contains(s[i]) || ("a"..."z").contains(s[i])) }
    var tokens: [String] = []
    var i = 0
    while i < s.count {
        if isLetter(i) {
            tokens.append(String(s[i]))
            i += 1
            continue
        }
        // -?\d*\.?\d+ is greedy: the longest of digits.digits, digits, or .digits.
        var j = i
        if s[j] == "-" { j += 1 }
        var k = j
        while isDigit(k) { k += 1 }
        var end: Int?
        if k < s.count, s[k] == ".", isDigit(k + 1) {
            var m = k + 1
            while isDigit(m) { m += 1 }
            end = m
        } else if k > j {
            end = k
        }
        if let end {
            tokens.append(String(String.UnicodeScalarView(s[i..<end])))
            i = end
        } else {
            i += 1
        }
    }
    return tokens
}

/// Mirrors a pool path left to right. The paths use absolute M, L, H, V, Q, C, and Z only, so
/// every x (each pair's first number, and H's) becomes 140 - x.
public func mirrorPath(_ path: String) -> String {
    var out: [String] = []
    var command = ""
    var index = 0
    for token in pathTokens(path) {
        if let first = token.unicodeScalars.first, ("A"..."Z").contains(first) || ("a"..."z").contains(first) {
            command = token
            index = 0
            out.append(token)
            continue
        }
        let n = ECMA.number(token)
        let isX = command == "H" || (command != "V" && index % 2 == 0)
        out.append(ECMA.numberString(isX ? mirrorAxis - n : n))
        index += 1
    }
    return out.joined(separator: " ")
}

/// Read a layout from a synced row. Anything unrecognized is dropped, never thrown.
public func parseDiagramLayout(_ value: JSONValue?) -> DiagramLayout {
    guard let value else { return DiagramLayout() }
    var layout = DiagramLayout()
    if value["mirror"] == .bool(true) { layout.mirror = true }
    func unit(_ v: JSONValue?) -> Double? {
        if case .number(let n) = v, n >= 0, n <= 1 { return n }
        return nil
    }
    if let spa = value["spa"], let x = unit(spa["x"]), let y = unit(spa["y"]) {
        layout.spa = .init(
            x: x, y: y, size: spa["size"]?.string.flatMap(SpaSize.init(rawValue:)),
            shape: spa["shape"]?.string.flatMap(SpaShape.init(rawValue:)))
    }
    return layout
}

/// Top-down diagram for a property. Pins are stored as 0..1 of width and height. Without a
/// layout, the spa sits at the top right as before (on the left when mirrored).
public func poolDiagram(_ shape: DiagramShape?, _ hasSpa: Bool, _ layout: DiagramLayout? = nil) -> PoolDiagram {
    let path = (shape ?? .rectangle).path
    let mirror = layout?.mirror == true
    let placed = layout?.spa
    let r = (placed?.size ?? .medium).r
    return PoolDiagram(
        width: diagramWidth, height: diagramHeight, pool: mirror ? mirrorPath(path) : path,
        spa: hasSpa
            ? .init(
                cx: placed.map { $0.x * diagramWidth } ?? (mirror ? diagramWidth - 145 : 145),
                cy: placed.map { $0.y * diagramHeight } ?? 22, r: r, square: placed?.shape == .square)
            : nil)
}

// MARK: - JavaScript semantics

extension ECMA {
    /// `String(value)` for a test value.
    static func string(_ value: TestValue) -> String {
        switch value {
        case .null: "null"
        case .string(let s): s
        case .number(let n): numberString(n)
        }
    }
}

// MARK: - Verdicts

/// Badge text for an item, in the design partner's words. Yes/no items read "Yes" or "No".
public func verdictLabel(status: ChecklistStatus?, outcome: ChecklistOutcome?, answer: ComponentAnswer = .leak)
    -> String
{
    guard let status, status != .pending else { return "To do" }
    if answer == .done {
        if status == .excluded { return "Skipped" }
        return outcome == .attention ? "Needs attention" : "Done"
    }
    if status == .excluded { return "Not applicable" }
    if answer == .yesNo { return outcome == .ok ? "No" : "Yes" }
    return outcome == .leaking ? "Leaking" : outcome == .attention ? "Attention" : "Not leaking"
}

/// One tap per item: the shop's verdicts (yes/no items: No, Yes, N/A).
public enum Verdict: String, Codable, Sendable {
    case ok, leaking, attention, na
}

public struct VerdictOption: Codable, Equatable, Sendable {
    public var value: Verdict
    public var label: String
}

public func verdictOptions(_ answer: ComponentAnswer?) -> [VerdictOption] {
    switch answer {
    case .done:
        [
            .init(value: .ok, label: "Done"), .init(value: .attention, label: "Needs Attention"),
            .init(value: .na, label: "Skipped"),
        ]
    case .yesNo:
        [.init(value: .ok, label: "No"), .init(value: .attention, label: "Yes"), .init(value: .na, label: "N/A")]
    default:
        [
            .init(value: .ok, label: "Not Leaking"), .init(value: .leaking, label: "Leaking"),
            .init(value: .attention, label: "Attention"), .init(value: .na, label: "N/A"),
        ]
    }
}

/// The verdict an item has now; nil while it's to do.
public func currentVerdict(status: ChecklistStatus?, outcome: ChecklistOutcome?) -> Verdict? {
    guard let status, status != .pending else { return nil }
    if status == .excluded { return .na }
    return outcome.flatMap { Verdict(rawValue: $0.rawValue) } ?? .ok
}

/// The checklist row values for a verdict. "Where" only stays for Leaking and Attention.
public func verdictValues(_ v: Verdict?, userId: String?, now: Date = Date()) -> [String: JSONValue] {
    let at = JSONValue.string((try? ECMA.isoString(ECMA.milliseconds(now))) ?? "")
    let by = userId.map(JSONValue.string) ?? .null
    guard let v else { return ["status": "pending", "outcome": .null, "inspected_at": .null, "inspected_by": .null] }
    if v == .na {
        return ["status": "excluded", "outcome": .null, "location_text": .null, "inspected_at": at, "inspected_by": by]
    }
    var values: [String: JSONValue] = [
        "status": "inspected", "outcome": .string(v.rawValue), "inspected_at": at, "inspected_by": by,
    ]
    if v == .ok { values["location_text"] = .null }
    return values
}
