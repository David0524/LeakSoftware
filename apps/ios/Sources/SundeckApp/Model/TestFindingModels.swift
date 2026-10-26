import Foundation
import SundeckCore
import SundeckSync

// Tests and findings on a job: the editors' form state, what the Findings section lists, the pool
// diagram's pins and outline. Ports of TestsEditor, FindingsEditor and their sheets in
// apps/web/src/components/job-work.tsx, and apps/web/src/components/{pool-diagram,shape-picker}.tsx
// (spec 5.4, 6.1, 6.2, 3.18). SwiftUI-free so it's tested on Linux.

// MARK: - Outcomes

extension Outcome {
    /// The chip's and segment's word ("inconclusive" reads "Unclear").
    public var label: String {
        switch self {
        case .pass: "Pass"
        case .fail: "Fail"
        case .inconclusive: "Unclear"
        }
    }
}

/// A form value as JavaScript's `String(value)` writes it; nil for a blank (null) value.
func testValueText(_ value: TestValue) -> String? {
    switch value {
    case .null: return nil
    case .string(let s): return s
    case .number(let n):
        if n.isFinite, n == n.rounded(), abs(n) < 1e15 { return String(Int64(n)) }
        return "\(n)"
    }
}

// MARK: - Test editor

/// The Add/Edit Test form: values typed as text, the component, the chosen outcome and notes.
public struct TestForm: Equatable, Sendable {
    public private(set) var type: TestType
    public private(set) var existingId: String?
    public var componentId: String?
    public var values: [String: String]
    /// The tech's pick; nil follows the calculator's suggestion.
    public var chosenOutcome: Outcome?
    public var notes: String
    public private(set) var errors: [String: String] = [:]
    private var initial: Snapshot

    private struct Snapshot: Equatable, Sendable {
        var typeId: String
        var componentId: String?
        var values: [String: String]
        var chosenOutcome: Outcome?
        var notes: String
    }

    /// `component` is the checklist item the test was started from (new tests only): a pressure
    /// test started from it names the line after it.
    public init(type: TestType, existing: TestResult?, componentId: String?, component: JobComponent?) {
        self.type = type
        existingId = existing?.id
        self.componentId = existing?.jobComponentId ?? componentId
        var values: [String: String] = [:]
        for (key, value) in existing?.data ?? [:] { values[key] = testValueText(value) ?? "" }
        if existing == nil, let component { values["line_name"] = component.label }
        self.values = values
        chosenOutcome = existing?.outcome
        notes = existing?.notes ?? ""
        initial = Snapshot(
            typeId: type.id, componentId: self.componentId, values: values, chosenOutcome: chosenOutcome, notes: notes)
    }

    /// A new test's "Test" select: another type clears what was typed (as on the website).
    public mutating func changeType(_ newType: TestType) {
        guard isNew, newType.id != type.id else { return }
        type = newType
        values = [:]
        chosenOutcome = nil
        errors = [:]
    }

    public var isNew: Bool { existingId == nil }

    private var snapshot: Snapshot {
        Snapshot(typeId: type.id, componentId: componentId, values: values, chosenOutcome: chosenOutcome, notes: notes)
    }

    /// Anything changed since the sheet opened: Cancel asks first, and a swipe can't close it.
    public var isDirty: Bool { snapshot != initial }

    /// Add Photo on a test not saved yet saves it first (owner, 2026-10-20): the sheet stays
    /// open as Edit, with nothing left unsaved.
    public mutating func markSaved(_ id: String) {
        existingId = id
        initial = snapshot
    }

    var data: TestData { values.mapValues { TestValue.string($0) } }

    /// The live calculator result; a reading that fails the checks counts as blank.
    public var calculation: Calculation { previewTest(type, data) }

    /// The outcome the segmented control shows: the tech's pick, else the suggestion.
    public var outcome: Outcome? { chosenOutcome ?? calculation.suggested }

    /// "Suggested: pass" under the result.
    public var suggestedText: String? { calculation.suggested.map { "Suggested: \($0.label.lowercased())" } }

    /// The tech picked something other than the suggestion: ask for a note.
    public var changedSuggestion: Bool {
        guard let chosenOutcome, let suggested = calculation.suggested else { return false }
        return chosenOutcome != suggested
    }

    /// Cancel with changes asks this (spec 3.15).
    public var discardTitle: String { DiscardText.title }

    /// The sheet's title: "Add Test", or "Edit Pressure Test" with the type's name.
    public var sheetTitle: String { isNew ? "Add Test" : "Edit \(type.name)" }
    /// The sheet's main button.
    public var submitTitle: String { isNew ? "Add Test" : "Save Test" }

    /// The "Result" choices: nil follows the calculation, then the type's results.
    public var resultChoices: [Outcome?] { [nil] + type.resultOptions.map { Optional($0) } }

    /// A result choice's words: "Use the calculation (Fail)" or "Not decided" for nil.
    public func resultLabel(_ choice: Outcome?) -> String {
        if let choice { return choice.label }
        return calculation.suggested.map { "Use the calculation (\($0.label))" } ?? "Not decided"
    }

    /// The form's fields in runs: a long-text field gets its own block, the fields between share one.
    public var groups: [[TestField]] {
        var out: [[TestField]] = []
        for field in type.fieldSchema.fields {
            if field.type == .textarea || out.isEmpty || out[out.count - 1][0].type == .textarea {
                out.append([field])
            } else {
                out[out.count - 1].append(field)
            }
        }
        return out
    }

    /// The component picker sits in its own block when the form starts with a long-text field
    /// (or has no fields), else at the top of the first block.
    public var componentAlone: Bool { groups.first?.first?.type == .textarea || groups.isEmpty }

    /// "Start pressure (PSI)".
    public static func label(_ field: TestField) -> String {
        if let unit = field.unit, !unit.isEmpty { return "\(field.label) (\(unit))" }
        return field.label
    }

    /// Checks the form and keeps the errors for the fields to show. True when it can be saved.
    public mutating func validate() -> Bool {
        errors = validateTestData(type.fieldSchema, data)
        return errors.isEmpty
    }

    /// What's stored: numbers as numbers, blanks as null, text trimmed.
    public var normalizedData: TestData { normalizeTestData(type.fieldSchema, data) }

    /// Validates, then saves (new tests get `performed_at`). Returns the test's id, or nil
    /// when a field needs fixing.
    @MainActor
    public mutating func save(_ sync: SyncService, companyId: String, jobId: String, existing: TestResult?)
        throws -> String?
    {
        guard validate() else { return nil }
        return try InspectionWrites.saveTest(
            sync, companyId: companyId, jobId: jobId, existing: existing, type: type, componentId: componentId,
            data: normalizedData, outcome: outcome, notes: notes)
    }
}

// MARK: - Finding editor

/// A spot on the diagram, as fractions (0…1) of its width and height.
public struct DiagramPoint: Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// The Status segments, in the website's order (`FINDING_STATUS_LABELS`).
public let findingStatusChoices: [FindingStatus] = [.open, .quoted, .repaired, .monitor]

/// The Add/Edit Finding form.
public struct FindingForm: Equatable, Sendable {
    public private(set) var existingId: String?
    public var title: String
    public var componentId: String?
    /// The severity's key; blank until picked (no default).
    public var severity: String
    public var location: String
    public var pin: DiagramPoint?
    public var status: FindingStatus
    public var notes: String
    public private(set) var errors: [String: String] = [:]
    private var initial: Snapshot

    private struct Snapshot: Equatable, Sendable {
        var title: String
        var componentId: String?
        var severity: String
        var location: String
        var pin: DiagramPoint?
        var status: FindingStatus
        var notes: String
    }

    public init(existing: Finding?, componentId: String?) {
        existingId = existing?.id
        title = existing?.title ?? ""
        self.componentId = existing?.jobComponentId ?? componentId
        severity = existing?.severityKey ?? ""
        location = existing?.locationText ?? ""
        if let x = existing?.pinX, let y = existing?.pinY { pin = DiagramPoint(x: x, y: y) }
        status = existing?.status ?? .open
        notes = existing?.notes ?? ""
        initial = Snapshot(
            title: title, componentId: self.componentId, severity: severity, location: location, pin: pin,
            status: status, notes: notes)
    }

    private var snapshot: Snapshot {
        Snapshot(
            title: title, componentId: componentId, severity: severity, location: location, pin: pin, status: status,
            notes: notes)
    }

    public var isNew: Bool { existingId == nil }
    public var isDirty: Bool { snapshot != initial }

    /// Add Photo on a finding not saved yet saves it first (owner, 2026-10-20): the sheet stays
    /// open as Edit Finding, with nothing left unsaved.
    public mutating func markSaved(_ id: String) {
        existingId = id
        initial = snapshot
    }
    /// Status shows on every finding, new ones too (as on the website); a new one starts open.
    public var showsStatus: Bool { true }
    public var navigationTitle: String { isNew ? "Add Finding" : "Edit Finding" }
    public var submitTitle: String { isNew ? "Add Finding" : "Save Finding" }
    public var discardTitle: String { DiscardText.title }
    public var pinHint: String { "Tap where the leak is." }
    /// Under the diagram: "Pin placed." (with Clear Pin) or "No pin yet."
    public var pinStatus: String { pin == nil ? "No pin yet." : "Pin placed." }

    /// A tap on the diagram, as fractions of its size (rounded to 4 decimals, clamped).
    public mutating func place(x: Double, y: Double) {
        pin = DiagramPoint(x: diagramFraction(x), y: diagramFraction(y))
    }

    public mutating func validate() -> Bool {
        errors = validateFinding(title: title, severityKey: severity)
        return errors.isEmpty
    }

    /// Validates, then saves. Returns the finding's id, or nil when a field needs fixing.
    @MainActor
    public mutating func save(_ sync: SyncService, companyId: String, jobId: String, existing: Finding?) throws
        -> String?
    {
        guard validate() else { return nil }
        return try InspectionWrites.saveFinding(
            sync, companyId: companyId, jobId: jobId, existing: existing, title: title, componentId: componentId,
            severityKey: severity, location: location, pin: pin.map { (x: $0.x, y: $0.y) }, status: status,
            notes: notes)
    }
}

// MARK: - Tabs

/// One row of the Findings section's Tests list, as the website shows it.
public struct TestRowItem: Identifiable, Equatable, Sendable {
    public struct FieldLine: Equatable, Sendable {
        public var label: String
        public var value: String
    }

    public var id: String
    /// The test type's name ("Pressure test").
    public var name: String
    /// "Skimmer · Today 9:40 AM": the item and when it was done, either left out when missing.
    public var meta: String?
    /// The calculator's summary ("Dropped 8 PSI in 15 min").
    public var summary: String?
    /// Each recorded field of a test without a calculator ("Result: No draw").
    public var fields: [FieldLine]
    public var notes: String?
    public var outcome: Outcome?
}

/// The Tests list, in the order the tests were done.
public func testRows(_ insp: JobInspection, _ config: InspectionConfig, now: Date, timeZone: String) -> [TestRowItem] {
    insp.tests.map { test in
        let type = config.testTypeById[test.testTypeId]
        let component = test.jobComponentId.flatMap { insp.componentById[$0] }
        let when = test.performedAt.flatMap { try? formatSchedule($0, now, timeZone) }
        let meta = [component?.label, when].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let fields: [TestRowItem.FieldLine] =
            type.map { type in
                guard type.calculator == nil else { return [] }
                return type.fieldSchema.fields.compactMap { field in
                    guard let value = test.data[field.key].flatMap(testValueText), !value.isEmpty else { return nil }
                    return TestRowItem.FieldLine(label: field.label, value: value)
                }
            } ?? []
        return TestRowItem(
            id: test.id, name: type?.name ?? "Test", meta: meta.isEmpty ? nil : meta,
            summary: type.flatMap { calculate($0, test.data).summary }, fields: fields,
            notes: test.notes.flatMap { $0.isEmpty ? nil : $0 }, outcome: test.outcome)
    }
}

/// One numbered row of the Findings list.
public struct FindingRowItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var number: Int
    public var title: String
    /// "Major · Return 3 · Open · Pinned on the diagram", parts left out when blank.
    public var subtitle: String
    /// Where it is ("Skimmer throat").
    public var location: String?
    public var notes: String?
    /// The severity's hex color; nil draws it in the fail color.
    public var color: String?
}

/// The Findings list, numbered in the order they were made.
public func findingRows(_ insp: JobInspection, _ config: InspectionConfig) -> [FindingRowItem] {
    insp.findings.enumerated().map { i, finding in
        let severity = config.severityByKey[finding.severityKey]
        let component = finding.jobComponentId.flatMap { insp.componentById[$0] }
        let parts: [String?] = [
            severity?.name ?? finding.severityKey, component?.label, finding.status.label,
            finding.pinX != nil ? "Pinned on the diagram" : nil,
        ]
        return FindingRowItem(
            id: finding.id, number: i + 1, title: finding.title,
            subtitle: parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
            location: finding.locationText.flatMap { $0.isEmpty ? nil : $0 },
            notes: finding.notes.flatMap { $0.isEmpty ? nil : $0 },
            color: severity?.color.flatMap { $0.isEmpty ? nil : $0 })
    }
}

// MARK: - Pins

/// A pin's color: a severity's (its hex, else the fail color), or the grey of another finding.
public enum PinTint: Equatable, Sendable {
    case severity(String?)
    case other
}

/// A pin on the diagram.
public struct DiagramPin: Identifiable, Equatable, Sendable {
    public var id: String
    public var point: DiagramPoint
    public var tint: PinTint
    public var label: String
    /// The pin being placed or edited (drawn a little bigger).
    public var active: Bool = false
}

/// The Findings tab's pins: every pinned finding, numbered like its row.
public func findingPins(_ insp: JobInspection, _ config: InspectionConfig) -> [DiagramPin] {
    insp.findings.enumerated().compactMap { i, finding in
        guard let x = finding.pinX, let y = finding.pinY else { return nil }
        return DiagramPin(
            id: finding.id, point: DiagramPoint(x: x, y: y),
            tint: .severity(config.severityByKey[finding.severityKey]?.color), label: String(i + 1))
    }
}

/// The editor's pin: this finding's alone, in the chosen severity's color, unlabelled (as the
/// website's pin picker draws it).
public func editorPins(_ config: InspectionConfig, form: FindingForm) -> [DiagramPin] {
    form.pin.map {
        [
            DiagramPin(
                id: editorPinId, point: $0, tint: .severity(config.severityByKey[form.severity]?.color), label: "",
                active: true)
        ]
    } ?? []
}

/// The id of the pin being placed in the editor.
public let editorPinId = "this"

/// What VoiceOver reads for the diagram's pins: "Pin 1, Pin 2", or "No pins"; in the editor,
/// "This finding’s pin".
public func pinSummary(_ pins: [DiagramPin]) -> String {
    pins.isEmpty
        ? "No pins"
        : pins.map { $0.id == editorPinId ? "This finding’s pin" : "Pin \($0.label)" }.joined(separator: ", ")
}

/// A severity's `#RRGGBB` (or `#RGB`) as red, green and blue from 0 to 1; nil when it isn't one.
public func hexRGB(_ hex: String) -> (red: Double, green: Double, blue: Double)? {
    var text = hex.trimmingCharacters(in: .whitespaces)
    if text.hasPrefix("#") { text.removeFirst() }
    if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
    guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
    return (
        Double((value >> 16) & 0xFF) / 255, Double((value >> 8) & 0xFF) / 255, Double(value & 0xFF) / 255
    )
}

// MARK: - Pool shape

/// The property's pool shape; nil when not picked (or one this app doesn't know).
public func diagramShape(of property: Row?) -> DiagramShape? {
    property?["diagram_shape"]?.string.flatMap(DiagramShape.init(rawValue:))
}

/// The property's diagram layout (mirror, the spa's place, size, and shape); empty when unset.
public func diagramLayout(of property: Row?) -> DiagramLayout {
    parseDiagramLayout(property?["diagram_layout"])
}

/// The shape picker's hint while no shape is picked.
public let shapeNotPickedHint = "Pick one so the diagram matches the pool."

/// Tapping a shape picks it; tapping the picked one clears it.
public func shapeAfterTap(current: DiagramShape?, tapped: DiagramShape) -> DiagramShape? {
    current == tapped ? nil : tapped
}

// MARK: - SVG paths

/// One drawing command of a pool outline, in absolute coordinates.
public enum PathCommand: Equatable, Sendable {
    case move(Double, Double)
    case line(Double, Double)
    case quad(Double, Double, Double, Double)
    case cubic(Double, Double, Double, Double, Double, Double)
    case close
}

/// Parses the SVG path commands the core's pool outlines use (M, L, H, V, Q, C, Z, and their
/// relative forms), into absolute commands.
public func parseSVGPath(_ d: String) -> [PathCommand] {
    // Tokens: command letters and numbers.
    var items: [(command: Character?, number: Double?)] = []
    var current = ""
    func flush() {
        if !current.isEmpty, let n = Double(current) { items.append((nil, n)) }
        current = ""
    }
    for ch in d {
        if ch.isLetter && ch != "e" && ch != "E" {
            flush()
            items.append((ch, nil))
        } else if ch == "-" && !current.isEmpty && current.last != "e" && current.last != "E" {
            flush()
            current = "-"
        } else if ch == "." && current.contains(".") {
            flush()
            current = "."
        } else if ch.isNumber || ch == "." || ch == "-" || ch == "e" || ch == "E" {
            current.append(ch)
        } else {
            flush()
        }
    }
    flush()

    var out: [PathCommand] = []
    var x = 0.0
    var y = 0.0
    var startX = 0.0
    var startY = 0.0
    var i = 0
    var command: Character = "M"
    func next() -> Double? {
        guard i < items.count, let n = items[i].number else { return nil }
        i += 1
        return n
    }
    while i < items.count {
        if let c = items[i].command {
            command = c
            i += 1
            if c == "Z" || c == "z" {
                out.append(.close)
                x = startX
                y = startY
                continue
            }
        }
        let relative = command.isLowercase
        let dx = relative ? x : 0
        let dy = relative ? y : 0
        switch command.uppercased() {
        case "M":
            guard let a = next(), let b = next() else { return out }
            x = a + dx
            y = b + dy
            startX = x
            startY = y
            out.append(.move(x, y))
            command = relative ? "l" : "L"  // more pairs after M are lines
        case "L":
            guard let a = next(), let b = next() else { return out }
            x = a + dx
            y = b + dy
            out.append(.line(x, y))
        case "H":
            guard let a = next() else { return out }
            x = a + dx
            out.append(.line(x, y))
        case "V":
            guard let b = next() else { return out }
            y = b + dy
            out.append(.line(x, y))
        case "Q":
            guard let a = next(), let b = next(), let c = next(), let e = next() else { return out }
            out.append(.quad(a + dx, b + dy, c + dx, e + dy))
            x = c + dx
            y = e + dy
        case "C":
            guard let a = next(), let b = next(), let c = next(), let e = next(), let f = next(), let g = next()
            else { return out }
            out.append(.cubic(a + dx, b + dy, c + dx, e + dy, f + dx, g + dy))
            x = f + dx
            y = g + dy
        default:
            return out  // a command these outlines don't use
        }
    }
    return out
}

// MARK: - The pool, from the finding sheet

@MainActor
extension InspectionWrites {
    /// The finding sheet's "Has a spa" switch: saved at once, and the diagram redraws.
    public static func setHasSpa(_ sync: SyncService, propertyId: String, companyId: String, hasSpa: Bool) throws {
        try sync.write("property", id: propertyId, companyId: companyId, ["has_spa": .bool(hasSpa)])
    }
}
