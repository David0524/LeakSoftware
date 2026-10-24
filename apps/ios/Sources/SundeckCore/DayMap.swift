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
/// map so it doesn't look like one blob"; 2026-10-24: "the stops aren't numbered"): the route at
/// `RouteZoom.small` and farther, smaller pins (22 points, still numbered) on a thin line. Between
/// it and `routeStyle`, every size steps smoothly with the zoom (`routeStyleAt`). Pins that would
/// overlap are spread apart (`spreadPins`), never shrunk to dots.
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
    pinSize: 22, currentPinSize: 27, pinEdge: 1.5, currentWhiteRing: 2, currentNavyRing: 1.5, startPinSize: 20,
    lineWidth: 2.5, casingWidth: 4)

/// `ROUTE_ZOOM`: the web map zoom (256-point tiles) at and closer than which a route is drawn at
/// `routeStyle` (`full`), and at and farther than which at `routeStyleSmall` (`small`).
public struct RouteZoom: Codable, Equatable, Sendable {
    public var full: Double
    public var small: Double
}

public let routeZoom = RouteZoom(full: 13, small: 10)

/// A route's sizes at one zoom (`RouteSizes`), in points. Every size shows its pins' numbers.
public struct RouteSizes: Codable, Equatable, Sendable {
    public var pinSize: Double
    public var currentPinSize: Double
    public var pinEdge: Double
    public var currentWhiteRing: Double
    public var currentNavyRing: Double
    public var startPinSize: Double
    public var lineWidth: Double
    public var casingWidth: Double
}

/// The route's sizes at `zoom`, each to the nearest quarter point (`routeStyleAt`).
public func routeStyleAt(_ zoom: Double) -> RouteSizes {
    let z = zoom.isFinite ? zoom : routeZoom.full
    let t = max(0, min(1, (z - routeZoom.small) / (routeZoom.full - routeZoom.small)))
    func at(_ small: Double, _ full: Double) -> Double { ECMA.round((small + (full - small) * t) * 4) / 4 }
    let s = routeStyleSmall
    let f = routeStyle
    return RouteSizes(
        pinSize: at(s.pinSize, f.pinSize), currentPinSize: at(s.currentPinSize, f.currentPinSize),
        pinEdge: at(s.pinEdge, f.pinEdge),
        currentWhiteRing: at(s.currentWhiteRing, f.currentWhiteRing),
        currentNavyRing: at(s.currentNavyRing, f.currentNavyRing), startPinSize: at(s.startPinSize, f.startPinSize),
        lineWidth: at(s.lineWidth, f.lineWidth), casingWidth: at(s.casingWidth, f.casingWidth))
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
        if !crowdedAt(pins, order[i].style) { break }
        i += 1
    }
    return order[i]
}

/// Whether any two stops (in map points) would overlap at `sizes` (`crowdedAt`); the start, drawn
/// under them, is left out.
public func crowdedAt(_ pins: [ImagePin], _ sizes: RouteSizes) -> Bool {
    let stops = pins.filter { $0.tone != .shop }
    let overlap = { (a: ImagePin, b: ImagePin) in
        hypot(a.x - b.x, a.y - b.y) < (pinSizeAt(a.tone, sizes) + pinSizeAt(b.tone, sizes)) / 2
    }
    return stops.indices.contains { j in stops[(j + 1)...].contains { overlap(stops[j], $0) } }
}

/// A pin on a live map or in a view, by place (`{ at, tone }`).
public struct PlacedPin: Codable, Equatable, Sendable {
    public var at: LatLng
    public var tone: PinTone

    public init(at: LatLng, tone: PinTone) {
        self.at = at
        self.tone = tone
    }
}

/// A live map's route sizes at `zoom` (`crowdedStyleAt`; owner, 2026-10-24: no pile of pins):
/// `routeStyleAt(zoom)`, or the medium or small tier's smaller sizes while pins would overlap.
public func crowdedStyleAt(_ zoom: Double, _ pins: [PlacedPin]) -> RouteSizes {
    let base = routeStyleAt(zoom)
    let at = pins.map { p in
        let pt = projectPoint(p.at, zoom)
        return ImagePin(x: pt.x, y: pt.y, tone: p.tone)
    }
    if !crowdedAt(at, base) { return base }
    for tier in [RouteTier.medium, .small] {
        let sizes = tier.style
        if sizes.pinSize >= base.pinSize { continue }
        if tier == .small || !crowdedAt(at, sizes) { return sizes }
    }
    return base
}

/// A map point (`projectPoint`, web Mercator at `zoom`): x east, y south.
public struct MapPoint: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public func projectPoint(_ p: LatLng, _ zoom: Double) -> MapPoint {
    let scale = 256 * pow(2, zoom)
    let lat = max(-85, min(85, p.lat))
    let s = sin(lat * Double.pi / 180)
    return MapPoint(x: (p.lng + 180) / 360 * scale, y: (0.5 - log((1 + s) / (1 - s)) / (4 * Double.pi)) * scale)
}

/// The place at map point `pt` at `zoom` (`unprojectPoint`).
public func unprojectPoint(_ pt: MapPoint, _ zoom: Double) -> LatLng {
    let scale = 256 * pow(2, zoom)
    let n = Double.pi - 2 * Double.pi * pt.y / scale
    return LatLng(lat: atan(sinh(n)) * 180 / Double.pi, lng: pt.x / scale * 360 - 180)
}

/// What a map shows (`MapView`): its middle, zoom (256-point tiles) and the size of its route.
public struct MapView: Codable, Equatable, Sendable {
    public var center: LatLng
    public var zoom: Double
    public var tier: RouteTier
}

/// `VIEW_MARGIN` and `VIEW_MAX_ZOOM`.
public let viewMargin = 8.0
public let viewMaxZoom = 15.0

/// The tightest view of `w`×`h` points showing every pin whole and every `extra` point
/// (`mapView`; owner, 2026-10-24: framed tightly, no pile of pins).
public func mapView(_ pins: [PlacedPin], w: Double, h: Double, extra: [LatLng] = []) -> MapView {
    let points = pins.map(\.at) + extra
    guard let first = points.first else { return MapView(center: LatLng(lat: 0, lng: 0), zoom: 3, tier: .small) }
    let spread = points.contains { abs($0.lat - first.lat) > 1e-6 || abs($0.lng - first.lng) > 1e-6 }
    let maxZoom = spread ? viewMaxZoom : routeZoom.full
    let order = RouteTier.allCases
    var view = MapView(center: first, zoom: maxZoom, tier: .small)
    for (i, tier) in order.enumerated() {
        let sizes = tier.style
        let pad =
            pins.map { pinSizeAt($0.tone, sizes) / 2 + viewMargin }
            + extra.map { _ in sizes.casingWidth / 2 + viewMargin / 2 }
        func box(_ z: Double) -> (x0: Double, x1: Double, y0: Double, y1: Double) {
            let at = points.map { projectPoint($0, z) }
            var b = (x0: Double.infinity, x1: -Double.infinity, y0: Double.infinity, y1: -Double.infinity)
            for (k, p) in at.enumerated() {
                b.x0 = min(b.x0, p.x - pad[k])
                b.x1 = max(b.x1, p.x + pad[k])
                b.y0 = min(b.y0, p.y - pad[k])
                b.y1 = max(b.y1, p.y + pad[k])
            }
            return b
        }
        func fits(_ z: Double) -> Bool {
            let b = box(z)
            return b.x1 - b.x0 <= w && b.y1 - b.y0 <= h
        }
        var zoom = maxZoom
        if !fits(zoom) {
            var lo = 2.0
            var hi = maxZoom
            for _ in 0..<40 {
                let mid = (lo + hi) / 2
                if fits(mid) { lo = mid } else { hi = mid }
            }
            zoom = lo
        }
        let b = box(zoom)
        let center = unprojectPoint(MapPoint(x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2), zoom)
        let at = pins.map { p in
            let pt = projectPoint(p.at, zoom)
            return ImagePin(x: pt.x, y: pt.y, tone: p.tone)
        }
        view = MapView(center: center, zoom: zoom, tier: tier)
        if (order.firstIndex(of: imageTier(zoom, at)) ?? 0) <= i { break }
    }
    return view
}

/// Where `p` lands on a map of `w`×`h` points centered on `center` at `zoom` (`viewPoint`).
public func viewPoint(_ p: LatLng, center: LatLng, zoom: Double, w: Double, h: Double) -> MapPoint {
    let a = projectPoint(p, zoom)
    let c = projectPoint(center, zoom)
    return MapPoint(x: a.x - c.x + w / 2, y: a.y - c.y + h / 2)
}

// MARK: - Pins too close to read: spread apart (owner, 2026-10-24: "the dots aren't placed great")

/// `SPREAD`: `gap` points kept between two pins' circles; a pin moved more than `leaderFrom` points
/// gets a leader line (`leaderWidth`, in the route's color) back to a small dot (`leaderDot`
/// across) on its true spot; map images keep pins out of the top-right `corner` (Enlarge).
public struct Spread: Codable, Equatable, Sendable {
    public var gap: Double
    public var leaderFrom: Double
    public var leaderWidth: Double
    public var leaderDot: Double
    public var corner: Double
}

/// The golden angle, in radians: one turn per pin spreads a pile evenly.
private let goldenAngle = 2.399963229728653

public let spread = Spread(gap: 2, leaderFrom: 3, leaderWidth: 1.5, leaderDot: 6, corner: 58)

/// Where a pin is drawn after spreading (`SpreadPoint`), in map points, and whether it has a
/// leader line.
public struct SpreadPoint: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var leader: Bool
}

/// What a map keeps pins inside (`SpreadFrame`): its size, the room at its edges, and its Enlarge
/// corner (0 for none).
public struct SpreadFrame: Codable, Equatable, Sendable {
    public var w: Double
    public var h: Double
    public var margin: Double
    public var corner: Double?

    public init(w: Double, h: Double, margin: Double, corner: Double? = nil) {
        self.w = w
        self.h = h
        self.margin = margin
        self.corner = corner
    }
}

/// Pins (map points, x right, y down) moved apart where their circles at `sizes` would overlap,
/// each as little as it can (`spreadPins`): pushes between overlapping pairs while each pin is
/// drawn back toward its place, then pushes alone until none overlap. The start never moves for a
/// stop; pins on one spot part the same way every time. With `frame`, pins stay inside its
/// margins and out of its Enlarge corner.
public func spreadPins(_ pins: [ImagePin], _ sizes: RouteSizes, frame: SpreadFrame? = nil) -> [SpreadPoint] {
    let n = pins.count
    let r = pins.map { pinSizeAt($0.tone, sizes) / 2 }
    let fixed = pins.map { $0.tone == .shop }
    var pos = pins.map { MapPoint(x: $0.x, y: $0.y) }
    func keepIn(_ i: Int) {
        guard let frame else { return }
        let ri = r[i]
        let corner = frame.corner ?? 0
        if corner > 0, pos[i].x > frame.w - corner - ri, pos[i].y < corner + ri {
            // Out of the corner the shorter way: left, or down.
            let left = pos[i].x - (frame.w - corner - ri - spread.gap)
            let down = corner + ri + spread.gap - pos[i].y
            if left <= down { pos[i].x -= left } else { pos[i].y += down }
        }
        let x0 = frame.margin + ri
        let x1 = frame.w - frame.margin - ri
        let y0 = frame.margin + ri
        let y1 = frame.h - frame.margin - ri
        pos[i].x = x0 <= x1 ? max(x0, min(x1, pos[i].x)) : frame.w / 2
        pos[i].y = y0 <= y1 ? max(y0, min(y1, pos[i].y)) : frame.h / 2
    }
    func push() -> Bool {
        var moved = false
        for i in 0..<n {
            for j in (i + 1)..<n {
                if fixed[i] && fixed[j] { continue }
                let dx = pos[j].x - pos[i].x
                let dy = pos[j].y - pos[i].y
                let d = (dx * dx + dy * dy).squareRoot()
                let need = r[i] + r[j] + spread.gap
                if d >= need - 1e-9 { continue }
                var ux: Double
                var uy: Double
                if d > 1e-6 {
                    ux = dx / d
                    uy = dy / d
                } else {
                    let ax = pins[j].x - pins[i].x
                    let ay = pins[j].y - pins[i].y
                    let ad = (ax * ax + ay * ay).squareRoot()
                    if ad > 1e-6 {
                        ux = ax / ad
                        uy = ay / ad
                    } else {
                        // The golden angle per pin: pins on one spot fan out evenly.
                        let turn = Double(j) * goldenAngle
                        ux = cos(turn)
                        uy = sin(turn)
                    }
                }
                let over = need - d
                let si: Double = fixed[i] ? 0 : fixed[j] ? 1 : 0.5
                let sj: Double = fixed[j] ? 0 : fixed[i] ? 1 : 0.5
                pos[i].x -= ux * over * si
                pos[i].y -= uy * over * si
                pos[j].x += ux * over * sj
                pos[j].y += uy * over * sj
                moved = true
            }
        }
        for i in 0..<n where !fixed[i] { keepIn(i) }
        return moved
    }
    for i in 0..<n { keepIn(i) }
    // Pins in a pile first step off their place a little, each its own way (the golden angle per
    // pin), so they part in every direction, not in a long line.
    for i in 0..<n where !fixed[i] {
        let crowded = pos.indices.contains { j in
            guard j != i else { return false }
            let dx = pos[j].x - pos[i].x
            let dy = pos[j].y - pos[i].y
            return (dx * dx + dy * dy).squareRoot() < r[i] + r[j] + spread.gap
        }
        guard crowded else { continue }
        let turn = Double(i) * goldenAngle
        pos[i].x += cos(turn) * r[i] * 0.5
        pos[i].y += sin(turn) * r[i] * 0.5
        keepIn(i)
    }
    // Spread, drawn back toward each place, then settle with no pull.
    for _ in 0..<40 {
        for i in 0..<n where !fixed[i] {
            pos[i].x += (pins[i].x - pos[i].x) * 0.15
            pos[i].y += (pins[i].y - pos[i].y) * 0.15
            keepIn(i)
        }
        _ = push()
    }
    for _ in 0..<200 {
        if !push() { break }
    }
    func round2(_ v: Double) -> Double { ECMA.round(v * 100) / 100 }
    return pos.enumerated().map { i, p in
        let dx = p.x - pins[i].x
        let dy = p.y - pins[i].y
        let moved = (dx * dx + dy * dy).squareRoot()
        return SpreadPoint(x: round2(p.x), y: round2(p.y), leader: moved > spread.leaderFrom)
    }
}

/// The degrees such a map spans (`viewSpan`): from its top edge to its bottom edge, and across.
public struct ViewSpan: Codable, Equatable, Sendable {
    public var latDelta: Double
    public var lngDelta: Double
}

public func viewSpan(center: LatLng, zoom: Double, w: Double, h: Double) -> ViewSpan {
    let c = projectPoint(center, zoom)
    let top = unprojectPoint(MapPoint(x: c.x, y: c.y - h / 2), zoom)
    let bottom = unprojectPoint(MapPoint(x: c.x, y: c.y + h / 2), zoom)
    return ViewSpan(latDelta: top.lat - bottom.lat, lngDelta: w * 360 / (256 * pow(2, zoom)))
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
