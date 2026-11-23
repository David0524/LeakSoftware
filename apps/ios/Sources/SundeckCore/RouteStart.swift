import Foundation

// Where each person's day starts and ends: the shop, or their home (owner, 2026-10-21: "Techs/
// owners need to be able to set if they start their day from home or from the shop";
// docs/design/2026-10-21-start-from-home.md). Port of route-start.ts. Every routing call that
// took the shop as its depot takes the tech's start instead: startFor(techId, starts, shop).at.
// Where the day ends is set apart (owner, 2026-11-23: "start location at the shop, and finish
// location at home"): the drive back goes to startFor(…).end.at.

public enum RouteStartLabel: String, Codable, Sendable {
    case shop, home
}

/// One end of a day: a place on the map (nil for a shop with no map location), and which.
public struct RoutePoint: Codable, Equatable, Sendable {
    public var at: LatLng?
    public var label: RouteStartLabel

    public init(at: LatLng?, label: RouteStartLabel) {
        self.at = at
        self.label = label
    }

    enum CodingKeys: String, CodingKey { case at, label }

    // `at` is always present (null for a shop with no location), as in TypeScript.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(at, forKey: .at)
        try c.encode(label, forKey: .label)
    }
}

public struct RouteStart: Codable, Equatable, Sendable {
    /// Where the day starts; nil when it starts at a shop with no map location.
    public var at: LatLng?
    public var label: RouteStartLabel
    /// Where the day ends (the drive back goes there).
    public var end: RoutePoint

    /// `end` defaults to the start.
    public init(at: LatLng?, label: RouteStartLabel, end: RoutePoint? = nil) {
        self.at = at
        self.label = label
        self.end = end ?? RoutePoint(at: at, label: label)
    }

    enum CodingKeys: String, CodingKey { case at, label, end }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        at = try c.decodeIfPresent(LatLng.self, forKey: .at)
        label = try c.decode(RouteStartLabel.self, forKey: .label)
        end = try c.decodeIfPresent(RoutePoint.self, forKey: .end) ?? RoutePoint(at: at, label: label)
    }

    // `at` is always present (null for a shop with no location), as in TypeScript.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(at, forKey: .at)
        try c.encode(label, forKey: .label)
        try c.encode(end, forKey: .end)
    }
}

/// A `member_start` row (one per team member; no row means the shop). Synced, but read only by
/// the person and by owners and admins.
public struct MemberStart: Codable, Equatable, Sendable {
    public var id: String?
    public var companyId: String?
    public var userId: String
    /// "shop" or "home"; anything else reads as the shop.
    public var startFrom: String
    /// Where the day ends (owner, 2026-11-23): "shop" or "home". nil (a row from before it existed)
    /// ends where the day starts.
    public var endAt: String?
    /// One line, as typed or picked from the suggestions.
    public var homeAddress: String?
    public var homeLatitude: Double?
    public var homeLongitude: Double?
    /// The address the coordinates were looked up for (or last tried, when not found).
    public var homeGeocodedAddress: String?
    public var deletedAt: String?

    public init(
        id: String? = nil, companyId: String? = nil, userId: String, startFrom: String, endAt: String? = nil,
        homeAddress: String? = nil, homeLatitude: Double? = nil, homeLongitude: Double? = nil,
        homeGeocodedAddress: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.companyId = companyId
        self.userId = userId
        self.startFrom = startFrom
        self.endAt = endAt
        self.homeAddress = homeAddress
        self.homeLatitude = homeLatitude
        self.homeLongitude = homeLongitude
        self.homeGeocodedAddress = homeGeocodedAddress
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case companyId = "company_id"
        case userId = "user_id"
        case startFrom = "start_from"
        case endAt = "end_at"
        case homeAddress = "home_address"
        case homeLatitude = "home_latitude"
        case homeLongitude = "home_longitude"
        case homeGeocodedAddress = "home_geocoded_address"
        case deletedAt = "deleted_at"
    }
}

/// `START_FROM_COPY`: the setting's words, the same on every platform.
public enum StartFromCopy {
    public static let field = "Start My Day From"
    /// Right under it, the same control (owner, 2026-11-23).
    public static let endField = "End My Day At"
    /// On someone else's profile (Team › their profile), without "My" (2026-11-23).
    public static let othersField = "Start Day From"
    public static let othersEndField = "End Day At"
    /// Team › a person's profile has a save per section on the website; this one saves both ends.
    public static let save = "Save Start and End"
    public static let shop = "The Shop"
    public static let home = "Home"
    public static let homeAddress = "Home Address"
    public static let footer = "Routes, drive times and Optimize start and end at these places."
    /// Under the setting while a home address isn't found on the map.
    public static let pending = "Using the shop until the address is found on the map."
    /// The day map's pin for home, at the start or the end (never the street).
    public static let homePin = "Home"

    /// All of it, keyed as in TypeScript.
    public static let all: [String: String] = [
        "field": field, "endField": endField, "othersField": othersField, "othersEndField": othersEndField,
        "save": save, "shop": shop, "home": home, "homeAddress": homeAddress,
        "footer": footer, "pending": pending, "homePin": homePin,
    ]
}

/// The `endAtOf` input: a row's start and end.
public struct StartAndEnd: Codable, Equatable, Sendable {
    public var startFrom: String
    public var endAt: String?

    public init(startFrom: String, endAt: String? = nil) {
        self.startFrom = startFrom
        self.endAt = endAt
    }

    enum CodingKeys: String, CodingKey {
        case startFrom = "start_from"
        case endAt = "end_at"
    }
}

/// Where a row's day ends: its end_at, or (a row from before there was one) where it starts.
public func endAtOf(startFrom: String, endAt: String?) -> RouteStartLabel {
    (endAt ?? startFrom) == "home" ? .home : .shop
}

public func endAtOf(_ member: MemberStart) -> RouteStartLabel {
    endAtOf(startFrom: member.startFrom, endAt: member.endAt)
}

/// Whether the setting needs a home address: the day starts or ends at home.
public func usesHome(_ startFrom: String?, _ endAt: String?) -> Bool {
    startFrom == "home" || endAt == "home"
}

/// A home address as it's looked up and kept in home_geocoded_address (spaces tidied), or ""
/// when there's none. The website's lookup compares and saves this form.
public func homeLookupAddress(_ address: String?) -> String {
    // JavaScript's trim() and /\s+/g: ECMAScript white space and line terminators.
    let words = (address ?? "").split(whereSeparator: isJSSpace)
    return words.joined(separator: " ")
}

private func isJSSpace(_ c: Character) -> Bool {
    c.unicodeScalars.allSatisfy { s in
        switch s.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            true
        default: false
        }
    }
}

public enum HomeMapStatus: String, Codable, Sendable {
    case found, missing
}

/// Whether a home start or end is on the map: found when it has coordinates for its current
/// address, missing when the day starts or ends at Home without them (no address, not found, or
/// changed since), nil when it starts and ends at the shop.
public func homeMapStatus(_ member: MemberStart?) -> HomeMapStatus? {
    guard let member, member.deletedAt == nil || member.deletedAt == "",
        usesHome(member.startFrom, endAtOf(member).rawValue)
    else {
        return nil
    }
    let address = homeLookupAddress(member.homeAddress)
    if address.isEmpty || member.homeLatitude == nil || member.homeLongitude == nil { return .missing }
    // Coordinates belong to the address they were found for.
    guard let found = member.homeGeocodedAddress else { return .found }
    return homeLookupAddress(found) == address ? .found : .missing
}

/// Where this person's routes start and end: each is home when they chose Home for it and the
/// address is on the map, otherwise the shop.
public func routeStart(_ member: MemberStart?, shop: LatLng?) -> RouteStart {
    let atShop = RoutePoint(at: shop, label: .shop)
    guard homeMapStatus(member) == .found, let m = member, let lat = m.homeLatitude, let lng = m.homeLongitude
    else {
        return RouteStart(at: shop, label: .shop, end: atShop)
    }
    let home = RoutePoint(at: LatLng(lat: lat, lng: lng), label: .home)
    let start = m.startFrom == "home" ? home : atShop
    return RouteStart(at: start.at, label: start.label, end: endAtOf(m) == .home ? home : atShop)
}

/// A tech's start from the shop's member_start rows (those this person can read: their own, or
/// everyone's for owners and admins). Nobody, or no row: the shop.
public func startFor(_ techId: String?, _ starts: [MemberStart]?, shop: LatLng?) -> RouteStart {
    guard let techId, !techId.isEmpty else { return routeStart(nil, shop: shop) }
    let row = starts?.first { $0.userId == techId && ($0.deletedAt ?? "").isEmpty }
    return routeStart(row, shop: shop)
}

/// The first leg's words: "18 min from the shop", "18 min from home".
public func startLegLabel(_ label: RouteStartLabel) -> String {
    label == .home ? "from home" : "from the shop"
}

/// The drive back's words, by where the day ends: "36 min back to the shop", "36 min back home".
public func backLegLabel(_ label: RouteStartLabel) -> String {
    label == .home ? "back home" : "back to the shop"
}
