/// Hybrid logical clock (BUILD_PLAN 4.2). Port of packages/sync/src/hlc.ts.
/// Format: "{unix_ms:13}-{counter:4}-{deviceId}". Strings sort in time order with plain string
/// comparison (same as Postgres collate "C"). The clock never runs behind the highest HLC it
/// has seen, so a phone whose clock is slow still orders its edits after server data it has.
public struct HLCState: Codable, Equatable, Sendable {
    public var ms: Int64
    public var counter: Int

    public init(ms: Int64 = 0, counter: Int = 0) {
        self.ms = ms
        self.counter = counter
    }
}

public struct HLCError: Error, CustomStringConvertible {
    public let description: String
}

private let maxCounter = 9999

public func formatHLC(ms: Int64, counter: Int, deviceId: String) -> String {
    "\(pad(String(ms), 13))-\(pad(String(counter), 4))-\(deviceId)"
}

private func pad(_ s: String, _ width: Int) -> String {
    s.count >= width ? s : String(repeating: "0", count: width - s.count) + s
}

public func parseHLC(_ hlc: String) throws -> (ms: Int64, counter: Int, deviceId: String) {
    guard let m = hlc.wholeMatch(of: /(\d{13})-(\d{4})-([A-Za-z0-9]+)/), let ms = Int64(m.1), let counter = Int(m.2)
    else { throw HLCError(description: "Invalid HLC: \(hlc)") }
    return (ms, counter, String(m.3))
}

/// Byte order, like JavaScript's `<` on these ASCII strings. Equality is byte equality too:
/// Swift's `==` treats canonically equivalent strings as equal, JavaScript's `===` doesn't.
public func compareHLC(_ a: String, _ b: String) -> Int {
    a.utf8.lexicographicallyPrecedes(b.utf8) ? -1 : a.utf8.elementsEqual(b.utf8) ? 0 : 1
}

public func isValidDeviceId(_ id: String) -> Bool {
    id.wholeMatch(of: /[A-Za-z0-9]{1,64}/) != nil
}

public final class HybridClock: @unchecked Sendable {
    public let deviceId: String
    private var ms: Int64
    private var counter: Int
    private let now: () -> Int64

    public init(deviceId: String, state: HLCState = HLCState(), now: @escaping () -> Int64) throws {
        guard isValidDeviceId(deviceId) else { throw HLCError(description: "Invalid device id: \(deviceId)") }
        self.deviceId = deviceId
        self.ms = state.ms
        self.counter = state.counter
        self.now = now
    }

    /// Next timestamp for a local write.
    public func tick() -> String {
        let wall = now()
        if wall > ms {
            ms = wall
            counter = 0
        } else if counter < maxCounter {
            counter += 1
        } else {
            // Counter exhausted within one millisecond: borrow the next millisecond.
            ms += 1
            counter = 0
        }
        return formatHLC(ms: ms, counter: counter, deviceId: deviceId)
    }

    /// Advance past a timestamp seen from the server or another device.
    public func receive(_ remote: String) throws {
        let r = try parseHLC(remote)
        if r.ms > ms || (r.ms == ms && r.counter > counter) {
            ms = r.ms
            counter = r.counter
        }
    }

    public var state: HLCState { HLCState(ms: ms, counter: counter) }
}
