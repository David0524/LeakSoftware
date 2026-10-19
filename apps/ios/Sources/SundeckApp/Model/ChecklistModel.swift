import Foundation
import Observation
import SundeckCore
import SundeckSync

/// One item on the Checklist tab, with what its row shows. Port of ChecklistItem in
/// apps/mobile/src/features/inspection/ChecklistTab.tsx.
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
}

/// A checklist section and its items, in checklist order.
public struct ChecklistSectionRows: Identifiable, Equatable, Sendable {
    public var section: ChecklistSection
    public var items: [ChecklistItemRow]

    public var id: String { section.rawValue }
    public var title: String { section.label }
}

/// "Where" shows for Leaking and Attention on items that aren't yes/no.
func needsWhereField(_ type: ComponentType, _ verdict: Verdict?) -> Bool {
    type.answer != .yesNo && (verdict == .leaking || verdict == .attention)
}

/// What the Checklist tab shows for one job, worked out from the shop's setup and the job's rows.
public struct ChecklistModel: Equatable, Sendable {
    /// Sections in this fixed order. "service" is the pool service checklist (maintenance visits).
    public static let sectionOrder: [ChecklistSection] = [.service, .visual, .plumbing, .bondBeam, .other]

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

    /// The line over the sections, in maintenance or leak words.
    public var tallyText: String { Self.tallyText(tally, jobType: jobType) }

    public static func tallyText(_ t: ChecklistTally, jobType: JobType) -> String {
        jobType == .maintenance
            ? "\(t.pass) done · \(t.attention) need attention · \(t.notApplicable) skipped · \(t.pending) to do"
            : "\(t.pass) pass · \(t.attention) attention · \(t.leaking) leaking · \(t.notApplicable) N/A · \(t.pending) to do"
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

/// The checklist tab's writes, on top of `InspectionWrites`.
@MainActor
extension InspectionWrites {
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

/// The checklist item screen's form: Result, Where and Notes, saved only on Save. Port of
/// apps/mobile/src/app/(app)/jobs/[id]/component/[componentId].tsx.
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
    }

    public var options: [VerdictOption] { verdictOptions(type.answer) }
    public var needsWhere: Bool { needsWhereField(type, verdict) }

    /// What Save writes: the verdict, "where" only when it applies, and the notes.
    public func values(userId: String?, now: Date = Date()) -> Row {
        var values = verdictValues(verdict, userId: userId, now: now)
        values["location_text"] = needsWhere ? blankToNull(location) : .null
        values["notes"] = blankToNull(notes)
        return values
    }

    public func save(_ sync: SyncService, userId: String?) throws {
        try InspectionWrites.saveChecklistResult(
            sync, companyId: companyId, jobId: jobId, componentId: component.id, existing: result,
            values(userId: userId))
    }
}
