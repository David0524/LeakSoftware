import Foundation

// Where each person's day starts and ends: the shop, or their home (owner, 2026-10-21: "Techs/
// owners need to be able to set if they start their day from home or from the shop";
// docs/design/2026-10-21-start-from-home.md). Port of route-start.ts. Every routing call that
// took the shop as its depot takes the tech's start instead: startFor(techId, starts, shop).at.

public enum RouteStartLabel: String, Codable, Sendable {
    case shop, home
}

public struct RouteStart: Codable, Equatable, Sendable {
    /// Where the day starts and ends; nil when it starts at a shop with no map location.
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

/// A `member_start` row (one per team member; no row means the shop). Synced, but read only by
/// the person and by owners and admins.
public struct MemberStart: Codable, Equatable, Sendable {
    public var id: String?
    public var companyId: String?
    public var userId: String
    /// "shop" or "home"; anything else reads as the shop.
    public var startFrom: String
    /// One line, as typed or picked from the suggestions.
    public var homeAddress: String?
    public var homeLatitude: Double?
    public var homeLongitude: Double?
    /// The address the coordinates were looked up for (or last tried, when not found).
    public var homeGeocodedAddress: String?
    public var deletedAt: String?

    public init(
        id: String? = nil, companyId: String? = nil, userId: String, startFrom: String,
        homeAddress: String? = nil, homeLatitude: Double? = nil, homeLongitude: Double? = nil,
        homeGeocodedAddress: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.companyId = companyId
        self.userId = userId
        self.startFrom = startFrom
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
    public static let shop = "The Shop"
    public static let home = "Home"
    public static let homeAddress = "Home Address"
    public static let footer = "Routes, drive times and Optimize start and end here."
    /// Under the setting while a home address isn't found on the map.
    public static let pending = "Starting from the shop until the address is found on the map."
    /// The day map's start pin for someone who starts at home (never the street).
    public static let homePin = "Home"

    /// All of it, keyed as in TypeScript.
    public static let all: [String: String] = [
        "field": field, "shop": shop, "home": home, "homeAddress": homeAddress, "footer": footer,
        "pending": pending, "homePin": homePin,
    ]
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

/// Whether a home start is on the map: found when it has coordinates for its current address,
/// missing when it's set to Home without them (no address, not found, or changed since), nil
/// when the day starts at the shop.
public func homeMapStatus(_ member: MemberStart?) -> HomeMapStatus? {
    guard let member, member.deletedAt == nil || member.deletedAt == "", member.startFrom == "home" else {
        return nil
    }
    let address = homeLookupAddress(member.homeAddress)
    if address.isEmpty || member.homeLatitude == nil || member.homeLongitude == nil { return .missing }
    // Coordinates belong to the address they were found for.
    guard let found = member.homeGeocodedAddress else { return .found }
    return homeLookupAddress(found) == address ? .found : .missing
}

/// Where this person's routes start and end: home when they start from home and the address is
/// on the map, otherwise the shop.
public func routeStart(_ member: MemberStart?, shop: LatLng?) -> RouteStart {
    if homeMapStatus(member) == .found, let m = member, let lat = m.homeLatitude, let lng = m.homeLongitude {
        return RouteStart(at: LatLng(lat: lat, lng: lng), label: .home)
    }
    return RouteStart(at: shop, label: .shop)
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

/// The drive back's words: "36 min back to the shop", "36 min back home".
public func backLegLabel(_ label: RouteStartLabel) -> String {
    label == .home ? "back home" : "back to the shop"
}
