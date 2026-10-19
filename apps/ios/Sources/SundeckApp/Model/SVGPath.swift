import Foundation

/// A point in an SVG drawing's coordinates.
public struct SVGPoint: Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }
}

/// One drawing step, in absolute coordinates. Arcs and smooth curves become cubic curves.
public enum SVGCommand: Equatable, Sendable {
    case move(SVGPoint)
    case line(SVGPoint)
    case curve(SVGPoint, SVGPoint, SVGPoint)
    case close
}

/// Reads an SVG path's `d` attribute (M L H V C S A Z, absolute and relative), enough for the
/// website's icons (`apps/web/src/components/icons.tsx`) so the app draws the same shapes.
/// Unknown commands end the path where they start.
public func svgCommands(_ d: String) -> [SVGCommand] {
    var scanner = SVGScanner(Array(d.utf8))
    var out: [SVGCommand] = []
    var current = SVGPoint(0, 0)
    var start = SVGPoint(0, 0)
    var lastControl: SVGPoint?
    var command: UInt8 = 0

    while true {
        scanner.skipSeparators()
        guard let next = scanner.peek() else { break }
        if scanner.isCommand(next) {
            command = next
            scanner.advance()
        } else if command == 0 {
            break
        }
        let relative = command >= UInt8(ascii: "a")
        let base = relative ? current : SVGPoint(0, 0)
        func point() -> SVGPoint? {
            guard let x = scanner.number(), let y = scanner.number() else { return nil }
            return SVGPoint(base.x + x, base.y + y)
        }
        var control: SVGPoint?
        switch command | 0x20 {
        case UInt8(ascii: "m"):
            guard let p = point() else { return out }
            out.append(.move(p))
            current = p
            start = p
            // Further pairs after a move are lines.
            command = relative ? UInt8(ascii: "l") : UInt8(ascii: "L")
        case UInt8(ascii: "l"):
            guard let p = point() else { return out }
            out.append(.line(p))
            current = p
        case UInt8(ascii: "h"):
            guard let x = scanner.number() else { return out }
            current = SVGPoint(relative ? current.x + x : x, current.y)
            out.append(.line(current))
        case UInt8(ascii: "v"):
            guard let y = scanner.number() else { return out }
            current = SVGPoint(current.x, relative ? current.y + y : y)
            out.append(.line(current))
        case UInt8(ascii: "c"):
            guard let c1 = point(), let c2 = point(), let p = point() else { return out }
            out.append(.curve(c1, c2, p))
            control = c2
            current = p
        case UInt8(ascii: "s"):
            guard let c2 = point(), let p = point() else { return out }
            let c1 = lastControl.map { SVGPoint(2 * current.x - $0.x, 2 * current.y - $0.y) } ?? current
            out.append(.curve(c1, c2, p))
            control = c2
            current = p
        case UInt8(ascii: "a"):
            guard let rx = scanner.number(), let ry = scanner.number(), let rotation = scanner.number(),
                let large = scanner.flag(), let sweep = scanner.flag(), let p = point()
            else { return out }
            out.append(
                contentsOf: arcCurves(
                    from: current, to: p, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep))
            current = p
        case UInt8(ascii: "z"):
            out.append(.close)
            current = start
        default:
            return out
        }
        lastControl = control
    }
    return out
}

/// An elliptical arc as cubic curves (SVG implementation notes, F.6.5), at most 90 degrees each.
func arcCurves(
    from p0: SVGPoint, to p1: SVGPoint, rx rxIn: Double, ry ryIn: Double, rotation: Double, large: Bool, sweep: Bool
) -> [SVGCommand] {
    var rx = abs(rxIn)
    var ry = abs(ryIn)
    if rx == 0 || ry == 0 || p0 == p1 { return p0 == p1 ? [] : [.line(p1)] }
    let phi = rotation * .pi / 180
    let cosPhi = cos(phi)
    let sinPhi = sin(phi)
    let dx = (p0.x - p1.x) / 2
    let dy = (p0.y - p1.y) / 2
    let x1 = cosPhi * dx + sinPhi * dy
    let y1 = -sinPhi * dx + cosPhi * dy
    let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if lambda > 1 {
        rx *= lambda.squareRoot()
        ry *= lambda.squareRoot()
    }
    let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
    var factor = (max(0, numerator) / denominator).squareRoot()
    if large == sweep { factor = -factor }
    let cx1 = factor * rx * y1 / ry
    let cy1 = -factor * ry * x1 / rx
    let cx = cosPhi * cx1 - sinPhi * cy1 + (p0.x + p1.x) / 2
    let cy = sinPhi * cx1 + cosPhi * cy1 + (p0.y + p1.y) / 2

    func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
        atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    }
    let theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    var delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if !sweep && delta > 0 { delta -= 2 * .pi }
    if sweep && delta < 0 { delta += 2 * .pi }

    let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
    let step = delta / Double(segments)
    let k = 4.0 / 3.0 * tan(step / 4)
    func onEllipse(_ t: Double) -> (SVGPoint, SVGPoint) {
        // The point and its derivative direction at angle t.
        let x = rx * cos(t)
        let y = ry * sin(t)
        let point = SVGPoint(cx + cosPhi * x - sinPhi * y, cy + sinPhi * x + cosPhi * y)
        let ddx = -rx * sin(t)
        let ddy = ry * cos(t)
        return (point, SVGPoint(cosPhi * ddx - sinPhi * ddy, sinPhi * ddx + cosPhi * ddy))
    }
    var out: [SVGCommand] = []
    var t = theta1
    for i in 0..<segments {
        let (a, da) = onEllipse(t)
        let (b, db) = onEllipse(t + step)
        let end = i == segments - 1 ? p1 : b
        out.append(
            .curve(
                SVGPoint(a.x + k * da.x, a.y + k * da.y), SVGPoint(b.x - k * db.x, b.y - k * db.y), end))
        t += step
    }
    return out
}

private struct SVGScanner {
    let bytes: [UInt8]
    var index = 0

    init(_ bytes: [UInt8]) { self.bytes = bytes }

    func peek() -> UInt8? { index < bytes.count ? bytes[index] : nil }
    mutating func advance() { index += 1 }

    func isCommand(_ byte: UInt8) -> Bool {
        "MmLlHhVvCcSsAaZz".utf8.contains(byte)
    }

    mutating func skipSeparators() {
        while let b = peek(), b == UInt8(ascii: " ") || b == UInt8(ascii: ",") || b == 0x0A || b == 0x09 || b == 0x0D {
            advance()
        }
    }

    /// An arc flag: a single 0 or 1, which may run into the next number ("a1 1 0 011 1").
    mutating func flag() -> Bool? {
        skipSeparators()
        guard let b = peek(), b == UInt8(ascii: "0") || b == UInt8(ascii: "1") else { return nil }
        advance()
        return b == UInt8(ascii: "1")
    }

    /// A number: optional sign, digits, one decimal point, optional exponent. "6.1-7" is two
    /// numbers and so is ".5.5".
    mutating func number() -> Double? {
        skipSeparators()
        let begin = index
        if let b = peek(), b == UInt8(ascii: "-") || b == UInt8(ascii: "+") { advance() }
        var digits = false
        var dot = false
        while let b = peek() {
            if b >= UInt8(ascii: "0") && b <= UInt8(ascii: "9") {
                digits = true
                advance()
            } else if b == UInt8(ascii: ".") && !dot {
                dot = true
                advance()
            } else {
                break
            }
        }
        if digits, let b = peek(), b == UInt8(ascii: "e") || b == UInt8(ascii: "E") {
            advance()
            if let s = peek(), s == UInt8(ascii: "-") || s == UInt8(ascii: "+") { advance() }
            while let d = peek(), d >= UInt8(ascii: "0") && d <= UInt8(ascii: "9") { advance() }
        }
        guard digits else {
            index = begin
            return nil
        }
        return Double(String(decoding: bytes[begin..<index], as: UTF8.self))
    }
}

/// A tab's symbol as the website draws it (`ICONS` in apps/web/src/components/nav-links.tsx), on
/// a 24 x 24 artboard with 1.8 round strokes. Selected tabs show the filled version: `shape`
/// filled and stroked, `cut` stroked out of it, then `extra` stroked on top.
public struct TabSymbol: Sendable, Equatable {
    /// Outline strokes: the path and its stroke width.
    public var line: [(d: String, width: Double)]
    public var shape: String
    public var cut: String?
    public var cutWidth: Double = 2
    public var extra: String?

    public static func == (a: TabSymbol, b: TabSymbol) -> Bool {
        a.line.map(\.d) == b.line.map(\.d) && a.line.map(\.width) == b.line.map(\.width) && a.shape == b.shape
            && a.cut == b.cut && a.cutWidth == b.cutWidth && a.extra == b.extra
    }

    public static let stroke: Double = 1.8

    public static let today = TabSymbol(
        line: [
            (
                "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
                stroke
            )
        ],
        shape: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z",
        cut: "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z")

    public static let jobs = TabSymbol(
        line: [
            ("M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4", stroke)
        ],
        shape: "M6 4h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
        cut: "M9 11h6M9 15h4")

    public static let schedule = TabSymbol(
        line: [
            (
                "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3",
                stroke
            )
        ],
        shape: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
        cut: "M4 8.5h16M8 12h3M8 16h3M13 12h3",
        extra: "M7 3v3M17 3v3")

    public static let messages = TabSymbol(
        line: [("M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z", stroke)],
        shape: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
        cut: "M8 11h.01M12 11h.01M16 11h.01",
        cutWidth: 2.6)

    public static let more = TabSymbol(
        line: [("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", stroke), ("M8 12h.01M12 12h.01M16 12h.01", 2.6)],
        shape: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z",
        cut: "M8 12h.01M12 12h.01M16 12h.01",
        cutWidth: 2.8)
}
