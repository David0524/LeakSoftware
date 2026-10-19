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
            let engine = SyncEngine(store: store, transport: server)
            server.set { $0.pages = [page([row("job", j1), row("job", j2)])] }
            _ = await engine.sync()
            server.set {
                $0.scopeValue = "c1:own3"
                $0.failPullAt = $0.cursors.count  // the next pull fails
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
}
