import Foundation
import Observation
import SundeckCore
import SundeckSync

/// One item on the Checklist section, with what its row shows. Port of ChecklistItem in
/// apps/web/src/components/job-work.tsx.
public struct ChecklistItemRow: Identifiable, Equatable, Sendable {
    public var component: JobComponent
    public var type: ComponentType
    public var result: ChecklistItemResult?
    /// "+ Add" sits on the last item of a type that can repeat, not on its own row.
    public var addsAnother: Bool

    public var id: String { component.id }
    public var verdict: Verdict? { currentVerdict(status: result?.status, outcome: result?.outcome) }
    /// Maintenance items are just done or not: a check, no choices (owner, 2026-10-18).
    public var isCheck: Bool { type.answer == .done }
    public var isDone: Bool { verdict == .ok }
    public var options: [VerdictOption] { verdictOptions(type.answer) }
    /// "Where" only for Leaking and Attention, never on yes/no items.
    public var needsWhere: Bool { needsWhereField(type, verdict) }

    /// The answer after tapping a segment (owner, 2026-10-20): tapping the chosen one again
    /// clears it, back to To do.
    public func verdictAfterTap(_ tapped: Verdict) -> Verdict? { tapped == verdict ? nil : tapped }

    /// The verdict pill's word: "To Do", or the chosen option's label.
    public var verdictLabel: String {
        verdict.flatMap { v in options.first { $0.value == v }?.label } ?? "To Do"
    }

    /// The muted line under the name: "{n} photos" (apps only), then the method and notes on a
    /// leak item, or a maintenance item's other answer ("Skipped") and notes.
    public func subline(photos: Int) -> String? {
        let first: String? =
            isCheck
            ? (verdict != nil && verdict != .ok ? verdictLabel : nil)
            : result?.method
        let parts = [photos > 0 ? (photos == 1 ? "1 photo" : "\(photos) photos") : nil, first, result?.notes]
            .compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Each answer's icon on a phone's one-line row (owner, 2026-10-22), in `options` order:
    /// leaks ✓ drop ! –, maintenance ✓ ! ⏭, yes/no ✗ ✓ – (core `verdictIcon`).
    public var answerIcons: [AnswerIcon] { options.map { verdictIcon(type.answer, $0.value) } }

    /// The phone row's muted line (owner, 2026-10-22): the chosen answer's word first, so the
    /// icons are learnable ("Leaking · 1 photo · Visual"), then photos, the method and notes.
    public func phoneSubline(photos: Int) -> String? {
        let parts = [
            verdict != nil ? verdictLabel : nil, photos > 0 ? (photos == 1 ? "1 photo" : "\(photos) photos") : nil,
            isCheck ? nil : result?.method, result?.notes,
        ]
        .compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Put on this visit by the plan's scheduled cleaning (`job_component.plan_cleaning_id`).
    public var fromPlan: Bool { component.planCleaningId != nil }

    /// Remove (core `removeItemConfirm`): any item can go (owner, 2026-10-19). Nothing asks first
    /// since 2026-10-26: its `message`, for a scheduled cleaning, is the note under the "Item
    /// removed" banner (it goes on the next visit).
    public var removeConfirm: RemoveItemConfirm { removeItemConfirm(component.label, fromPlan: fromPlan) }

    /// Why an item was left out ("Covered by deck"), shown under its row.
    public var exclusionText: String? {
        guard result?.status == .excluded, let reason = result?.exclusionReason, !reason.isEmpty else { return nil }
        return reason
    }
}

/// A checklist section and its items, in checklist order.
public struct ChecklistSectionRows: Identifiable, Equatable, Sendable {
    public var section: ChecklistSection
    public var items: [ChecklistItemRow]

    public var id: String { section.rawValue }
    public var title: String { section.label }

    /// Items not answered yet.
    public var toDo: [ChecklistItemRow] { items.filter { $0.verdict == nil } }

    /// The header's summary (`checklistSectionSummary`): "3 of 9 to do", "All clear", "1 leaking ·
    /// 1 attention"; on the service checklist "All done" or "2 need attention".
    public var header: ChecklistSectionSummary {
        checklistSectionSummary(
            items.map { $0.result.map { ChecklistAnswer(status: $0.status, outcome: $0.outcome) } },
            service: section == .service)
    }

    public var summary: String { header.text }
    /// Green means all clear; attention is the warning color (spec decision 10).
    public var summaryTone: ChecklistSummaryTone { header.tone }
    /// Open while it has items to do.
    public var startsOpen: Bool { header.open }

    /// Whether the section shows its items: the person's choice (nil follows `startsOpen`), and
    /// always while the checklist is in Edit, so each item shows its Remove button.
    public func isOpen(folded: Bool?, editing: Bool) -> Bool {
        editing || !(folded ?? !startsOpen)
    }

    /// The action under the items while any are to do (`markRemainingLabel`).
    public var markRemainingTitle: String? {
        let rest = toDo
        return rest.isEmpty ? nil : markRemainingLabel(rest.map(\.type.answer))
    }
}

/// One choice in "Add an item": another of a type that repeats, or a type not on the list yet.
public struct ChecklistAddOption: Identifiable, Equatable, Sendable {
    public var type: ComponentType
    /// "Another Return", or the type's name.
    public var label: String

    public var id: String { type.id }
}

/// "Where" shows for Leaking and Attention on items that aren't yes/no.
func needsWhereField(_ type: ComponentType, _ verdict: Verdict?) -> Bool {
    type.answer != .yesNo && (verdict == .leaking || verdict == .attention)
}

/// What the Checklist tab shows for one job, worked out from the shop's setup and the job's rows.
public struct ChecklistModel: Equatable, Sendable {
    /// Sections in the website's order (`CHECKLIST_SECTION_LABELS`). "service" is the pool service
    /// checklist (maintenance visits).
    public static let sectionOrder: [ChecklistSection] = [.visual, .plumbing, .bondBeam, .other, .service]

    public var jobType: JobType
    /// No items yet: the tab offers Set Up Checklist.
    public var isEmpty: Bool
    public var tally: ChecklistTally
    public var sections: [ChecklistSectionRows]
    /// A pool inspection's eight sections (they have their own rows; `sections` leaves them out).
    public var inspection: InspectionChecklist
    /// "Add an item": active types not on the job yet, for this kind of job and this pool.
    public var missing: [ComponentType]
    /// Add Item: the shop's stand-in type for typing an item in, on a leak detection or visit
    /// checklist (nil: not offered).
    public var customType: ComponentType?

    public init(config: InspectionConfig, inspection: JobInspection, jobType: JobType, property: Property?) {
        self.jobType = jobType
        isEmpty = inspection.components.isEmpty
        tally = checklistTally(inspection.components, inspection.results)
        self.inspection = InspectionChecklist(config: config, inspection: inspection)
        let checklistType = checklistJobType(jobType)

        // Items whose type this phone doesn't have are left out (Expo renders nothing for them).
        let typed = inspection.components.enumerated().compactMap { index, c in
            config.componentTypeById[c.componentTypeId].map { (index, c, $0) }
        }
        sections = Self.sectionOrder.compactMap { section in
            let items = typed.filter { ($0.2.section ?? .other) == section }
                .sorted { a, b in
                    (a.2.sortOrder, a.1.sortOrder, a.0) < (b.2.sortOrder, b.1.sortOrder, b.0)
                }
            guard !items.isEmpty else { return nil }
            let rows = items.enumerated().map { i, item in
                let last = i + 1 == items.count || items[i + 1].1.componentTypeId != item.1.componentTypeId
                return ChecklistItemRow(
                    component: item.1, type: item.2, result: inspection.resultByComponent[item.1.id],
                    addsAnother: last && item.2.allowsMultiple)
            }
            return ChecklistSectionRows(section: section, items: rows)
        }
        customType =
            takesCustomItems(jobType)
            ? customItemType(Array(config.componentTypeById.values), checklistType) : nil
        missing = config.componentTypes.filter { t in
            !inspection.components.contains { $0.componentTypeId == t.id }
                && (t.jobType ?? .detection) == checklistType
                && (property.map { componentApplies(t, $0) } ?? true)
        }
    }

    /// Edit sits over the checklist once it has items (owner, 2026-10-19).
    public var canEdit: Bool { !sections.isEmpty || !inspection.isEmpty }

    /// "Add an item": another of each type on the list that repeats, then the missing types.
    public var addOptions: [ChecklistAddOption] {
        var seen = Set<String>()
        let repeatable = sections.flatMap(\.items).map(\.type).filter {
            $0.allowsMultiple && !isCustomItemType($0) && seen.insert($0.id).inserted
        }
        return repeatable.map { ChecklistAddOption(type: $0, label: "Another \($0.name)") }
            + missing.map { ChecklistAddOption(type: $0, label: $0.name) }
    }

    /// The line under "Checklist", in maintenance, leak, or pool inspection words (an inspection
    /// counts only the questions its gates leave open).
    public var tallyText: String {
        jobType == .inspection ? inspection.tallyText : Self.tallyText(tally, jobType: jobType)
    }

    public static func tallyText(_ t: ChecklistTally, jobType: JobType) -> String {
        checklistTallyText(t, maintenance: jobType == .maintenance)
    }

    /// The pool the default checklist is planned for: the job's property, or a pool without a
    /// spa when the property isn't on this phone (as in Expo).
    public static func planningProperty(_ property: Property?) -> Property {
        if let property { return property }
        let row: JSONValue = ["address_line1": "", "has_pool": true, "has_spa": false, "pool_type": nil]
        return (try? row.decode(Property.self))!
    }

    /// The items in checklist order, for the item page's Previous Item and Next Item.
    public var itemIds: [String] { sections.flatMap { $0.items.map(\.id) } }

    /// The items before and after `componentId` on the checklist (nil at either end).
    public func neighbors(of componentId: String) -> (previous: String?, next: String?) {
        let ids = itemIds
        guard let index = ids.firstIndex(of: componentId) else { return (nil, nil) }
        return (index > 0 ? ids[index - 1] : nil, index + 1 < ids.count ? ids[index + 1] : nil)
    }

    /// The "where" to save when the field loses focus, or nil when nothing changed (or the item
    /// has no result row yet). Blank saves as null.
    public static func whereToSave(draft: String?, result: ChecklistItemResult?) -> JSONValue? {
        guard let result, let draft, draft != (result.locationText ?? "") else { return nil }
        return blankToNull(draft)
    }
}

/// The checklist section's writes, on top of `InspectionWrites`.
@MainActor
extension InspectionWrites {
    /// "Mark 4 Remaining Not Leaking": every item still to do answered OK, in one batch. Returns
    /// the results it answered, for Undo (owner, 2026-10-20).
    @discardableResult
    public static func markRemaining(
        _ sync: SyncService, companyId: String, jobId: String, items: [ChecklistItemRow], userId: String?
    ) throws -> [String] {
        let rest = items.filter { $0.verdict == nil }
        guard !rest.isEmpty else { return [] }
        var values = verdictValues(.ok, userId: userId)
        values["location_text"] = .null
        return try sync.batch {
            try rest.map { item in
                if let result = item.result {
                    try sync.store.write("checklist_item_result", id: result.id, companyId: companyId, values)
                    return result.id
                }
                var row = values
                row["job_id"] = .string(jobId)
                row["job_component_id"] = .string(item.component.id)
                return try sync.store.insert("checklist_item_result", companyId: companyId, row)
            }
        }
    }

    /// Saves an item's "where" when its field loses focus; does nothing when it didn't change.
    public static func saveWhere(
        _ sync: SyncService, companyId: String, jobId: String, componentId: String, result: ChecklistItemResult?,
        draft: String?
    ) throws {
        guard let value = ChecklistModel.whereToSave(draft: draft, result: result) else { return }
        try saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: componentId, existing: result,
            ["location_text": value])
    }
}

/// The checklist item screen's form: Result, Where, Method, Exclusion reason and Notes, saved by
/// Save, or by themselves (`saveChanges`) after typing stops and when the item is left. Port of apps/mobile/src/app/(app)/jobs/[id]/component/[componentId].tsx, with what the
/// website's row has no room for on a phone (spec 5.4).
@MainActor @Observable
public final class ComponentForm {
    public let companyId: String
    public let jobId: String
    public let component: JobComponent
    public let type: ComponentType
    /// The item's result row now (kept current by the screen), so Save updates it, never a second one.
    public var result: ChecklistItemResult?

    public var verdict: Verdict?
    public var location: String
    public var notes: String
    /// How it was checked (one of the type's methods), blank for none.
    public var method: String
    /// Why it was left out, when the answer is N/A; blank for none.
    public var exclusionReason: String

    public init(
        companyId: String, jobId: String, component: JobComponent, type: ComponentType, result: ChecklistItemResult?
    ) {
        self.companyId = companyId
        self.jobId = jobId
        self.component = component
        self.type = type
        self.result = result
        let saved = Fields(result)
        baseline = saved
        verdict = saved.verdict
        location = saved.location
        notes = saved.notes
        method = saved.method
        exclusionReason = saved.exclusionReason
    }

    /// The form's fields as the phone has them saved.
    private struct Fields: Equatable {
        var verdict: Verdict?
        var location: String
        var notes: String
        var method: String
        var exclusionReason: String

        init(_ result: ChecklistItemResult?) {
            verdict = currentVerdict(status: result?.status, outcome: result?.outcome)
            location = result?.locationText ?? ""
            notes = result?.notes ?? ""
            method = result?.method ?? ""
            exclusionReason = result?.exclusionReason ?? ""
        }

        init(verdict: Verdict?, location: String, notes: String, method: String, exclusionReason: String) {
            self.verdict = verdict
            self.location = location
            self.notes = notes
            self.method = method
            self.exclusionReason = exclusionReason
        }
    }

    /// What the fields were last loaded or saved as: what's changed since is the tech's.
    private var baseline: Fields

    private var current: Fields {
        Fields(verdict: verdict, location: location, notes: notes, method: method, exclusionReason: exclusionReason)
    }

    /// Something was changed on the page and isn't saved yet (saved by itself when the item is
    /// left, owner 2026-10-20).
    public var isDirty: Bool { current != baseline }

    /// The item's row changed (a sync, the checklist, Undo): fields the tech hasn't touched follow
    /// it, so saving never puts back an old answer and text typed again saves (apps/mobile
    /// `rebase`).
    public func refresh(_ newResult: ChecklistItemResult?) {
        result = newResult
        let saved = Fields(newResult)
        if verdict == baseline.verdict { verdict = saved.verdict }
        if location == baseline.location { location = saved.location }
        if notes == baseline.notes { notes = saved.notes }
        if method == baseline.method { method = saved.method }
        if exclusionReason == baseline.exclusionReason { exclusionReason = saved.exclusionReason }
        baseline = saved
    }

    /// Saves only what was changed on the page (the answer with its stamps, or the text), so
    /// notes saved by themselves never overwrite an answer given elsewhere. Returns whether
    /// anything was written.
    @discardableResult
    public func saveChanges(_ sync: SyncService, userId: String?, now: Date = Date()) throws -> Bool {
        let was = baseline
        let changed = current
        guard changed != was else { return false }
        let all = values(userId: userId, now: now)
        var keys: Set<String> = []
        if changed.verdict != was.verdict {
            keys.formUnion(["status", "outcome", "inspected_at", "inspected_by", "location_text", "exclusion_reason"])
        }
        if changed.location != was.location { keys.insert("location_text") }
        if changed.notes != was.notes { keys.insert("notes") }
        if changed.method != was.method { keys.insert("method") }
        if changed.exclusionReason != was.exclusionReason { keys.insert("exclusion_reason") }
        try InspectionWrites.saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: component.id, existing: result,
            all.filter { keys.contains($0.key) })
        baseline = changed
        return true
    }

    /// The methods to choose from: blank first, then the type's, and the saved one if it's gone.
    public var methodChoices: [String] {
        var out = [""] + type.methods
        if !method.isEmpty, !out.contains(method) { out.append(method) }
        return out
    }

    /// Exclusion reasons only make sense for N/A.
    public var asksExclusion: Bool { verdict == .na }

    public var options: [VerdictOption] { verdictOptions(type.answer) }
    public var needsWhere: Bool { needsWhereField(type, verdict) }

    /// What Save writes: the verdict, "where" only when it applies, and the notes.
    public func values(userId: String?, now: Date = Date()) -> Row {
        var values = verdictValues(verdict, userId: userId, now: now)
        values["location_text"] = needsWhere ? blankToNull(location) : .null
        values["notes"] = blankToNull(notes)
        values["method"] = blankToNull(method)
        values["exclusion_reason"] = asksExclusion ? blankToNull(exclusionReason) : .null
        return values
    }

    public func save(_ sync: SyncService, userId: String?) throws {
        try InspectionWrites.saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: component.id, existing: result,
            values(userId: userId))
        baseline = current
    }
}

/// The shop's exclusion reasons ("Covered by deck"), active ones in order (`exclusion_reason`).
public func exclusionReasons(_ store: LocalStore, companyId: String) -> [String] {
    ((try? store.list("exclusion_reason", companyId: companyId)) ?? [])
        .filter { $0["active"]?.bool ?? true }
        .sorted { ($0["sort_order"]?.number ?? 0) < ($1["sort_order"]?.number ?? 0) }
        .compactMap { $0["label"]?.string }
}
