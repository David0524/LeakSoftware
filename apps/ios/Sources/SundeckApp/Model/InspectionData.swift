import Foundation
import SundeckCore
import SundeckSync

/// A severity the shop uses for findings (`severity_level` rows).
public struct Severity: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var key: String
    public var name: String
    public var color: String?
    public var sortOrder: Int
    public var active: Bool

    enum CodingKeys: String, CodingKey {
        case id, key, name, color, active
        case sortOrder = "sort_order"
    }
}

/// The shop's inspection setup: checklist items, tests and severities. Port of
/// useInspectionConfig in apps/mobile/src/data/inspection.ts.
public struct InspectionConfig: Sendable {
    /// Active, in order.
    public var componentTypes: [ComponentType]
    /// Every type, inactive ones too (old jobs still use them).
    public var componentTypeById: [String: ComponentType]
    public var testTypes: [TestType]
    public var testTypeById: [String: TestType]
    public var severities: [Severity]
    public var severityByKey: [String: Severity]

    public init(_ store: LocalStore, companyId: String) {
        let types = decodeRows(store, "component_type", companyId, as: ComponentType.self)
        componentTypes = types.filter(\.active).sorted { $0.sortOrder < $1.sortOrder }
        componentTypeById = Dictionary(types.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let tests = decodeRows(store, "test_type", companyId, as: TestType.self)
        testTypes = tests.filter(\.active).sorted { $0.sortOrder < $1.sortOrder }
        testTypeById = Dictionary(tests.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let levels = decodeRows(store, "severity_level", companyId, as: Severity.self)
        severities = levels.filter(\.active).sorted { $0.sortOrder < $1.sortOrder }
        severityByKey = Dictionary(levels.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
    }
}

/// One job's checklist, tests and findings (deleted rows left out). Port of useJobInspection.
public struct JobInspection: Sendable {
    public var components: [JobComponent]
    public var componentById: [String: JobComponent]
    public var results: [ChecklistItemResult]
    public var resultByComponent: [String: ChecklistItemResult]
    /// In the order they were done.
    public var tests: [TestResult]
    /// In the order they were made (UUIDv7 ids sort by time).
    public var findings: [Finding]

    public init(_ store: LocalStore, jobId: String) {
        components = decodeJobRows(store, "job_component", jobId, as: JobComponent.self).sorted {
            $0.sortOrder < $1.sortOrder
        }
        componentById = Dictionary(components.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        results = decodeJobRows(store, "checklist_item_result", jobId, as: ChecklistItemResult.self)
        resultByComponent = Dictionary(results.map { ($0.jobComponentId, $0) }, uniquingKeysWith: { a, _ in a })
        tests = decodeJobRows(store, "test_result", jobId, as: TestResult.self).sorted {
            ($0.performedAt ?? "").utf8.lexicographicallyPrecedes(($1.performedAt ?? "").utf8)
        }
        findings = decodeJobRows(store, "finding", jobId, as: Finding.self).sorted { $0.id < $1.id }
    }
}

/// Every inspection write. All go through the sync service: the row and its outbox entry in
/// one transaction, and several rows that belong together in one batch.
@MainActor
public enum InspectionWrites {
    /// The default checklist for the job: one item per planned component, each with a pending result.
    public static func createChecklist(
        _ sync: SyncService, companyId: String, jobId: String, types: [ComponentType], property: Property,
        jobType: JobType
    ) throws {
        let planned = planComponents(types, property, checklistJobType(jobType))
        try sync.batch {
            for p in planned { try insertComponent(sync, companyId: companyId, jobId: jobId, p) }
        }
    }

    /// Another instance of an item type ("Return 4"), with its pending result.
    @discardableResult
    public static func addComponent(
        _ sync: SyncService, companyId: String, jobId: String, type: ComponentType, existing: [JobComponent]
    ) throws -> String {
        let next = nextInstance(type, existing)
        return try sync.batch { try insertComponent(sync, companyId: companyId, jobId: jobId, next) }
    }

    /// Saves an item's answer: updates its result, or creates one if it has none.
    public static func saveChecklistResult(
        _ sync: SyncService, companyId: String, jobId: String, componentId: String, existing: ChecklistItemResult?,
        _ values: Row
    ) throws {
        if let existing {
            try sync.write("checklist_item_result", id: existing.id, companyId: companyId, values)
        } else {
            var row = values
            row["job_id"] = .string(jobId)
            row["job_component_id"] = .string(componentId)
            try sync.insert("checklist_item_result", companyId: companyId, row)
        }
    }

    /// A one-tap verdict (nil clears it). "Where" is cleared unless Leaking or Attention.
    public static func setVerdict(
        _ sync: SyncService, companyId: String, jobId: String, componentId: String, existing: ChecklistItemResult?,
        verdict: Verdict?, userId: String?
    ) throws {
        var values = verdictValues(verdict, userId: userId)
        if verdict == nil || verdict == .ok || verdict == .na { values["location_text"] = .null }
        try saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: componentId, existing: existing, values)
    }

    /// Saves a test (new when `existing` is nil). Returns its id.
    @discardableResult
    public static func saveTest(
        _ sync: SyncService, companyId: String, jobId: String, existing: TestResult?, type: TestType,
        componentId: String?, data: TestData, outcome: Outcome?, notes: String
    ) throws -> String {
        var values: Row = [
            "job_component_id": componentId.map(JSONValue.string) ?? .null,
            "schema_version": .number(Double(type.schemaVersion)),
            "data": try json(data),
            "computed": try json(calculate(type, data).computed),
            "outcome": outcome.map { .string($0.rawValue) } ?? .null,
            "notes": blankToNull(notes),
        ]
        if let existing {
            try sync.write("test_result", id: existing.id, companyId: companyId, values)
            return existing.id
        }
        values["job_id"] = .string(jobId)
        values["test_type_id"] = .string(type.id)
        values["performed_at"] = nowISO()
        return try sync.insert("test_result", companyId: companyId, values)
    }

    /// Saves a finding (new when `existing` is nil). Returns its id.
    @discardableResult
    public static func saveFinding(
        _ sync: SyncService, companyId: String, jobId: String, existing: Finding?, title: String,
        componentId: String?, severityKey: String, location: String, pin: (x: Double, y: Double)?,
        status: FindingStatus, notes: String
    ) throws -> String {
        var values: Row = [
            "title": .string(title.trimmingCharacters(in: .whitespacesAndNewlines)),
            "job_component_id": componentId.map(JSONValue.string) ?? .null,
            "severity_key": .string(severityKey),
            "location_text": blankToNull(location),
            "pin_x": pin.map { .number($0.x) } ?? .null,
            "pin_y": pin.map { .number($0.y) } ?? .null,
            "status": .string(status.rawValue),
            "notes": blankToNull(notes),
        ]
        if let existing {
            try sync.write("finding", id: existing.id, companyId: companyId, values)
            return existing.id
        }
        values["job_id"] = .string(jobId)
        return try sync.insert("finding", companyId: companyId, values)
    }

    /// The pool's shape on the diagram; nil clears it.
    public static func setDiagramShape(
        _ sync: SyncService, propertyId: String, companyId: String, shape: DiagramShape?
    ) throws {
        try sync.write(
            "property", id: propertyId, companyId: companyId,
            ["diagram_shape": shape.map { .string($0.rawValue) } ?? .null])
    }

    @discardableResult
    private static func insertComponent(
        _ sync: SyncService, companyId: String, jobId: String, _ p: PlannedComponent
    ) throws -> String {
        let id = try sync.store.insert(
            "job_component", companyId: companyId,
            [
                "job_id": .string(jobId), "component_type_id": .string(p.componentTypeId),
                "instance_number": .number(Double(p.instanceNumber)), "label": .string(p.label),
                "sort_order": .number(Double(p.sortOrder)),
            ])
        try sync.store.insert(
            "checklist_item_result", companyId: companyId,
            ["job_id": .string(jobId), "job_component_id": .string(id), "status": "pending"])
        return id
    }
}

// MARK: - Helpers

/// Rounds a tap on the diagram to 4 decimals, clamped to 0…1 (fractions of the diagram, the same
/// on every screen size and on reports).
public func diagramFraction(_ value: Double) -> Double {
    (min(1, max(0, value)) * 10_000).rounded() / 10_000
}

func nowISO() -> JSONValue {
    .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000))
}

func blankToNull(_ text: String) -> JSONValue {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? .null : .string(trimmed)
}

func json<T: Encodable>(_ value: T) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
}

/// A table's rows that decode as `T`; a row that doesn't (from a newer server) is skipped.
func decodeRows<T: Decodable>(_ store: LocalStore, _ table: String, _ companyId: String, as type: T.Type) -> [T] {
    ((try? store.list(table, companyId: companyId)) ?? []).compactMap { try? JSONValue.object($0).decode(T.self) }
}

func decodeJobRows<T: Decodable>(_ store: LocalStore, _ table: String, _ jobId: String, as type: T.Type) -> [T] {
    ((try? store.list(table, jobId: jobId)) ?? []).compactMap { try? JSONValue.object($0).decode(T.self) }
}
