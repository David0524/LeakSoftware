import Foundation
import SundeckCore
import SundeckSync

// Pool Inspection's checklist (owner, 2026-10-20; docs/plans/pool-inspection.md): Leaktronics'
// form, every question kept, made shorter. One row per question with its answers on the row;
// Describe and photos open only when used; a gate's No folds its group away as "Not present";
// banners sit above their question, word for word. Port of apps/web/src/components/
// inspection-checklist.tsx; the rules are core's (PoolInspection.swift).

/// One pool inspection question on the Checklist, with what its row shows.
public struct InspectionQuestionRow: Identifiable, Equatable, Sendable {
    public var component: JobComponent
    public var type: ComponentType
    public var result: ChecklistItemResult?
    /// The small header above it ("Filtration System"), on its group's first row.
    public var header: String?
    /// Questions its gate's answer folded away, shown under it.
    public var foldedAway: Int

    public var id: String { component.id }
    public var label: String { component.label }
    /// Choice (one of its options), multi (several), or text.
    public var kind: ComponentAnswer { type.answer.flatMap { $0.isInspection ? $0 : nil } ?? .choice }
    public var options: [ChoiceOption] { choiceOptions(type.options) }
    public var value: InspectionValue? { inspectionValue(kind, result?.value) }
    /// The Describe box's text.
    public var notes: String { result?.notes ?? "" }
    /// The banner before it, word for word.
    public var notice: String? {
        guard let n = type.notice, !n.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return n
    }

    /// The answer in words ("Yes", "Pool main drain, Pool skimmer"), or "To do".
    public var answerText: String {
        verdictLabel(status: result?.status, outcome: result?.outcome, answer: kind, value: result?.value)
    }

    /// Whether `option` is chosen.
    public func isChosen(_ option: ChoiceOption) -> Bool {
        switch value {
        case .text(let s)?: kind == .choice && s == option.label
        case .list(let l)?: l.contains(option.label)
        case nil: false
        }
    }

    /// The answer after tapping `option`: a choice picks it, or clears it when it was chosen
    /// (the question goes back to do); a multi question turns it on or off.
    public func valueAfterTapping(_ option: ChoiceOption) -> InspectionValue? {
        if kind == .multi { return .list(toggleChoice(options, value?.list ?? [], option.label)) }
        return isChosen(option) ? nil : .text(option.label)
    }

    /// A choice question's options as icons on a phone's one-line row, or nil to use the answer
    /// pill and its menu (core `choiceIcons`; owner, 2026-10-22). Multi and text never use icons.
    public var icons: [AnswerIcon]? { kind == .choice ? choiceIcons(options) : nil }

    /// The chosen option's label, for a choice question.
    public var chosenLabel: String? { kind == .choice ? value?.text : nil }

    /// The muted line under the name: the chosen answer's word and the photo count.
    public func subline(photos: Int) -> String? {
        let parts = [
            icons != nil ? chosenLabel : nil, photos > 0 ? (photos == 1 ? "1 photo" : "\(photos) photos") : nil,
        ]
        .compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "Not present: 3 questions folded away."
    public var foldedText: String? {
        guard foldedAway > 0 else { return nil }
        return "\(notPresentLabel): \(foldedAway) \(foldedAway == 1 ? "question" : "questions") folded away."
    }
}

/// One inspection section (a tab of the form) and its questions still shown.
public struct InspectionSectionRows: Identifiable, Equatable, Sendable {
    public var section: ChecklistSection
    /// The questions shown, in checklist order: folded ones are left out.
    public var questions: [InspectionQuestionRow]
    /// Left out folded questions.
    public var progress: InspectionProgress
    /// The first section with questions left starts open; the rest are one line each.
    public var startsOpen: Bool

    public var id: String { section.rawValue }
    public var title: String { section.label }
    /// "12 of 49 answered", "All answered", "1 leaking · 2 need attention".
    public var progressText: String { inspectionProgressText(progress) }
    /// Leaking red, attention amber, still to do muted, all answered green.
    public var progressTone: ChecklistSummaryTone {
        progress.leaking > 0 ? .fail : progress.attention > 0 ? .warning : progress.toDo > 0 ? .muted : .pass
    }

    /// Whether the section shows its questions: the person's choice (nil follows `startsOpen`),
    /// and always while the checklist is in Edit.
    public func isOpen(folded: Bool?, editing: Bool) -> Bool {
        editing || !(folded ?? !startsOpen)
    }
}

/// A job's pool inspection: its sections, and its progress leaving out folded questions.
public struct InspectionChecklist: Equatable, Sendable {
    public var sections: [InspectionSectionRows]
    public var progress: InspectionProgress

    /// The job's items in the inspection sections, in checklist order. Items whose type this
    /// phone doesn't have are left out, as on the leak checklist.
    public init(config: InspectionConfig, inspection: JobInspection) {
        let items = inspection.components.enumerated()
            .compactMap { index, c in config.componentTypeById[c.componentTypeId].map { (index, c, $0) } }
            .filter { inspectionSections.contains($0.2.section ?? .other) }
            .sorted { a, b in (a.2.sortOrder, a.1.sortOrder, a.0) < (b.2.sortOrder, b.1.sortOrder, b.0) }
            .map { (component: $0.1, type: $0.2, result: inspection.resultByComponent[$0.1.id]) }
        let rows = items.map { Self.row($0.component, $0.type, $0.result) }
        let folded = foldedItems(rows)
        progress = inspectionProgress(rows, folded: folded)
        var first = true
        sections = inspectionSections.compactMap { section in
            let here = items.filter { $0.type.section == section }
            guard !here.isEmpty else { return nil }
            let questions = here.enumerated().compactMap { i, item -> InspectionQuestionRow? in
                guard !folded.contains(item.component.id) else { return nil }
                let group = item.type.groupLabel.flatMap { $0.isEmpty ? nil : $0 }
                let header = group != nil && group != (i > 0 ? here[i - 1].type.groupLabel : nil) ? group : nil
                let away =
                    isGate(item.type.options)
                    ? here.filter { folded.contains($0.component.id) && $0.type.groupLabel == item.type.groupLabel }
                        .count : 0
                return InspectionQuestionRow(
                    component: item.component, type: item.type, result: item.result, header: header, foldedAway: away)
            }
            let p = inspectionProgress(here.map { Self.row($0.component, $0.type, $0.result) }, folded: folded)
            let open = first && p.toDo > 0
            if open { first = false }
            return InspectionSectionRows(section: section, questions: questions, progress: p, startsOpen: open)
        }
    }

    public var isEmpty: Bool { sections.isEmpty }

    /// The line under "Checklist": "12 of 49 answered · 1 needs attention", zero counts left out.
    public var tallyText: String { inspectionTallyText(progress) }

    static func row(_ c: JobComponent, _ t: ComponentType, _ r: ChecklistItemResult?) -> InspectionRow {
        InspectionRow(
            id: c.id, section: t.section?.rawValue, groupLabel: t.groupLabel, options: t.options, value: r?.value,
            result: r.map { ChecklistAnswer(status: $0.status, outcome: $0.outcome) })
    }
}

/// Checklist items still to do: for a pool inspection, its questions left leaving out folded
/// ones (`inspectionProgress().toDo`); otherwise its pending results. The Checklist's badge and
/// Complete Job's "finish the checklist first" both count this.
public func checklistToDo(config: InspectionConfig, inspection: JobInspection, jobType: JobType) -> Int {
    jobType == .inspection
        ? InspectionChecklist(config: config, inspection: inspection).progress.toDo
        : checklistTally(inspection.components, inspection.results).pending
}

/// Checklist items marked needs attention, the Checklist tab's badge (owner, 2026-10-26: a badge
/// counts what needs action, not every unanswered item). A pool inspection leaves out folded
/// questions.
public func checklistAttention(config: InspectionConfig, inspection: JobInspection, jobType: JobType) -> Int {
    jobType == .inspection
        ? InspectionChecklist(config: config, inspection: inspection).progress.attention
        : checklistTally(inspection.components, inspection.results).attention
}

/// The pool inspection's writes, on top of `InspectionWrites`. Each goes through the sync layer.
@MainActor
extension InspectionWrites {
    /// A pool inspection answer: an option, several, or text (nil or blank puts the question back
    /// to do). The question's own options decide the outcome (`inspectionAnswerValues`).
    public static func setAnswer(
        _ sync: SyncService, companyId: String, jobId: String, question: InspectionQuestionRow,
        value: InspectionValue?, userId: String?
    ) throws {
        let values = inspectionAnswerValues(
            answer: question.kind, options: question.type.options, value: value, userId: userId)
        try saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: question.component.id, existing: question.result,
            values)
    }

    /// A text answer, saved when its box loses focus; nothing when it didn't change.
    public static func saveTextAnswer(
        _ sync: SyncService, companyId: String, jobId: String, question: InspectionQuestionRow, draft: String,
        userId: String?
    ) throws {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != (question.value?.text ?? "") else { return }
        try setAnswer(
            sync, companyId: companyId, jobId: jobId, question: question, value: .text(draft), userId: userId)
    }

    /// A question's Describe box (its notes), saved when it loses focus; nothing when it didn't
    /// change. Blank saves as null.
    public static func saveNotes(
        _ sync: SyncService, companyId: String, jobId: String, question: InspectionQuestionRow, draft: String
    ) throws {
        let value = blankToNull(draft)
        guard value != (question.result?.notes.map(blankToNull) ?? .null) else { return }
        try saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: question.component.id, existing: question.result,
            ["notes": value])
    }
}
