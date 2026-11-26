import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// Standalone quotes (docs/design/2026-11-24-standalone-quotes.md): New Quote's batch, the Quotes
// list, the Quote screen, Add Pool, Delete Quote, and quote jobs left out of every job list.

@Suite @MainActor struct StandaloneQuoteTests {
    let shell: Shell
    var sync: SyncService { shell.sync }

    init() throws {
        shell = try Shell()
        try shell.seedCompany(userId: "u1")
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "customer", xid: "2",
                        row: ["id": "cu1", "company_id": "c1", "kind": "homeowner", "name": "Maria Lopez"]),
                    PulledRow(
                        table: "customer", xid: "2",
                        row: ["id": "cu2", "company_id": "c1", "kind": "homeowner", "name": "Bo Lee"]),
                    PulledRow(
                        table: "property", xid: "2",
                        row: [
                            "id": "p1", "company_id": "c1", "customer_id": "cu2", "address_line1": "9 Elm St",
                            "city": "Mesa", "has_pool": true,
                        ]),
                    PulledRow(
                        table: "job", xid: "3",
                        row: [
                            "id": "j1", "company_id": "c1", "type": "detection", "status": "unscheduled",
                            "number": 1050,
                            "property_id": "p1", "bill_to_customer_id": "cu2",
                        ]),
                    PulledRow(
                        table: "quote", xid: "3",
                        row: [
                            "id": "q1", "company_id": "c1", "job_id": "j1", "number": 1043, "status": "sent",
                            "total_cents": 125000, "created_at": "2026-11-20T10:00:00Z",
                        ]),
                    PulledRow(
                        table: "job", xid: "3",
                        row: [
                            "id": "j2", "company_id": "c1", "type": "repair", "status": "quote",
                            "bill_to_customer_id": "cu1",
                        ]),
                    PulledRow(
                        table: "quote", xid: "3",
                        row: [
                            "id": "q2", "company_id": "c1", "job_id": "j2", "number": 1044, "status": "accepted",
                            "total_cents": 50000, "created_at": "2026-11-21T10:00:00Z",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
    }

    func form(role: String = "owner", customerId: String? = nil) -> NewQuoteForm {
        NewQuoteForm(
            sync: sync,
            company: CompanyContext(
                id: "c1", name: "Demo Leak Co.", timeZone: "America/Phoenix", settings: [:], role: role),
            userId: "u1", customerId: customerId)
    }

    @Test func quoteJobsAreLeftOutOfJobLists() throws {
        #expect(try jobViews(sync.store, companyId: "c1").map(\.id) == ["j1"])
        #expect(Set(try jobViews(sync.store, companyId: "c1", includeQuoteJobs: true).map(\.id)) == ["j1", "j2"])
        #expect(scheduleJobs(sync.store, companyId: "c1").map(\.id) == ["j1"])
        let records = searchRecords(sync.store, companyId: "c1", userId: "u1", seesAll: true)
        #expect(records.jobs?.map(\.id) == ["j1"])
        // Its quote stays in search's Quotes.
        #expect(Set(records.quotes?.map(\.id) ?? []) == ["q1", "q2"])
    }

    @Test func theQuotesListHasEveryQuoteNewestFirst() {
        let rows = quoteListRows(sync.store, companyId: "c1")
        #expect(rows.map(\.id) == ["q2", "q1"])
        #expect(rows.map(\.customer) == ["Maria Lopez", "Bo Lee"])
        #expect(rows[1].detail == "Quote #1043 · $1,250.00")
        #expect(rows[0].waitingForPool)
        #expect(!rows[1].waitingForPool)
        #expect(filterQuotes(rows, segment: nil, q: nil).map(\.id) == ["q1"])
        #expect(filterQuotes(rows, segment: "sent", q: "1050").map(\.id) == ["q1"])
    }

    @Test func aJobRouteToAQuoteJobOpensItsQuote() {
        #expect(standaloneQuoteId(sync.store, jobId: "j2") == "q2")
        #expect(standaloneQuoteId(sync.store, jobId: "j1") == nil)
    }

    @Test func theQuoteScreenShowsCustomerPoolAndJob() throws {
        let onJob = try #require(QuoteScreenModel(sync.store, companyId: "c1", quoteId: "q1"))
        #expect(onJob.title == "Quote #1043")
        #expect(onJob.customerName == "Bo Lee")
        #expect(onJob.poolAddress == "9 Elm St, Mesa")
        #expect(onJob.jobLabel == "Job #1050")
        #expect(!onJob.canDelete && !onJob.canAddPool)

        let standalone = try #require(QuoteScreenModel(sync.store, companyId: "c1", quoteId: "q2"))
        #expect(standalone.poolAddress == nil)
        #expect(standalone.canAddPool)
        #expect(standalone.jobLabel == nil)
        #expect(standalone.waitingForPool)
        // Accepted: not a draft, so no Delete Quote.
        #expect(!standalone.canDelete)
    }

    @Test func newQuoteForANewCustomerWritesOneBatch() throws {
        let f = form()
        #expect(!f.isDirty)
        #expect(throws: NewJobFormError.invalid) { try f.save() }
        #expect(f.errors["customerName"] == "Enter the customer's name.")
        f.input.customerName = " Ana Ruiz "
        f.input.city = "Phoenix"
        #expect(throws: NewJobFormError.invalid) { try f.save() }
        #expect(f.errors["addressLine1"] == "Enter the street address, or leave the address blank.")
        f.input.city = ""
        let quoteId = try f.save()

        let quote = try #require(try sync.store.getLive("quote", quoteId))
        let jobId = try #require(quote["job_id"]?.string)
        let job = try #require(try sync.store.getLive("job", jobId))
        #expect(job["status"]?.string == "quote")
        #expect(job["type"]?.string == "repair")
        #expect(job["property_id"] == nil || job["property_id"] == .null)
        // An owner's quote is nobody's in particular.
        #expect(job["assigned_user_id"] == .null)
        let customer = try #require(try sync.store.getLive("customer", job["bill_to_customer_id"]?.string ?? ""))
        #expect(customer["name"]?.string == "Ana Ruiz")
        #expect(quote["discount_cents"]?.number == 0)
        // Not in Jobs; in Quotes as a draft.
        #expect(try !jobViews(sync.store, companyId: "c1").contains { $0.id == jobId })
        #expect(quoteListRows(sync.store, companyId: "c1").first?.status == .draft)
        let model = try #require(QuoteScreenModel(sync.store, companyId: "c1", quoteId: quoteId))
        #expect(model.title == "Quote")
        #expect(model.canDelete)
    }

    @Test func newQuoteFromACustomerPagePicksTheCustomerAndTheirPool() throws {
        let f = form(role: "tech", customerId: "cu2")
        #expect(f.mode == .existing)
        #expect(f.customerId == "cu2")
        #expect(f.propertyId == "p1")
        #expect(!f.isDirty)
        let quoteId = try f.save()
        let jobId = try #require(try sync.store.getLive("quote", quoteId)?["job_id"]?.string)
        let job = try #require(try sync.store.getLive("job", jobId))
        #expect(job["bill_to_customer_id"]?.string == "cu2")
        #expect(job["property_id"]?.string == "p1")
        // A tech's own quote, so a tech limited to their jobs sees it.
        #expect(job["assigned_user_id"]?.string == "u1")
    }

    /// The second business (2026-11-26): New Quote starts on the main business; only a pick is saved.
    @Test func newQuoteSavesAPickedBusinessOnly() throws {
        #expect(!form().showsBusiness)
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "company", xid: "5",
                        row: [
                            "id": "c1", "company_id": "c1", "name": "Demo Leak Co.", "timezone": "America/Phoenix",
                            "settings": ["services": "both"], "second_name": "Demo Pool Care", "second_for": "pool",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
        let f = form(customerId: "cu2")
        #expect(f.showsBusiness)
        #expect(f.businessOptions.map(\.label) == ["Demo Leak Co.", "Demo Pool Care"])
        #expect(f.shownBusiness == .main)
        let automatic = try #require(try sync.store.getLive("quote", f.save())?["job_id"]?.string)
        let job = try #require(try sync.store.getLive("job", automatic))
        #expect(job["business"] == nil || job["business"] == .null)

        let g = form(customerId: "cu2")
        g.business = .second
        #expect(g.shownBusiness == .second)
        let picked = try #require(try sync.store.getLive("quote", g.save())?["job_id"]?.string)
        #expect(try sync.store.getLive("job", picked)?["business"] == "second")
    }

    @Test func addPoolSetsTheQuoteJobsPool() throws {
        try StandaloneQuoteWrites.addPool(
            sync, companyId: "c1", jobId: "j2", propertyId: nil, customerId: "cu1",
            address: NewQuoteInput(addressLine1: " 1 Main St ", state: "az"))
        let job = try #require(try sync.store.getLive("job", "j2"))
        let pool = try #require(try sync.store.getLive("property", job["property_id"]?.string ?? ""))
        #expect(pool["customer_id"]?.string == "cu1")
        #expect(pool["address_line1"]?.string == "1 Main St")
        #expect(pool["state"]?.string == "AZ")
        #expect(addPoolAddressError("  ") == "Enter the street address.")
    }

    @Test func deleteQuoteRemovesTheQuoteAndItsJob() throws {
        let quoteId = try form(customerId: "cu1").save()
        let jobId = try #require(try sync.store.getLive("quote", quoteId)?["job_id"]?.string)
        try StandaloneQuoteWrites.delete(sync, companyId: "c1", quoteId: quoteId, jobId: jobId)
        #expect(try sync.store.getLive("quote", quoteId) == nil)
        #expect(try sync.store.getLive("job", jobId) == nil)
        #expect(!quoteListRows(sync.store, companyId: "c1").contains { $0.id == quoteId })
    }

    @Test func aRepairJobFromAStandaloneQuoteShowsItReadOnly() throws {
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "job", xid: "4",
                        row: [
                            "id": "j2", "company_id": "c1", "type": "repair", "status": "unscheduled", "number": 1051,
                            "property_id": "p1", "bill_to_customer_id": "cu1",
                        ]),
                    PulledRow(
                        table: "quote", xid: "4",
                        row: [
                            "id": "q2", "company_id": "c1", "job_id": "j2", "number": 1044, "status": "accepted",
                            "total_cents": 50000, "repair_job_id": "j2", "accepted_by_name": "Maria Lopez",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        let job = try #require(try jobView(sync.store, companyId: "c1", jobId: "j2"))
        let model = QuoteSectionModel(
            store: sync.store, companyId: "c1", settings: [:], role: "owner", job: job, timeZone: "America/Phoenix")
        #expect(model.shows)
        #expect(!model.showsStart)
        #expect(model.cards.map(\.isEditable) == [false])
        // No link to the page it's already on.
        #expect(model.cards.first?.repairJobId == nil)
        #expect(standaloneQuoteId(sync.store, jobId: "j2") == nil)
        let screen = try #require(QuoteScreenModel(sync.store, companyId: "c1", quoteId: "q2"))
        #expect(screen.jobLabel == "Job #1051")
    }

    @Test func quotesAreInMoreAfterInvoices() {
        #expect(moreLinks(role: "tech", services: .leak) == [.customers, .invoices, .quotes, .activity])
        #expect(MoreLink.quotes.title == "Quotes")
    }
}
