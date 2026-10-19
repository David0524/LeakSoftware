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

    /// Why an item was left out ("Covered by deck"), shown under its row.
    public var exclusionText: String? {
        guard result?.status == .excluded, let reason = result?.exclusionReason, !reason.isEmpty else { return nil }
        return reason
    }
}

/// How a checklist section's summary reads: muted while items are to do, else the worst news.
public enum ChecklistSummaryTone: Equatable, Sendable {
    case muted, pass, warning, fail
}

/// A checklist section and its items, in checklist order.
public struct ChecklistSectionRows: Identifiable, Equatable, Sendable {
    public var section: ChecklistSection
    public var items: [ChecklistItemRow]

    public var id: String { section.rawValue }
    public var title: String { section.label }

    /// Items not answered yet.
    public var toDo: [ChecklistItemRow] { items.filter { $0.verdict == nil } }
    var leaking: Int { items.filter { $0.verdict == .leaking }.count }
    var attention: Int { items.filter { $0.verdict == .attention }.count }

    /// The header's summary: "3 of 9 to do", "All clear", "1 leaking · 1 attention"; on the
    /// service checklist "All done" or "2 need attention".
    public var summary: String {
        let toDo = toDo.count
        if toDo > 0 { return "\(toDo) of \(items.count) to do" }
        if section == .service {
            return attention > 0 ? "\(attention) need\(attention == 1 ? "s" : "") attention" : "All done"
        }
        if leaking > 0 || attention > 0 {
            return [leaking > 0 ? "\(leaking) leaking" : nil, attention > 0 ? "\(attention) attention" : nil]
                .compactMap { $0 }.joined(separator: " · ")
        }
        return "All clear"
    }

    /// Green means all clear; attention alone is the warning color (spec decision 10).
    public var summaryTone: ChecklistSummaryTone {
        if !toDo.isEmpty { return .muted }
        if leaking > 0 { return .fail }
        return attention > 0 ? .warning : .pass
    }

    /// Open while it has items to do.
    public var startsOpen: Bool { !toDo.isEmpty }

    /// The action under the items while any are to do.
    public var markRemainingTitle: String? {
        let rest = toDo
        guard !rest.isEmpty else { return nil }
        if rest.allSatisfy({ $0.type.answer == .yesNo }) { return "Answer \(rest.count) Remaining No" }
        if rest.allSatisfy({ $0.type.answer == .done }) { return "Mark \(rest.count) Remaining Done" }
        return "Mark \(rest.count) Remaining Not Leaking"
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
    /// "Add an item": active types not on the job yet, for this kind of job and this pool.
    public var missing: [ComponentType]

    public init(config: InspectionConfig, inspection: JobInspection, jobType: JobType, property: Property?) {
        self.jobType = jobType
        isEmpty = inspection.components.isEmpty
        tally = checklistTally(inspection.components, inspection.results)
        let checklistType: JobType = jobType == .maintenance ? .maintenance : .detection

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
        missing = config.componentTypes.filter { t in
            !inspection.components.contains { $0.componentTypeId == t.id }
                && (t.jobType ?? .detection) == checklistType
                && (property.map { componentApplies(t, $0) } ?? true)
        }
    }

    /// "Add an item": another of each type on the list that repeats, then the missing types.
    public var addOptions: [ChecklistAddOption] {
        var seen = Set<String>()
        let repeatable = sections.flatMap(\.items).map(\.type).filter {
            $0.allowsMultiple && seen.insert($0.id).inserted
        }
        return repeatable.map { ChecklistAddOption(type: $0, label: "Another \($0.name)") }
            + missing.map { ChecklistAddOption(type: $0, label: $0.name) }
    }

    /// The line under "Checklist", in maintenance or leak words.
    public var tallyText: String { Self.tallyText(tally, jobType: jobType) }

    public static func tallyText(_ t: ChecklistTally, jobType: JobType) -> String {
        jobType == .maintenance
            ? "\(t.pass) done · \(t.attention) need attention · \(t.notApplicable) skipped · \(t.pending) to do"
            : "\(t.pass) not leaking · \(t.attention) attention · \(t.leaking) leaking · \(t.notApplicable) not applicable · \(t.pending) to do"
    }

    /// The pool the default checklist is planned for: the job's property, or a pool without a
    /// spa when the property isn't on this phone (as in Expo).
    public static func planningProperty(_ property: Property?) -> Property {
        if let property { return property }
        let row: JSONValue = ["address_line1": "", "has_pool": true, "has_spa": false, "pool_type": nil]
        return (try? row.decode(Property.self))!
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
    /// "Mark 4 Remaining Not Leaking": every item still to do answered OK, in one batch.
    public static func markRemaining(
        _ sync: SyncService, companyId: String, jobId: String, items: [ChecklistItemRow], userId: String?
    ) throws {
        let rest = items.filter { $0.verdict == nil }
        guard !rest.isEmpty else { return }
        var values = verdictValues(.ok, userId: userId)
        values["location_text"] = .null
        try sync.batch {
            for item in rest {
                if let result = item.result {
                    try sync.store.write("checklist_item_result", id: result.id, companyId: companyId, values)
                } else {
                    var row = values
                    row["job_id"] = .string(jobId)
                    row["job_component_id"] = .string(item.component.id)
                    try sync.store.insert("checklist_item_result", companyId: companyId, row)
                }
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

/// The checklist item screen's form: Result, Where, Method, Exclusion reason and Notes, saved only
/// on Save. Port of apps/mobile/src/app/(app)/jobs/[id]/component/[componentId].tsx, with what the
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
        verdict = currentVerdict(status: result?.status, outcome: result?.outcome)
        location = result?.locationText ?? ""
        notes = result?.notes ?? ""
        method = result?.method ?? ""
        exclusionReason = result?.exclusionReason ?? ""
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
    }
}

/// The shop's exclusion reasons ("Covered by deck"), active ones in order (`exclusion_reason`).
public func exclusionReasons(_ store: LocalStore, companyId: String) -> [String] {
    ((try? store.list("exclusion_reason", companyId: companyId)) ?? [])
        .filter { $0["active"]?.bool ?? true }
        .sorted { ($0["sort_order"]?.number ?? 0) < ($1["sort_order"]?.number ?? 0) }
        .compactMap { $0["label"]?.string }
}
