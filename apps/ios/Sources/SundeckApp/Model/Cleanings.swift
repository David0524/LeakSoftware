import Foundation
import SundeckCore
import SundeckSync

// Filter, salt cell and replace-filter cleanings (owner, 2026-10-19). A plan's scheduled
// cleanings (`plan_cleaning`) sync to phones (migration 20261012005800): Today's pills, the
// visit's Regular cleanings and the customer's Maintenance lines read them as the website does.
// Until a phone has them, the visit's own checklist items a cleaning put there
// (`job_component.plan_cleaning_id`, due on that visit) stand in.

/// A cleaning on this visit's checklist.
public struct VisitCleaning: Identifiable, Equatable, Sendable {
    /// The checklist item's id.
    public var id: String
    /// The item type's name ("Clean filter").
    public var name: String
    public var kind: CleaningKind
    /// "Due today": the server puts a cleaning on the visit it's due.
    public var due: CleaningCountdown
}

/// The words, as on the website.
public enum CleaningText {
    public static let title = "Regular cleanings"
    public static let onVisit = "On this visit’s checklist"
    public static let today = "Today"

    /// Beside the icon on a Today card: "Today", "3 days", "Overdue" (core `cleaningShortLabel`).
    public static func short(_ c: VisitCleaning) -> String { cleaningShortLabel(c.due) }
    /// What VoiceOver reads: "Clean filter due today" (core `cleaningDueSpoken`).
    public static func spoken(_ c: VisitCleaning) -> String { cleaningDueSpoken(c.name, c.due) }
    /// Overdue shows in the fail color, the rest muted.
    public static func isOverdue(_ c: VisitCleaning) -> Bool { c.due.days < 0 }
    /// VoiceOver's prefix on a stop's access notes (the key icon says it on screen).
    public static func accessSpoken(_ notes: String) -> String { "Access: \(notes)" }
}

/// One of a plan's scheduled cleanings, with its checklist item type's name.
public struct PlanCleaningRow: Identifiable, Equatable, Sendable {
    public var id: String
    public var planId: String
    /// The type's name ("Clean filter"), or "Cleaning".
    public var name: String
    public var kind: CleaningKind
    public var everyMonths: Int
    /// "2026-11-30".
    public var nextDue: String
    /// When it was last done (for Replace filter, the filter's age).
    public var lastDoneOn: String?
    public var priceCents: Cents?
}

/// The plans' cleanings on this phone (not deleted), by the type's checklist order.
public func planCleanings(_ store: LocalStore, companyId: String, planIds: Set<String>) -> [PlanCleaningRow] {
    guard !planIds.isEmpty else { return [] }
    let types = Dictionary(
        ((try? store.list("component_type", companyId: companyId, includeDeleted: true)) ?? []).map { ($0.id, $0) },
        uniquingKeysWith: { a, _ in a })
    let rows = ((try? store.list("plan_cleaning", companyId: companyId)) ?? []).filter {
        $0["deleted_at"]?.string == nil && planIds.contains($0["service_plan_id"]?.string ?? "")
    }
    return
        rows
        .sorted {
            let a = types[$0["component_type_id"]?.string ?? ""]?["sort_order"]?.number ?? 0
            let b = types[$1["component_type_id"]?.string ?? ""]?["sort_order"]?.number ?? 0
            return (a, $0.id) < (b, $1.id)
        }
        .compactMap { row -> PlanCleaningRow? in
            guard let plan = row["service_plan_id"]?.string, let due = row["next_due"]?.string else { return nil }
            let type = types[row["component_type_id"]?.string ?? ""]
            let key = type?["key"]?.string
            let typeName = type?["name"]?.string
            return PlanCleaningRow(
                id: row.id, planId: plan, name: typeName ?? "Cleaning", kind: cleaningKind(key: key, name: typeName),
                everyMonths: Int(row["every_months"]?.number ?? 3), nextDue: String(due.prefix(10)),
                lastDoneOn: row["last_done_on"]?.string.map { String($0.prefix(10)) },
                priceCents: row["price_cents"]?.number.map { Int($0) })
        }
}

/// Today's pills for one stop: the plan's cleanings on its checklist (`onVisit`, by plan
/// cleaning id), with how each stands against its due date (website today/page.tsx `dueAt`;
/// owner, 2026-10-20: what Today shows is what the checklist has).
public func stopCleanings(_ cleanings: [PlanCleaningRow], onVisit: Set<String>, visitDay: String) -> [VisitCleaning] {
    cleanings.filter { onVisit.contains($0.id) }.compactMap { c in
        guard let due = cleaningCountdown(c.nextDue, visitDay) else { return nil }
        return VisitCleaning(id: c.id, name: c.name, kind: c.kind, due: due)
    }
}

/// A cleaning a plan put on a visit's checklist, for Schedule (owner, 2026-10-20: "The
/// filter/salt cells don't show up on the dates they're due").
public struct ScheduledCleaning: Equatable, Sendable {
    public var name: String
    public var kind: CleaningKind
}

/// The plan cleanings on these visits' checklists (job_component rows with plan_cleaning_id),
/// by job, in checklist order (website `visitCleanings`).
public func scheduledCleanings(_ store: LocalStore, companyId: String, jobIds: Set<String>)
    -> [String: [ScheduledCleaning]]
{
    guard !jobIds.isEmpty else { return [:] }
    let types = Dictionary(
        ((try? store.list("component_type", companyId: companyId, includeDeleted: true)) ?? []).map { ($0.id, $0) },
        uniquingKeysWith: { a, _ in a })
    var out: [String: [ScheduledCleaning]] = [:]
    let rows = ((try? store.list("job_component", companyId: companyId)) ?? []).filter {
        $0["plan_cleaning_id"]?.string != nil && $0["deleted_at"]?.string == nil
            && jobIds.contains($0["job_id"]?.string ?? "")
    }
    for row in rows.sorted(by: { ($0["sort_order"]?.number ?? 0) < ($1["sort_order"]?.number ?? 0) }) {
        guard let job = row["job_id"]?.string else { continue }
        let type = types[row["component_type_id"]?.string ?? ""]
        let name = type?["name"]?.string ?? row["label"]?.string ?? "Cleaning"
        out[job, default: []].append(
            ScheduledCleaning(name: name, kind: cleaningKind(key: type?["key"]?.string, name: name)))
    }
    return out
}

/// One row of a visit's Regular cleanings (website jobs/[id]/page.tsx `Cleanings`).
public struct RegularCleaning: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var kind: CleaningKind
    /// "On this visit’s checklist", or "Every 3 months · next Mon, Nov 30"; a replace filter
    /// adds the filter's age.
    public var detail: String
    /// "Today" on this visit, else the countdown ("In 6 weeks").
    public var value: String
    /// Due within a week: the value is semibold in the warning color.
    public var soon: Bool
}

/// The visit's plan's cleanings: on this visit's checklist (`onVisit`, by plan cleaning id) or
/// when they're next due.
public func regularCleanings(_ cleanings: [PlanCleaningRow], onVisit: Set<String>, visitDay: String)
    -> [RegularCleaning]
{
    cleanings.map { c in
        let due = cleaningCountdown(c.nextDue, visitDay)
        let on = onVisit.contains(c.id)
        let next = (try? formatDay(c.nextDue, style: .short)) ?? c.nextDue
        let detail = [
            on ? CleaningText.onVisit : "\(cleaningCadence(c.everyMonths)) · next \(next)",
            c.kind == .filterReplace ? filterAge(c.lastDoneOn, visitDay) : nil,
        ]
        .compactMap { $0 }.joined(separator: " · ")
        return RegularCleaning(
            id: c.id, name: c.name, kind: c.kind, detail: detail,
            value: on ? CleaningText.today : due?.label ?? "", soon: due?.soon ?? false)
    }
}

/// Stand-in rows from the visit's checklist, before the plan's cleanings reach this phone.
public func regularCleanings(fromChecklist cleanings: [VisitCleaning]) -> [RegularCleaning] {
    cleanings.map {
        RegularCleaning(
            id: $0.id, name: $0.name, kind: $0.kind, detail: CleaningText.onVisit, value: CleaningText.today,
            soon: $0.due.soon)
    }
}

/// A cleaning under a plan on the customer's Maintenance (website maintenance-plans.tsx):
/// "Clean filter every 3 months · $40.00 each · " then "In 6 weeks" (semibold warning when
/// soon), then " (Mon, Nov 30)" and a replace filter's " · Filter 8 months old".
public struct PlanCleaningLine: Identifiable, Equatable, Sendable {
    public var id: String
    public var kind: CleaningKind
    public var summary: String
    public var due: String
    public var soon: Bool
    public var after: String

    /// The whole line, for VoiceOver.
    public var text: String { "\(summary) · \(due)\(after)" }

    public init(_ c: PlanCleaningRow, today: String) {
        id = c.id
        kind = c.kind
        summary = cleaningSummary(c.name, everyMonths: c.everyMonths, priceCents: c.priceCents)
        let countdown = cleaningCountdown(c.nextDue, today)
        due = countdown?.label ?? ""
        soon = countdown?.soon ?? false
        var after = ""
        if let countdown, countdown.days > 0, let day = try? formatDay(c.nextDue, style: .short) { after = " (\(day))" }
        if c.kind == .filterReplace, let age = filterAge(c.lastDoneOn, today) { after += " · \(age)" }
        self.after = after
    }
}

/// A visit's Regular cleanings: its plan's cleanings when this phone has them, else the ones on
/// its checklist. `day` is the visit's day (`plan_date`, else today).
public func visitRegularCleanings(
    _ store: LocalStore, companyId: String, job: Row, _ insp: JobInspection, _ config: InspectionConfig, day: String
) -> [RegularCleaning] {
    if let plan = job["service_plan_id"]?.string {
        let rows = planCleanings(store, companyId: companyId, planIds: [plan])
        if !rows.isEmpty {
            let onVisit = Set(insp.components.compactMap(\.planCleaningId))
            return regularCleanings(rows, onVisit: onVisit, visitDay: day)
        }
    }
    return regularCleanings(fromChecklist: visitCleanings(insp, config, day: day))
}

/// The cleanings on a visit's checklist, in checklist order.
public func visitCleanings(_ insp: JobInspection, _ config: InspectionConfig, day: String) -> [VisitCleaning] {
    let due =
        cleaningCountdown(day, day)
        ?? CleaningCountdown(days: 0, weeks: 0, soon: true, label: "Due today")
    return insp.components.compactMap { c in
        guard c.planCleaningId != nil else { return nil }
        let type = config.componentTypeById[c.componentTypeId]
        let name = type?.name ?? (c.label.isEmpty ? "Cleaning" : c.label)
        return VisitCleaning(id: c.id, name: name, kind: cleaningKind(key: type?.key, name: name), due: due)
    }
}

/// The cleaning icons from the website (apps/web/src/components/icons.tsx), in a 24-unit box
/// with a 1.8 stroke: a pleated cartridge for filters, a tube with a spark for salt cells, two
/// arrows in a circle for anything else. Rounded rectangles as (x, y, width, height, radius).
public struct CleaningGlyph: Equatable, Sendable {
    public var rects: [[Double]]
    public var paths: [String]

    public static func of(_ kind: CleaningKind) -> CleaningGlyph {
        switch kind {
        case .filter: CleaningGlyph(rects: [[6, 3, 12, 18, 3]], paths: ["M10 7v10M14 7v10"])
        // A new cartridge with an arrow going in (NewFilterIcon).
        case .filterReplace:
            CleaningGlyph(rects: [[9, 6, 10, 15, 2.5]], paths: ["M12.5 10v7M15.5 10v7M3 4h6M6 1v6"])
        case .saltCell: CleaningGlyph(rects: [[2.5, 8, 19, 8, 4]], paths: ["m13 9.5-2.5 3h3L11 15"])
        case .other:
            CleaningGlyph(
                rects: [], paths: ["M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5", "M5 3v4h4M19 21v-4h-4"])
        }
    }
}
