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

/// "1 needs attention", "2 need attention".
public func needAttentionText(_ n: Int) -> String {
    "\(n) need\(n == 1 ? "s" : "") attention"
}

/// The line under a pool inspection's Checklist heading: "12 of 49 answered", then what needs
/// attention or is leaking, each only when there is some (owner, 2026-10-26: no zero counts).
public func inspectionTallyText(_ p: InspectionProgress) -> String {
    [
        "\(p.answered) of \(p.total) answered",
        p.attention > 0 ? needAttentionText(p.attention) : nil,
        p.leaking > 0 ? "\(p.leaking) leaking" : nil,
    ].compactMap { $0 }.joined(separator: " · ")
}

/// The line under a leak or maintenance checklist's heading: the counts that aren't zero.
/// Maintenance: done, needs attention, skipped, to do. Leak detection: not leaking, attention,
/// leaking, not applicable, to do. `pending: false` leaves out "to do". Empty when every count is
/// zero.
public func checklistTallyText(_ t: ChecklistTally, maintenance: Bool, pending: Bool = true) -> String {
    var parts: [String?] =
        maintenance
        ? [
            t.pass > 0 ? "\(t.pass) done" : nil,
            t.attention > 0 ? needAttentionText(t.attention) : nil,
            t.notApplicable > 0 ? "\(t.notApplicable) skipped" : nil,
        ]
        : [
            t.pass > 0 ? "\(t.pass) not leaking" : nil,
            t.attention > 0 ? "\(t.attention) attention" : nil,
            t.leaking > 0 ? "\(t.leaking) leaking" : nil,
            t.notApplicable > 0 ? "\(t.notApplicable) not applicable" : nil,
        ]
    if pending && t.pending > 0 { parts.append("\(t.pending) to do") }
    return parts.compactMap { $0 }.joined(separator: " · ")
}
