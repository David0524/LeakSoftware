#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Getting Started on Today (spec 5.1; the website's components/getting-started.tsx):
    /// managers' first steps for the shop's package, ticked off from the shop's own data, until
    /// every step is done or they tap Hide. Hiding is kept on the person's account (as on the
    /// website) and on the phone, so it stays hidden offline.
    struct GettingStartedCard: View {
        /// Off until it draws inside the tab view (see TodayScreen).
        static let enabled = false

        var company: CompanyContext
        /// Asks the server for invites and payments (off only in screenshots).
        var loadsServer = true
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openTab) private var openTab
        /// Invites and the Stripe account aren't on the phone: asked when there's a signal.
        @State private var server = ServerProgress()

        struct ServerProgress: Equatable {
            var invites = 0
            var payments = false
        }

        var body: some View {
            let _ = sync.revision
            let steps = gettingStarted(
                company.services,
                shopProgress(sync.store, company: company, invites: server.invites, payments: server.payments))
            // Nothing at all when hidden or done, so Today keeps its spacing.
            if !app.walkthrough.gettingStartedHidden, steps.contains(where: { !$0.done }) {
                card(steps).task(id: company.id) { if loadsServer { await loadServer() } }
            }
        }

        private func card(_ steps: [StartStep]) -> some View {
            let done = steps.filter(\.done).count
            return VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        CardTitle("Getting Started")
                        Text("\(done) of \(steps.count) done").textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                    .padding(.top, 16)
                    Spacer(minLength: 0)
                    Button("Hide") { hide() }
                        .textRole(.body)
                        .foregroundStyle(Color.link)
                        .frame(minWidth: minTarget, minHeight: minTarget)
                        .padding(.top, 8)
                        .accessibilityLabel("Hide Getting Started")
                }
                .padding(.horizontal, 20)
                Capsule().fill(Color.fill)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Color.pass)
                            .scaleEffect(x: CGFloat(done) / CGFloat(max(steps.count, 1)), anchor: .leading)
                    }
                    .frame(height: 6)
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .accessibilityElement()
                    .accessibilityLabel("Getting Started progress")
                    .accessibilityValue("\(done) of \(steps.count)")
                VStack(spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.element.id) { i, step in
                        if i > 0 { Rectangle().fill(Color.separator).frame(height: 0.5) }
                        Button {
                            open(step)
                        } label: {
                            HStack(spacing: 12) {
                                RoundCheck(done: step.done)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(step.label)
                                        .textRole(.body)
                                        .strikethrough(step.done)
                                        .foregroundStyle(step.done ? Color.textMuted : Color.text)
                                    if !step.done {
                                        Text(step.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                                    }
                                }
                                .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                                Chevron()
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .frame(minHeight: 48)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.row)
                        .accessibilityLabel(step.done ? "\(step.label) (done)" : step.label)
                    }
                }
                .padding(.top, 12)
            }
            .padding(.bottom, 8)
            // No clipShape: inside the tab view on iOS 26 the clipped card stopped Today drawing.
            .card(padding: 0)
        }

        /// Where a step leads in the app.
        private func open(_ step: StartStep) {
            switch step.href {
            case "/jobs/new": openRoute(.newJob(back: "Today"))
            case "/jobs": openTab(.jobs)
            case "/customers": openRoute(.more(.customers))
            case "/invoices": openRoute(.more(.invoices))
            // The sample job (owner, 2026-10-22): its finished report.
            case let href where href.hasPrefix("/jobs/"): openRoute(.job(String(href.dropFirst("/jobs/".count))))
            case "/settings/team": openRoute(.more(.settingsPage(.team)))
            case "/settings/company": openRoute(.more(.settingsPage(.company)))
            case "/settings/import": openRoute(.more(.settingsPage(.importCustomers)))
            case "/settings/payments": openRoute(.more(.settingsPage(.payments)))
            default: openRoute(.more(.settings))
            }
        }

        private func hide() {
            app.walkthrough.setGettingStartedHidden(true)
            Task {
                try? await app.client.auth.update(user: UserAttributes(data: ["getting_started_hidden": .bool(true)]))
            }
        }

        private func loadServer() async {
            // The account's own setting wins once it's known (hidden on the website).
            if case .bool(let hidden) = app.client.auth.currentSession?.user.userMetadata["getting_started_hidden"] {
                app.walkthrough.setGettingStartedHidden(hidden)
            }
            guard !app.walkthrough.gettingStartedHidden else { return }
            struct Stripe: Decodable {
                let chargesEnabled: Bool?
                enum CodingKeys: String, CodingKey { case chargesEnabled = "charges_enabled" }
            }
            let invites =
                (try? await app.client.from("invite").select("id", head: true, count: .exact)
                    .eq("company_id", value: company.id).is("accepted_at", value: nil).is("revoked_at", value: nil)
                    .execute().count) ?? 0
            let stripe: [Stripe] =
                (try? await app.client.from("stripe_account").select("charges_enabled")
                    .eq("company_id", value: company.id).execute().value) ?? []
            server = ServerProgress(invites: invites ?? 0, payments: stripe.first?.chargesEnabled == true)
        }
    }
#endif
