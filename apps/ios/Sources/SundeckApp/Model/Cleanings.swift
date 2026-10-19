import Foundation
import SundeckCore
import SundeckSync

// Filter and salt cell cleanings on a visit (owner, 2026-10-19). Phones don't sync a plan's
// scheduled cleanings (`plan_cleaning`), so this reads only what's on the phone: the visit's
// own checklist items that a cleaning put there (`job_component.plan_cleaning_id`). Those are
// due on that visit. Website: the job page's Regular cleanings and the Today pill.

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

    /// The Today card's pill: "Clean filter: due today".
    public static func pill(_ c: VisitCleaning) -> String { "\(c.name): \(c.due.label.lowercased())" }
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
        case .saltCell: CleaningGlyph(rects: [[2.5, 8, 19, 8, 4]], paths: ["m13 9.5-2.5 3h3L11 15"])
        case .other:
            CleaningGlyph(
                rects: [], paths: ["M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5", "M5 3v4h4M19 21v-4h-4"])
        }
    }
}
