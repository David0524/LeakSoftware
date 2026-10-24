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

/// A route's color on its map (owner, 2026-10-23: "Bold tech-colored routes"; `routeColor`): the
/// tech's team color, so each map matches its tech's column; blue (the brand's water blue) when no
/// tech is known. Unlike `techColor`, a missing or unknown key is blue, not slate.
public func routeColor(_ key: String?) -> TechColor { key.flatMap(TechColor.init(rawValue:)) ?? .blue }

/// How a route is drawn on every map (`ROUTE_STYLE`): the line in the tech's color on a white
/// casing; stops filled in that color with a white number and edge; a done stop quieter (a light
/// tint of the color with a ring in it, numbered in the text color); the stop you're on larger, with a white ring and a navy ring outside it; the start
/// unchanged. Sizes in points.
public struct RouteStyle: Codable, Equatable, Sendable {
    public var pinSize: Double
    public var currentPinSize: Double
    public var pinEdge: Double
    public var currentWhiteRing: Double
    public var currentNavyRing: Double
    public var startPinSize: Double
    /// A done stop's fill: the route's color at this strength over the surface.
    public var doneTint: Double
    public var lineWidth: Double
    public var casingWidth: Double
}

/// `ROUTE_STYLE`.
public let routeStyle = RouteStyle(
    pinSize: 34, currentPinSize: 40, pinEdge: 2, currentWhiteRing: 3, currentNavyRing: 2, startPinSize: 28,
    doneTint: 0.2, lineWidth: 6, casingWidth: 9)

/// `ROUTE_STYLE_SMALL` (owner, 2026-10-23: "thinner lines and smaller dots when zoomed out of the
/// map so it doesn't look like one blob"): the route at `RouteZoom.small` and farther, small dots
/// without numbers on a thin line. Between it and `routeStyle`, every size steps smoothly with the
/// zoom (`routeStyleAt`).
public struct RouteStyleSmall: Codable, Equatable, Sendable {
    public var pinSize: Double
    public var currentPinSize: Double
    public var pinEdge: Double
    public var currentWhiteRing: Double
    public var currentNavyRing: Double
    public var startPinSize: Double
    public var lineWidth: Double
    public var casingWidth: Double
}

public let routeStyleSmall = RouteStyleSmall(
    pinSize: 13, currentPinSize: 18, pinEdge: 1.5, currentWhiteRing: 2, currentNavyRing: 1.5, startPinSize: 14,
    lineWidth: 2.5, casingWidth: 4)

/// `ROUTE_ZOOM`: the web map zoom (256-point tiles) at and closer than which a route is drawn at
/// `routeStyle` (`full`), at and farther than which at `routeStyleSmall` (`small`), and the pin
/// size from which pins show their numbers (`numbersFrom`).
public struct RouteZoom: Codable, Equatable, Sendable {
    public var full: Double
    public var small: Double
    public var numbersFrom: Double
}

public let routeZoom = RouteZoom(full: 13, small: 10, numbersFrom: 20)

/// A route's sizes at one zoom (`RouteSizes`), in points, and whether its pins show their numbers.
public struct RouteSizes: Codable, Equatable, Sendable {
    public var pinSize: Double
    public var currentPinSize: Double
    public var pinEdge: Double
    public var currentWhiteRing: Double
    public var currentNavyRing: Double
    public var startPinSize: Double
    public var lineWidth: Double
    public var casingWidth: Double
    public var numbers: Bool
}

/// The route's sizes at `zoom`, each to the nearest quarter point (`routeStyleAt`).
public func routeStyleAt(_ zoom: Double) -> RouteSizes {
    let z = zoom.isFinite ? zoom : routeZoom.full
    let t = max(0, min(1, (z - routeZoom.small) / (routeZoom.full - routeZoom.small)))
    func at(_ small: Double, _ full: Double) -> Double { ECMA.round((small + (full - small) * t) * 4) / 4 }
    let s = routeStyleSmall
    let f = routeStyle
    let pin = at(s.pinSize, f.pinSize)
    return RouteSizes(
        pinSize: pin, currentPinSize: at(s.currentPinSize, f.currentPinSize), pinEdge: at(s.pinEdge, f.pinEdge),
        currentWhiteRing: at(s.currentWhiteRing, f.currentWhiteRing),
        currentNavyRing: at(s.currentNavyRing, f.currentNavyRing), startPinSize: at(s.startPinSize, f.startPinSize),
        lineWidth: at(s.lineWidth, f.lineWidth), casingWidth: at(s.casingWidth, f.casingWidth),
        numbers: pin >= routeZoom.numbersFrom)
}

/// A map image's three sizes (`RouteTier`): full, medium (halfway) and small.
public enum RouteTier: String, Codable, CaseIterable, Sendable {
    case full, medium, small

    /// `ROUTE_TIER_ZOOM`.
    public var zoom: Double {
        switch self {
        case .full: 13
        case .medium: 11.5
        case .small: 10
        }
    }

    /// `routeTierStyle`.
    public var style: RouteSizes { routeStyleAt(zoom) }
}

/// A pin's size at `sizes` (`pinSizeAt`): the start's, the stop you're on, or any other stop's.
public func pinSizeAt(_ tone: PinTone, _ sizes: RouteSizes) -> Double {
    tone == .shop ? sizes.startPinSize : tone == .current ? sizes.currentPinSize : sizes.pinSize
}

/// A pin at a point of a map image, for `imageTier`.
public struct ImagePin: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var tone: PinTone

    public init(x: Double, y: Double, tone: PinTone) {
        self.x = x
        self.y = y
        self.tone = tone
    }
}

/// The size a map image draws its route at (`imageTier`): the tier nearest the live map's size at
/// its zoom, then a smaller one while any two pins would overlap.
public func imageTier(_ zoom: Double, _ pins: [ImagePin]) -> RouteTier {
    let order = RouteTier.allCases
    var i =
        order.indices.first { k in k == order.count - 1 || zoom >= (order[k].zoom + order[k + 1].zoom) / 2 }
        ?? order.count - 1
    while i < order.count - 1 {
        let sizes = order[i].style
        let overlap = { (a: ImagePin, b: ImagePin) in
            hypot(a.x - b.x, a.y - b.y) < (pinSizeAt(a.tone, sizes) + pinSizeAt(b.tone, sizes)) / 2
        }
        let crowded = pins.indices.contains { j in pins[(j + 1)...].contains { overlap(pins[j], $0) } }
        if !crowded { break }
        i += 1
    }
    return order[i]
}

/// A map point (`projectPoint`, web Mercator at `zoom`): x east, y south.
public struct MapPoint: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
}

public func projectPoint(_ p: LatLng, _ zoom: Double) -> MapPoint {
    let scale = 256 * pow(2, zoom)
    let lat = max(-85, min(85, p.lat))
    let s = sin(lat * Double.pi / 180)
    return MapPoint(x: (p.lng + 180) / 360 * scale, y: (0.5 - log((1 + s) / (1 - s)) / (4 * Double.pi)) * scale)
}

/// The zoom at which a map `width` points wide shows `lngDelta` degrees across (`zoomForSpan`).
public func zoomForSpan(_ lngDelta: Double, _ width: Double) -> Double {
    guard lngDelta > 0, width > 0 else { return routeZoom.full }
    return log2(width * 360 / (256 * lngDelta))
}

/// The zoom a map image of `w`×`h` points ends up at fitting `points` with `padding` spare
/// (`fitZoom`), at most `maxZoom`.
public func fitZoom(_ points: [LatLng], w: Double, h: Double, padding: Double, maxZoom: Double = 16) -> Double {
    guard points.count >= 2 else { return maxZoom }
    let at = points.map { projectPoint($0, 0) }
    let xs = at.map(\.x)
    let ys = at.map(\.y)
    let dx = xs.max()! - xs.min()!
    let dy = ys.max()! - ys.min()!
    let zx = dx > 0 ? log2(max(1, w - 2 * padding) / dx) : .infinity
    let zy = dy > 0 ? log2(max(1, h - 2 * padding) / dy) : .infinity
    let z = min(zx, zy, maxZoom)
    return z.isFinite ? z : maxZoom
}

/// Meters one map point covers at `lat` and `zoom` (`metersPerPoint`).
public func metersPerPoint(_ lat: Double, _ zoom: Double) -> Double {
    156_543.03392 * cos(lat * Double.pi / 180) / pow(2, zoom)
}

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
