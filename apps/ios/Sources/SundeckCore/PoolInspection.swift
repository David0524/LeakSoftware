import Foundation

// Pool Inspection (owner, 2026-10-20; docs/plans/pool-inspection.md): a job type for leak shops
// whose checklist is Leaktronics' New Swimming Pool Inspection form, every question word for
// word, as config rows (component_type, job_type "inspection"). Port of pool-inspection.ts.
//
// Its questions are answered with one of their options ("choice"), several ("multi"), or text.
// An option's flag says what the answer means: "attention" or "leaking" (counted, and listed
// first on the report as Needs attention), "ok", or "na" (not applicable). The first question of
// a group can be a gate: an option with `fold` ("Is a perimeter fence present?" No) folds the rest
// of its group away as "Not present". Nothing is deleted; Yes opens them all again.

/// What an inspection option means.
public enum ChoiceFlag: String, Codable, Sendable {
    case ok, attention, leaking, na
}

/// One choice on an inspection question.
public struct ChoiceOption: Codable, Equatable, Hashable, Sendable {
    public var label: String
    public var flag: ChoiceFlag?
    /// Choosing it folds away the rest of the question's group.
    public var fold: Bool?

    public init(label: String, flag: ChoiceFlag? = nil, fold: Bool? = nil) {
        self.label = label
        self.flag = flag
        self.fold = fold
    }
}

/// An inspection answer: an option's label (or text), or several labels. nil is no answer.
public enum InspectionValue: Codable, Equatable, Hashable, Sendable {
    case text(String)
    case list([String])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let list = try? container.decode([String].self) {
            self = .list(list)
        } else {
            self = .text(try container.decode(String.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let s): try container.encode(s)
        case .list(let l): try container.encode(l)
        }
    }

    /// As stored in `checklist_item_result.value`.
    public var json: JSONValue {
        switch self {
        case .text(let s): .string(s)
        case .list(let l): .array(l.map { .string($0) })
        }
    }

    /// The chosen label of a choice or text answer; nil for a list.
    public var text: String? {
        if case .text(let s) = self { return s }
        return nil
    }

    /// The labels of a multi answer; empty for text.
    public var list: [String] {
        if case .list(let l) = self { return l }
        return []
    }
}

/// The eight checklist sections, one per tab of the form, in order (`INSPECTION_SECTIONS`).
public let inspectionSections: [ChecklistSection] = [
    .inspEquipment, .inspSelfCleaning, .inspHeaters, .inspElectrical, .inspFencing, .inspCovers, .inspVisual,
    .inspPlumbing,
]

/// What a folded group shows instead of its questions (`NOT_PRESENT_LABEL`).
public let notPresentLabel = "Not present"

/// Whether an answer kind is a pool inspection one (choice, multi, text).
public func isInspectionAnswer(_ answer: String?) -> Bool {
    answer == "choice" || answer == "multi" || answer == "text"
}

extension ComponentAnswer {
    /// A pool inspection question's answer kind.
    public var isInspection: Bool { self == .choice || self == .multi || self == .text }
}

/// A question's options from its row (bad or missing rows read as none).
public func choiceOptions(_ raw: JSONValue?) -> [ChoiceOption] {
    guard case .array(let items)? = raw else { return [] }
    return items.compactMap { o in
        guard case .object = o, case .string(let label)? = o["label"], !ECMA.trim(label).isEmpty else { return nil }
        let flag = o["flag"]?.string.flatMap(ChoiceFlag.init(rawValue:))
        return ChoiceOption(label: label, flag: flag, fold: o["fold"] == .bool(true) ? true : nil)
    }
}

/// A stored answer as a value: text for choice and text questions, a list for multi.
public func inspectionValue(_ answer: ComponentAnswer?, _ raw: JSONValue?) -> InspectionValue? {
    if answer == .multi {
        return .list((raw?.array ?? []).compactMap(\.string))
    }
    guard case .string(let s)? = raw, !ECMA.trim(s).isEmpty else { return nil }
    return .text(s)
}

/// The checklist row for an answer (`inspectionAnswerValues`). A choice takes its option's flag:
/// attention or leaking set the outcome, not applicable excludes the item, anything else passes.
/// A list with something picked, or text, is answered. An empty answer puts the question back to do.
public func inspectionAnswerValues(
    answer: ComponentAnswer?, options: JSONValue?, value: InspectionValue?, userId: String?, now: Date = Date()
) -> [String: JSONValue] {
    let at = JSONValue.string((try? ECMA.isoString(ECMA.milliseconds(now))) ?? "")
    let by = userId.map(JSONValue.string) ?? .null
    let blank: Bool =
        switch value {
        case nil: true
        case .list(let l)?: l.isEmpty
        case .text(let s)?: ECMA.trim(s).isEmpty
        }
    guard let value, !blank else {
        return [
            "status": "pending", "outcome": .null, "value": .null, "method": .null, "inspected_at": .null,
            "inspected_by": .null,
        ]
    }
    if answer == .choice {
        let label: String =
            switch value {
            case .text(let s): s
            case .list(let l): l.first ?? ""
            }
        let flag = choiceOptions(options).first { $0.label == label }?.flag
        if flag == .na {
            return [
                "status": "excluded", "outcome": .null, "value": .string(label), "method": .null,
                "inspected_at": at, "inspected_by": by,
            ]
        }
        return [
            "status": "inspected",
            "outcome": .string(flag == .attention || flag == .leaking ? flag!.rawValue : "ok"),
            "value": .string(label), "method": "Visual", "inspected_at": at, "inspected_by": by,
        ]
    }
    let stored: JSONValue =
        switch (answer == .multi, value) {
        case (true, .list(let l)): InspectionValue.list(l).json
        case (true, .text(let s)): .array([.string(s)])
        // `String(value).trim()`: an array joins with commas.
        case (false, .list(let l)): .string(ECMA.trim(l.joined(separator: ",")))
        case (false, .text(let s)): .string(ECMA.trim(s))
        }
    return [
        "status": "inspected", "outcome": "ok", "value": stored, "method": "Visual", "inspected_at": at,
        "inspected_by": by,
    ]
}

/// A multi answer with one label turned on or off, in the options' order.
public func toggleChoice(_ options: [ChoiceOption], _ picked: [String], _ label: String) -> [String] {
    let on = picked.contains(label) ? picked.filter { $0 != label } : picked + [label]
    let order = options.map(\.label)
    let index = { (s: String) in Double(order.firstIndex(of: s) ?? -1) }
    return ECMA.sort(on) { index($0) - index($1) }
}

/// The answer as text: "Yes", "Pool main drain, Pool skimmer", the text, or nil.
public func inspectionAnswerText(_ answer: ComponentAnswer?, _ raw: JSONValue?) -> String? {
    switch inspectionValue(answer, raw) {
    case .list(let l)?: l.isEmpty ? nil : l.joined(separator: ", ")
    case .text(let s)?: s
    case nil: nil
    }
}

/// The tone of an answer, from its option's flag.
public func inspectionTone(status: ChecklistStatus?, outcome: ChecklistOutcome?) -> VerdictTone {
    guard let status, status != .pending else { return .pending }
    if status == .excluded { return .notApplicable }
    if outcome == .leaking { return .leaking }
    if outcome == .attention { return .attention }
    return .pass
}

/// A row as the folding and progress rules read it: its section, group, options, answer, and
/// result (`FoldRow` with its result).
public struct InspectionRow: Codable, Equatable, Sendable {
    public var id: String
    public var section: String?
    public var groupLabel: String?
    public var options: JSONValue?
    public var value: JSONValue?
    public var result: ChecklistAnswer?

    public init(
        id: String, section: String?, groupLabel: String?, options: JSONValue?, value: JSONValue?,
        result: ChecklistAnswer?
    ) {
        self.id = id
        self.section = section
        self.groupLabel = groupLabel
        self.options = options
        self.value = value
        self.result = result
    }

    enum CodingKeys: String, CodingKey {
        case id, section, options, value, result
        case groupLabel = "group_label"
    }
}

/// The questions folded away by their group's gate, as ids. Rows come in checklist order; a
/// group is the run of rows with the same section and group label, and its first row is the gate
/// when one of its options folds. Ungrouped rows never fold.
public func foldedItems(_ rows: [InspectionRow]) -> Set<String> {
    var folded = Set<String>()
    var keys: [String] = []
    var groups: [String: [InspectionRow]] = [:]
    for r in rows {
        guard let group = r.groupLabel, !group.isEmpty else { continue }
        let key = "\(r.section ?? "")\u{0}\(group)"
        if groups[key] == nil { keys.append(key) }
        groups[key, default: []].append(r)
    }
    for key in keys {
        let items = groups[key] ?? []
        guard let gate = items.first, items.count > 1 else { continue }
        guard case .string(let chosen)? = gate.value, !chosen.isEmpty else { continue }
        if choiceOptions(gate.options).contains(where: { $0.fold == true && $0.label == chosen }) {
            for r in items.dropFirst() { folded.insert(r.id) }
        }
    }
    return folded
}

/// Whether a row is the gate of its group (its options fold the rest).
public func isGate(_ options: JSONValue?) -> Bool {
    choiceOptions(options).contains { $0.fold == true }
}

/// A section's progress, leaving out folded questions.
public struct InspectionProgress: Codable, Equatable, Sendable {
    public var answered: Int
    public var total: Int
    /// What's left; Complete Job counts it when the shop requires a finished checklist.
    public var toDo: Int
    public var attention: Int
    public var leaking: Int

    public init(answered: Int, total: Int, toDo: Int, attention: Int, leaking: Int) {
        self.answered = answered
        self.total = total
        self.toDo = toDo
        self.attention = attention
        self.leaking = leaking
    }
}

/// "12 of 49 answered", how many need attention or are leaking, and what's left to do.
public func inspectionProgress(_ rows: [InspectionRow], folded: Set<String>? = nil) -> InspectionProgress {
    let folded = folded ?? foldedItems(rows)
    let shown = rows.filter { !folded.contains($0.id) }
    let answered = shown.filter { $0.result != nil && $0.result?.status != .pending }.count
    return InspectionProgress(
        answered: answered, total: shown.count, toDo: shown.count - answered,
        attention: shown.filter { $0.result?.outcome == .attention }.count,
        leaking: shown.filter { $0.result?.outcome == .leaking }.count)
}

/// "12 of 49 answered", or "All answered" with what needs attention.
public func inspectionProgressText(_ p: InspectionProgress) -> String {
    if p.answered < p.total { return "\(p.answered) of \(p.total) answered" }
    let flagged = [
        p.leaking > 0 ? "\(p.leaking) leaking" : nil,
        p.attention > 0 ? "\(p.attention) need\(p.attention == 1 ? "s" : "") attention" : nil,
    ].compactMap { $0 }
    return flagged.isEmpty ? "All answered" : flagged.joined(separator: " · ")
}

/// The From the Customer questions this job type asks (`intakeQuestionsFor`), from the settings'
/// raw `intake_questions`. A question without job types is a leak detection question, as before
/// inspections.
public func intakeQuestionsFor(_ questions: [JSONValue], _ type: JobType) -> [JSONValue] {
    questions.filter { q in
        guard let raw = q["job_types"]?.array, !raw.isEmpty else { return type == .detection }
        return raw.contains(.string(type.rawValue))
    }
}

/// The checklist a job takes: its own for service visits and inspections, the leak one otherwise
/// (a repair has none of its own).
public func checklistJobType(_ type: JobType) -> JobType {
    type == .maintenance || type == .inspection ? type : .detection
}

// MARK: - Options in Settings

/// What each flag reads as in Settings (`FLAG_WORDS`), in the order they're looked for.
private let flagWords: [(ChoiceFlag, String)] = [
    (.attention, "needs attention"), (.leaking, "leaking"), (.ok, "ok"), (.na, "not applicable"),
]
private let foldWords = "folds the group"

/// A question's options as text for Settings, one per line, with what each means in brackets:
/// "No (needs attention)", "Not applicable (not applicable)", "No (folds the group)".
public func optionsToText(_ raw: JSONValue?) -> String {
    choiceOptions(raw).map { o in
        let notes = [
            o.flag.flatMap { f in f == .ok ? nil : flagWords.first { $0.0 == f }?.1 },
            o.fold == true ? foldWords : nil,
        ].compactMap { $0 }
        return notes.isEmpty ? o.label : "\(o.label) (\(notes.joined(separator: ", ")))"
    }.joined(separator: "\n")
}

/// Options typed in Settings, read back: each line a choice, its brackets saying whether it needs
/// attention, is leaking, is not applicable, or folds the group. Blank and repeated lines drop.
public func optionsFromText(_ text: String) -> [ChoiceOption] {
    var seen = Set<String>()
    // Split on U+000A only, as JavaScript does ("\r\n" is one Character in Swift).
    let lines = text.unicodeScalars.split(separator: "\n", omittingEmptySubsequences: false)
        .map { String(String.UnicodeScalarView($0)) }
    return lines.compactMap { line in
        let t = ECMA.trim(line)
        // /^(.*?)\s*\(([^()]*)\)\s*$/ on the trimmed line.
        var label = line
        var notesText = ""
        if t.hasSuffix(")"), let open = t.lastIndex(of: "(") {
            let inner = t[t.index(after: open)..<t.index(before: t.endIndex)]
            if !inner.contains(")") {
                label = String(t[..<open])
                notesText = String(inner)
            }
        }
        label = ECMA.trim(label)
        guard !label.isEmpty, !seen.contains(label), label.utf16.count <= 120 else { return nil }
        seen.insert(label)
        let notes = notesText.split(separator: ",", omittingEmptySubsequences: false).map {
            ECMA.lowercase(ECMA.trim(String($0)))
        }
        let flag = flagWords.first { $0.0 != .ok && notes.contains($0.1) }?.0
        return ChoiceOption(label: label, flag: flag, fold: notes.contains(foldWords) ? true : nil)
    }
}
