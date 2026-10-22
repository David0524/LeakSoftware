import Foundation

// The shop's colors from its logo (owner, 2026-10-22: "You should auto fill company colors
// based on the logo, and give a picker. A hex code alone is not useful"). Port of
// packages/core/src/logo-colors.ts; the app reads the logo's pixels with CGImage and passes them
// here. Fixtures: Tests/Fixtures/logo-colors.json.

/// The default brand color of a new shop (`DEFAULT_BRAND_COLOR`).
public let defaultBrandColor = "#12263A"

/// Swatches offered beside the logo's own colors (`BRAND_COLOR_PRESETS`): six since slate #3C4450
/// and then red #B3261E went (owner, 2026-10-22: "Remove one color from Accent -> More Colors to
/// save space", "Drop another color"), so Accent's None and six fit one row on a 6.1" iPhone.
public let brandColorPresets = [
    "#12263A", "#1D5FA8", "#0F7C80", "#2E7D32", "#C2410C", "#5B3A9B",
]

private struct ColorCluster {
    var n: Int
    var r: Int
    var g: Int
    var b: Int
}

/// Rounded integer average, as in TypeScript: floor((2·sum + n) / 2n).
private func average(_ sum: Int, _ n: Int) -> Int { (2 * sum + n) / (2 * n) }

private func hex2(_ v: Int) -> String { String(format: "%02X", v) }

/// The logo's main colors, most used first, as #RRGGBB, at most `max` (`logoPalette`). RGBA
/// bytes, row by row. Transparent, near-white, near-black and grayish pixels don't count; close
/// shades merge; colors under 3% of the colorful pixels drop out. No real color gives none.
public func logoPalette(_ rgba: [UInt8], max: Int = 5) -> [String] {
    var buckets: [Int: ColorCluster] = [:]
    var opaque = 0
    var colorful = 0
    var i = 0
    while i + 3 < rgba.count {
        defer { i += 4 }
        if rgba[i + 3] < 128 { continue }
        opaque += 1
        let r = Int(rgba[i])
        let g = Int(rgba[i + 1])
        let b = Int(rgba[i + 2])
        let hi = Swift.max(r, g, b)
        let lo = Swift.min(r, g, b)
        if lo >= 225 || hi <= 50 { continue }
        if hi - lo < 40 || (hi - lo) * 100 < 25 * hi { continue }
        colorful += 1
        let key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
        if var c = buckets[key] {
            c.n += 1
            c.r += r
            c.g += g
            c.b += b
            buckets[key] = c
        } else {
            buckets[key] = ColorCluster(n: 1, r: r, g: g, b: b)
        }
    }
    if colorful < 4 || colorful * 200 < opaque { return [] }

    let sorted = buckets.sorted { x, y in x.value.n != y.value.n ? x.value.n > y.value.n : x.key < y.key }
    var clusters: [ColorCluster] = []
    for (_, c) in sorted {
        let cr = average(c.r, c.n)
        let cg = average(c.g, c.n)
        let cb = average(c.b, c.n)
        var best = -1
        var bestD = 48 * 48 + 1
        for (index, k) in clusters.enumerated() {
            let dr = average(k.r, k.n) - cr
            let dg = average(k.g, k.n) - cg
            let db = average(k.b, k.n) - cb
            let d = dr * dr + dg * dg + db * db
            if d < bestD {
                bestD = d
                best = index
            }
        }
        if best >= 0 {
            clusters[best].n += c.n
            clusters[best].r += c.r
            clusters[best].g += c.g
            clusters[best].b += c.b
        } else {
            clusters.append(c)
        }
    }
    let ranked = clusters.enumerated().sorted { x, y in
        x.element.n != y.element.n ? x.element.n > y.element.n : x.offset < y.offset
    }
    return ranked.enumerated()
        .filter { place, entry in place == 0 || entry.element.n * 100 >= colorful * 3 }
        .prefix(Swift.max(0, max))
        .map { _, entry in
            let k = entry.element
            return "#\(hex2(average(k.r, k.n)))\(hex2(average(k.g, k.n)))\(hex2(average(k.b, k.n)))"
        }
}

/// The swatches to offer: the current color first when it's neither a logo color nor a preset,
/// then the logo's colors, then the presets, without repeats (`brandColorChoices`).
public func brandColorChoices(_ logo: [String], current: String?) -> [String] {
    var out: [String] = []
    func add(_ c: String?) {
        guard let v = c?.uppercased(), v.wholeMatch(of: /#[0-9A-F]{6}/) != nil, !out.contains(v) else { return }
        out.append(v)
    }
    let known = (logo + brandColorPresets).map { $0.uppercased() }
    if let current, !current.isEmpty, !known.contains(current.uppercased()) { add(current) }
    for c in logo + brandColorPresets { add(c) }
    return out
}

/// What the brand color becomes once the logo's colors are known (`suggestedBrandColor`): a new
/// logo always fills it; a logo already there only while the color is still the default.
public func suggestedBrandColor(_ palette: [String], current: String?, newLogo: Bool) -> String? {
    guard let top = palette.first else { return nil }
    let now = (current ?? "").trimmingCharacters(in: .whitespaces).uppercased()
    if now == top { return nil }
    if newLogo || now.isEmpty || now == defaultBrandColor { return top }
    return nil
}

/// WCAG relative luminance of a #RRGGBB color (settings.ts).
private func luminance(_ hex: String) -> Double {
    let digits = Array(hex.dropFirst())
    func channel(_ i: Int) -> Double {
        let c = Double(Int(String(digits[i..<(i + 2)]), radix: 16) ?? 0) / 255
        return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/// Contrast ratio between two #RRGGBB colors, 1 to 21, to two places (`contrastRatio`).
public func contrastRatio(_ a: String, _ b: String) -> Double {
    guard isHexColor(a), isHexColor(b) else { return 1 }
    let x = luminance(a)
    let y = luminance(b)
    return (((Swift.max(x, y) + 0.05) / (Swift.min(x, y) + 0.05)) * 100).rounded() / 100
}

/// White or navy text, whichever reads better on the shop's color, as the documents choose it
/// (`textOnBrand`).
public func textOnBrand(_ background: String, dark: String = "#12263A", light: String = "#FFFFFF") -> String {
    contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark
}
