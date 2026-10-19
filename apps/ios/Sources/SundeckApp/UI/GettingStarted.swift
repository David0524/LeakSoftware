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
        var company: CompanyContext
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openTab) private var openTab
        @State private var steps: [StartStep] = []
        /// Invites and the Stripe account aren't on the phone: asked when there's a signal.
        @State private var server = ServerProgress()

        struct ServerProgress: Equatable {
            var invites = 0
            var payments = false
        }

        var body: some View {
            Group {
                if !app.walkthrough.gettingStartedHidden, !steps.isEmpty, steps.contains(where: { !$0.done }) {
                    card
                } else {
                    Color.clear.frame(height: 0)
                }
            }
            .task(id: "\(sync.revision)|\(server.invites)|\(server.payments)") { reload() }
            .task(id: company.id) { await loadServer() }
        }

        private var card: some View {
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
                GeometryReader { geo in
                    Capsule().fill(Color.fill)
                        .overlay(alignment: .leading) {
                            Capsule().fill(Color.pass)
                                .frame(width: geo.size.width * CGFloat(done) / CGFloat(max(steps.count, 1)))
                        }
                }
                .frame(height: 6)
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .accessibilityElement()
                .accessibilityLabel("Getting Started progress")
                .accessibilityValue("\(done) of \(steps.count)")
                VStack(spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.element.id) { i, step in
                        if i > 0 { Divider().overlay(Color.separator) }
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
            .card(padding: 0)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }

        /// Where a step leads in the app.
        private func open(_ step: StartStep) {
            switch step.href {
            case "/jobs/new": openRoute(.newJob(back: "Today"))
            case "/jobs": openTab(.jobs)
            case "/customers": openRoute(.more(.customers))
            case "/invoices": openRoute(.more(.invoices))
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

        private func reload() {
            steps = gettingStarted(
                company.services,
                shopProgress(sync.store, company: company, invites: server.invites, payments: server.payments))
        }

        private func loadServer() async {
            // The account's own setting wins once it's known (hidden on the website, or brought
            // back by Show Tips Again there).
            if let session = try? await app.client.auth.session,
                case .bool(let hidden) = session.user.userMetadata["getting_started_hidden"]
            {
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
