import Foundation
import SundeckCore
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/performance.test.ts. M11: a busy tech's phone after a year:
/// 1,000 jobs, each with a 27-item checklist and 10 photos (10,000 photos), loaded the way sync
/// loads them (pulled pages). The job screen must stay quick: it reads one job's rows through
/// the job index, not every row of a table.
///
/// Budgets are twice the TypeScript ones, for a debug build (unoptimized Swift with JSON coding)
/// on a shared CI machine. A debug build on Linux measured load 3.7–4.1 s, one job 4.4–5.3 ms,
/// whole tables 5.1–5.8 s, a save 1 ms, the job list 54–69 ms and a pending batch 0.5 ms, so
/// each budget has 7x or more headroom; the one-job read must still be 20x faster than the
/// whole tables, as in TypeScript.
@Suite(.serialized) struct PerformanceTests {
    static let jobs = 1_000
    static let items = 27
    static let photos = 10

    /// Budgets in milliseconds (TypeScript's in comments).
    static let loadBudget = 60_000.0  // 30,000
    static let jobReadBudget = 50.0  // 25
    static let saveBudget = 50.0  // 25
    static let jobListBudget = 500.0  // 250
    static let pendingBatchBudget = 100.0  // 50

    struct Loaded: Sendable {
        let store: LocalStore
        let ms: Double
    }

    /// Loaded once for the suite, like the TypeScript `describe` body.
    static let loaded: Loaded = {
        let result = time { try! load() }
        return Loaded(store: result.value, ms: result.ms)
    }()

    let job = "job-00500"
    let c = testCompany

    static func time<T>(_ body: () throws -> T) rethrows -> (ms: Double, value: T) {
        let start = ContinuousClock.now
        let value = try body()
        let elapsed = ContinuousClock.now - start
        let ms = Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15
        return (ms, value)
    }

    static func load() throws -> LocalStore {
        let store = try LocalStore.open(memoryDatabase())
        let c = testCompany
        var n = 0
        func id(_ prefix: String) -> String {
            defer { n += 1 }
            return "\(prefix)-\(pad(n, 8))"
        }
        var rows: [PulledRow] = []
        for j in 0..<jobs {
            let job = "job-\(pad(j, 5))"
            rows.append(
                pulled(
                    "job",
                    [
                        "id": .string(job), "company_id": .string(c), "status": .string("report_sent"),
                        "number": .number(Double(j)),
                    ]))
            for i in 0..<items {
                let comp = id("jc")
                rows.append(
                    pulled(
                        "job_component",
                        [
                            "id": .string(comp), "company_id": .string(c), "job_id": .string(job),
                            "label": .string("Item \(i)"), "sort_order": .number(Double(i)),
                        ]))
                rows.append(
                    pulled(
                        "checklist_item_result",
                        [
                            "id": .string(id("cr")), "company_id": .string(c), "job_id": .string(job),
                            "job_component_id": .string(comp), "status": .string("inspected"),
                            "outcome": .string("ok"),
                        ]))
            }
            for p in 0..<photos {
                rows.append(
                    pulled(
                        "media",
                        [
                            "id": .string(id("m")), "company_id": .string(c), "job_id": .string(job),
                            "kind": .string("photo"), "storage_path": .string("\(c)/\(job)/\(p).jpg"),
                            "upload_state": .string("uploaded"),
                        ]))
            }
        }
        for start in stride(from: 0, to: rows.count, by: 500) {
            try store.applyPage(
                PullPage(
                    rows: Array(rows[start..<min(start + 500, rows.count)]), done: false, cursor: cursor(),
                    serverHLC: fakeServerHLC))
        }
        return store
    }

    static func pad(_ n: Int, _ width: Int) -> String {
        let s = String(n)
        return String(repeating: "0", count: max(0, width - s.count)) + s
    }

    @Test func loadsThroughSyncInReasonableTime() throws {
        let loaded = Self.loaded
        #expect(try loaded.store.list("media").count == Self.jobs * Self.photos)
        #expect(loaded.ms < Self.loadBudget)
    }

    @Test func readsOneJobsChecklistAndPhotosQuickly() throws {
        let store = Self.loaded.store
        let read = try Self.time {
            (
                components: try store.list("job_component", companyId: c, jobId: job),
                results: try store.list("checklist_item_result", companyId: c, jobId: job),
                media: try store.list("media", companyId: c, jobId: job)
            )
        }
        #expect(read.value.components.count == Self.items)
        #expect(read.value.results.count == Self.items)
        #expect(read.value.media.count == Self.photos)
        // Reading the whole tables instead, for comparison.
        let whole = try Self.time {
            [
                try store.list("job_component", companyId: c),
                try store.list("checklist_item_result", companyId: c),
                try store.list("media", companyId: c),
            ]
        }
        print(
            "load \(Int(Self.loaded.ms)) ms · one job \(String(format: "%.2f", read.ms)) ms · whole tables \(Int(whole.ms)) ms"
        )
        #expect(read.ms < Self.jobReadBudget)
        #expect(read.ms * 20 < whole.ms)
    }

    @Test func savesAChecklistAnswerAndListsTheJobsQuickly() throws {
        let store = Self.loaded.store
        let save = try Self.time {
            try store.write(
                "checklist_item_result", id: "cr-new", companyId: c,
                ["job_id": .string(job), "status": .string("inspected"), "outcome": .string("leaking")])
        }
        let jobs = try Self.time { try store.list("job", companyId: c) }
        let batch = try Self.time { try store.pendingBatch(maxMutations: 200) }
        // TypeScript runs this test last; Swift Testing doesn't promise an order, so take the
        // new answer out again for the read test above.
        try store.database.query(
            "delete from sync_records where table_name = 'checklist_item_result' and id = 'cr-new'")
        try store.database.query("delete from sync_outbox where row_id = 'cr-new'")
        print(
            "save \(String(format: "%.2f", save.ms)) ms · list jobs \(Int(jobs.ms)) ms · pending batch \(String(format: "%.2f", batch.ms)) ms"
        )
        #expect(jobs.value.count == Self.jobs)
        #expect(save.ms < Self.saveBudget)
        #expect(jobs.ms < Self.jobListBudget)
        #expect(batch.ms < Self.pendingBatchBudget)
    }
}
