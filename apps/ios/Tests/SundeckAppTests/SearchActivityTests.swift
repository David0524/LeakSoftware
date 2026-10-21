import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// Search on Jobs and Activity under More (docs/plans/search-and-activity.md): what search reads
// from the phone's database, Recent, and Activity's pages.

@Suite @MainActor struct ShopSearchTests {
    let company = "co"

    private func open() throws -> (LocalStore, KeyValue) {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("search-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "7d", count: 32))
        return (try LocalStore.open(db), try KeyValue(db))
    }

    /// Sam Ochoa with a pool and two jobs (one Tony's, one Lee's), each with a quote and invoice.
    private func shop(_ store: LocalStore) throws {
        try store.write(
            "customer", id: "c1", companyId: company,
            ["name": "Sam Ochoa", "phone": "(602) 555-0142", "email": "sam@example.com"])
        try store.write(
            "property", id: "p1", companyId: company,
            ["customer_id": "c1", "address_line1": "1038 Palm Lane", "city": "Mesa"])
        try store.write(
            "job", id: "j1", companyId: company,
            [
                "number": 1038, "type": "detection", "status": "scheduled", "property_id": "p1",
                "assigned_user_id": "tony", "scheduled_start": "2026-10-14T16:30:00Z",
            ])
        try store.write(
            "job", id: "j2", companyId: company,
            [
                "number": 1039, "type": "repair", "status": "scheduled", "bill_to_customer_id": "c1",
                "assigned_user_id": "lee",
            ])
        try store.write(
            "quote", id: "q1", companyId: company,
            ["job_id": "j1", "number": 1012, "status": "sent", "total_cents": 97500])
        try store.write(
            "quote", id: "q2", companyId: company,
            ["job_id": "j2", "number": 1013, "status": "draft", "total_cents": 1000])
        try store.write(
            "invoice", id: "i1", companyId: company,
            [
                "job_id": "j1", "number": 1028, "status": "partially_paid", "total_cents": 50000,
                "amount_paid_cents": 12500,
            ])
    }

    @Test func searchesThePhonesOwnRows() throws {
        let (store, _) = try open()
        try shop(store)
        let records = searchRecords(store, companyId: company, userId: "tony", seesAll: true)
        let found = try searchShop(
            "ochoa", records, now: parseISODate("2026-10-20T16:00:00Z")!, timeZone: "America/Phoenix")
        #expect(found.groups.map(\.key) == [.customers, .jobs, .quotes, .invoices])
        #expect(
            found.groups.first { $0.key == .jobs }?.hits.map(\.title) == [
                "Job #1038 · Leak detection", "Job #1039 · Repair",
            ])
        #expect(found.groups.first { $0.key == .invoices }?.hits.first?.title == "Invoice #1028 · $375.00 due")
        // The pool's customer comes from the customer row; the job's from its pool.
        let pool = try searchShop("palm", records, now: Date(), timeZone: "UTC").groups.first?.hits.first
        #expect(pool?.detail == "Sam Ochoa")
        #expect(pool?.open == SearchOpen(screen: .customer, id: "c1"))
    }

    @Test func aTechLimitedToTheirOwnJobsFindsOnlyThose() throws {
        let (store, _) = try open()
        try shop(store)
        let records = searchRecords(store, companyId: company, userId: "tony", seesAll: false)
        #expect(records.jobs?.map(\.id) == ["j1"])
        #expect(records.quotes?.map(\.id) == ["q1"])
        #expect(records.invoices?.map(\.id) == ["i1"])
        // Customers and pools are what the rest of the app shows them.
        #expect(records.customers?.map(\.id) == ["c1"])
    }

    @Test func deletedRowsNeverShow() throws {
        let (store, _) = try open()
        try shop(store)
        try store.softDelete("job", "j2")
        let records = searchRecords(store, companyId: company, userId: "tony", seesAll: true)
        #expect(records.jobs?.map(\.id) == ["j1"])
        #expect(records.quotes?.map(\.id) == ["q1"])
    }

    @Test func resultsOpenTheCustomerOrTheJobsWrapUp() {
        #expect(SearchDestination(SearchOpen(screen: .customer, id: "c")) == .customer("c"))
        #expect(SearchDestination(SearchOpen(screen: .job, id: "j")) == .job("j"))
        #expect(SearchDestination(SearchOpen(screen: .job, id: "j", section: .invoice)) == .jobSection("j", .wrapUp))
        #expect(SearchDestination(SearchOpen(screen: .job, id: "j", section: .quotes)) == .jobSection("j", .wrapUp))
    }

    @Test func recentKeepsTheLastEightNewestFirst() throws {
        let (_, kv) = try open()
        let recent = RecentSearches(kv: kv)
        #expect(recent.load().isEmpty)
        for n in 0..<10 {
            recent.remember(recentItem(customerId: "c\(n)", name: "Customer \(n)", phone: nil, email: nil))
        }
        #expect(recent.load().map(\.id) == ["c9", "c8", "c7", "c6", "c5", "c4", "c3", "c2"])
        recent.clear()
        #expect(recent.load().isEmpty)
    }

    @Test func aJobOpenedFromItsQuoteIsntAddedTwice() throws {
        let (_, kv) = try open()
        let recent = RecentSearches(kv: kv)
        let quote = RecentItem(
            kind: .quote, id: "q1", title: "Quote #1012 · $975.00", detail: "Sam Ochoa",
            open: SearchOpen(screen: .job, id: "j1", section: .quotes))
        recent.remember(quote)
        let job = RecentItem(
            kind: .job, id: "j1", title: "Job #1038 · Leak detection", detail: "Sam Ochoa",
            open: SearchOpen(screen: .job, id: "j1"))
        recent.opened(job)
        #expect(recent.load() == [quote])
        // Opened again later, from somewhere else, it goes first.
        recent.opened(recentItem(customerId: "c1", name: "Sam Ochoa", phone: " ", email: "sam@example.com"))
        recent.opened(job)
        #expect(recent.load().map(\.kind) == [.job, .customer, .quote])
        #expect(recent.load()[1].detail == "sam@example.com")
    }

    @Test func signingOutClearsRecent() {
        #expect(KVKey.signOutClears.contains(KVKey.searchRecent))
    }

    @Test func aJobPageAsRecent() throws {
        let (store, _) = try open()
        try shop(store)
        let view = try #require(try jobViews(store, companyId: company).first { $0.id == "j1" })
        let item = recentItem(job: view)
        #expect(item.title == "Job #1038 · Leak detection")
        #expect(item.detail == "Sam Ochoa")
        #expect(item.open == SearchOpen(screen: .job, id: "j1"))
    }
}

@Suite struct ActivityDataTests {
    @Test func pagesDecodeAndAddOnlyNewEvents() throws {
        let first = try JSONDecoder().decode(
            ActivityPage.self,
            from: Data(
                """
                {"events": [
                  {"id": "b", "kind": "report_sent", "created_at": "2026-10-20T16:00:00Z", "job_id": "j1",
                   "customer_name": "Maria Alvarez", "job_number": 1038},
                  {"id": "a", "kind": "text_received", "created_at": "2026-10-20T15:00:00Z",
                   "conversation_id": "cv", "preview": "Hi"}
                ], "more": true, "seen_at": null}
                """.utf8))
        var log = ActivityLog(first)
        #expect(log.next?.id == "a")
        let second = ActivityPage(
            events: [
                ActivityEvent(id: "a", kind: "text_received", createdAt: "2026-10-20T15:00:00Z"),
                ActivityEvent(id: "z", kind: "job_completed", createdAt: "2026-10-19T15:00:00Z"),
            ], more: false)
        log.append(second)
        #expect(log.events.map(\.id) == ["b", "a", "z"])
        #expect(log.next == nil)
        // A reply without a list reads as empty.
        let empty = try JSONDecoder().decode(ActivityPage.self, from: Data("{}".utf8))
        #expect(empty.events.isEmpty && !empty.more)
    }

    @Test func theFeedIsAskedForThePageAfterTheLastEvent() throws {
        func json(_ p: ActivityFeedParams) throws -> [String: JSONValue] {
            try JSONDecoder().decode([String: JSONValue].self, from: JSONEncoder().encode(p))
        }
        #expect(
            try json(ActivityFeedParams(company: "co"))
                == ["target_company": "co", "before_at": .null, "before_id": .null, "page_size": 50])
        let last = ActivityEvent(id: "e9", kind: "report_sent", createdAt: "2026-10-20T15:00:00Z")
        #expect(
            try json(ActivityFeedParams(company: "co", after: last, pageSize: 3))
                == ["target_company": "co", "before_at": "2026-10-20T15:00:00Z", "before_id": "e9", "page_size": 3])
    }
}
