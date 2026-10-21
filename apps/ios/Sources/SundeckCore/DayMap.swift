import Foundation

// A day's map on Schedule and Today (owner, 2026-10-20, docs/plans/route-maps.md). Port of
// day-map.ts: the shop and each stop as a numbered pin, in route order. The website and Android
// draw it as a map image from the server (GET /api/map?pins=…), the iPhone with Apple Maps; all
// three number and color the pins by this rule.

public enum PinTone: String, Codable, CaseIterable, Sendable {
    case shop, todo, current, done

    /// The tone's letter in the map address.
    var code: String {
        switch self {
        case .shop: "s"
        case .todo: "t"
        case .current: "c"
        case .done: "d"
        }
    }

    init?(code: String) {
        guard let tone = PinTone.allCases.first(where: { $0.code == code }) else { return nil }
        self = tone
    }
}

public struct MapPin: Codable, Equatable, Sendable {
    /// "1", "2", … (the stop's place in the day, unlocated stops counted), or "" for the shop.
    public var label: String
    public var at: LatLng
    public var tone: PinTone
    /// The stop's job (none for the shop).
    public var id: String?
    /// On the start pin (tone shop) of someone who starts from home: drawn as a house labeled
    /// "Home" (`StartFromCopy.homePin`), never the street. nil otherwise.
    public var home: Bool?

    public init(label: String, at: LatLng, tone: PinTone, id: String? = nil, home: Bool? = nil) {
        self.label = label
        self.at = at
        self.tone = tone
        self.id = id
        self.home = home
    }
}

/// `MAP_PIN_LIMIT`: most pins one map shows (the map image's address has a length limit).
public let mapPinLimit = 60

public struct MapStop: Codable, Equatable, Sendable {
    public var id: String
    public var location: LatLng?
    public var done: Bool

    public init(id: String, location: LatLng?, done: Bool) {
        self.id = id
        self.location = location
        self.done = done
    }
}

public struct DayMapPins: Codable, Equatable, Sendable {
    public var pins: [MapPin]
    /// Stops with no map location, shown under the map instead of guessed.
    public var missing: Int
}

/// Pins for a day: the start (the shop, or home for someone who starts there), then each located
/// stop numbered by its place in the day (so the numbers match the list), toned done, current
/// (the stop you're on), or still to do. `depot` is the tech's start (`startFor(…).at`);
/// `startLabel` `.home` draws it as Home.
public func dayMapPins(
    stops: [MapStop], depot: LatLng?, currentId: String? = nil, startLabel: RouteStartLabel? = nil
) -> DayMapPins {
    var pins: [MapPin] = []
    if let depot {
        pins.append(MapPin(label: "", at: depot, tone: .shop, home: startLabel == .home ? true : nil))
    }
    var missing = 0
    for (i, s) in stops.enumerated() {
        guard let location = s.location else {
            missing += 1
            continue
        }
        let tone: PinTone = s.done ? .done : (currentId != nil && s.id == currentId) ? .current : .todo
        pins.append(MapPin(label: String(i + 1), at: location, tone: tone, id: s.id))
    }
    return DayMapPins(pins: Array(pins.prefix(mapPinLimit)), missing: missing)
}

/// A home start pin's code ("h:33.4,-111.8"); it decodes as the start pin with `home`.
private let homeCode = "h"

/// The pins as the map address's `pins` value: "s:33.45,-112.07;t1:33.5,-112.1;…" (a home start
/// is "h:…").
public func encodePins(_ pins: [MapPin]) -> String {
    pins.map {
        let code = $0.home == true && $0.tone == .shop ? homeCode : $0.tone.code
        return "\(code)\($0.label):\(ECMA.toFixed($0.at.lat, 5)),\(ECMA.toFixed($0.at.lng, 5))"
    }
    .joined(separator: ";")
}

/// A pin read back from a map address (no job id).
public struct DecodedPin: Codable, Equatable, Sendable {
    public var tone: PinTone
    public var label: String
    public var at: LatLng
    /// A home start pin ("h:"); nil otherwise.
    public var home: Bool?

    public init(tone: PinTone, label: String, at: LatLng, home: Bool? = nil) {
        self.tone = tone
        self.label = label
        self.at = at
        self.home = home
    }
}

// ASCII digits only, anchored to the whole part, as JavaScript's /^…$/ without flags.
private let pinPattern =
    #"\A([stcdh])([0-9]{0,3}):(-?[0-9]{1,2}(?:\.[0-9]{1,6})?),(-?[0-9]{1,3}(?:\.[0-9]{1,6})?)\z"#

/// The pins back from the address, or nil when it isn't valid.
public func decodePins(_ value: String) -> [DecodedPin]? {
    if value.isEmpty || value.utf16.count > 4000 { return nil }
    guard let regex = try? NSRegularExpression(pattern: pinPattern) else { return nil }
    var out: [DecodedPin] = []
    for part in value.components(separatedBy: ";") {
        let ns = part as NSString
        guard let m = regex.firstMatch(in: part, range: NSRange(location: 0, length: ns.length)) else {
            return nil
        }
        let group = { (i: Int) in ns.substring(with: m.range(at: i)) }
        guard let lat = Double(group(3)), let lng = Double(group(4)) else { return nil }
        if abs(lat) > 90 || abs(lng) > 180 { return nil }
        if group(1) == homeCode {
            if !group(2).isEmpty { return nil }
            out.append(DecodedPin(tone: .shop, label: "", at: LatLng(lat: lat, lng: lng), home: true))
            continue
        }
        guard let tone = PinTone(code: group(1)) else { return nil }
        out.append(DecodedPin(tone: tone, label: group(2), at: LatLng(lat: lat, lng: lng)))
    }
    return !out.isEmpty && out.count <= mapPinLimit ? out : nil
}
