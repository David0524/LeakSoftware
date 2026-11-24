#if os(iOS)
    import Foundation
    import SundeckCore
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // Refund Payment (owner, 2026-11-24: "how would we reverse a charge?"): the sheet with Refund
    // Full, then Refund Part with an amount, and with too much typed.
    @Suite(.serialized) @MainActor struct RefundShots {
        let start = RefundStart(paymentId: "pay2", invoiceId: "i1", method: "card", refundableCents: 27400)

        func form(part: Bool = false, typed: String = "") -> RefundForm {
            let form = RefundForm(start: start)
            form.part = part
            form.typed = typed
            return form
        }

        @Test func refundSheet() async throws {
            let env = try sampleEnvironment()
            try await snapshot("82-refund", RefundSheet(form: form()) { _ in }.app(env))
            try await snapshot("82-refund-dark", dark: true, RefundSheet(form: form()) { _ in }.app(env))
            try await snapshot("82-refund-part", RefundSheet(form: form(part: true, typed: "25")) { _ in }.app(env))
            try await snapshot(
                "82-refund-too-much", RefundSheet(form: form(part: true, typed: "500")) { _ in }.app(env))
        }
    }
#endif
