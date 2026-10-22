#if os(iOS)
    import Foundation
    import SundeckCore
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"): the page with a
    // count and history, and with no mailing address and over the day's allowance, light and dark,
    // and Customers with its envelope in the bar (the sample shop's person is an owner).
    @Suite(.serialized) @MainActor struct MassEmailShots {
        func sample(address: String? = "200 W Washington St, Phoenix, AZ 85003", left: Int = 300) -> MassEmailForm {
            let form = MassEmailForm(
                setup: MassEmailSetup(
                    shopName: "Demo Leak Co.", address: address,
                    shows: customerShowOptions(offersPool: true), cities: ["Chandler", "Mesa", "Phoenix"],
                    left: left,
                    history: [
                        MassEmailHistoryRow(
                            id: "e1", subject: "Fall opening specials", status: "sent", recipients: 42, sent: 40,
                            failed: 2, createdAt: "2026-10-20T17:00:00Z"),
                        MassEmailHistoryRow(
                            id: "e2", subject: "Holiday hours", status: "sent", recipients: 38, sent: 38, failed: 0,
                            createdAt: "2026-09-02T17:00:00Z"),
                    ]),
                count: MassEmailCount(recipients: 42, noEmail: 3, unsubscribed: 2))
            form.subject = "Fall opening specials"
            form.body = "Hi {first name},\n\nPool openings start next week. Reply to book yours."
            return form
        }

        @Test func emailCustomers() async throws {
            let env = try sampleEnvironment()
            try await snapshot(
                "80-email-customers", height: 1900, NavigationStack { MassEmailScreen(form: sample()) }.app(env))
            try await snapshot(
                "80-email-customers-dark", dark: true, height: 1900,
                NavigationStack { MassEmailScreen(form: sample()) }.app(env))
            try await snapshot(
                "80-email-customers-blocked", height: 1900,
                NavigationStack { MassEmailScreen(form: sample(address: nil, left: 30)) }.app(env))
            try await snapshot("80-customers-email-button", NavigationStack { CustomersScreen() }.app(env))
        }
    }
#endif
