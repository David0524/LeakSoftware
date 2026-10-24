import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Supabase
import Testing

@testable import SundeckApp

/// S7's "Done when", as far as the dev project allows: a quote built offline-style and sent
/// from the Swift app, accepted on the customer's link, the job invoiced and the invoice sent
/// from the app, then paid. The deposit is paid by card only when the shop's Stripe account can
/// take charges (the demo shop's test onboarding isn't finished, so the test records the
/// payment as the office would, by check). Needs the network: runs only with `SUNDECK_LIVE=1`.
/// Each run leaves one job, its quote and invoice in the demo company.
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["SUNDECK_LIVE"] == "1")) @MainActor
struct LiveQuoteTests {
    @Test(.timeLimit(.minutes(5)))
    func aQuoteSentFromThePhoneIsAcceptedInvoicedAndPaid() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        _ = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        let client = check.client
        let token: @Sendable () async -> String? = { try? await client.auth.session.accessToken }
        let userId = try await client.auth.session.user.id.uuidString.lowercased()

        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("live-quote-\(UUID())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let db = try Database(
            path: folder.appendingPathComponent("app.db").path, key: String(repeating: "6b", count: 32))
        let store = try LocalStore.open(db)
        let sync = SyncService(
            store: store, kv: try KeyValue(db), transport: SupabaseTransport(SupabaseRPC(client)),
            auth: LiveQuoteAuth(), media: MediaFiles(root: folder))
        await sync.syncNow()
        let companyRow = try #require(try store.list("company").first)
        let company = try #require(companyRow["id"]?.string)
        let shop = companyRow["name"]?.string ?? "Shop"

        // ---- A job and its quote, built on the phone ----
        let run = String(UUID().uuidString.prefix(6))
        let customer = try sync.insert("customer", companyId: company, ["name": .string("Swift Quote \(run)")])
        let property = try sync.insert(
            "property", companyId: company,
            [
                "customer_id": .string(customer), "address_line1": "14 Quote Ct", "city": "Mesa", "state": "AZ",
                "has_pool": true, "has_spa": false,
            ])
        let job = try sync.insert(
            "job", companyId: company,
            [
                "property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress",
                "type": "detection", "assigned_user_id": .string(userId), "fee_cents": 64900,
                "started_at": .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
            ])
        let pricing = QuotePricing(companyRow["settings"] ?? [:])
        _ = try QuoteWrites.start(sync, companyId: company, jobId: job)
        let item = try #require(priceBook(store, companyId: company).first)
        var quote = try #require(jobQuotes(store, companyId: company, jobId: job).first)
        try QuoteWrites.addItem(sync, companyId: company, pricing: pricing, quote: quote, item, findingId: nil)
        quote = try #require(jobQuotes(store, companyId: company, jobId: job).first)
        #expect(quote.lines.count == 1)
        #expect(quote.quote.subtotalCents == item.priceCents)

        // ---- Sent from the phone ----
        let money = MoneyServer(sync: sync, api: WebAPI(baseURL: AppConfig.webURL, accessToken: token))
        let shared = try await money.sendQuote(quote.id, shopName: shop)
        #expect(shared.link.contains("/q/"))
        let linkToken = try #require(shared.link.split(separator: "/").last.map(String.init))
        quote = try #require(jobQuotes(store, companyId: company, jobId: job).first)
        #expect(quote.quote.status == .sent)
        #expect(quote.token == linkToken)

        // ---- The customer accepts on the link (no sign-in) ----
        let customerClient = ServerCheck.makeClient()
        try await customerClient.rpc(
            "accept_quote_by_link",
            params: [
                "link_token": AnyJSON.string(linkToken), "signer_name": .string("Swift Quote \(run)"),
                "agreed": .bool(true), "from_ip": .null, "user_agent": .string("Sundeck Pro Swift test"),
            ]
        ).execute()
        await sync.syncNow()
        quote = try #require(jobQuotes(store, companyId: company, jobId: job).first)
        #expect(quote.quote.status == .accepted)

        // ---- Invoiced and sent from the phone ----
        let invoiceId = try await money.createInvoice(jobId: job)
        #expect(!invoiceId.isEmpty)
        let sent = try await money.sendInvoice(invoiceId, channel: .smsDevice, to: nil)
        #expect(!sent.link.isEmpty)
        var invoice = try #require(jobInvoices(store, companyId: company, jobId: job).first { $0.id == invoiceId })
        #expect(invoice.invoice.status == .sent)
        #expect(invoice.invoice.totalCents > 0)

        // ---- Paid: by check, recorded by the owner as the office would ----
        let owner = ServerCheck(client: ServerCheck.makeClient())
        _ = try await owner.signIn(email: "owner@demo.leakbook.test", password: "leakbook-demo")
        try await owner.client.rpc(
            "record_invoice_payment",
            params: ["target_invoice": AnyJSON.string(invoiceId), "amount": .integer(invoice.invoice.balanceCents)]
        ).execute()
        await sync.syncNow()
        invoice = try #require(jobInvoices(store, companyId: company, jobId: job).first { $0.id == invoiceId })
        #expect(invoice.invoice.status == .paid)
        #expect(invoice.invoice.balanceCents == 0)
        try await owner.signOut()
        try await check.signOut()
    }
}

private struct LiveQuoteAuth: AuthBackend {
    func currentSession() async -> SignInResult? {
        SignInResult(user: SignedInUser(id: "live", email: "tech@demo.leakbook.test"), needsCode: false)
    }
    func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("not used") }
    func signUp(name: String, email: String, password: String, heardFrom: String?, heardFromOther: String?)
        async throws -> Bool
    { false }
    func verifyCode(_ code: String) async throws {}
    func refresh() async throws {}
    func signOut() async {}
}
