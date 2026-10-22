import Foundation
import SundeckCore
import SundeckSync

// More › Invoices (spec 5.10; website app/(office)/invoices and its CSV export), from the
// invoices synced to this phone.

/// A row in the invoices list.
public struct InvoiceListItem: Identifiable, Equatable, Sendable {
    public var invoice: InvoiceRecord
    public var jobNumber: Int?
    public var customer: String?
    /// YYYY-MM-01 for a monthly maintenance invoice.
    public var periodMonth: String?
    public var createdAt: String?

    public var id: String { invoice.id }
    public var open: Bool { invoice.status == .sent || invoice.status == .partiallyPaid }
}

extension InvoiceListItem {
    /// What core's filters and sorts read.
    public var filterItem: InvoiceFilterItem {
        InvoiceFilterItem(
            number: invoice.number, status: invoice.status, totalCents: invoice.totalCents,
            amountPaidCents: invoice.amountPaidCents, dueDate: invoice.dueDate, sentAt: invoice.sentAt,
            customer: customer, jobNumber: jobNumber)
    }
}

/// The list a filter, search and sort show (core `filterInvoices`).
public func shownInvoices(
    _ list: [InvoiceListItem], filter: InvoiceFilter, sort: InvoiceSort, q: String, today: String
) -> [InvoiceListItem] {
    filterInvoices(list, item: \.filterItem, filter: filter.rawValue, sort: sort.rawValue, q: q, today: today)
}

/// "Unpaid 3": each filter's count, as the website's pills.
public func invoiceFilterCount(_ list: [InvoiceListItem], _ filter: InvoiceFilter, today: String) -> Int {
    filter == .all ? list.count : shownInvoices(list, filter: filter, sort: .newest, q: "", today: today).count
}

/// No invoices for a filter or search: `No invoices match “…”.` or "No invoices here."
public func invoicesEmptyText(_ q: String) -> String {
    let t = q.trimmingCharacters(in: .whitespaces)
    return t.isEmpty ? "No invoices here." : "No invoices match “\(t)”."
}

/// The company's invoices, newest first, with each job's number and customer.
public func invoiceList(_ store: LocalStore, companyId: String) -> [InvoiceListItem] {
    let jobs = Dictionary(
        ((try? jobViews(store, companyId: companyId)) ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    return ((try? store.list("invoice", companyId: companyId)) ?? [])
        .compactMap { row -> InvoiceListItem? in
            guard let invoice = try? JSONValue.object(row).decode(InvoiceRecord.self) else { return nil }
            let job = jobs[invoice.jobId]
            return InvoiceListItem(
                invoice: invoice, jobNumber: job?.number, customer: job?.customer?["name"]?.string,
                periodMonth: row["period_month"]?.string, createdAt: row["created_at"]?.string)
        }
        .sorted { a, b in
            let ac = a.createdAt ?? ""
            let bc = b.createdAt ?? ""
            if ac != bc { return ac > bc }
            return (a.invoice.number ?? .max) > (b.invoice.number ?? .max)
        }
}

/// What an invoice's row in Invoices can do (gestures spec section 12): its customer's payment
/// link, and Record Payment and Void Invoice as its card has them.
public struct InvoiceRowActions: Equatable, Sendable {
    public var link: URL?
    public var rules: InvoiceActionRules
    /// The balance, prefilled in Record Payment's amount.
    public var balanceText: String
    /// Send Receipt's line for the latest payment, when one was received (2026-10-22).
    public var receiptSummary: String?
}

/// Every invoice's row actions, read once for the list (payments and links in one pass each).
public func invoiceRowActions(
    _ store: LocalStore, companyId: String, list: [InvoiceListItem], role: String?,
    webURL: URL? = AppConfig.webURL
) -> [String: InvoiceRowActions] {
    let payments = Dictionary(
        grouping: decodeRows(store, "payment", companyId, as: PaymentRecord.self), by: { $0.invoiceId ?? "" })
    var tokens: [String: String] = [:]
    for link in (try? store.list("share_link", companyId: companyId)) ?? [] {
        guard let id = link["invoice_id"]?.string, let token = link["token"]?.string,
            link["revoked_at"]?.string == nil
        else { continue }
        tokens[id] = token
    }
    return Dictionary(
        list.map { item in
            let i = item.invoice
            return (
                i.id,
                InvoiceRowActions(
                    link: i.status == .void ? nil : tokens[i.id].flatMap { t in webURL.map { invoiceURL($0, t) } },
                    rules: InvoiceActionRules(invoice: i, payments: payments[i.id] ?? [], role: role),
                    balanceText: centsFieldText(i.balanceCents),
                    receiptSummary: receiptLine(i, payments[i.id] ?? []))
            )
        }, uniquingKeysWith: { a, _ in a })
}

/// Send Receipt's line for an invoice's latest payment, or nil when it can't send one.
func receiptLine(_ invoice: InvoiceRecord, _ payments: [PaymentRecord]) -> String? {
    let receipts = payments.map(\.receipt)
    guard canSendReceipt(status: invoice.status.rawValue, payments: receipts),
        let latest = latestReceiptPayment(receipts)
    else { return nil }
    return receiptSummary(latest, totalCents: invoice.totalCents, amountPaidCents: invoice.amountPaidCents)
}

/// "2 open · $750.00 owed", or "Nothing owed right now."
public func invoicesSubtitle(_ list: [InvoiceListItem]) -> String {
    let open = list.filter(\.open)
    guard !open.isEmpty else { return "Nothing owed right now." }
    return "\(open.count) open · \(formatCents(open.reduce(0) { $0 + $1.invoice.balanceCents })) owed"
}

/// "October 2026" from "2026-10-01".
func monthName(_ month: String) -> String {
    guard let date = parseISODate("\(month.prefix(10))T12:00:00Z") else { return month }
    return ShopClock("UTC").format(date, "MMMM yyyy")
}

/// "Oct 17, 2026".
func mediumDay(_ iso: String, timeZone: String) -> String {
    let date = iso.count == 10 ? parseISODate("\(iso)T12:00:00Z") : parseISODate(iso)
    return date.map { ShopClock(timeZone).format($0, "MMM d, yyyy") } ?? ""
}

/// The row's two detail lines: "#1026 · Job #1072" (or "· Maintenance, October 2026") and
/// "Sent · sent Oct 17, 2026 · $375.00 due".
public func invoiceRowLines(_ item: InvoiceListItem, timeZone: String, today: String? = nil) -> (String, String) {
    let i = item.invoice
    var first = i.number.map { "#\($0)" } ?? "Draft"
    if let month = item.periodMonth {
        first += " · Maintenance, \(monthName(month))"
    } else if let job = item.jobNumber {
        first += " · Job #\(job)"
    }
    var second = today.map { invoiceOverdue(item.filterItem, $0) } == true ? "Overdue" : i.status.label
    if let sent = i.sentAt { second += " · sent \(mediumDay(sent, timeZone: timeZone))" }
    if item.open { second += " · \(formatCents(i.balanceCents)) due" }
    return (first, second)
}

// MARK: - Export (managers; the website's Export Invoices and Export Payments)

/// Rows as CSV, quoting where needed (port of toCsv).
public func csvText(_ rows: [[String]]) -> String {
    rows.map { row in
        row.map { cell in
            cell.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" })
                ? "\"\(cell.replacingOccurrences(of: "\"", with: "\"\""))\"" : cell
        }
        .joined(separator: ",")
    }
    .joined(separator: "\r\n") + "\r\n"
}

/// Dollars with two decimals, no symbol ("375.00").
func dollars(_ cents: Cents) -> String { String(format: "%.2f", Double(cents) / 100) }

/// Every sent invoice, with the same columns as the website's export.
public func invoicesCSV(_ store: LocalStore, companyId: String) -> String {
    let header = [
        "Invoice", "Job", "Customer", "Status", "Sent", "Due", "Paid on", "Subtotal", "Discount", "Tax",
        "Deposit credit", "Total", "Paid", "Balance",
    ]
    let day = { (iso: String?) in iso.map { String($0.prefix(10)) } ?? "" }
    let rows = invoiceList(store, companyId: companyId).filter { $0.invoice.status != .draft }.map { item in
        let i = item.invoice
        return [
            i.number.map(String.init) ?? "", item.jobNumber.map(String.init) ?? "", item.customer ?? "",
            i.status.label, day(i.sentAt), i.dueDate ?? "", day(i.paidAt), dollars(i.subtotalCents),
            dollars(i.discountCents), dollars(i.taxCents), dollars(i.creditCents), dollars(i.totalCents),
            dollars(i.amountPaidCents), dollars(i.status == .void ? 0 : max(0, i.totalCents - i.amountPaidCents)),
        ]
    }
    return csvText([header] + rows)
}

/// Every payment, oldest first, with the same columns as the website's export.
public func paymentsCSV(_ store: LocalStore, companyId: String) -> String {
    let rowsOf = { (table: String) in (try? store.list(table, companyId: companyId)) ?? [] }
    let invoices = Dictionary(
        rowsOf("invoice").map { ($0.id, $0["number"]?.number.map { String(Int($0)) } ?? "") },
        uniquingKeysWith: { a, _ in a })
    let quotes = Dictionary(
        rowsOf("quote").map { ($0.id, $0["number"]?.number.map { String(Int($0)) } ?? "") },
        uniquingKeysWith: { a, _ in a })
    let method = ["card": "Card", "ach": "Bank (ACH)", "cash": "Cash", "check": "Check", "other": "Recorded"]
    let payments = rowsOf("payment").sorted { ($0["created_at"]?.string ?? "") < ($1["created_at"]?.string ?? "") }
    let rows = payments.map { p -> [String] in
        let invoice = p["invoice_id"]?.string
        let m = p["method"]?.string ?? ""
        let checkNumber = m == "check" ? p["check_number"]?.string : nil
        return [
            String((p["paid_at"]?.string ?? p["created_at"]?.string ?? "").prefix(10)),
            invoice != nil ? "Invoice" : "Quote deposit",
            invoice.flatMap { invoices[$0] } ?? p["quote_id"]?.string.flatMap { quotes[$0] } ?? "",
            dollars(Int(p["amount_cents"]?.number ?? 0)), checkNumber.map { "Check #\($0)" } ?? method[m] ?? m,
            p["status"]?.string ?? "",
            p["stripe_payment_intent_id"]?.string ?? "",
        ]
    }
    return csvText([["Date", "For", "Number", "Amount", "Method", "Status", "Stripe payment"]] + rows)
}

/// The export's file name, as the website's download ("leakbook-invoices-2026-10-19.csv").
public func exportFileName(_ kind: String, now: Date = Date()) -> String {
    "leakbook-\(kind)-\(String(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000).prefix(10))).csv"
}
