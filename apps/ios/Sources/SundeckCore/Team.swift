import Foundation

// Team colors, the Team list's order, and moving a plan visit (owner, 2026-10-20,
// docs/design/2026-10-20-team-week.md sections 2, 3 and 5), plus the Maps wording (section 4).
// Port of team.ts and routing.ts's MAPS_LABELS. Pure.

/// A tech's color: a key of the palette (brand/tokens.json › color.tech).
public enum TechColor: String, CaseIterable, Codable, Hashable, Sendable {
    case blue, green, orange, purple, pink, teal, red, olive, brown, slate

    /// The name the owner picks it by: "Blue".
    public var label: String {
        switch self {
        case .blue: "Blue"
        case .green: "Green"
        case .orange: "Orange"
        case .purple: "Purple"
        case .pink: "Pink"
        case .teal: "Teal"
        case .red: "Red"
        case .olive: "Olive"
        case .brown: "Brown"
        case .slate: "Slate"
        }
    }
}

/// One of the palette's colors with its name (`TECH_COLORS`).
public struct TechColorOption: Codable, Equatable, Sendable {
    public var key: TechColor
    public var label: String
}

/// Every tech color, in palette order (`TECH_COLORS`).
public let techColorOptions = TechColor.allCases.map { TechColorOption(key: $0, label: $0.label) }

/// A stored color as a palette key; anything else (missing, old, mistyped) is Slate.
public func techColor(_ key: String?) -> TechColor { key.flatMap(TechColor.init(rawValue:)) ?? .slate }

/// The same for any JSON value (a number or null is Slate).
public func techColor(_ key: JSONValue?) -> TechColor { techColor(key?.string) }

/// The color for a new member, given the colors the shop's active members use: the first
/// palette color nobody uses; when all ten are used, the least-used one, earliest in the
/// palette. Values that aren't palette keys are ignored.
public func nextTechColor(_ used: [String?]) -> TechColor {
    var counts = Dictionary(uniqueKeysWithValues: TechColor.allCases.map { ($0, 0) })
    for u in used { if let c = u.flatMap(TechColor.init(rawValue:)) { counts[c, default: 0] += 1 } }
    var best = TechColor.allCases[0]
    for c in TechColor.allCases where counts[c]! < counts[best]! { best = c }
    return best
}

/// What Settings › Team orders by.
public protocol TeamOrdered {
    var orderName: String? { get }
    var orderStatus: String { get }
    /// When they were turned off (ISO).
    var orderDisabledAt: String? { get }
}

/// `a.trim() || "￿"` compared with sensitivity base: a missing or blank name last.
private func byName(_ a: String?, _ b: String?) -> Int {
    let x = a?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let y = b?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if x.isEmpty || y.isEmpty { return x.isEmpty == y.isEmpty ? 0 : x.isEmpty ? 1 : -1 }
    return ECMA.localeCompareBase(x, y)
}

/// Settings › Team's one list: active members A to Z by name (ignoring case and accents; no
/// name last), then those turned off, the most recently turned off first (no `disabled_at`
/// last), then by name. Ties keep the input order.
public func teamOrder<T: TeamOrdered>(_ members: [T]) -> (active: [T], off: [T]) {
    let indexed = Array(members.enumerated())
    let time = { (v: String?) in v.flatMap { $0.isEmpty ? nil : ECMA.parseDate($0) } ?? .nan }
    let active = ECMA.sort(indexed.filter { $0.element.orderStatus == "active" }) { x, y in
        let n = byName(x.element.orderName, y.element.orderName)
        return Double(n != 0 ? n : x.offset - y.offset)
    }
    let off = ECMA.sort(indexed.filter { $0.element.orderStatus != "active" }) { x, y in
        let a = time(x.element.orderDisabledAt)
        let b = time(y.element.orderDisabledAt)
        let when: Double = a.isNaN ? (b.isNaN ? 0 : 1) : b.isNaN ? -1 : b - a
        if when != 0 { return when }
        let n = byName(x.element.orderName, y.element.orderName)
        return Double(n != 0 ? n : x.offset - y.offset)
    }
    return (active.map(\.element), off.map(\.element))
}

/// Where a visit is: its shop-local date ("2026-10-21") and its tech.
public struct VisitSlot: Codable, Equatable, Sendable {
    public var date: String
    public var techId: String?

    public init(date: String, techId: String?) {
        self.date = date
        self.techId = techId
    }
}

/// Whether moving this job asks "Move <Customer>'s visits?" (Change Schedule / Just This
/// Visit / Cancel): a maintenance plan's visit that is still Scheduled. With `move`, only a
/// move to another day or another tech asks; a new place in the same tech's same day doesn't.
public func asksPlanMove(servicePlanId: String?, status: String, move: (from: VisitSlot, to: VisitSlot)? = nil)
    -> Bool
{
    guard let plan = servicePlanId, !plan.isEmpty, status == "scheduled" else { return false }
    guard let move else { return true }
    return move.from.date != move.to.date || move.from.techId != move.to.techId
}

/// The action sheet for moving a plan visit; buttons in this order (`PLAN_MOVE_CHOICES`).
public enum PlanMoveChoices {
    public static func title(_ customer: String) -> String { "Move \(customer)’s visits?" }
    public static let changeSchedule = "Change Schedule"
    public static let justThisVisit = "Just This Visit"
    public static let cancel = "Cancel"
}

/// After Change Schedule: "Rivera is now on Tuesdays with Luis"; with no tech the "with" part
/// is left off.
public func planMovedBanner(_ customer: String, _ weekdayName: String, _ techName: String) -> String {
    let tech = techName.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(customer) is now on \(weekdayName)s\(tech.isEmpty ? "" : " with \(tech)")"
}

/// After Just This Visit.
public let visitMovedBanner = "Moved this visit only"

/// The maps buttons' words (`MAPS_LABELS`): never the maps company, except in the setting
/// where someone picks one.
public enum MapsLabels {
    public static let openInMaps = "Open in Maps"
    public static let directions = "Directions"
    /// Apple Maps links take one stop: the day's button opens the next one.
    public static let nextStop = "Next Stop in Maps"
    /// Google Maps takes the whole route.
    public static let openRoute = "Open Route in Maps"
    /// The short form of either day button.
    public static let maps = "Maps"
    public static let setting = "Directions open in"
    public static let automatic = "Automatic"
    public static let apple = "Maps (Apple)"
    public static let google = "Maps (Google)"

    /// The table as the TypeScript has it, by key.
    public static let all: [String: String] = [
        "openInMaps": openInMaps, "directions": directions, "nextStop": nextStop, "openRoute": openRoute,
        "maps": maps, "setting": setting, "automatic": automatic, "apple": apple, "google": google,
    ]
}

/// The day's directions button for the chosen app: the whole route, or the next stop.
public func dayMapsLabel(_ app: MapsApp) -> String { app == .google ? MapsLabels.openRoute : MapsLabels.nextStop }
