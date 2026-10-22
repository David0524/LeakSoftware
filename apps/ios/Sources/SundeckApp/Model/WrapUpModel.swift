import Foundation
import SundeckCore
import SundeckSync

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md):
// what core `wrapUp` is worked out from, read from the phone's database. Port of
// apps/web/src/lib/wrap-up.ts.

/// The job's finish list: the homeowner report's draft and newest finished version, the
/// sign-off signatures (not work authorization, signed before the work, nor quote acceptance,
/// signed on the quote), the quotes and invoices.
public func wrapUpInput(store: LocalStore, companyId: String, settings: JSONValue?, job: JobView) -> WrapUpInput {
    let report = ReportTabModel(store: store, companyId: companyId, settings: settings, job: job)
    let rawReport = report.finished.flatMap { finished in
        ((try? store.list("report", jobId: job.id)) ?? []).first { $0["id"]?.string == finished.id }
    }
    let unsigned = rawReport?["data_snapshot"]?["sign_off"]?["unsigned_reason"]?.string
    let signers = jobSignatures(store, jobId: job.id)
        .filter { $0.purpose != "work_authorization" && $0.purpose != "quote_acceptance" }
        .map(\.signerName)
    let pricing = QuotePricing(settings ?? [:])
    let payments = decodeRows(store, "payment", companyId, as: PaymentRecord.self)
    let quotes = jobQuotes(store, companyId: companyId, jobId: job.id).map { q in
        let quote = q.quote
        let total =
            quote.status == .draft
            ? quoteTotals(q.lines, quote.discountCents, pricing.taxRateBps, pricing.deposit).totalCents
            : quote.totalCents
        return WrapUpQuote(
            id: quote.id, number: quote.number, status: quote.status, totalCents: total,
            depositPaid: payments.contains { $0.quoteId == quote.id && $0.status == "succeeded" })
    }
    let invoices = jobInvoices(store, companyId: companyId, jobId: job.id).map { i in
        WrapUpInvoice(
            id: i.invoice.id, number: i.invoice.number, status: i.invoice.status, totalCents: i.invoice.totalCents,
            amountPaidCents: i.invoice.amountPaidCents)
    }
    return WrapUpInput(
        jobType: job.type.rawValue, customer: job.customer?["name"]?.string, reportOn: !report.templates.isEmpty,
        hasDraft: report.hasDraftText, sentVersion: report.finished?.version, unsignedReason: unsigned,
        findings: (try? store.list("finding", jobId: job.id))?.count ?? 0,
        tests: (try? store.list("test_result", jobId: job.id))?.count ?? 0,
        signers: signers, quotes: quotes, invoices: invoices)
}

/// A step's sheet: which step, and the quote or invoice it's about.
public struct WrapUpOpen: Equatable, Hashable, Sendable, Identifiable {
    public var step: WrapUpStep
    /// The quote or invoice.
    public var refId: String?

    public init(step: WrapUpStep, refId: String?) {
        self.step = step
        self.refId = refId
    }

    /// What a row opens: its own step, or Report while there's no report to sign.
    public init(row: WrapUpRow) {
        self.init(step: row.opens, refId: row.opens == row.step ? row.id : nil)
    }

    public var id: String { "\(step.rawValue):\(refId ?? "")" }

    /// The sheet's large title: the row's name, in Title Case for a screen ("Customer Signs").
    public func title(_ list: WrapUp) -> String {
        switch step {
        case .report: "Report"
        case .sign: "Customer Signs"
        case .quote: list.rows.first { $0.step == .quote && $0.id == refId }?.title ?? "Quote"
        case .invoice: list.rows.first { $0.step == .invoice && $0.id == refId }?.title ?? "Invoice"
        }
    }
}
