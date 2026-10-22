import Foundation
import SundeckCore
import SundeckSync

/// A quote on the job with its lines (in order) and its customer link. Port of useJobQuotes in
/// apps/mobile/src/data/quotes.ts.
public struct JobQuote: Equatable, Sendable, Identifiable {
    public var quote: Quote
    public var lines: [QuoteLine]
    /// The customer link's token, once the quote has been sent.
    public var token: String?

    public var id: String { quote.id }
}

/// The job's quotes, newest first, each with its lines and customer link token.
public func jobQuotes(_ store: LocalStore, companyId: String, jobId: String) -> [JobQuote] {
    struct Link: Decodable {
        let token: String
        let quoteId: String?
        let revokedAt: String?
        enum CodingKeys: String, CodingKey {
            case token
            case quoteId = "quote_id"
            case revokedAt = "revoked_at"
        }
    }
    struct Line: Decodable {
        let id: String
        let quoteId: String
        let line: QuoteLine
        enum CodingKeys: String, CodingKey {
            case id
            case quoteId = "quote_id"
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            quoteId = try c.decode(String.self, forKey: .quoteId)
            line = try QuoteLine(from: decoder)
        }
    }
    let quotes = decodeJobRows(store, "quote", jobId, as: Quote.self).filter { $0.jobId == jobId }
    let ids = Set(quotes.map(\.id))
    let lines = decodeRows(store, "quote_line_item", companyId, as: Line.self).filter { ids.contains($0.quoteId) }
    let links = decodeJobRows(store, "share_link", jobId, as: Link.self)
    return
        quotes
        .sorted { a, b in
            let an = a.number ?? .max
            let bn = b.number ?? .max
            return an != bn ? an > bn : a.id > b.id
        }
        .map { quote in
            JobQuote(
                quote: quote,
                lines:
                    lines
                    .filter { $0.quoteId == quote.id }
                    .sorted { a, b in
                        let ao = a.line.sortOrder ?? 0
                        let bo = b.line.sortOrder ?? 0
                        return ao != bo ? ao < bo : a.id < b.id
                    }
                    .map {
                        var line = $0.line
                        line.id = $0.id
                        return line
                    },
                token: links.first { $0.quoteId == quote.id && $0.revokedAt == nil }?.token)
        }
}

/// The shop's price book (active items in order, for the quote builder).
public func priceBook(_ store: LocalStore, companyId: String) -> [PriceBookItem] {
    decodeRows(store, "price_book_item", companyId, as: PriceBookItem.self)
        .filter { $0.active && $0.deletedAt == nil }
        .sorted { $0.sortOrder != $1.sortOrder ? $0.sortOrder < $1.sortOrder : $0.name < $1.name }
}

/// The shop's tax rate and deposit rule (company settings).
public struct QuotePricing: Equatable, Sendable {
    public var taxRateBps: Int
    public var deposit: DepositRule

    public init(_ settings: JSONValue) {
        taxRateBps = settings["tax_rate_bps"]?.number.map { Int($0) } ?? 0
        // New shops default to no deposit (2026-10-18).
        deposit = (try? settings["deposit"]?.decode(DepositRule.self)) ?? DepositRule(type: .percent, valueBps: 0)
    }
}

/// Every quote write. All go through the sync service; a line change and the quote's new totals
/// are one batch, so the office always sees matching numbers. Port of apps/mobile/src/data/quotes.ts.
@MainActor
public enum QuoteWrites {
    public static func start(_ sync: SyncService, companyId: String, jobId: String) throws -> String {
        try sync.insert("quote", companyId: companyId, ["job_id": .string(jobId), "discount_cents": 0])
    }

    public static func addLine(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: JobQuote, _ line: QuoteLine
    ) throws {
        try sync.batch {
            try sync.store.insert(
                "quote_line_item", companyId: companyId,
                [
                    "quote_id": .string(quote.id),
                    "description": .string(line.description ?? ""),
                    "quantity": .number(line.quantity),
                    "unit_price_cents": .number(Double(line.unitPriceCents)),
                    "taxable": .bool(line.taxable),
                    "finding_id": line.findingId.map(JSONValue.string) ?? .null,
                    "price_book_item_id": line.priceBookItemId.map(JSONValue.string) ?? .null,
                    "sort_order": .number(Double((quote.lines.last?.sortOrder ?? 0) + 1)),
                ])
            try saveTotals(sync, companyId: companyId, pricing: pricing, quote: quote.quote, quote.lines + [line])
        }
    }

    public static func addItem(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: JobQuote, _ item: PriceBookItem,
        findingId: String?
    ) throws {
        try addLine(sync, companyId: companyId, pricing: pricing, quote: quote, lineFromItem(item, findingId))
    }

    /// The fields a tech can change on a line.
    public struct LineChange: Equatable, Sendable {
        public var quantity: Double?
        public var unitPriceCents: Cents?
        public var description: String?
        public var taxable: Bool?

        public init(
            quantity: Double? = nil, unitPriceCents: Cents? = nil, description: String? = nil, taxable: Bool? = nil
        ) {
            self.quantity = quantity
            self.unitPriceCents = unitPriceCents
            self.description = description
            self.taxable = taxable
        }
    }

    public static func updateLine(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: JobQuote, lineId: String,
        _ change: LineChange
    ) throws {
        var values: Row = [:]
        if let q = change.quantity { values["quantity"] = .number(q) }
        if let p = change.unitPriceCents { values["unit_price_cents"] = .number(Double(p)) }
        if let d = change.description { values["description"] = .string(d) }
        if let t = change.taxable { values["taxable"] = .bool(t) }
        let lines = quote.lines.map { line -> QuoteLine in
            guard line.id == lineId else { return line }
            var l = line
            l.quantity = change.quantity ?? l.quantity
            l.unitPriceCents = change.unitPriceCents ?? l.unitPriceCents
            l.description = change.description ?? l.description
            l.taxable = change.taxable ?? l.taxable
            return l
        }
        try sync.batch {
            try sync.store.write("quote_line_item", id: lineId, companyId: companyId, values)
            try saveTotals(sync, companyId: companyId, pricing: pricing, quote: quote.quote, lines)
        }
    }

    public static func removeLine(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: JobQuote, lineId: String
    ) throws {
        try sync.batch {
            try sync.store.write("quote_line_item", id: lineId, companyId: companyId, ["deleted_at": nowISO()])
            try saveTotals(
                sync, companyId: companyId, pricing: pricing, quote: quote.quote, quote.lines.filter { $0.id != lineId }
            )
        }
    }

    public static func setDiscount(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: JobQuote, cents: Cents
    ) throws {
        var q = quote.quote
        q.discountCents = cents
        try sync.batch {
            try sync.store.write(
                "quote", id: quote.id, companyId: companyId, ["discount_cents": .number(Double(cents))])
            try saveTotals(sync, companyId: companyId, pricing: pricing, quote: q, quote.lines)
        }
    }

    /// Recomputes and saves a draft's totals so the office sees current numbers.
    private static func saveTotals(
        _ sync: SyncService, companyId: String, pricing: QuotePricing, quote: Quote, _ lines: [QuoteLine]
    ) throws {
        let t = quoteTotals(lines, quote.discountCents, pricing.taxRateBps, pricing.deposit)
        try sync.store.write(
            "quote", id: quote.id, companyId: companyId,
            [
                "subtotal_cents": .number(Double(t.subtotalCents)),
                "tax_cents": .number(Double(t.taxCents)),
                "total_cents": .number(Double(t.totalCents)),
                "deposit_cents": .number(Double(t.depositCents)),
            ])
    }
}

/// Quotes and invoices go out through the Sundeck Pro server, after a sync, with the Expo app's
/// messages. Port of sendQuoteFromPhone (apps/mobile/src/data/quotes.ts) and
/// apps/mobile/src/data/invoices.ts.
@MainActor
public struct MoneyServer {
    public let sync: SyncService
    public let api: WebAPI

    public init(sync: SyncService, api: WebAPI) {
        self.sync = sync
        self.api = api
    }

    public struct Shared: Equatable, Sendable {
        public var link: String
        public var message: String
    }

    /// Sends the quote; returns the link and a text message.
    public func sendQuote(_ quoteId: String, shopName: String) async throws -> Shared {
        await sync.syncNow()
        // Removed lines are no longer in the quote, so check every unsent line change.
        if sync.hasPendingWrites("quote", quoteId) || sync.hasPendingWrites("quote_line_item") {
            throw WebAPI.Failure(description: "The quote hasn’t reached the server yet. Try again with signal.")
        }
        let reply = try await api.post("api/quotes/\(quoteId)/send")
        guard let link = reply["link"]?.string else { throw WebAPI.Failure(description: "The server said no link.") }
        await sync.syncNow()
        return Shared(link: link, message: reply["message"]?.string ?? quoteShareText(shopName, link))
    }

    /// The server builds the invoice from the job (fee, accepted quote, deposit); it syncs down.
    /// It waits only for the phone's own unsent changes, and the invoice comes down with a sync
    /// started after (owner, 2026-10-22: Create Invoice "takes a super long time": it waited for
    /// two whole syncs, which can be a large download).
    public func createInvoice(jobId: String) async throws -> String {
        if ((try? sync.store.pendingCount()) ?? 0) > 0 { await sync.syncNow() }
        let reply = try await api.post("api/jobs/\(jobId)/invoice")
        Task { await sync.syncNow() }
        return reply["invoiceId"]?.string ?? ""
    }

    public struct InvoiceSent: Equatable, Sendable {
        public var link: String
        public var message: String
        public var status: String
        public var emailed: Bool
    }

    /// Sends the invoice by email, or for the tech to text.
    public func sendInvoice(_ invoiceId: String, channel: ReportServer.Channel, to: String?) async throws
        -> InvoiceSent
    {
        await sync.syncNow()
        if sync.hasPendingWrites("invoice", invoiceId) {
            throw WebAPI.Failure(description: "Your changes haven’t reached the server yet. Try again with signal.")
        }
        let reply = try await api.post(
            "api/invoices/\(invoiceId)/send",
            ["channel": .string(channel.rawValue), "to": to.map(JSONValue.string) ?? .null])
        await sync.syncNow()
        return InvoiceSent(
            link: reply["link"]?.string ?? "", message: reply["message"]?.string ?? "",
            status: reply["status"]?.string ?? "", emailed: reply["emailed"]?.bool ?? false)
    }
}
