import Foundation
import SundeckCore
import SundeckSync

// Tests and findings on a job: the editors' form state, what the tabs list, the pool diagram's
// pins and outline. Ports of apps/mobile/src/features/inspection/{TestsTab,FindingsTab}.tsx,
// apps/mobile/src/app/(app)/jobs/[id]/(edit)/{test/[testId],finding/[findingId]}.tsx and
// apps/mobile/src/ui/{PoolDiagram,ShapePicker}.tsx. SwiftUI-free so it's tested on Linux.

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
    public let type: TestType
    public let existingId: String?
    public var componentId: String?
    public var values: [String: String]
    /// The tech's pick; nil follows the calculator's suggestion.
    public var chosenOutcome: Outcome?
    public var notes: String
    public private(set) var errors: [String: String] = [:]
    private let initial: Snapshot

    private struct Snapshot: Equatable, Sendable {
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
        initial = Snapshot(componentId: self.componentId, values: values, chosenOutcome: chosenOutcome, notes: notes)
    }

    public var isNew: Bool { existingId == nil }

    /// Anything changed since the sheet opened: Cancel asks first, and a swipe can't close it.
    public var isDirty: Bool {
        Snapshot(componentId: componentId, values: values, chosenOutcome: chosenOutcome, notes: notes) != initial
    }

    var data: TestData { values.mapValues { TestValue.string($0) } }

    /// The live calculator result.
    public var calculation: Calculation { calculate(type, data) }

    /// The outcome the segmented control shows: the tech's pick, else the suggestion.
    public var outcome: Outcome? { chosenOutcome ?? calculation.suggested }

    /// "Suggested: pass" under the result.
    public var suggestedText: String? { calculation.suggested.map { "Suggested: \($0.label.lowercased())" } }

    /// The tech picked something other than the suggestion: ask for a note.
    public var changedSuggestion: Bool {
        guard let chosenOutcome, let suggested = calculation.suggested else { return false }
        return chosenOutcome != suggested
    }

    public var discardTitle: String { isNew ? "Discard this test?" : "Discard your changes?" }

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

/// The Status segments, in the Expo app's order.
public let findingStatusChoices: [FindingStatus] = [.open, .monitor, .quoted, .repaired]

/// The Add/Edit Finding form.
public struct FindingForm: Equatable, Sendable {
    public let existingId: String?
    public var title: String
    public var componentId: String?
    /// The severity's key; blank until picked (no default).
    public var severity: String
    public var location: String
    public var pin: DiagramPoint?
    public var status: FindingStatus
    public var notes: String
    public private(set) var errors: [String: String] = [:]
    private let initial: Snapshot

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
    /// Status is set on existing findings only; a new one is open.
    public var showsStatus: Bool { !isNew }
    public var navigationTitle: String { isNew ? "New Finding" : "Finding" }
    public var discardTitle: String { isNew ? "Discard this finding?" : "Discard your changes?" }
    public var pinHint: String { pin == nil ? "Tap where the leak is." : "Tap again to move the pin." }

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

/// One row on the Tests tab.
public struct TestRowItem: Identifiable, Equatable, Sendable {
    public var id: String
    /// "Pressure test · Return 1".
    public var title: String
    /// The calculator's summary, else the observation.
    public var detail: String?
    public var outcome: Outcome?
}

/// The Tests tab's rows, in the order the tests were done.
public func testRows(_ insp: JobInspection, _ config: InspectionConfig) -> [TestRowItem] {
    insp.tests.map { test in
        let type = config.testTypeById[test.testTypeId]
        let component = test.jobComponentId.flatMap { insp.componentById[$0] }
        // JavaScript's `a ?? b`: only a missing or null value falls through.
        let named = [test.data["line_name"], test.data["location"]].compactMap { $0 }.first { $0 != .null }
        let place = named.flatMap(testValueText) ?? component?.label ?? ""
        let summary = type.flatMap { calculate($0, test.data).summary }
        let detail = summary ?? test.data["observation"].flatMap(testValueText)
        return TestRowItem(
            id: test.id, title: (type?.name ?? "Test") + (place.isEmpty ? "" : " · \(place)"),
            detail: detail?.isEmpty == true ? nil : detail, outcome: test.outcome)
    }
}

/// One numbered row on the Findings tab.
public struct FindingRowItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var number: Int
    public var title: String
    /// "Major · Return 3 · Deep end · Not pinned", parts left out when blank.
    public var subtitle: String
    /// The severity's hex color; nil draws it in the fail color.
    public var color: String?
}

/// The Findings tab's rows, numbered in the order they were made.
public func findingRows(_ insp: JobInspection, _ config: InspectionConfig) -> [FindingRowItem] {
    insp.findings.enumerated().map { i, finding in
        let severity = config.severityByKey[finding.severityKey]
        let component = finding.jobComponentId.flatMap { insp.componentById[$0] }
        let parts: [String?] = [
            severity?.name, component?.label, finding.locationText, finding.pinX == nil ? "Not pinned" : nil,
        ]
        return FindingRowItem(
            id: finding.id, number: i + 1, title: finding.title,
            subtitle: parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
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

/// The editor's pins: other findings grey and unlabelled, this one in its severity's color with "!".
public func editorPins(_ insp: JobInspection, _ config: InspectionConfig, form: FindingForm) -> [DiagramPin] {
    var pins: [DiagramPin] = insp.findings.compactMap { finding in
        guard finding.id != form.existingId, let x = finding.pinX, let y = finding.pinY else { return nil }
        return DiagramPin(id: finding.id, point: DiagramPoint(x: x, y: y), tint: .other, label: "")
    }
    if let pin = form.pin {
        pins.append(
            DiagramPin(
                id: "this", point: pin, tint: .severity(config.severityByKey[form.severity]?.color), label: "!",
                active: true))
    }
    return pins
}

/// What VoiceOver reads for the diagram's pins: "Pin 1, Pin 2", or "No pins". In the editor, "!"
/// is this finding and unlabelled pins are other findings.
public func pinSummary(_ pins: [DiagramPin]) -> String {
    pins.isEmpty
        ? "No pins"
        : pins.map {
            $0.label == "!" ? "This finding’s pin" : $0.label.isEmpty ? "Another finding’s pin" : "Pin \($0.label)"
        }.joined(separator: ", ")
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

/// The shape picker's hint while no shape is picked.
public let shapeNotPickedHint = "Not picked yet. Pick one so the diagram matches the pool."

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
