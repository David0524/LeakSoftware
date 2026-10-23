import SundeckCore
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/engine.test.ts.
@Suite struct SyncEngineTests {
    let c = testCompany

    @Test func pushesMergedChangesAndClearsTheOutbox() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        let id = try store.insert("customer", companyId: c, ["name": .string("a")])
        try store.write("customer", id: id, companyId: c, ["name": .string("b")])
        let s = await SyncEngine(store: store, transport: server).sync()
        #expect(s.pushed == 1)
        #expect(s.pending == 0)
        #expect(server.received.first?.first?.fields["name"]?.v == .string("b"))
    }

    @Test func keepsChangesWhenTheNetworkFailsAndSendsThemNextTime() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        try store.insert("customer", companyId: c, ["name": .string("a")])
        server.set { $0.failNextPush = true }
        let engine = SyncEngine(store: store, transport: server)
        let first = await engine.sync()
        #expect(first.error == "network down")
        #expect(first.pending == 1)
        let second = await engine.sync()
        #expect(second.pushed == 1)
        #expect(second.pending == 0)
    }

    @Test func doesNotLoopOnRejectedChanges() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        server.set { $0.rejectTables.insert("quote") }
        try store.insert("quote", companyId: c, ["status": .string("accepted")])
        try store.insert("customer", companyId: c, ["name": .string("fine")])
        let s = await SyncEngine(store: store, transport: server).sync()
        #expect(s.pushed == 1)
        #expect(s.rejected == 1)
        #expect(s.pending == 0)
        #expect(server.received.count == 1)
        #expect(try store.problems().count == 1)
    }

    @Test func keepsChangesOnTheDeviceWhileTheShopIsReadOnlyAndSendsThemOncePaid() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        server.set { $0.readOnly = true }
        try store.insert("customer", companyId: c, ["name": .string("kept")])
        let engine = SyncEngine(store: store, transport: server)
        let first = await engine.sync()
        #expect(first.pushed == 0)
        #expect(first.rejected == 0)
        #expect(first.pending == 1)
        #expect(first.readOnly == "This shop is read-only.")
        #expect(first.error == nil)
        #expect(try store.problems().isEmpty)
        server.set { $0.readOnly = false }
        let second = await engine.sync()
        #expect(second.pushed == 1)
        #expect(second.pending == 0)
        #expect(second.readOnly == nil)
    }

    @Test func pushesInBatches() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        for i in 0..<5 { try store.insert("customer", companyId: c, ["name": .string("c\(i)")]) }
        _ = await SyncEngine(store: store, transport: server, pushBatch: 2).sync()
        #expect(server.received.map(\.count) == [2, 2, 1])
    }

    @Test func pullsEveryPage() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        func row(_ n: Int) -> PulledRow {
            pulled(
                "customer", ["id": .string("id\(n)"), "company_id": .string(c), "name": .string("n\(n)")],
                xid: String(n))
        }
        server.set {
            $0.pages = [
                PullPage(
                    rows: [row(1), row(2)], done: false,
                    cursor: .object([
                        "from": .string("0"), "high": .string("9"),
                        "after": .array([.string("2"), .string("customer"), .string("id2")]),
                    ]), serverHLC: fakeServerHLC),
                PullPage(rows: [row(3)], done: true, cursor: cursor(["from": "9"]), serverHLC: fakeServerHLC),
            ]
        }
        let s = await SyncEngine(store: store, transport: server).sync()
        #expect(s.pulled == 3)
        #expect(try store.list("customer").count == 3)
        #expect(try store.cursor() == cursor(["from": "9"]))
    }

    /// TypeScript checks that two calls return the same promise. Here the server holds each pull
    /// so the two calls overlap, and the server must see one sync, with both callers getting
    /// its summary.
    @Test func runsOneSyncAtATime() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        server.set { $0.pullDelay = .milliseconds(200) }
        try store.insert("customer", companyId: c, ["name": .string("a")])
        let engine = SyncEngine(store: store, transport: server)
        async let a = engine.sync()
        async let b = engine.sync()
        let (first, second) = await (a, b)
        #expect(first == second)
        #expect(server.received.count == 1)
        #expect(server.cursors.count == 1)
    }

    /// "when what the tech may see changes"
    @Suite struct WhenWhatTheTechMaySeeChanges {
        let c = testCompany
        let j1 = "00000000-0000-4000-8000-0000000000a1"
        let j2 = "00000000-0000-4000-8000-0000000000a2"

        func row(_ table: String, _ id: String) -> PulledRow {
            pulled(table, ["id": .string(id), "company_id": .string(c)], xid: "5")
        }

        func page(_ rows: [PulledRow], done: Bool = true) -> PullPage {
            PullPage(rows: rows, done: done, cursor: cursor(["from": "9"]), serverHLC: fakeServerHLC)
        }

        @Test func pullsEverythingAgainAndDropsJobsThatAreNoLongerTheirs() async throws {
            let store = try LocalStore.open(memoryDatabase())
            let server = FakeServer()
            let engine = SyncEngine(store: store, transport: server)
            server.set { $0.pages = [page([row("job", j1), row("job", j2)])] }
            _ = await engine.sync()
            #expect(try store.scope() == "c1:all")
            #expect(try store.get("job", j2) != nil)

            // Same scope: an ordinary incremental pull from the saved cursor.
            _ = await engine.sync()
            #expect(server.cursors.last == cursor(["from": "9"]))

            // The owner limits techs; J2 isn't theirs. Everything comes again, J2 is gone.
            server.set {
                $0.scopeValue = "c1:own1"
                $0.pages = [page([row("job", j1)], done: false), page([])]
            }
            let s = await engine.sync()
            #expect(server.cursors.dropLast().last == cursor())
            #expect(s.pulled == 1)
            #expect(try store.get("job", j1) != nil)
            #expect(try store.get("job", j2) == nil)
            #expect(try store.scope() == "c1:own1")
        }

        @Test func keepsRowsWithChangesNotYetSent() async throws {
            let store = try LocalStore.open(memoryDatabase())
            let server = FakeServer()
            let engine = SyncEngine(store: store, transport: server)
            server.set { $0.pages = [page([row("job", j1), row("job", j2)])] }
            _ = await engine.sync()
            server.set { $0.readOnly = true }  // the change stays unsent
            try store.write("job", id: j2, companyId: c, ["summary_notes": .string("found the leak")])
            server.set {
                $0.scopeValue = "c1:own2"
                $0.pages = [page([row("job", j1)])]
            }
            _ = await engine.sync()
            #expect(try store.get("job", j2) != nil)
        }

        @Test func startsOverAgainWhenTheFullPullIsInterrupted() async throws {
            let store = try LocalStore.open(memoryDatabase())
            let server = FakeServer()
            let engine = SyncEngine(store: store, transport: server, pullRetryDelays: [0, 0, 0])
            server.set { $0.pages = [page([row("job", j1), row("job", j2)])] }
            _ = await engine.sync()
            server.set {
                $0.scopeValue = "c1:own3"
                $0.failingPulls = 4  // the next pull fails, and its three retries
            }
            let failed = await engine.sync()
            #expect(failed.error == "network down")
            #expect(try store.scope() == "c1:all")
            #expect(try store.get("job", j2) != nil)
            server.set { $0.pages = [page([row("job", j1)])] }
            _ = await engine.sync()
            #expect(server.cursors.last == cursor())
            #expect(try store.get("job", j2) == nil)
        }
    }

    /// A pull page that fails on the network is asked for again after 1, 3 and 8 seconds before the
    /// sync gives up (owner, 2026-10-22). Port of engine.test.ts "a pull page that fails on the network".
    @Suite struct APullPageThatFailsOnTheNetwork {
        let c = testCompany
        let j1 = "00000000-0000-4000-8000-0000000000a1"

        final class Waits: @unchecked Sendable {
            let all = Locked<[Double]>([])
        }

        func setup() throws -> (LocalStore, FakeServer, Waits, SyncEngine) {
            let store = try LocalStore.open(memoryDatabase())
            let server = FakeServer()
            let waits = Waits()
            let engine = SyncEngine(
                store: store, transport: server, sleep: { s in waits.all.withLock { $0.append(s) } })
            server.set {
                $0.pages = [
                    PullPage(
                        rows: [pulled("job", ["id": .string(j1), "company_id": .string(c)], xid: "5")], done: true,
                        cursor: cursor(["from": "9"]), serverHLC: fakeServerHLC)
                ]
            }
            return (store, server, waits, engine)
        }

        @Test func isAskedForAgainFromTheSameCursor() async throws {
            let (store, server, waits, engine) = try setup()
            server.set { $0.failingPulls = 3 }
            let s = await engine.sync()
            #expect(s.error == nil)
            #expect(waits.all.current == [1, 3, 8])
            #expect(server.cursors == [cursor(), cursor(), cursor(), cursor()])
            #expect(try store.get("job", j1) != nil)
        }

        @Test func failsTheSyncAfterThreeRetriesAndTheNextSyncCarriesOn() async throws {
            let (store, server, waits, engine) = try setup()
            server.set { $0.failingPulls = 4 }
            let s = await engine.sync()
            #expect(s.error == "network down")
            #expect(waits.all.current == [1, 3, 8])
            #expect(try store.get("job", j1) == nil)
            #expect(await engine.sync().error == nil)
            #expect(try store.get("job", j1) != nil)
        }

        @Test func isNotRetriedWhenTheSignInIsRefusedOrTheServerSaysNo() async throws {
            for error: any Error & Sendable in [AuthError("JWT expired"), TestError("permission denied for table job")]
            {
                let (_, server, waits, engine) = try setup()
                server.set {
                    $0.failingPulls = 1
                    $0.pullError = error
                }
                _ = await engine.sync()
                #expect(waits.all.current.isEmpty)
                #expect(server.cursors.count == 1)
            }
        }

        @Test func tellsNetworkFailuresFromOtherErrors() {
            for m in [
                "TypeError: Network request failed", "The Internet connection appears to be offline.",
                "The request timed out.", "connection reset", "Error Domain=NSURLErrorDomain Code=-1005",
                "504 Gateway Timeout",
            ] {
                #expect(isNetworkFailure(TestError(m)), "\(m)")
            }
            for m in ["permission denied for table job", "duplicate key value"] {
                #expect(!isNetworkFailure(TestError(m)), "\(m)")
            }
            #expect(!isNetworkFailure(AuthError("network")))
        }

        @Test func aResumedFirstDownloadCountsWhatIsAlreadyOnThePhone() async throws {
            let store = try LocalStore.open(memoryDatabase())
            let server = FakeServer()
            func customer(_ n: Int) -> PulledRow {
                pulled(
                    "customer", ["id": .string("00000000-0000-7000-8000-00000000000\(n)"), "company_id": .string(c)])
            }
            // An earlier run saved two customers and the server's marked cursor, then lost its signal.
            try store.applyPage(
                PullPage(
                    rows: [customer(1), customer(2)], done: false,
                    cursor: ["first": true, "from": "0", "high": "9"], serverHLC: fakeServerHLC))
            server.set {
                $0.counts = ["customer": 4]
                $0.pages = [
                    PullPage(
                        rows: [customer(3), customer(4)], done: true, cursor: cursor(["from": "9"]),
                        serverHLC: fakeServerHLC)
                ]
            }
            let engine = SyncEngine(store: store, transport: server)
            let seen = Locked<[PullProgress]>([])
            await engine.setProgressHandler { p in seen.withLock { $0.append(p) } }
            #expect(await engine.sync().error == nil)
            // It goes on from 50%, not from 0%, as a first download (small opening page).
            #expect(seen.current.first?.pulled == ["customer": 2])
            #expect(seen.current.last?.pulled == ["customer": 4])
            #expect(seen.current.last?.totals == ["customer": 4])
            #expect(server.state.current.pageSizes.first == SyncEngine.openingPullPage)
        }
    }
}
