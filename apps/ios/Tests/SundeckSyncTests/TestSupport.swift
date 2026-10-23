import Foundation
import SundeckCore
import SundeckStorage

@testable import SundeckSync

/// Shared helpers for the sync tests. Port of packages/sync/test/sqlite.ts plus the fakes the
/// TypeScript tests declare inline.

/// The company every test row belongs to.
let testCompany = "00000000-0000-4000-8000-0000000000c1"

/// The HLC the fake servers answer with.
let fakeServerHLC = "1800000000000-0000-server"

/// A fresh in-memory encrypted database, like `memoryDb()` in the TypeScript tests.
func memoryDatabase() throws -> Database {
    try Database(path: ":memory:", key: String(repeating: "ab", count: 32))
}

/// A store on a new database with a fixed device id and a clock that moves 1 ms per read,
/// like `store()` in store.test.ts.
func steppingStore(start: Int64 = 1_800_000_000_000, deviceId: String = "dev1") throws -> LocalStore {
    var t = start
    return try LocalStore.open(
        memoryDatabase(),
        now: {
            defer { t += 1 }
            return t
        }, deviceId: deviceId)
}

/// One pulled row.
func pulled(_ table: String, _ row: Row, xid: String = "1") -> PulledRow {
    PulledRow(table: table, xid: xid, row: row)
}

/// A pull cursor from string fields (`{}` when empty).
func cursor(_ fields: [String: String] = [:]) -> PullCursor {
    .object(fields.mapValues { .string($0) })
}

/// An error that reads as `message`, like `new Error(message)`.
struct TestError: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}

/// A thread-safe box for a fake's mutable state.
final class Locked<Value>: @unchecked Sendable {
    private var value: Value
    private let lock = NSLock()

    init(_ value: Value) { self.value = value }

    func withLock<T>(_ body: (inout Value) throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body(&value)
    }

    var current: Value { withLock { $0 } }
}

/// A fake sync server (engine.test.ts `FakeServer`): records pushes and pull cursors, serves
/// queued pages, and can fail, reject tables, or be read-only.
final class FakeServer: SyncTransport, @unchecked Sendable {
    struct State {
        var received: [[Mutation]] = []
        var failNextPush = false
        var rejectTables: Set<String> = []
        var readOnly = false
        var pages: [PullPage] = []
        var cursors: [PullCursor] = []
        var scopeValue: String? = "c1:all"
        var failPullAt = -1
        /// The next this many pulls fail with `pullError`.
        var failingPulls = 0
        var pullError: any Error & Sendable = TestError("network down")
        /// Holds each pull this long, so overlapping syncs can be seen.
        var pullDelay: Duration = .zero
        /// public.sync_pull_count's answer (nil: an older server).
        var counts: [String: Int]? = nil
        var failCount = false
        var pageSizes: [Int] = []
    }

    let state = Locked(State())

    var received: [[Mutation]] { state.current.received }
    var cursors: [PullCursor] { state.current.cursors }

    func set(_ change: (inout State) -> Void) { state.withLock(change) }

    func scope() async throws -> String? { state.current.scopeValue }

    func pullCount() async throws -> [String: Int]? {
        if state.current.failCount { throw TestError("no such function") }
        return state.current.counts
    }

    func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
        try state.withLock { s in
            if s.failNextPush {
                s.failNextPush = false
                throw TestError("network down")
            }
            s.received.append(mutations)
            return PushResponse(
                serverHLC: fakeServerHLC,
                results: mutations.map { m in
                    if s.readOnly {
                        return MutationResult(
                            id: m.id, status: .rejected, code: "TL423", error: "This shop is read-only.")
                    }
                    if s.rejectTables.contains(m.table) {
                        return MutationResult(id: m.id, status: .rejected, code: "42501", error: "not allowed")
                    }
                    return MutationResult(id: m.id, status: .applied)
                })
        }
    }

    func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
        let delay = state.current.pullDelay
        if delay > .zero { try await Task.sleep(for: delay) }
        return try state.withLock { s in
            s.cursors.append(cursor)
            s.pageSizes.append(pageSize)
            if s.cursors.count - 1 == s.failPullAt { throw TestError("network down") }
            if s.failingPulls > 0 {
                s.failingPulls -= 1
                throw s.pullError
            }
            if !s.pages.isEmpty { return s.pages.removeFirst() }
            return PullPage(rows: [], done: true, cursor: .object(["from": .string("1")]), serverHLC: fakeServerHLC)
        }
    }
}
