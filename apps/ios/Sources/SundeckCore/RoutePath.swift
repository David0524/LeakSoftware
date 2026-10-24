import Foundation

// Routes that follow the roads (owner, 2026-10-23: "The route between stops is always a straight
// line and doesn't take roads"). Port of route-path.ts: a day's route is a line through its
// points in order, each drive between two of them a leg (keyed like drive times by `pointKey`).
// The iPhone gets each leg's road path from MapKit on the phone and keeps it by `legKey`; a leg
// with no path is drawn straight, so the map never breaks.

/// A leg's key: its two points' `pointKey`s ("33.4152,-111.8315>33.4100,-111.9030").
public func legKey(_ from: LatLng, _ to: LatLng) -> String { "\(pointKey(from))>\(pointKey(to))" }

public struct RouteLeg: Codable, Equatable, Sendable {
    public var from: LatLng
    public var to: LatLng
    public var key: String
}

/// The legs of a route through `points` in order; a leg between two points at the same place
/// (the same `pointKey`) is left out.
public func routeLegs(_ points: [LatLng]) -> [RouteLeg] {
    guard points.count > 1 else { return [] }
    return (1..<points.count).compactMap { i in
        let from = points[i - 1]
        let to = points[i]
        return pointKey(from) == pointKey(to) ? nil : RouteLeg(from: from, to: to, key: legKey(from, to))
    }
}

/// `LEG_POLYLINE_MAX` and `LEG_TOLERANCE_M`: a kept leg's longest encoded path, and how closely
/// it follows its road, in meters.
public let legPolylineMax = 20_000
public let legToleranceMeters = 3.0

/// Points as Google's encoded polyline at `precision` decimals (`encodePolyline`).
public func encodePolyline(_ points: [LatLng], precision: Int = 5) -> String {
    let f = pow(10, Double(precision))
    var out: [UInt16] = []
    var last = (lat: 0, lng: 0)
    func enc(_ v: Int) {
        var n = v < 0 ? ~(v * 2) : v * 2
        while n >= 0x20 {
            out.append(UInt16((0x20 | (n & 0x1f)) + 63))
            n /= 32
        }
        out.append(UInt16(n + 63))
    }
    for p in points {
        let lat = Int(ECMA.round(p.lat * f))
        let lng = Int(ECMA.round(p.lng * f))
        enc(lat - last.lat)
        enc(lng - last.lng)
        last = (lat, lng)
    }
    return String(decoding: out, as: UTF16.self)
}

/// An encoded polyline's points, or nil when it isn't one (`decodePolyline`).
public func decodePolyline(_ value: String, precision: Int = 5) -> [LatLng]? {
    let f = pow(10, Double(precision))
    let units = Array(value.utf16)
    var i = 0
    func next() -> Double? {
        var result = 0.0
        var shift = 1.0
        while true {
            guard i < units.count else { return nil }
            let b = Int(units[i]) - 63
            i += 1
            guard b >= 0, b <= 63 else { return nil }
            result += Double(b & 0x1f) * shift
            shift *= 32
            if b < 0x20 { break }
            if shift > pow(2, 35) { return nil }
        }
        return result.truncatingRemainder(dividingBy: 2) == 1 ? -(result + 1) / 2 : result / 2
    }
    var out: [LatLng] = []
    var lat = 0.0
    var lng = 0.0
    while i < units.count {
        guard let dLat = next(), let dLng = next() else { return nil }
        lat += dLat
        lng += dLng
        let p = LatLng(lat: lat / f, lng: lng / f)
        if abs(p.lat) > 90 || abs(p.lng) > 180 { return nil }
        out.append(p)
    }
    return out
}

private let metersPerDegree = 111_320.0

/// The path with points dropped where the line stays within `toleranceMeters` of them
/// (`simplifyPath`, Douglas–Peucker measured flat around the first point). The ends always stay;
/// repeated points go.
public func simplifyPath(_ points: [LatLng], _ toleranceMeters: Double) -> [LatLng] {
    var pts: [LatLng] = []
    for p in points where pts.last.map({ $0.lat != p.lat || $0.lng != p.lng }) ?? true { pts.append(p) }
    guard pts.count > 2, toleranceMeters > 0 else { return pts }
    let k = cos(pts[0].lat * Double.pi / 180)
    let xy = pts.map { (x: $0.lng * metersPerDegree * k, y: $0.lat * metersPerDegree) }
    var keep = [Bool](repeating: false, count: pts.count)
    keep[0] = true
    keep[pts.count - 1] = true
    var stack = [(0, pts.count - 1)]
    while let (a, b) = stack.popLast() {
        let (ax, ay) = xy[a]
        let (bx, by) = xy[b]
        let dx = bx - ax
        let dy = by - ay
        let len2 = dx * dx + dy * dy
        var far = -1
        var farD = 0.0
        if b > a + 1 {
            for i in (a + 1)..<b {
                let (px, py) = xy[i]
                let d: Double
                if len2 == 0 {
                    d = hypot(px - ax, py - ay)
                } else {
                    let t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
                    d = hypot(px - (ax + t * dx), py - (ay + t * dy))
                }
                if d > farD {
                    farD = d
                    far = i
                }
            }
        }
        if far >= 0, farD > toleranceMeters {
            keep[far] = true
            stack.append((a, far))
            stack.append((far, b))
        }
    }
    return pts.indices.filter { keep[$0] }.map { pts[$0] }
}

/// A leg's path as it's kept (`legPolyline`): simplified to `legToleranceMeters`, more if it's
/// still longer than `legPolylineMax` encoded; nil under two points.
public func legPolyline(_ path: [LatLng]) -> String? {
    guard path.count >= 2 else { return nil }
    var tol = legToleranceMeters
    while true {
        let s = encodePolyline(simplifyPath(path, tol))
        if s.utf16.count <= legPolylineMax || tol > 100_000 { return s }
        tol *= 2
    }
}

/// Each leg's line and how many are straight (`routeLegPaths`).
public struct RouteLegPaths: Codable, Equatable, Sendable {
    public var legs: [[LatLng]]
    public var straight: Int
}

/// Each leg of the route through `points`: its road path from `found` (by `legKey`) with the
/// leg's own two points at its ends, so the line meets every pin; or, with none, straight.
public func routeLegPaths(_ points: [LatLng], found: (String) -> [LatLng]?) -> RouteLegPaths {
    var straight = 0
    let legs = routeLegs(points).map { leg -> [LatLng] in
        guard let path = found(leg.key), path.count >= 2, let first = path.first, let last = path.last else {
            straight += 1
            return [leg.from, leg.to]
        }
        return (first == leg.from ? [] : [leg.from]) + path + (last == leg.to ? [] : [leg.to])
    }
    return RouteLegPaths(legs: legs, straight: straight)
}

/// The legs as one line, without the point each leg repeats where it meets the next (`joinLegs`).
public func joinLegs(_ legs: [[LatLng]]) -> [LatLng] {
    var out: [LatLng] = []
    for p in legs.joined() where out.last != p { out.append(p) }
    return out
}
