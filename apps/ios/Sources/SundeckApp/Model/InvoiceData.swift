import Foundation
import SundeckCore
import SundeckSync

/// An invoice row. Port of Invoice in packages/core/src/invoice.ts.
public struct InvoiceRecord: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var jobId: String
    public var quoteId: String?
    public var number: Int?
    public var status: InvoiceStatus
    public var subtotalCents: Cents
    public var discountCents: Cents
    public var taxCents: Cents
    public var creditCents: Cents
    public var totalCents: Cents
    public var amountPaidCents: Cents
    public var dueDate: String?
    public var notes: String?
    public var sentAt: String?
    public var paidAt: String?
    public var voidedAt: String?
    /// A monthly invoice's month ("2026-10-01"; owner, 2026-11-15); nil for a job's own.
    public var periodMonth: String?

    enum CodingKeys: String, CodingKey {
        case id, number, status, notes
        case jobId = "job_id"
        case quoteId = "quote_id"
        case subtotalCents = "subtotal_cents"
        case discountCents = "discount_cents"
        case taxCents = "tax_cents"
        case creditCents = "credit_cents"
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
        case dueDate = "due_date"
        case sentAt = "sent_at"
        case paidAt = "paid_at"
        case voidedAt = "voided_at"
        case periodMonth = "period_month"
    }

    /// What's still owed.
    public var balanceCents: Cents {
        invoiceBalance(Invoice(totalCents: totalCents, amountPaidCents: amountPaidCents))
    }
}

/// A payment on an invoice.
public struct PaymentRecord: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var invoiceId: String?
    /// A quote's deposit (no invoice yet).
    public var quoteId: String?
    public var amountCents: Cents
    public var method: String
    /// A check's number (2026-10-22).
    public var checkNumber: String?
    public var status: String
    public var paidAt: String?
    /// Refunded so far (owner, 2026-11-24); `amountCents` is what's still kept.
    public var refundedCents: Cents = 0

    enum CodingKeys: String, CodingKey {
        case id, method, status
        case invoiceId = "invoice_id"
        case quoteId = "quote_id"
        case amountCents = "amount_cents"
        case checkNumber = "check_number"
        case paidAt = "paid_at"
        case refundedCents = "refunded_cents"
    }

    /// As the receipt rules take it.
    public var receipt: ReceiptPayment {
        ReceiptPayment(
            id: id, amountCents: amountCents, method: method, checkNumber: checkNumber, status: status, paidAt: paidAt)
    }

    /// As the refund rules take it.
    public var refund: RefundablePayment {
        RefundablePayment(amountCents: amountCents, method: method, status: status, refundedCents: refundedCents)
    }
}

extension PaymentRecord {
    /// Rows synced before refunds have no `refunded_cents`: none refunded.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: try c.decode(String.self, forKey: .id),
            invoiceId: try c.decodeIfPresent(String.self, forKey: .invoiceId),
            quoteId: try c.decodeIfPresent(String.self, forKey: .quoteId),
            amountCents: try c.decode(Cents.self, forKey: .amountCents),
            method: try c.decode(String.self, forKey: .method),
            checkNumber: try c.decodeIfPresent(String.self, forKey: .checkNumber),
            status: try c.decode(String.self, forKey: .status),
            paidAt: try c.decodeIfPresent(String.self, forKey: .paidAt),
            refundedCents: try c.decodeIfPresent(Cents.self, forKey: .refundedCents) ?? 0)
    }
}

/// An invoice on the job with its lines, payments and customer link. Port of useJobInvoices in
/// apps/mobile/src/data/invoices.ts.
public struct JobInvoice: Equatable, Sendable, Identifiable {
    public var invoice: InvoiceRecord
    public var lines: [InvoiceLine]
    public var payments: [PaymentRecord]
    public var token: String?

    public var id: String { invoice.id }
}

/// The job's invoices, newest first.
public func jobInvoices(_ store: LocalStore, companyId: String, jobId: String) -> [JobInvoice] {
    struct Link: Decodable {
        let token: String
        let invoiceId: String?
        let revokedAt: String?
        enum CodingKeys: String, CodingKey {
            case token
            case invoiceId = "invoice_id"
            case revokedAt = "revoked_at"
        }
    }
    struct Line: Decodable {
        let id: String
        let invoiceId: String
        let line: InvoiceLine
        enum CodingKeys: String, CodingKey {
            case id
            case invoiceId = "invoice_id"
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            invoiceId = try c.decode(String.self, forKey: .invoiceId)
            line = try InvoiceLine(from: decoder)
        }
    }
    let invoices = decodeJobRows(store, "invoice", jobId, as: InvoiceRecord.self).filter { $0.jobId == jobId }
    let ids = Set(invoices.map(\.id))
    let lines = decodeRows(store, "invoice_line_item", companyId, as: Line.self).filter { ids.contains($0.invoiceId) }
    let payments = decodeRows(store, "payment", companyId, as: PaymentRecord.self)
    let links = decodeJobRows(store, "share_link", jobId, as: Link.self)
    return
        invoices
        .sorted { a, b in
            let an = a.number ?? .max
            let bn = b.number ?? .max
            return an != bn ? an > bn : a.id > b.id
        }
        .map { invoice in
            JobInvoice(
                invoice: invoice,
                lines:
                    lines
                    .filter { $0.invoiceId == invoice.id }
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
                payments: payments.filter { $0.invoiceId == invoice.id },
                token: links.first { $0.invoiceId == invoice.id && $0.revokedAt == nil }?.token)
        }
}
