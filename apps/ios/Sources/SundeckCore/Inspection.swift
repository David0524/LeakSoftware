import Foundation

// MARK: - Row shapes

/// Where an item is listed on the checklist and the report. Port of inspection.ts.
public enum ChecklistSection: String, Codable, CaseIterable, Sendable {
    case visual
    case plumbing
    case bondBeam = "bond_beam"
    case other
    case service
    // Pool Inspection's tabs (2026-10-20).
    case inspEquipment = "insp_equipment"
    case inspSelfCleaning = "insp_self_cleaning"
    case inspHeaters = "insp_heaters"
    case inspElectrical = "insp_electrical"
    case inspFencing = "insp_fencing"
    case inspCovers = "insp_covers"
    case inspVisual = "insp_visual"
    case inspPlumbing = "insp_plumbing"

    public var label: String {
        switch self {
        case .visual: "Visual Leak Inspection"
        case .plumbing: "Plumbing Static Test"
        case .bondBeam: "Bond Beam"
        case .other: "Other"
        case .service: "Service"
        case .inspEquipment: "Equipment"
        case .inspSelfCleaning: "Self Cleaning (In Floor) System"
        case .inspHeaters: "Heaters"
        case .inspElectrical: "Electrical Safety"
        case .inspFencing: "Fencing and Child Barriers"
        case .inspCovers: "Covers"
        case .inspVisual: "Visual Leak Inspection"
        case .inspPlumbing: "Plumbing Static Test"
        }
    }

    /// A section this app doesn't know (added on the server later) lists under Other.
    public init(from decoder: Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
    }
}

/// How an item is answered: a leak verdict, yes or no, a maintenance task, or a pool inspection
/// question's option, options, or text (PoolInspection.swift).
public enum ComponentAnswer: String, Codable, Sendable {
    case leak
    case yesNo = "yes_no"
    case done
    case choice, multi, text

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
    /// Which jobs get the item: leak detection (default), maintenance visits, or pool inspections.
    public var jobType: JobType?
    /// The small header it sits under ("Filtration System").
    public var groupLabel: String?
    /// A choice or multi question's options (`choiceOptions` reads them).
    public var options: JSONValue?
    /// A banner shown before it, word for word.
    public var notice: String?
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
        case groupLabel = "group_label"
        case options, notice
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
    /// A pool inspection answer: an option's label, a list of labels, or text.
    public var value: JSONValue?

    enum CodingKeys: String, CodingKey {
        case id, status, outcome, method, notes, value
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
    /// A number field's lowest and highest believable reading, e.g. 0 and 150 PSI.
    public var min: Double?
    public var max: Double?
}

extension TestField {
    /// A bound that isn't a number (a shop's typo) is ignored, as in TypeScript.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        label = try c.decode(String.self, forKey: .label)
        type = try c.decode(FieldType.self, forKey: .type)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        required = try c.decodeIfPresent(Bool.self, forKey: .required)
        options = try c.decodeIfPresent([String].self, forKey: .options)
        min = (try? c.decodeIfPresent(Double.self, forKey: .min)) ?? nil
        max = (try? c.decodeIfPresent(Double.self, forKey: .max)) ?? nil
    }
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
    // A repair job has no checklist (owner, 2026-10-22).
    if !jobHasChecklist(jobType.rawValue) { return [] }
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

// MARK: - Items typed in on a job (owner, 2026-10-26)

// "There sometimes is weird things at a pool that we may need to type in." At the bottom of a
// leak detection or visit checklist, Add Item takes a name. The item belongs to that job only: a
// job_component whose label is the typed name, on one hidden stand-in component type per
// checklist, so it syncs, is answered, shows on the report and goes with Undo like every other
// item. Port of the same section in packages/core/src/inspection.ts.

/// The hidden stand-in type's key for each checklist.
public let customItemKeyDetection = "custom_leak"
public let customItemKeyMaintenance = "custom_visit"

/// Is this one of the stand-in types? They never appear in settings or in Add an item.
public func isCustomItemType(_ type: ComponentType) -> Bool { type.key.hasPrefix("custom_") }

public let addItemLabel = "Type a New Item"
public let addItemTitle = "New Item"
public let addItemField = "Item name"
public let addItemPlaceholder = "For example, Cracked deck drain"
public let addItemHint = "This item is only on this job."
public let addItemSave = "Add"
public let customItemMax = 80

/// The typed name, tidied (spaces squeezed, 80 characters at most), or nil when it's blank.
public func customItemName(_ raw: String) -> String? {
    let squeezed = raw.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    let name = String(squeezed.prefix(customItemMax)).trimmingCharacters(in: .whitespaces)
    return name.isEmpty ? nil : name
}

/// The stand-in type for a checklist, when the shop has one (a shop that hasn't synced yet doesn't).
public func customItemType(_ types: [ComponentType], _ jobType: JobType) -> ComponentType? {
    let key = jobType == .maintenance ? customItemKeyMaintenance : customItemKeyDetection
    return types.first { $0.key == key && isLive($0.deletedAt) }
}

/// Does this job's checklist take typed-in items? Not a pool inspection (its questions are fixed) or a repair.
public func takesCustomItems(_ jobType: JobType) -> Bool {
    jobType != .inspection && jobHasChecklist(jobType.rawValue)
}

/// The component to add for a typed-in item: after the rest, in the order typed.
public func nextCustomItem(_ type: ComponentType, _ existing: [JobComponent], _ rawName: String) -> PlannedComponent? {
    guard let name = customItemName(rawName) else { return nil }
    var next = nextInstance(type, existing)
    next.label = name
    return next
}

/// The confirm before removing an item from a job's checklist.
public struct RemoveItemConfirm: Codable, Equatable, Sendable {
    public var title: String
    public var message: String?
    public var confirm: String

    public init(title: String, message: String?, confirm: String) {
        self.title = title
        self.message = message
        self.confirm = confirm
    }
}

/// Removing an item from a job's checklist (owner, 2026-10-19): any item can go. A scheduled
/// cleaning stays due on its plan, so it goes on the next visit, and the confirm says so.
public func removeItemConfirm(_ label: String, fromPlan: Bool) -> RemoveItemConfirm {
    RemoveItemConfirm(
        title: "Remove \(label) from the checklist?",
        message: fromPlan ? "It’s still due, so it goes on the next visit." : nil,
        confirm: "Remove Item")
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

/// "Enter start pressure between 0 and 150 PSI."
private func rangeMessage(_ field: TestField, _ min: Double?, _ max: Double?) -> String {
    let unit = field.unit.flatMap { $0.isEmpty ? nil : " \($0)" } ?? ""
    let label = ECMA.lowercase(field.label)
    switch (min, max) {
    case (let min?, let max?):
        return "Enter \(label) between \(ECMA.numberString(min)) and \(ECMA.numberString(max))\(unit)."
    case (let min?, nil): return "Enter \(label) of \(ECMA.numberString(min))\(unit) or more."
    default: return "Enter \(label) of \(ECMA.numberString(max ?? 0))\(unit) or less."
    }
}

/// Errors by field key: blanks in required fields, unreadable numbers, readings out of range.
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
        if field.type == .number {
            let min = field.min.flatMap { $0.isFinite ? $0 : nil }
            let max = field.max.flatMap { $0.isFinite ? $0 : nil }
            if let n = toNumber(value) {
                if let min, n < min {
                    errors[field.key] = rangeMessage(field, min, max)
                } else if let max, n > max {
                    errors[field.key] = rangeMessage(field, min, max)
                } else if min == nil && n < 0 {
                    errors[field.key] = "Can't be negative."
                }
            } else {
                errors[field.key] = "Enter a number."
            }
        }
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

/// The calculation shown while the tech types: a reading that fails the checks counts as blank,
/// so an impossible number never reaches the summary ("Dropped 1e+23 PSI").
public func previewTest(_ type: TestType, _ data: TestData) -> Calculation {
    var usable = data
    for key in validateTestData(type.fieldSchema, data).keys { usable[key] = .null }
    return calculate(type, usable)
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

/// Every shape a pool can be saved with (`isDiagramShape`): the tiles, Freeform (older pools)
/// and a pool drawn by hand.
public enum DiagramShape: String, Codable, CaseIterable, Sendable {
    case rectangle, oval, kidney
    case lShape = "l_shape"
    case freeform, roman, grecian
    case figureEight = "figure_eight"
    /// Drawn by hand: no preset outline (Clear, owner 2026-10-19).
    case custom

    /// The preset shapes on the Pool Shape tiles (`DIAGRAM_SHAPES`). Freeform left the tiles
    /// (owner, 2026-10-19: Draw covers it); pools already set to it still draw it.
    public static let tiles: [DiagramShape] = [.rectangle, .oval, .kidney, .lShape, .roman, .grecian, .figureEight]

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
        case .custom: "Drawn"
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
        case .custom: ""
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

/// Whether `v` is a shape a pool can be saved with (`isDiagramShape`).
public func isDiagramShape(_ v: JSONValue?) -> Bool {
    v?.string.flatMap(DiagramShape.init(rawValue:)) != nil
}

/// How a pool's diagram is laid out beyond its shape: mirrored left to right, the spa's center
/// (0..1 of the diagram), size, shape and radius, what was drawn, and the landmarks around it.
/// Stored in property.diagram_layout.
public struct DiagramLayout: Codable, Equatable, Sendable {
    public struct Spa: Codable, Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var size: SpaSize?
        public var shape: SpaShape?
        /// Its radius in diagram units, pinched on the diagram (owner, 2026-10-19). `size` is
        /// the nearest preset, for app builds that predate `r`.
        public var r: Double?

        public init(x: Double, y: Double, size: SpaSize? = nil, shape: SpaShape? = nil, r: Double? = nil) {
            self.x = x
            self.y = y
            self.size = size
            self.shape = shape
            self.r = r
        }
    }

    /// True or absent (TypeScript leaves the key out unless it's true).
    public var mirror: Bool?
    /// The pool is drawn in the middle of the diagram (owner, 2026-10-20: "Pool shapes are not
    /// centered"). Pools saved before sat 10 units left, to leave room for the spa; their spa,
    /// landmarks, drawing and finding pins were placed against that, so they keep it until the
    /// shape is saved again (`centerLayout`). True or absent.
    public var centered: Bool?
    public var spa: Spa?
    /// Lines, circles, and freehand strokes drawn on the diagram (Draw), 0..1 of it.
    public var drawing: [DrawnShape]?
    /// Trees, rocks, a waterfall, a skimmer, and so on, placed around the pool (Landmarks).
    public var landmarks: [Landmark]?

    public init(
        mirror: Bool? = nil, centered: Bool? = nil, spa: Spa? = nil, drawing: [DrawnShape]? = nil,
        landmarks: [Landmark]? = nil
    ) {
        self.mirror = mirror
        self.centered = centered
        self.spa = spa
        self.drawing = drawing
        self.landmarks = landmarks
    }
}

/// One thing drawn with Draw, in the pool's outline (owner, 2026-10-19). Encoded as the
/// website's `{type: "line" | "circle" | "pen", …}`.
public enum DrawnShape: Codable, Equatable, Sendable {
    case line(x1: Double, y1: Double, x2: Double, y2: Double)
    case circle(cx: Double, cy: Double, rx: Double, ry: Double)
    /// At least two points, each [x, y].
    case pen(points: [[Double]])

    enum Keys: String, CodingKey { case type, x1, y1, x2, y2, cx, cy, rx, ry, points }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "line":
            self = .line(
                x1: try c.decode(Double.self, forKey: .x1), y1: try c.decode(Double.self, forKey: .y1),
                x2: try c.decode(Double.self, forKey: .x2), y2: try c.decode(Double.self, forKey: .y2))
        case "circle":
            self = .circle(
                cx: try c.decode(Double.self, forKey: .cx), cy: try c.decode(Double.self, forKey: .cy),
                rx: try c.decode(Double.self, forKey: .rx), ry: try c.decode(Double.self, forKey: .ry))
        case "pen": self = .pen(points: try c.decode([[Double]].self, forKey: .points))
        default: throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "unknown shape")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .line(let x1, let y1, let x2, let y2):
            try c.encode("line", forKey: .type)
            try c.encode(x1, forKey: .x1)
            try c.encode(y1, forKey: .y1)
            try c.encode(x2, forKey: .x2)
            try c.encode(y2, forKey: .y2)
        case .circle(let cx, let cy, let rx, let ry):
            try c.encode("circle", forKey: .type)
            try c.encode(cx, forKey: .cx)
            try c.encode(cy, forKey: .cy)
            try c.encode(rx, forKey: .rx)
            try c.encode(ry, forKey: .ry)
        case .pen(let points):
            try c.encode("pen", forKey: .type)
            try c.encode(points, forKey: .points)
        }
    }

    /// As a synced JSON value.
    public var json: JSONValue {
        switch self {
        case .line(let x1, let y1, let x2, let y2):
            ["type": "line", "x1": .number(x1), "y1": .number(y1), "x2": .number(x2), "y2": .number(y2)]
        case .circle(let cx, let cy, let rx, let ry):
            ["type": "circle", "cx": .number(cx), "cy": .number(cy), "rx": .number(rx), "ry": .number(ry)]
        case .pen(let points):
            ["type": "pen", "points": .array(points.map { .array($0.map(JSONValue.number)) })]
        }
    }
}

/// A landmark's kind (`LandmarkKind`), in the Landmarks row's order.
public enum LandmarkKind: String, Codable, CaseIterable, Sendable {
    case tree, rock, waterfall, steps, equipment, house, skimmer, mainDrain, light, poolReturn, suctionLine

    public var label: String { landmarkDrawings.first { $0.key == self }!.label }
    /// Its filled parts in a 24 x 24 box (absolute M, L, H, V, Q, C, Z only).
    public var parts: [LandmarkPart] { landmarkDrawings.first { $0.key == self }!.parts }
    /// How a tap mirrors it (LANDMARKS' `mirror`): "y" top to bottom for a drawing that's the
    /// same both ways across (the steps; owner, 2026-10-20), else nil, left to right.
    public var mirrorAxis: String? { self == .steps ? "y" : nil }
}

/// A landmark drawing's colors (brand/tokens.json color.landmark): filled, with a thin dark
/// outline (owner, 2026-10-19: "All of the landmarks are hard to interpret").
public enum LandmarkTone: String, Codable, CaseIterable, Sendable {
    case leaf, leafDark, trunk, stone, stoneDark, water, foam, concrete, metal, wall, roof, door
}

/// One filled piece of a landmark drawing, in its 24 x 24 box. "foam" parts are white lines
/// (water streaks), stroked rather than filled.
public struct LandmarkPart: Codable, Equatable, Sendable {
    public var d: String
    public var tone: LandmarkTone

    public init(_ d: String, _ tone: LandmarkTone) {
        self.d = d
        self.tone = tone
    }
}

/// The landmarks (`LANDMARKS`), drawn as small filled pictures in a 24 x 24 box. Each part is
/// filled with its tone and outlined in color.landmark.outline (stroke 1 in the box).
public let landmarkDrawings: [(key: LandmarkKind, label: String, parts: [LandmarkPart])] = [
    (
        .tree, "Tree",
        [
            LandmarkPart("M10.6 15.5 H13.4 V22.5 H10.6 Z", .trunk),
            LandmarkPart(
                "M12 1.5 C15.6 1.5 18.2 4 18.4 7.2 C20.6 8.2 21.8 10.4 21.4 12.8 C21 15.4 18.8 17.2 16.2 17 "
                    + "C15 17.8 13.6 18.2 12 18.2 C10.4 18.2 9 17.8 7.8 17 C5.2 17.2 3 15.4 2.6 12.8 "
                    + "C2.2 10.4 3.4 8.2 5.6 7.2 C5.8 4 8.4 1.5 12 1.5 Z", .leaf),
            LandmarkPart(
                "M8.4 7.4 C9.4 6 11 5.4 12.6 5.6 C11.2 6.4 10.2 7.6 9.8 9.2 C9.2 8.8 8.7 8.2 8.4 7.4 Z", .leafDark),
        ]
    ),
    (
        .rock, "Rock",
        [
            LandmarkPart(
                "M2 19.5 C2 15.5 4 11.6 7.6 9.6 C9.6 7.4 13.6 6.8 16.4 8.4 C19.8 10.2 22 14.2 22 19.5 Z", .stone),
            LandmarkPart("M12.6 9.4 C15 9.6 17.2 11.4 18 14 C16.4 12.6 14.6 12 12.6 12.2 Z", .stoneDark),
        ]
    ),
    (
        .waterfall, "Waterfall",
        [
            LandmarkPart("M4.5 7 H19.5 V18 Q15.75 20.2 12 18 Q8.25 15.8 4.5 18 Z", .water),
            LandmarkPart("M8.5 9 V15.5 M12 9 V16.5 M15.5 9 V15.5", .foam),
            LandmarkPart("M1.5 8 C1.5 5 3.4 3 6.5 3 H17.5 C20.6 3 22.5 5 22.5 8 Z", .stone),
            LandmarkPart("M2.5 22.5 Q12 18.5 21.5 22.5 Z", .water),
        ]
    ),
    (
        .steps, "Steps",
        [
            LandmarkPart("M2.5 15.5 H21.5 V21.5 H2.5 Z", .concrete),
            LandmarkPart("M5.5 9.5 H18.5 V15.5 H5.5 Z", .concrete),
            LandmarkPart("M8.5 3.5 H15.5 V9.5 H8.5 Z", .concrete),
        ]
    ),
    (
        .equipment, "Equipment",
        [
            LandmarkPart("M1.5 18 H22.5 V22 H1.5 Z", .concrete),
            LandmarkPart("M3.5 9 H13.5 V18 H3.5 Z", .metal),
            LandmarkPart(
                "M13.5 10.5 H19 C20.4 10.5 21.5 11.6 21.5 13 V15.5 C21.5 16.9 20.4 18 19 18 H13.5 Z", .stoneDark),
            LandmarkPart("M6.5 9 V4 H12 V6 H8.5 V9 Z", .metal),
        ]
    ),
    (
        .house, "House",
        [
            LandmarkPart("M4.5 10.5 H19.5 V22 H4.5 Z", .wall),
            LandmarkPart("M1.5 11.5 L12 2.5 L22.5 11.5 Z", .roof),
            LandmarkPart("M10 22 V15.5 H14 V22 Z", .door),
        ]
    ),
    (
        .skimmer, "Skimmer",
        [
            LandmarkPart("M1.5 2.5 H22.5 V11 H1.5 Z", .water),
            LandmarkPart("M4.5 5.5 H9.5 M13.5 7.5 H19.5", .foam),
            LandmarkPart("M1.5 11 H22.5 V22.5 H1.5 Z", .concrete),
            LandmarkPart("M4.5 11 H19.5 V15 H4.5 Z", .stoneDark),
            LandmarkPart("M7.5 15 H16.5 V21 H7.5 Z", .stone),
            LandmarkPart("M10.5 17 H13.5 V19 H10.5 Z", .stoneDark),
        ]
    ),
    (
        .mainDrain, "Main Drain",
        [
            LandmarkPart(
                "M12 1.5 C17.8 1.5 22.5 6.2 22.5 12 C22.5 17.8 17.8 22.5 12 22.5 C6.2 22.5 1.5 17.8 1.5 12 "
                    + "C1.5 6.2 6.2 1.5 12 1.5 Z", .metal),
            LandmarkPart(
                "M12 4 C16.42 4 20 7.58 20 12 C20 16.42 16.42 20 12 20 C7.58 20 4 16.42 4 12 "
                    + "C4 7.58 7.58 4 12 4 Z", .concrete),
            LandmarkPart("M7.5 6.2 H16.5 V8.6 H7.5 Z", .stoneDark),
            LandmarkPart("M5.5 10.8 H18.5 V13.2 H5.5 Z", .stoneDark),
            LandmarkPart("M7.5 15.4 H16.5 V17.8 H7.5 Z", .stoneDark),
        ]
    ),
    (
        .light, "Light",
        [
            LandmarkPart(
                "M12 1.5 C17.8 1.5 22.5 6.2 22.5 12 C22.5 17.8 17.8 22.5 12 22.5 C6.2 22.5 1.5 17.8 1.5 12 "
                    + "C1.5 6.2 6.2 1.5 12 1.5 Z", .metal),
            LandmarkPart(
                "M12 4 C16.42 4 20 7.58 20 12 C20 16.42 16.42 20 12 20 C7.58 20 4 16.42 4 12 "
                    + "C4 7.58 7.58 4 12 4 Z", .stoneDark),
            LandmarkPart(
                "M12 6.2 C15.2 6.2 17.8 8.8 17.8 12 C17.8 15.2 15.2 17.8 12 17.8 C8.8 17.8 6.2 15.2 6.2 12 "
                    + "C6.2 8.8 8.8 6.2 12 6.2 Z", .wall),
            LandmarkPart("M8.8 11 Q9.2 8.9 11.3 8.3", .foam),
        ]
    ),
    (
        .poolReturn, "Return",
        [
            LandmarkPart("M9.5 15 L3.5 3.5 Q12 1 20.5 3.5 L14.5 15 Z", .water),
            LandmarkPart("M12 13 V5 M9.8 12 L7.2 6 M14.2 12 L16.8 6", .foam),
            LandmarkPart("M1.5 19 H22.5 V22.5 H1.5 Z", .concrete),
            LandmarkPart(
                "M12 11.7 C14.65 11.7 16.8 13.85 16.8 16.5 C16.8 19.15 14.65 21.3 12 21.3 "
                    + "C9.35 21.3 7.2 19.15 7.2 16.5 C7.2 13.85 9.35 11.7 12 11.7 Z", .metal),
            LandmarkPart(
                "M12 13.3 C13.77 13.3 15.2 14.73 15.2 16.5 C15.2 18.27 13.77 19.7 12 19.7 "
                    + "C10.23 19.7 8.8 18.27 8.8 16.5 C8.8 14.73 10.23 13.3 12 13.3 Z", .concrete),
            LandmarkPart(
                "M12 14.9 C12.88 14.9 13.6 15.62 13.6 16.5 C13.6 17.38 12.88 18.1 12 18.1 "
                    + "C11.12 18.1 10.4 17.38 10.4 16.5 C10.4 15.62 11.12 14.9 12 14.9 Z", .stoneDark),
        ]
    ),
    (
        .suctionLine, "Suction Line",
        [
            LandmarkPart("M8.4 11 H15.6 V22.5 H8.4 Z", .metal),
            LandmarkPart("M6.8 15.8 H17.2 V19 H6.8 Z", .stone),
            LandmarkPart(
                "M12 1.5 C15.59 1.5 18.5 4.41 18.5 8 C18.5 11.59 15.59 14.5 12 14.5 C8.41 14.5 5.5 11.59 5.5 8 "
                    + "C5.5 4.41 8.41 1.5 12 1.5 Z", .metal),
            LandmarkPart(
                "M12 3.2 C14.65 3.2 16.8 5.35 16.8 8 C16.8 10.65 14.65 12.8 12 12.8 C9.35 12.8 7.2 10.65 7.2 8 "
                    + "C7.2 5.35 9.35 3.2 12 3.2 Z", .concrete),
            LandmarkPart(
                "M12 5 C13.66 5 15 6.34 15 8 C15 9.66 13.66 11 12 11 C10.34 11 9 9.66 9 8 "
                    + "C9 6.34 10.34 5 12 5 Z", .stoneDark),
        ]
    ),
]

/// A landmark placed around the pool, its center 0..1 of the diagram, its size in diagram
/// units (nil: `landmarkSize`) and whether it's mirrored.
public struct Landmark: Codable, Equatable, Sendable {
    public var kind: LandmarkKind
    public var x: Double
    public var y: Double
    public var s: Double?
    public var flip: Bool?
    /// Quarter turns clockwise, 1 to 3 (the steps, waterfall, skimmer, return and suction line; owner,
    /// 2026-10-21 and 2026-10-26).
    public var turn: Int?

    public init(
        kind: LandmarkKind, x: Double, y: Double, s: Double? = nil, flip: Bool? = nil, turn: Int? = nil
    ) {
        self.kind = kind
        self.x = x
        self.y = y
        self.s = s
        self.flip = flip
        self.turn = turn
    }
}

/// What a tap on the selected landmark does: "turn" (the steps, waterfall, skimmer, return and
/// suction line; owner, 2026-10-26) or "mirror". Port of `landmarkTaps`.
public func landmarkTaps(_ kind: LandmarkKind) -> String {
    switch kind {
    case .steps, .waterfall, .skimmer, .poolReturn, .suctionLine: "turn"
    default: "mirror"
    }
}

/// A landmark's quarter turns clockwise, 0 to 3; saved flipped before turning, the steps count
/// as 2 and the waterfall as 0. Port of `landmarkTurn`.
public func landmarkTurn(kind: LandmarkKind, flip: Bool?, turn: Int?) -> Int {
    guard landmarkTaps(kind) == "turn" else { return 0 }
    if let turn, (1...3).contains(turn) { return turn }
    return flip == true && kind == .steps ? 2 : 0
}

/// A tap on the selected landmark: the steps, waterfall, skimmer, return and suction line turn a
/// quarter clockwise, the others mirror. Port of `tapLandmark`.
public func tapLandmark(_ l: Landmark) -> Landmark {
    var out = Landmark(kind: l.kind, x: l.x, y: l.y, s: l.s)
    if landmarkTaps(l.kind) == "turn" {
        let next = (landmarkTurn(kind: l.kind, flip: l.flip, turn: l.turn) + 1) % 4
        out.turn = next == 0 ? nil : next
    } else {
        out.flip = l.flip == true ? nil : true
    }
    return out
}

/// A drawn line this close to level or plumb (degrees) is drawn straight.
public let lineSnapDegrees = 8.0

/// At most this many drawn shapes and landmarks on one pool.
public let drawingMax = 40
public let landmarksMax = 30
/// A landmark's drawn size, in diagram units (of 160 x 100), and how far it can be resized.
public let landmarkSize = 20.0
public let landmarkMin = 10.0
public let landmarkMax = 44.0

/// A landmark size kept within what can be pinched, to a tenth.
public func clampLandmarkSize(_ size: Double) -> Double {
    ECMA.round(min(landmarkMax, max(landmarkMin, size)) * 10) / 10
}
/// How small and large a spa can be pinched, as a radius in diagram units.
public let spaRMin = 7.0
public let spaRMax = 28.0

/// A top-down pool diagram.
public struct PoolDiagram: Codable, Equatable, Sendable {
    /// The spa: a circle of radius r, or with `square`, a rounded square r from its center.
    public struct Spa: Codable, Equatable, Sendable {
        public var cx: Double
        public var cy: Double
        public var r: Double
        public var square: Bool
    }

    /// A landmark's parts in a `size` box centered on cx, cy: translate(cx - size / 2, cy -
    /// size / 2) scale(size / 24); flipped, mirrored about cx (`mirror` "x") or about cy ("y").
    public struct PlacedLandmark: Codable, Equatable, Sendable {
        public var kind: LandmarkKind
        public var cx: Double
        public var cy: Double
        public var size: Double
        public var flip: Bool
        public var mirror: String
        /// Quarter turns clockwise about cx, cy, around the box above: rotate(90 × turn).
        public var turn: Int
        public var parts: [LandmarkPart]
    }

    public var width: Double
    public var height: Double
    /// SVG path for the pool outline, in the diagram's coordinates; empty for a drawn pool.
    public var pool: String
    public var spa: Spa?
    /// Each drawn shape as an SVG path, stroked like the pool's outline.
    public var drawing: [String] = []
    public var landmarks: [PlacedLandmark] = []
}

private let diagramWidth = 160.0
private let diagramHeight = 100.0
/// The paths are drawn in x 8..132; mirroring flips them about the middle of that.
private let mirrorAxis = 140.0
/// How far right a centered pool is drawn: x 18..142, the middle of the 160-wide diagram.
public let poolCenterOffset = 10.0

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

/// Moves a pool path right by dx (absolute M, L, H, V, Q, C, and Z only, as `mirrorPath`).
public func offsetPath(_ path: String, _ dx: Double) -> String {
    if dx == 0 || dx.isNaN || path.isEmpty { return path }
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
        out.append(ECMA.numberString(isX ? n + dx : n))
        index += 1
    }
    return out.joined(separator: " ")
}

/// A layout moved to the centered pool: the spa, landmarks and drawing move right with it, so
/// they stay where they were against the outline. The shape editor opens with this, and saves
/// it.
public func centerLayout(_ layout: DiagramLayout) -> DiagramLayout {
    if layout.centered == true { return layout }
    let dx = poolCenterOffset / diagramWidth
    func x(_ v: Double) -> Double { ECMA.round(min(1, max(0, v + dx)) * 10_000) / 10_000 }
    var out = layout
    out.centered = true
    if var spa = layout.spa {
        spa.x = x(spa.x)
        out.spa = spa
    }
    out.landmarks = layout.landmarks?.map { l in
        var l = l
        l.x = x(l.x)
        return l
    }
    out.drawing = layout.drawing?.map { d in
        switch d {
        case .line(let x1, let y1, let x2, let y2): .line(x1: x(x1), y1: y1, x2: x(x2), y2: y2)
        case .circle(let cx, let cy, let rx, let ry): .circle(cx: x(cx), cy: cy, rx: rx, ry: ry)
        case .pen(let points): .pen(points: points.map { p in p.count >= 2 ? [x(p[0]), p[1]] : p })
        }
    }
    return out
}

/// Read a layout from a synced row. Anything unrecognized is dropped, never thrown.
public func parseDiagramLayout(_ value: JSONValue?) -> DiagramLayout {
    guard let value else { return DiagramLayout() }
    var layout = DiagramLayout()
    if value["mirror"] == .bool(true) { layout.mirror = true }
    if value["centered"] == .bool(true) { layout.centered = true }
    func unit(_ v: JSONValue?) -> Double? {
        if case .number(let n) = v, n >= 0, n <= 1 { return n }
        return nil
    }
    if let spa = value["spa"], let x = unit(spa["x"]), let y = unit(spa["y"]) {
        var r: Double?
        if case .number(let n) = spa["r"], n >= spaRMin, n <= spaRMax { r = n }
        layout.spa = .init(
            x: x, y: y, size: spa["size"]?.string.flatMap(SpaSize.init(rawValue:)),
            shape: spa["shape"]?.string.flatMap(SpaShape.init(rawValue:)), r: r)
    }
    if case .array(let items) = value["drawing"] {
        let drawing = Array(items.compactMap(drawnShape).prefix(drawingMax))
        if !drawing.isEmpty { layout.drawing = drawing }
    }
    if case .array(let items) = value["landmarks"] {
        let landmarks = Array(
            items.compactMap { l -> Landmark? in
                guard case .object = l, let kind = l["kind"]?.string.flatMap(LandmarkKind.init(rawValue:)),
                    let x = unit(l["x"]), let y = unit(l["y"])
                else { return nil }
                var s: Double?
                if case .number(let n) = l["s"], n >= landmarkMin, n <= landmarkMax { s = n }
                let flip = l["flip"] == .bool(true)
                var turn: Int?
                if case .number(let n) = l["turn"] { turn = Int(exactly: n) }
                let turned = landmarkTurn(kind: kind, flip: flip, turn: turn)
                return Landmark(
                    kind: kind, x: x, y: y, s: s, flip: flip && landmarkTaps(kind) == "mirror" ? true : nil,
                    turn: turned == 0 ? nil : turned)
            }
            .prefix(landmarksMax))
        if !landmarks.isEmpty { layout.landmarks = landmarks }
    }
    return layout
}

private func unitNumber(_ v: JSONValue?) -> Double? {
    if case .number(let n) = v, n >= 0, n <= 1 { return n }
    return nil
}

/// One drawn shape from a synced row, or nil when it isn't one.
private func drawnShape(_ v: JSONValue) -> DrawnShape? {
    guard case .object = v else { return nil }
    switch v["type"]?.string {
    case "line":
        guard let x1 = unitNumber(v["x1"]), let y1 = unitNumber(v["y1"]), let x2 = unitNumber(v["x2"]),
            let y2 = unitNumber(v["y2"])
        else { return nil }
        return .line(x1: x1, y1: y1, x2: x2, y2: y2)
    case "circle":
        guard let cx = unitNumber(v["cx"]), let cy = unitNumber(v["cy"]), let rx = unitNumber(v["rx"]),
            let ry = unitNumber(v["ry"])
        else { return nil }
        return .circle(cx: cx, cy: cy, rx: rx, ry: ry)
    case "pen":
        guard case .array(let raw) = v["points"] else { return nil }
        let points = raw.compactMap { p -> [Double]? in
            guard case .array(let pair) = p, pair.count == 2, let x = unitNumber(pair[0]), let y = unitNumber(pair[1])
            else { return nil }
            return [x, y]
        }
        .prefix(400)
        return points.count >= 2 ? .pen(points: Array(points)) : nil
    default: return nil
    }
}

/// The nearest preset for a pinched spa radius, written beside `r` for older app builds.
public func spaSizeFor(_ r: Double) -> SpaSize {
    SpaSize.allCases.reduce(SpaSize.small) { best, z in abs(z.r - r) < abs(best.r - r) ? z : best }
}

/// A spa radius kept within what can be pinched, to a tenth.
public func clampSpaR(_ r: Double) -> Double {
    ECMA.round(min(spaRMax, max(spaRMin, r)) * 10) / 10
}

private func tenth(_ n: Double) -> String { ECMA.numberString(ECMA.round(n * 10) / 10) }

/// A drawn shape as an SVG path in the 160 x 100 diagram (circles as four curves, no arcs).
public func drawnPath(_ d: DrawnShape) -> String {
    let (w, h) = (diagramWidth, diagramHeight)
    switch d {
    case .line(let x1, let y1, let x2, let y2):
        return "M\(tenth(x1 * w)) \(tenth(y1 * h)) L\(tenth(x2 * w)) \(tenth(y2 * h))"
    case .pen(let points):
        return points.enumerated().map { i, p in "\(i > 0 ? "L" : "M")\(tenth(p[0] * w)) \(tenth(p[1] * h))" }
            .joined(separator: " ")
    case .circle(let ux, let uy, let urx, let ury):
        let (cx, cy, rx, ry) = (ux * w, uy * h, urx * w, ury * h)
        let k = 0.5523
        return [
            "M\(tenth(cx)) \(tenth(cy - ry))",
            "C\(tenth(cx + k * rx)) \(tenth(cy - ry)) \(tenth(cx + rx)) \(tenth(cy - k * ry)) \(tenth(cx + rx)) \(tenth(cy))",
            "C\(tenth(cx + rx)) \(tenth(cy + k * ry)) \(tenth(cx + k * rx)) \(tenth(cy + ry)) \(tenth(cx)) \(tenth(cy + ry))",
            "C\(tenth(cx - k * rx)) \(tenth(cy + ry)) \(tenth(cx - rx)) \(tenth(cy + k * ry)) \(tenth(cx - rx)) \(tenth(cy))",
            "C\(tenth(cx - rx)) \(tenth(cy - k * ry)) \(tenth(cx - k * rx)) \(tenth(cy - ry)) \(tenth(cx)) \(tenth(cy - ry)) Z",
        ].joined(separator: " ")
    }
}

/// Draw's tools.
public enum DrawTool: String, Codable, CaseIterable, Sendable {
    case line, circle, pen

    /// The segmented control's words.
    public var label: String {
        switch self {
        case .line: "Line"
        case .circle: "Circle"
        case .pen: "Freeform"
        }
    }
}

/// A drag on the diagram as a drawn shape (Draw's Line, Circle, and Freeform), points 0..1.
/// A line or circle from where the drag started to where it ended (the circle fills the box
/// between them); a freehand stroke from every point, thinned to at most 400. Nil when too
/// small to see.
public func drawnShapeFrom(_ tool: DrawTool, _ points: [(x: Double, y: Double)]) -> DrawnShape? {
    let c = { (n: Double) in ECMA.round(min(1, max(0, n)) * 10_000) / 10_000 }
    guard let first = points.first, let last = points.last else { return nil }
    if tool == .pen {
        var kept: [[Double]] = []
        for p in points {
            let q = [c(p.x), c(p.y)]
            if let prev = kept.last, (q[0] - prev[0]).hypot(q[1] - prev[1]) < 0.004 { continue }
            kept.append(q)
        }
        if kept.count < 2 { return nil }
        let step = Int((Double(kept.count) / 400).rounded(.up))
        let thin =
            step > 1
            ? kept.enumerated().filter { $0.offset % step == 0 || $0.offset == kept.count - 1 }.map(\.element) : kept
        return .pen(points: Array(thin.prefix(400)))
    }
    if (last.x - first.x).hypot(last.y - first.y) < 0.02 { return nil }
    if tool == .line {
        // Within 8 degrees of level or plumb (in the diagram's own units), the line snaps
        // straight (owner, 2026-10-19).
        let dx = abs(last.x - first.x) * diagramWidth
        let dy = abs(last.y - first.y) * diagramHeight
        let tan = Foundation.tan(lineSnapDegrees * Double.pi / 180)
        let end =
            dy <= dx * tan ? (x: last.x, y: first.y) : dx <= dy * tan ? (x: first.x, y: last.y) : (x: last.x, y: last.y)
        return .line(x1: c(first.x), y1: c(first.y), x2: c(end.x), y2: c(end.y))
    }
    return .circle(
        cx: c((first.x + last.x) / 2), cy: c((first.y + last.y) / 2), rx: c(abs(last.x - first.x) / 2),
        ry: c(abs(last.y - first.y) / 2))
}

extension Double {
    /// `Math.hypot(self, other)`.
    fileprivate func hypot(_ other: Double) -> Double { Foundation.hypot(self, other) }
}

/// Clear (owner, 2026-10-19: "Clear would empty everything in the diagram"): no outline, no
/// spa, nothing drawn, no landmarks. What Save writes for a cleared pool (`CLEARED_DIAGRAM`).
public let clearedDiagram: (shape: DiagramShape, hasSpa: Bool, layout: DiagramLayout) = (
    .custom, false, DiagramLayout()
)

/// Top-down diagram for a property. Pins are stored as 0..1 of width and height. Without a
/// layout, the spa sits at the top right as before (on the left when mirrored).
public func poolDiagram(_ shape: DiagramShape?, _ hasSpa: Bool, _ layout: DiagramLayout? = nil) -> PoolDiagram {
    let path = (shape ?? .rectangle).path
    let mirror = layout?.mirror == true
    let dx = layout?.centered == true ? poolCenterOffset : 0
    let placed = layout?.spa
    let r = placed?.r ?? (placed?.size ?? .medium).r
    return PoolDiagram(
        width: diagramWidth, height: diagramHeight,
        pool: offsetPath(mirror && !path.isEmpty ? mirrorPath(path) : path, dx),
        spa: hasSpa
            ? .init(
                cx: placed.map { $0.x * diagramWidth } ?? (mirror ? diagramWidth - 145 : 145),
                cy: placed.map { $0.y * diagramHeight } ?? 22, r: r, square: placed?.shape == .square)
            : nil,
        drawing: (layout?.drawing ?? []).map(drawnPath),
        landmarks: (layout?.landmarks ?? []).map { l in
            let size = l.s ?? landmarkSize
            let half = size / 2
            return .init(
                kind: l.kind, cx: min(diagramWidth - half, max(half, l.x * diagramWidth)),
                cy: min(diagramHeight - half, max(half, l.y * diagramHeight)), size: size,
                flip: l.flip == true && landmarkTaps(l.kind) == "mirror",
                mirror: l.kind.mirrorAxis ?? "x", turn: landmarkTurn(kind: l.kind, flip: l.flip, turn: l.turn),
                parts: l.kind.parts)
        })
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

/// Badge text for an item, in the design partner's words. Yes/no items read "Yes" or "No"; a
/// pool inspection question reads its answer.
public func verdictLabel(
    status: ChecklistStatus?, outcome: ChecklistOutcome?, answer: ComponentAnswer = .leak, value: JSONValue? = nil
) -> String {
    guard let status, status != .pending else { return "To do" }
    if answer.isInspection {
        return inspectionAnswerText(answer, value) ?? (status == .excluded ? "Not applicable" : "Answered")
    }
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
