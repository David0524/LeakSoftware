import Foundation
import SundeckCore
import SundeckSync

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

// Monthly billing on the phone (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md;
// website components/charges.tsx, components/month-billing.tsx, app/actions/monthly-billing.ts).
// A visit's Charges are synced `visit_charge` rows, written here through the sync layer (row +
// outbox), so they work offline like the rest of a visit; the server sets a price book item's
// price when the row arrives. A month's page reads the server (public.month_billing); its Add
// Charge and Remove change the draft's synced lines; Send All is the website's
// POST /api/invoices/month/{month}/send.

/// A number column as JSON may hold it: a number, or text (Postgres numerics).
private func amount(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n): n
    case .string(let s): Double(s)
    default: nil
    }
}

private func isLive(_ row: Row) -> Bool { row["deleted_at"]?.string?.isEmpty ?? true }

// MARK: - Charges on a visit

/// The price book items Add Charge offers: active services and parts (not chemicals), in the
/// book's order (website `getChargeItems`).
public func visitChargeItems(_ store: LocalStore, companyId: String) -> [ChargeItem] {
    let rows = (try? store.list("price_book_item", companyId: companyId)) ?? []
    let items = rows.map { r in
        ChargeItem(
            id: r.id, name: r["name"]?.string ?? "Item", category: r["category"]?.string,
            priceCents: amount(r["price_cents"]).map { Int($0) }, taxable: r["taxable"]?.bool,
            chemical: r["chemical"]?.string, sortOrder: amount(r["sort_order"]), active: r["active"]?.bool,
            deletedAt: r["deleted_at"]?.string)
    }
    return chargeItems(items.filter { $0.active != false })
        .sorted { a, b in
            let ao = a.sortOrder ?? .infinity
            let bo = b.sortOrder ?? .infinity
            if ao != bo { return ao < bo }
            let an = a.name.lowercased()
            let bn = b.name.lowercased()
            return an != bn ? an < bn : a.id < b.id
        }
}

/// A synced row as a charge. Before the server's price arrives, the price book's.
func decodeVisitCharge(_ r: Row, items: [ChargeItem]) -> VisitCharge? {
    guard let job = r["job_id"]?.string, let quantity = amount(r["quantity"]) else { return nil }
    let itemId = r["price_book_item_id"]?.string
    let price =
        amount(r["unit_price_cents"]).map { Int($0) } ?? items.first { $0.id == itemId }?.priceCents ?? 0
    return VisitCharge(
        id: r.id, jobId: job, priceBookItemId: itemId, name: r["name"]?.string ?? "Charge", quantity: quantity,
        unitPriceCents: price, taxable: r["taxable"]?.bool, billedInvoiceId: r["billed_invoice_id"]?.string,
        addedAt: r["added_at"]?.string ?? r["created_at"]?.string, deletedAt: r["deleted_at"]?.string)
}

/// The visit's charges in the order they were added (removed ones left out).
public func visitCharges(_ store: LocalStore, jobId: String, items: [ChargeItem]) -> [VisitCharge] {
    ((try? store.list("visit_charge", jobId: jobId)) ?? [])
        .filter { $0["job_id"]?.string == jobId && isLive($0) }
        .compactMap { decodeVisitCharge($0, items: items) }
        .sorted { a, b in
            let at = a.addedAt ?? ""
            let bt = b.addedAt ?? ""
            return at != bt ? at < bt : a.id < b.id
        }
}

/// "Nov 1": an instant's day in the shop's time zone.
func shortMonthDay(_ iso: String?, timeZone: String) -> String {
    guard let date = parseInstant(iso) else { return "" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: timeZone) ?? TimeZone(identifier: "UTC")
    f.dateFormat = "MMM d"
    return f.string(from: date)
}

/// "Nov 15" for a day ("2026-11-15"), as the website writes the invoice-day dates.
public func billingDayText(_ day: String) -> String {
    shortMonthDay("\(day.prefix(10))T12:00:00Z", timeZone: "UTC")
}

/// The sent invoice the visit's charges are on, if any (website `getVisitCharges`): they can't
/// change then. An invoice this phone doesn't have isn't counted, as on the website (the server
/// refuses a change to a sent one).
public func visitChargesSentInvoice(_ store: LocalStore, _ charges: [VisitCharge], timeZone: String)
    -> SentInvoiceRef?
{
    for c in charges {
        guard let id = c.billedInvoiceId, let invoice = try? store.get("invoice", id),
            let status = invoice["status"]?.string, status != "draft", status != "void"
        else { continue }
        let sentAt = invoice["sent_at"]?.string
        return SentInvoiceRef(
            number: invoice["number"]?.number.map { Int($0) },
            sentOn: sentAt.map { shortMonthDay($0, timeZone: timeZone) } ?? "")
    }
    return nil
}

/// The visit's Charges footer: "Billed on Jane’s October invoice." or "On invoice #1042, sent
/// Nov 1." The month is the visit's (its plan day, else its time, else when it was done, else now).
public func visitChargesFooter(_ job: JobView, sent: SentInvoiceRef?, timeZone: String, now: Date = Date())
    -> String
{
    let name = job.customer?["name"]?.string ?? ""
    let firstName = name.split(separator: " ").first.map(String.init) ?? "the customer"
    let day =
        job.job["plan_date"]?.string ?? job.job["scheduled_start"]?.string ?? job.job["completed_at"]?.string
        ?? isoString(now)
    return chargesFooter(firstName: firstName, month: monthName(day, timeZone: timeZone), sentInvoice: sent)
}

/// Add Charge's two ways: a price book item, or a custom description and price.
public enum ChargeMode: String, CaseIterable, Hashable, Sendable {
    case book, custom

    public var label: String { self == .book ? "Price Book" : "Custom" }
}

/// A charge ready to save: a visit's `visit_charge`, or a line on a month's draft.
public struct ChargeDraft: Equatable, Sendable {
    public var priceBookItemId: String?
    public var name: String
    public var quantity: Double
    public var unitPriceCents: Cents
    public var taxable: Bool

    public init(priceBookItemId: String?, name: String, quantity: Double, unitPriceCents: Cents, taxable: Bool) {
        self.priceBookItemId = priceBookItemId
        self.name = name
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.taxable = taxable
    }
}

/// Add Charge's fields to fix, by name (item, quantity, description, price).
public struct ChargeErrors: Error, Equatable, Sendable {
    public var fields: [String: String]
}

/// A quantity as typed ("1", "2.5", "2,5"): more than 0, under 100,000, at most two decimals;
/// blank is 1 (the website's `parseQuantity`).
public func chargeQuantity(_ input: String) -> Double? {
    var typed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if let comma = typed.range(of: ",") { typed.replaceSubrange(comma, with: ".") }
    if typed.isEmpty { return 1 }
    guard typed.wholeMatch(of: /[0-9]*\.?[0-9]+/) != nil, let q = Double(typed), q.isFinite, q > 0, q < 100_000
    else { return nil }
    let hundredths = (q * 100).rounded()
    return abs(q * 100 - hundredths) < 1e-6 ? hundredths / 100 : nil
}

/// Add Charge's fields checked as the website checks them (`chargeFields`).
public func checkCharge(
    mode: ChargeMode, item: ChargeItem?, quantity: String, description: String, price: String, taxable: Bool
) -> Result<ChargeDraft, ChargeErrors> {
    guard let q = chargeQuantity(quantity) else {
        return .failure(ChargeErrors(fields: ["quantity": "Enter a quantity like 1 or 2.5."]))
    }
    if mode == .book {
        guard let item else { return .failure(ChargeErrors(fields: ["item": "Pick an item from the price book."])) }
        return .success(
            ChargeDraft(
                priceBookItemId: item.id, name: item.name, quantity: q, unitPriceCents: item.priceCents ?? 0,
                taxable: item.taxable ?? true))
    }
    let name = description.trimmingCharacters(in: .whitespacesAndNewlines)
    let cents = parseDollars(price.trimmingCharacters(in: .whitespacesAndNewlines))
    var fields: [String: String] = [:]
    if let problem = Limits.lineDescriptionError(name) { fields["description"] = problem }
    if (cents ?? -1) < 0 { fields["price"] = "Enter a price like 24." }
    guard fields.isEmpty, let cents else { return .failure(ChargeErrors(fields: fields)) }
    return .success(
        ChargeDraft(priceBookItemId: nil, name: name, quantity: q, unitPriceCents: cents, taxable: taxable))
}

/// A visit's charges, through the sync layer (anyone on the team, on visits they can see).
@MainActor
public enum VisitChargeWrites {
    /// Add Charge. The server sets a price book item's price and tax when the row arrives.
    @discardableResult
    public static func add(_ sync: SyncService, companyId: String, jobId: String, _ d: ChargeDraft, now: Date = Date())
        throws -> String
    {
        try sync.insert(
            "visit_charge", companyId: companyId,
            [
                "job_id": .string(jobId),
                "price_book_item_id": d.priceBookItemId.map { JSONValue.string($0) } ?? JSONValue.null,
                "name": .string(d.name), "quantity": .number(d.quantity),
                "unit_price_cents": .number(Double(d.unitPriceCents)), "taxable": .bool(d.taxable),
                "added_at": .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000)),
            ])
    }

    /// Remove Charge (soft delete, so it leaves every phone and the draft it's on).
    public static func remove(_ sync: SyncService, id: String) throws {
        try sync.softDelete("visit_charge", id)
    }
}

// MARK: - A month's page

/// A month's drafts as this phone has them now: the lines and total after Add Charge and Remove
/// made here, before the server's totals come back. Drafts not on the phone stay as the server
/// sent them.
public func localMonthBilling(_ store: LocalStore, companyId: String, _ b: MonthBilling, taxRateBps: Int)
    -> MonthBilling
{
    let ids = Set(b.drafts.map(\.id))
    guard !ids.isEmpty else { return b }
    var lines: [String: [InvoiceLine]] = [:]
    for row in (try? store.list("invoice_line_item", companyId: companyId)) ?? [] {
        guard let invoice = row["invoice_id"]?.string, ids.contains(invoice), isLive(row),
            var line = try? JSONValue.object(row).decode(InvoiceLine.self)
        else { continue }
        line.id = row.id
        lines[invoice, default: []].append(line)
    }
    var out = b
    out.invoices = b.invoices.map { inv in
        guard inv.status == "draft", let row = try? store.get("invoice", inv.id), row["status"]?.string == "draft"
        else { return inv }
        let mine = (lines[inv.id] ?? []).sorted { a, b in
            let ao = a.sortOrder ?? 0
            let bo = b.sortOrder ?? 0
            return ao != bo ? ao < bo : (a.id ?? "") < (b.id ?? "")
        }
        var next = inv
        next.lines = mine.map { l in
            MonthBillingLine(
                id: l.id ?? "", description: l.description ?? "", quantity: l.quantity,
                unitPriceCents: l.unitPriceCents, unit: inv.lines.first { $0.id == l.id }?.unit, kind: l.kind.rawValue,
                taxable: l.taxable)
        }
        let discount = amount(row["discount_cents"]).map { Int($0) } ?? 0
        next.totalCents = invoiceTotals(mine, discount, taxRateBps).totalCents
        return next
    }
    return out
}

/// A draft's lines, through the sync layer (owners and admins; the server freezes them once sent).
@MainActor
public enum MonthBillingWrites {
    static let notHere = "This invoice isn’t on this phone yet. Pull down to refresh, then try again."

    /// Add Charge on a month's page: a line at the end of that customer's draft.
    @discardableResult
    public static func addLine(_ sync: SyncService, companyId: String, invoiceId: String, _ d: ChargeDraft) throws
        -> String
    {
        guard let invoice = try sync.store.get("invoice", invoiceId) else {
            throw InvoiceWrites.Problem(field: "", description: notHere)
        }
        guard invoice["status"]?.string == "draft" else {
            throw InvoiceWrites.Problem(field: "", description: "This invoice has been sent and can’t be changed.")
        }
        let last =
            ((try? sync.store.list("invoice_line_item", companyId: companyId)) ?? [])
            .filter { $0["invoice_id"]?.string == invoiceId && isLive($0) }
            .compactMap { amount($0["sort_order"]) }
            .max() ?? 0
        return try sync.insert(
            "invoice_line_item", companyId: companyId,
            [
                "invoice_id": .string(invoiceId), "kind": "item", "description": .string(d.name),
                "quantity": .number(d.quantity), "unit_price_cents": .number(Double(d.unitPriceCents)),
                "taxable": .bool(d.taxable), "sort_order": .number(last + 1),
            ])
    }

    /// Remove a line from a draft.
    public static func removeLine(_ sync: SyncService, companyId: String, lineId: String) throws {
        guard try sync.store.get("invoice_line_item", lineId) != nil else {
            throw InvoiceWrites.Problem(field: "", description: notHere)
        }
        try sync.write("invoice_line_item", id: lineId, companyId: companyId, ["deleted_at": nowISO()])
    }
}

/// What a month's page asks the server: the months, a month, Create Invoices, Send All. Each
/// needs a connection.
public enum MonthlyBillingServer {
    /// Invoices › Monthly Billing's rows, newest month first (public.billing_months).
    public static func months(_ rpc: any RPCClient, companyId: String) async throws -> [BillingMonth] {
        try await rpc.call("billing_months", ["target_company": .string(companyId)]).decode([BillingMonth].self)
    }

    /// A month's page (public.month_billing).
    public static func month(_ rpc: any RPCClient, companyId: String, month: String) async throws -> MonthBilling {
        try await rpc.call("month_billing", ["target_company": .string(companyId), "month": .string(month)])
            .decode(MonthBilling.self)
    }

    /// Create Invoices: the month's drafts for everyone not invoiced yet, whatever their day.
    /// Returns what to say: "3 invoices ready to send."
    public static func createInvoices(_ rpc: any RPCClient, companyId: String, month: String) async throws
        -> String
    {
        let reply = try await rpc.call(
            "create_monthly_invoices", ["target_company": .string(companyId), "month": .string(month)])
        let n = Int(reply.number ?? Double(reply.string ?? "") ?? 0)
        return n == 1 ? "1 invoice ready to send." : "\(n) invoices ready to send."
    }

    /// Send All: the month's drafts, each by email or text, on the server.
    public static func sendAll(_ api: WebAPI, companyId: String, month: String) async throws -> SendAllResult {
        let reply = try await api.post("api/invoices/month/\(month)/send", ["company_id": .string(companyId)])
        return try reply.decode(SendAllResult.self)
    }

    /// What to say when a call didn't work: offline, the server's words, or plain words.
    public static func message(_ error: Error, sending: Bool = false) -> String {
        if let failure = error as? WebAPI.Failure {
            return failure.offline && sending ? MassEmailText.offline : failure.description
        }
        if error is URLError || isNetworkFailure(String(describing: error)) {
            return sending ? MassEmailText.offline : WebAPI.Failure.noConnection
        }
        if let rpc = error as? RPCError { return friendlyError(rpc.message) }
        return userMessage(error)
    }
}

/// A Sent row's detail: "#1042 · Paid · sent Nov 1" ("Overdue" once past its due date).
public func sentMonthInvoiceDetail(_ inv: MonthBillingInvoice, today: String) -> String {
    let status = InvoiceStatus(rawValue: inv.status)
    let overdue =
        status.map {
            invoiceOverdue(
                InvoiceFilterItem(
                    number: inv.number, status: $0, totalCents: inv.totalCents, amountPaidCents: inv.amountPaidCents,
                    dueDate: inv.dueDate, sentAt: inv.sentAt, customer: inv.customer), today)
        } ?? false
    let label = overdue ? "Overdue" : status?.label ?? inv.status
    return (inv.number.map { "#\($0) · " } ?? "") + label + (inv.sentAt.map { " · sent \(billingDayText($0))" } ?? "")
}

/// A draft line's "2 each × $24.00" under its description, when there's more than one.
public func monthLineDetail(_ line: MonthBillingLine) -> String? {
    guard line.quantity != 1 else { return nil }
    let q = line.quantity == line.quantity.rounded() ? String(Int(line.quantity)) : String(line.quantity)
    return "\(q)\(line.unit.map { " \($0)" } ?? "") × \(formatCents(line.unitPriceCents))"
}
