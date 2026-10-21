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

// MARK: - The order of techs on the Schedule (owner, 2026-10-21; docs/design/2026-10-21-tech-order.md)

/// The words of Reorder Techs, the same on every platform (`REORDER_TECHS`).
public enum ReorderTechs {
    public static let action = "Reorder Techs"
    public static let title = "Reorder Techs"
    public static let done = "Done"
    public static let cancel = "Cancel"
    public static let moveUp = "Move Up"
    public static let moveDown = "Move Down"
    public static let saved = "Order saved."
    public static let help = "Drag techs into the order the Schedule and Today show them."

    /// The table as the TypeScript has it, by key.
    public static let all: [String: String] = [
        "action": action, "title": title, "done": done, "cancel": cancel, "moveUp": moveUp,
        "moveDown": moveDown, "saved": saved, "help": help,
    ]
}

/// What the Schedule's order reads.
public protocol ScheduleOrdered {
    var orderUserId: String { get }
    var orderName: String? { get }
    /// Their saved place, 1 first (`membership.schedule_order`); nil when never placed.
    var scheduleOrder: Int? { get }
}

/// The order the Schedule lists techs in, and Today's Whose Day (`scheduleOrder`): a saved
/// order wins (people with a place first, lowest first, then those without one, A to Z);
/// without one, `me` first, then A to Z. Names ignore case and accents, no name last; ties keep
/// the input order.
public func scheduleOrder<T: ScheduleOrdered>(_ members: [T], me: String? = nil) -> [T] {
    let saved = members.contains { $0.scheduleOrder != nil }
    return ECMA.sort(Array(members.enumerated())) { x, y in
        let a = x.element.scheduleOrder
        let b = y.element.scheduleOrder
        if a != nil || b != nil {
            guard let a else { return 1 }
            guard let b else { return -1 }
            if a != b { return Double(a - b) }
        } else if let me, !me.isEmpty, !saved {
            let mine = (y.element.orderUserId == me ? 1 : 0) - (x.element.orderUserId == me ? 1 : 0)
            if mine != 0 { return Double(mine) }
        }
        let n = byName(x.element.orderName, y.element.orderName)
        return Double(n != 0 ? n : x.offset - y.offset)
    }.map(\.element)
}

/// One `schedule_order` to write, on the membership with this id.
public struct ScheduleOrderWrite: Codable, Equatable, Sendable {
    public var id: String
    public var scheduleOrder: Int

    public init(id: String, scheduleOrder: Int) {
        self.id = id
        self.scheduleOrder = scheduleOrder
    }

    enum CodingKeys: String, CodingKey {
        case id
        case scheduleOrder = "schedule_order"
    }
}

/// The writes that save a reordered list (`scheduleOrderWrites`): each id in `ordered` gets its
/// place (1 first); only places that changed are written, and ids not in `members` are skipped.
/// `members` are (id, saved place).
public func scheduleOrderWrites(_ members: [(id: String, scheduleOrder: Int?)], _ ordered: [String])
    -> [ScheduleOrderWrite]
{
    var now: [String: Int?] = [:]
    for m in members where now[m.id] == nil { now[m.id] = .some(m.scheduleOrder) }
    var writes: [ScheduleOrderWrite] = []
    for (i, id) in ordered.enumerated() {
        guard let saved = now[id] else { continue }
        if saved != i + 1 { writes.append(ScheduleOrderWrite(id: id, scheduleOrder: i + 1)) }
    }
    return writes
}

/// The list with the item at `from` moved to `to`, clamped (`moveInList`).
public func moveInList<T>(_ list: [T], from: Int, to: Int) -> [T] {
    guard from >= 0, from < list.count else { return list }
    let target = max(0, min(list.count - 1, to))
    guard target != from else { return list }
    var next = list
    let item = next.remove(at: from)
    next.insert(item, at: target)
    return next
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
