#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // Standalone quotes (owner, 2026-11-24; docs/design/2026-11-24-standalone-quotes.md): More ›
    // Quotes on Sent and Accepted (one waiting for a pool), New Quote (new customer and from a
    // customer page), and the Quote screen (a draft standalone quote, and one on a job).
    @Suite(.serialized) @MainActor struct QuoteShots {
        /// Two quote jobs and a quote on Maria's job #1042, as a sync would bring them.
        func seedQuotes(_ env: AppEnvironment) throws {
            let store = env.session.sync.store
            let maria = try #require(try store.list("job").first { $0["number"]?.number == 1042 })
            func row(_ table: String, _ values: Row) -> PulledRow {
                var r = values
                r["company_id"] = "c1"
                return PulledRow(table: table, xid: "9", row: r)
            }
            try store.applyPage(
                PullPage(
                    rows: [
                        row("customer", ["id": "cq1", "kind": "homeowner", "name": "Grace Holloway"]),
                        row("customer", ["id": "cq2", "kind": "homeowner", "name": "Riley Rivera"]),
                        row(
                            "job",
                            ["id": "jq1", "type": "repair", "status": "quote", "bill_to_customer_id": "cq1"]),
                        row(
                            "job",
                            ["id": "jq2", "type": "repair", "status": "quote", "bill_to_customer_id": "cq2"]),
                        row(
                            "quote",
                            [
                                "id": "q1", "job_id": .string(maria.id), "number": 1043, "status": "sent",
                                "total_cents": 125000, "created_at": "2026-11-20T10:00:00Z",
                            ]),
                        row(
                            "quote",
                            [
                                "id": "q2", "job_id": "jq1", "number": 1044, "status": "sent", "total_cents": 48000,
                                "created_at": "2026-11-21T10:00:00Z",
                            ]),
                        row(
                            "quote",
                            [
                                "id": "q3", "job_id": "jq2", "number": 1045, "status": "accepted",
                                "total_cents": 97500, "accepted_by_name": "Riley Rivera",
                                "accepted_at": "2026-11-22T17:00:00Z", "created_at": "2026-11-22T10:00:00Z",
                            ]),
                        row(
                            "quote_line_item",
                            [
                                "id": "ql1", "quote_id": "q3", "description": "Replace skimmer throat", "quantity": 1,
                                "unit_price_cents": 97500, "taxable": true, "sort_order": 1,
                            ]),
                    ], done: true, cursor: [:], serverHLC: "1760000000009-0000-srv"))
        }

        @Test func quotesList() async throws {
            let env = try sampleEnvironment()
            try seedQuotes(env)
            try await snapshot("82-quotes", height: 1100, NavigationStack { QuotesScreen() }.app(env))
            try await snapshot(
                "82-quotes-dark", dark: true, height: 1100, NavigationStack { QuotesScreen() }.app(env))
        }

        @Test func newQuote() async throws {
            let env = try sampleEnvironment()
            let company = try #require(env.session.company)
            let sync = env.session.sync
            try await snapshot(
                "82-new-quote", height: 1500,
                NavigationStack {
                    NewQuoteView(form: NewQuoteForm(sync: sync, company: company, userId: "u1"), back: "Jobs") { _ in }
                }
                .app(env))
            // From Maria's page: Maria and her pool already picked.
            let maria = try #require(try sync.store.list("customer").first { $0["name"] == "Maria Alvarez" })
            try await snapshot(
                "82-new-quote-customer", height: 1300,
                NavigationStack {
                    NewQuoteView(
                        form: NewQuoteForm(sync: sync, company: company, userId: "u1", customerId: maria.id),
                        back: "Maria Alvarez"
                    ) { _ in }
                }
                .app(env))
        }

        @Test func quoteScreen() async throws {
            let env = try sampleEnvironment()
            let company = try #require(env.session.company)
            let sync = env.session.sync
            try seedQuotes(env)
            // A draft just made for a new customer, no pool: Add Pool and Delete Quote.
            let form = NewQuoteForm(sync: sync, company: company, userId: "u1")
            form.input.customerName = "Daniel Reyes"
            let draft = try form.save()
            try await snapshot("82-quote-draft", height: 2000, NavigationStack { QuoteScreen(quoteId: draft) }.app(env))
            // Accepted with no pool yet: the note and Add Pool.
            try await snapshot(
                "82-quote-needs-pool", height: 1400, NavigationStack { QuoteScreen(quoteId: "q3") }.app(env))
            // On job #1042: Customer, Pool and Job.
            try await snapshot(
                "82-quote-on-job", height: 1400, NavigationStack { QuoteScreen(quoteId: "q1") }.app(env))
        }
    }
#endif
