import Foundation

/// UUIDv7: time-ordered ids generated on the device (BUILD_PLAN 4.1). Port of uuid.ts.
public func uuidv7(now: Date = Date()) -> String {
    uuidv7(milliseconds: UInt64(max(0, (now.timeIntervalSince1970 * 1000).rounded(.down))))
}

public func uuidv7(milliseconds ms: UInt64) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    var generator = SystemRandomNumberGenerator()
    for index in 6..<16 { bytes[index] = UInt8.random(in: 0...255, using: &generator) }
    for index in 0..<6 { bytes[index] = UInt8((ms >> UInt64(8 * (5 - index))) & 0xff) }
    bytes[6] = (bytes[6] & 0x0f) | 0x70  // version 7
    bytes[8] = (bytes[8] & 0x3f) | 0x80  // RFC 4122 variant
    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    let chars = Array(hex)
    func part(_ range: Range<Int>) -> String { String(chars[range]) }
    return "\(part(0..<8))-\(part(8..<12))-\(part(12..<16))-\(part(16..<20))-\(part(20..<32))"
}
