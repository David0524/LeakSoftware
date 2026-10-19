import Testing

@testable import SundeckSync

/// Port of packages/sync/test/hlc.test.ts.
@Suite struct HLCTests {
    @Test func formatsSortableStrings() throws {
        #expect(formatHLC(ms: 1_700_000_000_000, counter: 3, deviceId: "dev1") == "1700000000000-0003-dev1")
        let parsed = try parseHLC("1700000000000-0003-dev1")
        #expect(parsed.ms == 1_700_000_000_000)
        #expect(parsed.counter == 3)
        #expect(parsed.deviceId == "dev1")
        #expect(throws: HLCError.self) { try parseHLC("bad") }
    }

    @Test func increasesEvenWhenTheWallClockStandsStillOrGoesBack() throws {
        let wall = Locked<Int64>(1000)
        let c = try HybridClock(deviceId: "d", now: { wall.current })
        let a = c.tick()
        let b = c.tick()
        wall.withLock { $0 = 500 }
        let d = c.tick()
        #expect(compareHLC(a, b) == -1)
        #expect(compareHLC(b, d) == -1)
    }

    @Test func movesPastRemoteTimestampsFromTheFuture() throws {
        let c = try HybridClock(deviceId: "d", now: { 1000 })
        try c.receive("0000000005000-0002-server")
        #expect(compareHLC(c.tick(), "0000000005000-0002-server") == 1)
    }

    @Test func ignoresOlderRemoteTimestamps() throws {
        let c = try HybridClock(deviceId: "d", now: { 9000 })
        _ = c.tick()
        try c.receive("0000000001000-0000-server")
        #expect(c.state.ms == 9000)
    }

    @Test func rollsIntoTheNextMillisecondWhenTheCounterIsExhausted() throws {
        let c = try HybridClock(deviceId: "d", state: HLCState(ms: 1000, counter: 9999), now: { 1000 })
        #expect(c.tick() == "0000000001001-0000-d")
    }

    @Test func rejectsDeviceIdsThatWouldBreakTheFormat() {
        #expect(throws: HLCError.self) { try HybridClock(deviceId: "a-b", now: { 0 }) }
    }
}
