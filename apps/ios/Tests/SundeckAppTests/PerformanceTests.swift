import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// S9: a busy shop's phone, 1,000 jobs and 10,000 photos, stays quick. The budgets are for a
/// debug build on a CI machine, several times what the screens take on a phone in a release
/// build; they catch a query that goes from indexed to a scan of every row.
@Suite(.serialized) @MainActor struct PerformanceTests {
    static let jobs = 1_000
    static let photosPerJob = 10

    /// Seeds the shop once per test in pages, as a first sync would.
    func seeded() throws -> Shell {
        let s = try Shell()
        try s.seedCompany(userId: "u1", role: "owner")
        var rows: [PulledRow] = []
        func flush() throws {
            try s.sync.store.applyPage(
                PullPage(rows: rows, done: false, cursor: [:], serverHLC: "1760000000001-0000-srv"))
            rows.removeAll(keepingCapacity: true)
        }
        let day: TimeInterval = 86_400
        let start = Date(timeIntervalSince1970: 1_791_000_000)
        for i in 0..<Self.jobs {
            let c = "cu\(i)"
            let p = "pr\(i)"
            let j = "jb\(i)"
            let when = isoTimestamp(
                milliseconds: (start.timeIntervalSince1970 + Double(i % 60) * day + Double(i % 8) * 3_600) * 1000)
            rows.append(
                PulledRow(
                    table: "customer", xid: "1",
                    row: ["id": .string(c), "company_id": "c1", "name": .string("Customer \(i)")]))
            rows.append(
                PulledRow(
                    table: "property", xid: "1",
                    row: [
                        "id": .string(p), "company_id": "c1", "customer_id": .string(c),
                        "address_line1": .string("\(i) Desert Willow Dr"), "city": "Gilbert", "state": "AZ",
                        "latitude": .number(33.3 + Double(i % 50) / 100),
                        "longitude": .number(-111.8 + Double(i % 40) / 100),
                    ]))
            rows.append(
                PulledRow(
                    table: "job", xid: "1",
                    row: [
                        "id": .string(j), "company_id": "c1", "number": .number(Double(1000 + i)),
                        "status": i % 5 == 0 ? "done" : "scheduled", "type": "detection",
                        "customer_id": .string(c), "bill_to_customer_id": .string(c), "property_id": .string(p),
                        "assigned_user_id": i % 3 == 0 ? "u1" : "u2", "scheduled_start": .string(when),
                        "created_at": .string(when),
                    ]))
            for k in 0..<Self.photosPerJob {
                rows.append(
                    PulledRow(
                        table: "media", xid: "1",
                        row: [
                            "id": .string("md\(i)-\(k)"), "company_id": "c1", "job_id": .string(j), "kind": "photo",
                            "storage_path": .string("c1/\(j)/\(k).jpg"), "captured_at": .string(when),
                            "created_at": .string(when),
                        ]))
            }
            if rows.count >= 2_000 { try flush() }
        }
        try flush()
        return s
    }

    func time(_ body: () throws -> Void) rethrows -> Double {
        let t = Date()
        try body()
        return Date().timeIntervalSince(t)
    }

    @Test func screensStayQuickWithAThousandJobsAndTenThousandPhotos() throws {
        let s = try seeded()
        let store = s.sync.store
        #expect(try store.list("job", companyId: "c1").count == Self.jobs)
        let company = CompanyContext(
            id: "c1", name: "Demo Leak Co.", timeZone: "America/Phoenix", settings: [:], role: "owner")

        var rows = 0
        let jobs = try time {
            let views = try jobViews(store, companyId: "c1")
            rows =
                jobList(
                    views, filter: .open, search: "", now: Date(), timeZone: "America/Phoenix", userId: "u1",
                    seesAll: true, names: [:]
                ).count
        }
        #expect(rows > 0)

        var media = 0
        let photos = try time {
            for i in stride(from: 0, to: Self.jobs, by: 100) {
                media += jobMedia(store, MediaTarget(jobId: "jb\(i)")).count
            }
        }
        #expect(media == 10 * Self.photosPerJob)

        let schedule = try time {
            let ctx = scheduleContext(store, company: company, userId: "u1")
            let team = teamMembers(store, kv: s.sync.kv, companyId: "c1", userId: "u1")
            let all = scheduleJobs(store, companyId: "c1")
            let days = try scheduleDays(.week, ctx.today)
            _ = loadRoutes(all, ctx: ctx, dates: days, team: team, drive: DriveTimes())
        }

        let customers = try time { #expect(customerList(store, companyId: "c1").count == Self.jobs) }
        let pending = try time { _ = try store.pendingCount() }

        print(
            "PERF jobs \(jobs)s, 10 jobs' photos \(photos)s, schedule week \(schedule)s, customers \(customers)s, outbox \(pending)s"
        )
        #expect(jobs < 3)
        #expect(photos < 0.5)
        #expect(schedule < 3)
        #expect(customers < 3)
        #expect(pending < 0.1)
    }
}
