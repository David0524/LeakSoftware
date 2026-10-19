// A checklist section's header line and its "mark the rest" action. Port of checklist-summary.ts.

/// The color a checklist section's summary is drawn in.
public enum ChecklistSummaryTone: String, Codable, Equatable, Sendable {
    case muted, pass, fail, warning
}

public struct ChecklistSectionSummary: Codable, Equatable, Sendable {
    public var text: String
    public var tone: ChecklistSummaryTone
    /// Items not answered yet.
    public var toDo: Int
    /// Whether the section starts unfolded.
    public var open: Bool
}

/// The part of a result the summary reads (nil: no result row yet).
public struct ChecklistAnswer: Codable, Equatable, Sendable {
    public var status: ChecklistStatus
    public var outcome: ChecklistOutcome?

    public init(status: ChecklistStatus, outcome: ChecklistOutcome?) {
        self.status = status
        self.outcome = outcome
    }
}

/// The one-line summary at the right of a checklist section's header (design spec 5.4): "2 of 9
/// to do", "All clear", "1 leaking", "1 attention", "1 leaking · 1 attention"; on a pool service
/// list "All done" or "1 needs attention". Attention is warning-colored, not green (spec decision
/// 10); anything leaking is red.
public func checklistSectionSummary(_ items: [ChecklistAnswer?], service: Bool = false) -> ChecklistSectionSummary {
    let toDo = items.filter { currentVerdict(status: $0?.status, outcome: $0?.outcome) == nil }.count
    let leaking = items.filter { $0?.outcome == .leaking }.count
    let attention = items.filter { $0?.outcome == .attention }.count
    if toDo > 0 { return .init(text: "\(toDo) of \(items.count) to do", tone: .muted, toDo: toDo, open: true) }
    if service {
        return attention > 0
            ? .init(
                text: "\(attention) need\(attention == 1 ? "s" : "") attention", tone: .warning, toDo: toDo,
                open: false)
            : .init(text: "All done", tone: .pass, toDo: toDo, open: false)
    }
    if leaking > 0 || attention > 0 {
        let text = [leaking > 0 ? "\(leaking) leaking" : nil, attention > 0 ? "\(attention) attention" : nil]
            .compactMap { $0 }.joined(separator: " · ")
        return .init(text: text, tone: leaking > 0 ? .fail : .warning, toDo: toDo, open: false)
    }
    return .init(text: "All clear", tone: .pass, toDo: toDo, open: false)
}

/// The "mark the rest" action under a section's items: "Answer 3 Remaining No" for yes/no items,
/// "Mark 3 Remaining Done" for pool service items, else "Mark 3 Remaining Not Leaking".
public func markRemainingLabel(_ answers: [ComponentAnswer?]) -> String {
    let n = answers.count
    if answers.allSatisfy({ $0 == .yesNo }) { return "Answer \(n) Remaining No" }
    if answers.allSatisfy({ $0 == .done }) { return "Mark \(n) Remaining Done" }
    return "Mark \(n) Remaining Not Leaking"
}
