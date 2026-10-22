import SundeckCore
import Testing

@testable import SundeckSync

/// The first download's progress (owner, 2026-10-20: "Give a more interesting loading bar"):
/// the server's count once, rows counted per table as pages are applied, the biggest pages, and
/// a count that fails never failing the sync.
@Suite struct DownloadProgressTests {
    let c = testCompany

    final class Seen: @unchecked Sendable {
        let all = Locked<[PullProgress]>([])
    }

    private func row(_ id: String) -> Row { ["id": .string(id), "company_id": .string(testCompany)] }

    @Test func countsRowsPerTableOnTheFirstPull() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        server.set {
            $0.counts = ["customer": 2, "job": 1]
            $0.pages = [
                PullPage(
                    rows: [pulled("customer", row("00000000-0000-7000-8000-000000000001"))], done: false,
                    cursor: cursor(["customer": "1"]), serverHLC: fakeServerHLC),
                PullPage(
                    rows: [
                        pulled("customer", row("00000000-0000-7000-8000-000000000002")),
                        pulled("job", row("00000000-0000-7000-8000-000000000003")),
                    ], done: true, cursor: cursor(["job": "1"]), serverHLC: fakeServerHLC),
            ]
        }
        let engine = SyncEngine(store: store, transport: server)
        let seen = Seen()
        await engine.setProgressHandler { p in seen.all.withLock { $0.append(p) } }
        let s = await engine.sync()
        #expect(s.error == nil && s.pulled == 3)
        let all = seen.all.current
        // The first page is reported before the count is waited for, so the app can open on it.
        #expect(all.first == PullProgress(totals: nil))
        #expect(all.map(\.pulled) == [[:], ["customer": 1], ["customer": 1], ["customer": 2, "job": 1]])
        #expect(all.map { $0.totals == nil } == [true, true, false, false])
        #expect(all.last?.totals == ["customer": 2, "job": 1])
        #expect(all.last?.finished == true)
        // A small opening page (the company first), then 2,000 rows a page.
        #expect(server.state.current.pageSizes == [SyncEngine.openingPullPage, SyncEngine.firstPullPage])
        let progress = downloadProgress(all.last!.pulled, all.last!.totals)
        #expect(progress.percent == "100%")

        // Later pulls (a cursor already kept): no count, the usual pages.
        seen.all.withLock { $0 = [] }
        _ = await engine.sync()
        #expect(seen.all.current.isEmpty)
        #expect(server.state.current.pageSizes.last == 500)
    }

    @Test func aCountThatFailsNeverFailsTheSync() async throws {
        let store = try LocalStore.open(memoryDatabase())
        let server = FakeServer()
        server.set { $0.failCount = true }
        let engine = SyncEngine(store: store, transport: server)
        let seen = Seen()
        await engine.setProgressHandler { p in seen.all.withLock { $0.append(p) } }
        let s = await engine.sync()
        #expect(s.error == nil)
        #expect(seen.all.current.first?.totals == nil)
    }
}
