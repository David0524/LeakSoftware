import Foundation

// JavaScript's string and number behavior, where the TypeScript rules rely on it, so the
// Swift ports give the same results (docs/plans/swift-app.md, fixtures).

/// JavaScript's string and number rules where the TypeScript relies on them.
enum ECMA {
    /// `Array.prototype.sort` with a comparator: stable, so equal elements keep their order.
    static func sort<T>(_ items: [T], _ compare: (T, T) -> Double) -> [T] {
        items.enumerated().sorted { a, b in
            let order = compare(a.element, b.element)
            return order < 0 || (!(order > 0) && a.offset < b.offset)
        }.map(\.element)
    }

    /// ECMAScript WhiteSpace and LineTerminator (what `String.prototype.trim` and `\s` use).
    static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    /// `String.prototype.trim`.
    static func trim(_ s: String) -> String {
        let scalars = s.unicodeScalars
        guard let first = scalars.firstIndex(where: { !isWhitespace($0) }),
            let last = scalars.lastIndex(where: { !isWhitespace($0) })
        else { return "" }
        return String(scalars[first...last])
    }

    /// `String.prototype.toLowerCase`, including the final-sigma rule Swift leaves out.
    static func lowercase(_ s: String) -> String {
        let scalars = Array(s.unicodeScalars)
        var out = String.UnicodeScalarView()
        for (i, scalar) in scalars.enumerated() {
            if scalar == "\u{03A3}", i > 0, scalars[i - 1].properties.isCased,
                i + 1 == scalars.count || !scalars[i + 1].properties.isCased
            {
                out.append("\u{03C2}")
            } else {
                out.append(contentsOf: String(scalar).lowercased().unicodeScalars)
            }
        }
        return String(out)
    }

    /// `Math.round`: halves round up, toward +∞.
    static func round(_ x: Double) -> Double {
        guard x.isFinite else { return x }
        let floor = x.rounded(.down)
        return x - floor >= 0.5 ? floor + 1 : floor
    }

    /// `Number(string)`: NaN when the text isn't a number literal, 0 when it's blank.
    static func number(_ text: String) -> Double {
        let s = trim(text)
        if s.isEmpty { return 0 }
        let chars = Array(s.unicodeScalars)
        if chars.count > 2, chars[0] == "0" {
            let radix: UInt32? =
                switch chars[1] {
                case "x", "X": 16
                case "o", "O": 8
                case "b", "B": 2
                default: nil
                }
            if let radix {
                var value = 0.0
                for c in chars[2...] {
                    guard let digit = digitValue(c), digit < radix else { return .nan }
                    value = value * Double(radix) + Double(digit)
                }
                return value
            }
        }
        var body = s[...]
        var sign = 1.0
        if let first = body.first, first == "+" || first == "-" {
            sign = first == "-" ? -1 : 1
            body = body.dropFirst()
        }
        if body == "Infinity" { return sign * .infinity }
        // DecimalDigits [. DecimalDigits] [e[+-]DecimalDigits], or . DecimalDigits [exponent].
        let digits = body.unicodeScalars.map { $0 }
        var i = 0
        func isDigit(_ k: Int) -> Bool { k < digits.count && ("0"..."9").contains(digits[k]) }
        var mantissaDigits = 0
        while isDigit(i) {
            i += 1
            mantissaDigits += 1
        }
        if i < digits.count && digits[i] == "." {
            i += 1
            while isDigit(i) {
                i += 1
                mantissaDigits += 1
            }
        }
        if mantissaDigits == 0 { return .nan }
        if i < digits.count && (digits[i] == "e" || digits[i] == "E") {
            i += 1
            if i < digits.count && (digits[i] == "+" || digits[i] == "-") { i += 1 }
            guard isDigit(i) else { return .nan }
            while isDigit(i) { i += 1 }
        }
        guard i == digits.count, let value = Double(String(body)) else { return .nan }
        return sign * value
    }

    private static func digitValue(_ c: Unicode.Scalar) -> UInt32? {
        switch c {
        case "0"..."9": c.value - 48
        case "a"..."z": c.value - 87
        case "A"..."Z": c.value - 55
        default: nil
        }
    }

    /// `Number.prototype.toString()`: the shortest digits that round-trip, laid out the way
    /// JavaScript does (no exponent from 1e-6 up to 1e21).
    static func numberString(_ x: Double) -> String {
        if x.isNaN { return "NaN" }
        if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
        if x == 0 { return "0" }
        // Swift's description has the same shortest round-trip digits; only the layout differs.
        let text = "\(abs(x))"
        let parts = text.split(separator: "e")
        let mantissa = parts[0]
        let exponent = parts.count > 1 ? Int(parts[1])! : 0
        let pieces = mantissa.split(separator: ".", omittingEmptySubsequences: false)
        let whole = String(pieces[0])
        let fraction = pieces.count > 1 ? String(pieces[1]) : ""
        var digits = whole + fraction
        // value = 0.digits × 10^n
        var n = whole.count + exponent
        while digits.hasPrefix("0") {
            digits.removeFirst()
            n -= 1
        }
        while digits.hasSuffix("0") { digits.removeLast() }
        let k = digits.count
        let sign = x < 0 ? "-" : ""
        if k <= n && n <= 21 { return sign + digits + String(repeating: "0", count: n - k) }
        if 0 < n && n <= 21 {
            return sign + digits.prefix(n) + "." + digits.dropFirst(n)
        }
        if -6 < n && n <= 0 { return sign + "0." + String(repeating: "0", count: -n) + digits }
        let e = n - 1
        let exp = "e" + (e < 0 ? "-" : "+") + String(abs(e))
        return sign + (k == 1 ? digits : digits.prefix(1) + "." + digits.dropFirst()) + exp
    }

    /// `String(n).padStart(width, "0")`.
    static func pad(_ s: String, _ width: Int) -> String {
        s.count >= width ? s : String(repeating: "0", count: width - s.count) + s
    }

    /// `encodeURIComponent`.
    static func encodeURIComponent(_ s: String) -> String {
        var out = ""
        for byte in s.utf8 {
            switch byte {
            case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "a")...UInt8(ascii: "z"),
                UInt8(ascii: "0")...UInt8(ascii: "9"):
                out.unicodeScalars.append(Unicode.Scalar(byte))
            case _ where "-_.!~*'()".utf8.contains(byte):
                out.unicodeScalars.append(Unicode.Scalar(byte))
            default:
                out += "%" + pad(String(byte, radix: 16, uppercase: true), 2)
            }
        }
        return out
    }

    /// JavaScript truthiness of a JSON value (missing counts as undefined).
    static func truthy(_ value: JSONValue?) -> Bool {
        switch value {
        case nil, .null?: false
        case .bool(let b)?: b
        case .number(let n)?: n != 0 && !n.isNaN
        case .string(let s)?: !s.isEmpty
        case .array?, .object?: true
        }
    }

    /// JavaScript's `a.localeCompare(b)` (ICU's default collation) for the names a price book
    /// holds: punctuation and spaces before digits before letters, then accents, then lowercase
    /// before uppercase. Returns -1, 0 or 1.
    static func localeCompare(_ a: String, _ b: String) -> Int {
        let keysA = a.unicodeScalars.map(collationKey)
        let keysB = b.unicodeScalars.map(collationKey)
        let levels: [(CollationKey) -> [UInt32]] = [\.primary, { [$0.accent] }, { [$0.upper] }]
        for level in levels {
            let x = keysA.flatMap(level)
            let y = keysB.flatMap(level)
            if x != y { return x.lexicographicallyPrecedes(y) ? -1 : 1 }
        }
        return 0
    }
}

private struct CollationKey {
    var primary: [UInt32]
    var accent: UInt32
    var upper: UInt32
}

/// ASCII punctuation and symbols in ICU's root order.
private let punctuationOrder = Array("\t\n\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$")

private func collationKey(_ scalar: Unicode.Scalar) -> CollationKey {
    let char = String(scalar)
    let base = char.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    let accent: UInt32 = char.folding(options: .caseInsensitive, locale: nil) == base ? 0 : 1
    let upper: UInt32 = char.lowercased() == char ? 0 : 1
    let primary: [UInt32] = base.unicodeScalars.map { s in
        if let index = punctuationOrder.firstIndex(of: Character(s)) { return UInt32(index) }
        if s.properties.isWhitespace || (!s.properties.isAlphabetic && s.properties.numericType == nil) {
            return 0x100 + s.value
        }
        if s.properties.numericType != nil { return 0x20_0000 + s.value }
        return 0x40_0000 + s.value
    }
    return CollationKey(primary: primary, accent: accent, upper: upper)
}

extension String {
    /// The first `count` UTF-16 code units, like JavaScript's `slice(0, count)`. A surrogate
    /// pair cut in half is dropped (JavaScript would keep a lone surrogate, which no Swift string holds).
    init(utf16Prefix s: String, _ count: Int) {
        var units = Array(s.utf16.prefix(count))
        if let last = units.last, UTF16.isLeadSurrogate(last) { units.removeLast() }
        self = String(decoding: units, as: UTF16.self)
    }
}

extension JSONValue {
    /// JavaScript truthiness (null, false, 0, NaN and "" are false).
    public var isTruthy: Bool { ECMA.truthy(self) }
}
