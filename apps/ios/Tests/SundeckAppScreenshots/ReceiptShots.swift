#if os(iOS)
    import Foundation
    import SundeckCore
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"): Send Receipt
    // right after recording a check (Email, then Text, light and dark), and Record Payment from
    // the Invoices list with Paid by.
    @Suite(.serialized) @MainActor struct ReceiptShots {
        let start = ReceiptStart(
            invoiceId: "i1", paymentId: "p1", status: "partially_paid",
            summary: "$200.00 · Check #1234 · Balance remaining $449.00")

        func form(channel: ReceiptChannel = .email) -> ReceiptForm {
            let form = ReceiptForm(start: start, email: "sam.lee@example.com", phone: "6025550142", texting: true)
            form.channel = channel
            return form
        }

        @Test func sendReceipt() async throws {
            let env = try sampleEnvironment()
            try await snapshot("81-send-receipt", SendReceiptSheet(form: form()) { _ in }.app(env))
            try await snapshot(
                "81-send-receipt-dark", dark: true, SendReceiptSheet(form: form()) { _ in }.app(env))
            try await snapshot("81-send-receipt-text", SendReceiptSheet(form: form(channel: .text)) { _ in }.app(env))
            let emailOnly = ReceiptForm(
                start: ReceiptStart(invoiceId: "i1", summary: "$649.00 · Cash · Paid in full"),
                email: "sam.lee@example.com", phone: nil, texting: false)
            try await snapshot("81-send-receipt-email-only", SendReceiptSheet(form: emailOnly) { _ in }.app(env))
        }

        @Test func recordPayment() async throws {
            let env = try sampleEnvironment()
            let invoice = try JSONDecoder().decode(
                InvoiceRecord.self,
                from: Data(
                    #"{"id":"i1","company_id":"c1","job_id":"j1","number":1042,"status":"sent","total_cents":64900,"amount_paid_cents":0,"subtotal_cents":64900,"discount_cents":0,"tax_cents":0,"credit_cents":0}"#
                        .utf8))
            try await snapshot(
                "81-record-payment",
                RecordPaymentSheet(
                    title: "Sam Lee · Invoice #1042", invoice: invoice,
                    flow: InvoiceFlow(sync: env.session.sync, companyId: "c1", jobId: "j1")
                ) { _ in }
                .app(env))
        }
    }
#endif
