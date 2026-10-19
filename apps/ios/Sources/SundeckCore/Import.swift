import Foundation

/// A pool's gallons as typed ("20,000", "20k", "18500 gallons"), or nil when it isn't one between
/// 1 and 4,999,999. Port of `parseGallons` in import.ts.
public func parseGallons(_ v: String) -> Int? {
    let s = ECMA.lowercase(v).replacing(/[,\s]|gal(lons?)?/, with: "")
    guard let m = s.wholeMatch(of: /(\d+(?:\.\d+)?)(k)?/), let number = Double(m.output.1) else { return nil }
    let n = ECMA.round(number * (m.output.2 == nil ? 1 : 1000))
    return n > 0 && n < 5_000_000 ? Int(n) : nil
}
