import Foundation
import Observation
import SundeckCore
import SundeckSync

// The Wrap-Up section's Quotes (spec 5.4, 6.4; milestone S7): what each quote card shows, the
// builder for a draft, and the tech's edits. Port of apps/mobile/src/features/quote/QuoteTab.tsx
// with the website's look and words (apps/web/src/components/quote-panel.tsx, quote-builder.tsx,
// app/actions/quote-draft.ts). Kept out of SwiftUI so it's tested on Linux.

/// A line of totals: "Subtotal  $1,250.00". `strong` is the Total.
public struct MoneyRow: Equatable, Sendable, Identifiable {
    public var label: String
    public var value: String
    public var strong = false

    public var id: String { label }

    public init(_ label: String, _ value: String, strong: Bool = false) {
        self.label = label
        self.value = value
        self.strong = strong
    }
}

/// A date as the website writes it with `dateStyle: "medium"` ("Oct 14, 2026"), and with
/// `timeStyle: "short"` ("Oct 15, 2026, 10:39 AM"), in the shop's time zone.
public func mediumDate(_ iso: String?, timeZone: String, time: Bool = false) -> String {
    guard let iso, let date = parseISODate(iso) else { return "" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(identifier: timeZone) ?? .current
    formatter.dateFormat = time ? "MMM d, yyyy, h:mm a" : "MMM d, yyyy"
    return formatter.string(from: date)
}

/// A quantity as JavaScript prints it: 1, 2.5.
public func quantityText(_ quantity: Double) -> String {
    quantity == quantity.rounded() && abs(quantity) < 1e15 ? String(Int(quantity)) : String(quantity)
}

/// Dollars for a field: 125000 → "1250.00".
public func centsFieldText(_ cents: Cents) -> String {
    let magnitude = cents.magnitude
    let fraction = magnitude % 100
    return "\(cents < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
}

/// A price book item the builder offers.
public struct QuoteItemOption: Equatable, Sendable, Identifiable {
    public var item: PriceBookItem
    /// Already a line on this quote: "✓ …", disabled.
    public var added: Bool

    public var id: String { item.id }
    /// "+ Skimmer repair · $450.00", or "✓ …" once on the quote.
    public var title: String { "\(added ? "✓" : "+") \(item.name) · \(formatCents(item.priceCents))" }
    public var accessibilityLabel: String { "Add \(item.name), \(formatCents(item.priceCents))" }
    /// "Skimmer repair ($450.00)", the price book menu's wording.
    public var menuTitle: String { "\(item.name) (\(formatCents(item.priceCents)))" }
}

/// An unrepaired finding and the price book items for its component.
public struct FindingSuggestion: Equatable, Sendable, Identifiable {
    public var findingId: String
    public var title: String
    public var items: [QuoteItemOption]

    public var id: String { findingId }
    public static let noItems = "No price book items for this component. Add a custom line."
}

/// A sent quote's line: "Repair underground pressure line (per break)" and its amount.
public struct QuoteLineText: Equatable, Sendable, Identifiable {
    public var id: String
    public var description: String
    public var amount: String
}

/// One quote's card (spec 5.4 Quotes).
public struct QuoteCardModel: Equatable, Sendable, Identifiable {
    public var quote: JobQuote
    /// "Quote #1006 · Accepted"
    public var title: String
    /// The total at the card's right, "$1,250.00" (a draft's current total).
    public var totalText: String
    /// Only a draft is edited: once sent the prices are locked (the server refuses changes).
    public var isEditable: Bool
    /// A sent quote's lines.
    public var lines: [QuoteLineText]
    /// "Deposit $625.00 · paid (card)", for sent quotes.
    public var depositText: String?
    /// The customer's page, once the quote has a link.
    public var link: URL?
    /// "Accepted by Riley Rivera on Oct 14, 2026."
    public var acceptedText: String?
    /// The repair job an accepted quote made, and its link's words ("Repair job #1296").
    public var repairJobId: String?
    public var repairJobLabel: String?

    public var id: String { quote.id }

    public static let sendNote = "Locks the prices and gives you a link for the customer."
}

/// The builder in a draft quote's card (spec 6.4).
public struct QuoteBuilderModel: Equatable, Sendable {
    public var findings: [FindingSuggestion]
    public var lines: [QuoteLine]
    public var priceBook: [QuoteItemOption]
    public var totals: QuoteTotals
    public var totalRows: [MoneyRow]
    /// The discount as the field shows it ("" for none).
    public var discountText: String
    /// Under the discount field for techs: "Techs can give up to 10% off."; nil for managers.
    public var discountHint: String?
    public var canSend: Bool { !lines.isEmpty }

    public static let noLines = "No lines yet."
    public static let customPlaceholder = "Replace skimmer lid"

    /// Remove's confirmation: "Remove “Skimmer repair” from the quote?"
    public static func removeTitle(_ line: QuoteLine) -> String {
        "Remove “\(line.description ?? "")” from the quote?"
    }
}

/// What the Quotes part shows for one job.
public struct QuoteSectionModel: Equatable, Sendable {
    /// Leak detection and maintenance jobs have quotes; a repair job is the quote's work.
    public var shows: Bool
    /// "No quote yet. Start one…" with Start Quote, while there's no draft or accepted quote.
    public var showsStart: Bool
    public var cards: [QuoteCardModel]
    /// The draft's builder (the newest draft).
    public var builder: QuoteBuilderModel?
    public var isManager: Bool

    public static let startText = "No quote yet."
    /// With a quote already there (sent, declined or expired): never "No quote yet" (owner,
    /// 2026-10-22: it sat "directly above a quote that has already been sent").
    public static let anotherText = "Need another price?"
    /// Which of the two lines shows: `anotherText` once the job has any quote.
    public var startLine: String = startText

    public init(
        store: LocalStore, companyId: String, settings: JSONValue?, role: String?, job: JobView,
        timeZone: String, webURL: URL? = AppConfig.webURL
    ) {
        // Every job but a repair (pool inspections too, 2026-10-20), as the website.
        shows = job.type != .repair
        isManager = isManagerRole(role)
        let quotes = jobQuotes(store, companyId: companyId, jobId: job.id)
        showsStart = !quotes.contains { $0.quote.status == .draft || $0.quote.status == .accepted }
        startLine = quotes.isEmpty ? Self.startText : Self.anotherText
        let pricing = QuotePricing(settings ?? [:])
        let payments = decodeRows(store, "payment", companyId, as: PaymentRecord.self)
        let repairNumbers: [String: Int] = Dictionary(
            ((try? store.list("job")) ?? []).compactMap { row in
                guard let id = row["id"]?.string, let n = row["number"]?.number else { return nil }
                return (id, Int(n))
            }, uniquingKeysWith: { a, _ in a })

        cards = quotes.map { q in
            let quote = q.quote
            let draft = quote.status == .draft
            let total =
                draft
                ? quoteTotals(q.lines, quote.discountCents, pricing.taxRateBps, pricing.deposit).totalCents
                : quote.totalCents
            var card = QuoteCardModel(
                quote: q,
                title: "Quote" + (quote.number.map { " #\($0)" } ?? "") + " · " + quote.status.label,
                totalText: formatCents(total), isEditable: draft,
                lines: q.lines.map { line in
                    QuoteLineText(
                        id: line.id ?? "",
                        description: (line.description ?? "")
                            + (line.quantity != 1 ? " × \(quantityText(line.quantity))" : ""),
                        amount: formatCents(lineTotal(line)))
                },
                link: q.token.flatMap { token in webURL.map { quoteURL($0, token) } })
            if !draft {
                let deposit = payments.first {
                    $0.quoteId == quote.id && ($0.status == "succeeded" || $0.status == "pending")
                }
                card.depositText =
                    "Deposit \(formatCents(quote.depositCents))"
                    + (deposit.map { " · \(depositStatus($0.status)) (\($0.method == "ach" ? "bank" : "card"))" }
                        ?? "")
            }
            if quote.status == .accepted {
                let on = quote.acceptedAt.map { " on " + mediumDate($0, timeZone: timeZone) } ?? ""
                card.acceptedText = "Accepted by \(quote.acceptedByName ?? "the customer")\(on)."
                if let repair = quote.repairJobId {
                    card.repairJobId = repair
                    card.repairJobLabel = "Repair job" + (repairNumbers[repair].map { " #\($0)" } ?? "")
                }
            }
            return card
        }

        if let draft = quotes.first(where: { $0.quote.status == .draft }) {
            builder = Self.builder(
                store: store, companyId: companyId, settings: settings, isManager: isManager, job: job, draft: draft,
                pricing: pricing)
        }
    }

    static func builder(
        store: LocalStore, companyId: String, settings: JSONValue?, isManager: Bool, job: JobView, draft: JobQuote,
        pricing: QuotePricing
    ) -> QuoteBuilderModel {
        let book = priceBook(store, companyId: companyId)
        let onQuote = Set(draft.lines.compactMap(\.priceBookItemId))
        let inspection = JobInspection(store, jobId: job.id)
        let config = InspectionConfig(store, companyId: companyId)
        let findings = inspection.findings.filter { $0.status != .repaired && $0.deletedAt == nil }.map { f in
            let key = f.jobComponentId
                .flatMap { inspection.componentById[$0] }
                .flatMap { config.componentTypeById[$0.componentTypeId]?.key }
            return FindingSuggestion(
                findingId: f.id, title: f.title,
                items: suggestItems(book, key).map { QuoteItemOption(item: $0, added: onQuote.contains($0.id)) })
        }
        let totals = quoteTotals(draft.lines, draft.quote.discountCents, pricing.taxRateBps, pricing.deposit)
        let limit = techDiscountLimitBps(settings)
        return QuoteBuilderModel(
            findings: findings, lines: draft.lines,
            priceBook: book.map { QuoteItemOption(item: $0, added: onQuote.contains($0.id)) }, totals: totals,
            totalRows: quoteTotalRows(totals),
            discountText: draft.quote.discountCents > 0 ? centsFieldText(draft.quote.discountCents) : "",
            discountHint: isManager ? nil : "Techs can give up to \(percentText(limit))% off.")
    }
}

/// The website's builder totals: Subtotal, Discount (when any), Tax, Total, Deposit.
public func quoteTotalRows(_ t: QuoteTotals) -> [MoneyRow] {
    var rows = [MoneyRow("Subtotal", formatCents(t.subtotalCents))]
    if t.discountCents > 0 { rows.append(MoneyRow("Discount", "−" + formatCents(t.discountCents))) }
    rows.append(MoneyRow("Tax", formatCents(t.taxCents)))
    rows.append(MoneyRow("Total", formatCents(t.totalCents), strong: true))
    rows.append(MoneyRow("Deposit", formatCents(t.depositCents)))
    return rows
}

/// The shop's discount limit for techs, in basis points (0 when not set).
public func techDiscountLimitBps(_ settings: JSONValue?) -> Int {
    settings?["tech_discount_limit_bps"]?.number.map { Int($0) } ?? 0
}

/// 1000 bps → "10", 1250 → "12.5", as JavaScript prints `bps / 100`.
func percentText(_ bps: Int) -> String { quantityText(Double(bps) / 100) }

func depositStatus(_ status: String) -> String {
    switch status {
    case "pending": "processing"
    case "succeeded": "paid"
    case "failed": "failed"
    case "refunded": "refunded"
    default: status
    }
}

/// The customer's quote page: {web}/q/{token}.
public func quoteURL(_ webURL: URL, _ token: String) -> URL {
    webURL.appendingPathComponent("q").appendingPathComponent(token)
}

/// The tech's work on a draft quote: every edit is checked here first, with the website's words,
/// then written through `QuoteWrites` (row and totals in one batch, offline). Sending goes to the
/// server. Port of DraftQuote in QuoteTab.tsx and app/actions/quote-draft.ts.
@MainActor @Observable
public final class QuoteFlow {
    /// The last edit that was refused, shown under the builder.
    public var error: String?
    public var sending = false
    /// The quote just sent and its link and text message, for Copy Link and the share sheet.
    public var sent: MoneyServer.Shared?
    public var sentQuoteId: String?

    public let sync: SyncService
    public let companyId: String
    public let jobId: String
    public let isManager: Bool
    public let settings: JSONValue

    public init(sync: SyncService, companyId: String, jobId: String, role: String?, settings: JSONValue) {
        self.sync = sync
        self.companyId = companyId
        self.jobId = jobId
        isManager = isManagerRole(role)
        self.settings = settings
    }

    public static let alreadySent = "This quote was already sent."

    private var pricing: QuotePricing { QuotePricing(settings) }

    /// The quote as the phone has it now.
    private func current(_ quoteId: String) -> JobQuote? {
        jobQuotes(sync.store, companyId: companyId, jobId: jobId).first { $0.id == quoteId }
    }

    /// The draft, or nil (with the error set) when it was sent meanwhile.
    private func draft(_ quoteId: String) -> JobQuote? {
        guard let quote = current(quoteId), quote.quote.status == .draft else {
            error = Self.alreadySent
            return nil
        }
        return quote
    }

    private func attempt(_ work: () throws -> Void) {
        do {
            try work()
            error = nil
        } catch {
            self.error = String(describing: error)
        }
    }

    @discardableResult
    public func start() -> String? {
        var id: String?
        attempt { id = try QuoteWrites.start(sync, companyId: companyId, jobId: jobId) }
        return id
    }

    /// "+ {item}" under a finding, or Add from the price book (no finding).
    public func add(_ item: PriceBookItem, findingId: String?, to quoteId: String) {
        guard let quote = draft(quoteId) else { return }
        attempt {
            try QuoteWrites.addItem(
                sync, companyId: companyId, pricing: pricing, quote: quote, item, findingId: findingId)
        }
    }

    /// A custom line: what the work is and its price. Returns whether it was added (to clear the fields).
    @discardableResult
    public func addCustom(description: String, price: String, to quoteId: String) -> Bool {
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem = Limits.lineDescriptionError(text) {
            error = problem
            return false
        }
        guard let cents = parseDollars(price), cents >= 0 else {
            error = "Enter a price like 125 or 125.50."
            return false
        }
        guard let quote = draft(quoteId) else { return false }
        var added = false
        attempt {
            try QuoteWrites.addLine(
                sync, companyId: companyId, pricing: pricing, quote: quote,
                QuoteLine(quantity: 1, unitPriceCents: cents, taxable: true, description: text))
            added = true
        }
        return added
    }

    /// A line's fields as typed; only what changed is written. Bad values are refused with the
    /// website's words and the saved line stays.
    public func updateLine(
        _ lineId: String, in quoteId: String, description: String? = nil, quantity: String? = nil,
        price: String? = nil
    ) {
        guard let quote = draft(quoteId), let line = quote.lines.first(where: { $0.id == lineId }) else { return }
        var change = QuoteWrites.LineChange()
        if let description {
            let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
            if let problem = Limits.lineDescriptionError(text) {
                error = problem
                return
            }
            if text != line.description { change.description = text }
        }
        if let quantity {
            let n = Double(quantity.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
            guard let n, n > 0, n < 100_000 else {
                error = "Quantity must be more than 0."
                return
            }
            let rounded = (n * 100).rounded() / 100
            if rounded != line.quantity { change.quantity = rounded }
        }
        if let price {
            guard let cents = parseDollars(price), cents >= 0 else {
                error = "Enter a price like 125 or 125.50."
                return
            }
            if cents != line.unitPriceCents { change.unitPriceCents = cents }
        }
        guard change != QuoteWrites.LineChange() else {
            error = nil
            return
        }
        attempt {
            try QuoteWrites.updateLine(
                sync, companyId: companyId, pricing: pricing, quote: quote, lineId: lineId, change)
        }
    }

    public func removeLine(_ lineId: String, from quoteId: String) {
        guard let quote = draft(quoteId) else { return }
        attempt {
            try QuoteWrites.removeLine(sync, companyId: companyId, pricing: pricing, quote: quote, lineId: lineId)
        }
    }

    /// A discount off the subtotal. Techs are held to the shop's limit; owners and admins are not.
    public func setDiscount(_ text: String, on quoteId: String) {
        let cents = text.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : parseDollars(text)
        guard let cents, cents >= 0 else {
            error = "Enter a discount like 50 or 50.00."
            return
        }
        guard let quote = draft(quoteId) else { return }
        guard cents != quote.quote.discountCents else {
            error = nil
            return
        }
        let subtotal = quote.lines.reduce(0) { $0 + lineTotal($1) }
        if let tooLarge = Limits.discountTooLarge(cents, subtotal: subtotal) {
            error = tooLarge
            return
        }
        let limit = techDiscountLimitBps(settings)
        guard discountAllowed(subtotal, cents, isManager, limit) else {
            error = "Techs can give up to \(percentText(limit))% off. Ask an owner for more."
            return
        }
        attempt {
            try QuoteWrites.setDiscount(sync, companyId: companyId, pricing: pricing, quote: quote, cents: cents)
        }
    }

    /// Send Quote: locks the prices on the server; the link and its text come back.
    public func send(_ quoteId: String, shopName: String, server: MoneyServer) async {
        guard let quote = draft(quoteId) else { return }
        guard !quote.lines.isEmpty else {
            error = "Add a line before sending."
            return
        }
        sending = true
        error = nil
        defer { sending = false }
        do {
            sent = try await server.sendQuote(quoteId, shopName: shopName)
            sentQuoteId = quoteId
        } catch {
            self.error = (error as? WebAPI.Failure)?.description ?? String(describing: error)
        }
    }
}
