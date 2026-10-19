#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Account, sync, changes the server refused, tips, help, and signing out. Port of
    /// apps/mobile/src/app/(app)/settings.tsx (Messages, the Chemical Calculator and the mobile
    /// number come with S8).
    struct SettingsView: View {
        var showWelcome: () -> Void
        var showReauth: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @State private var problems: [OutboxProblem] = []
        @State private var syncing = false
        @State private var confirmSignOut = false
        @State private var confirmDelete = false
        @State private var deleting = false
        @State private var alert: (title: String, message: String)?

        var body: some View {
            List {
                account
                syncSection
                if !problems.isEmpty { problemsSection }
                Section("Tools") {
                    Button("Show Tips Again") {
                        app.walkthrough.reset()
                        showWelcome()
                    }
                    .frame(minHeight: minTarget)
                }
                Section("Help") {
                    link("Status and Support", "status")
                    link("Privacy Policy", "privacy")
                    link("Terms of Service", "terms")
                }
                Section {
                    Button("Sign Out", role: .destructive) { confirmSignOut = true }
                        .frame(minHeight: minTarget)
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        HStack {
                            Text("Delete My Account")
                            if deleting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .frame(minHeight: minTarget)
                    .disabled(deleting)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Settings")
            .task(id: sync.revision) { problems = (try? sync.store.problems()) ?? [] }
            .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
                Button("Stay Signed In", role: .cancel) {}
            } message: {
                Text(signOutMessage)
            }
            .confirmationDialog("Delete your account?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Account", role: .destructive) { Task { await deleteAccount() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(
                    "This removes your sign-in and the work on this phone. Jobs, reports, and invoices stay with the shop. If you’re the shop’s only owner, the shop’s data is deleted too, within 30 days."
                )
            }
            .alert(alert?.title ?? "", isPresented: .constant(alert != nil)) {
                Button("OK") { alert = nil }
            } message: {
                Text(alert?.message ?? "")
            }
        }

        @ViewBuilder private var account: some View {
            Section("Account") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.user?.email ?? "")
                    Text("\(session.company?.name ?? "") · \(roleLabel(session.company?.role))")
                        .font(.subheadline).foregroundStyle(Color.muted)
                }
                .frame(minHeight: minTarget, alignment: .leading)
                link("Two-Step Sign-In", "more/two-step")
                LabeledContent(
                    "Local data",
                    value: (try? sync.store.database.cipherVersion()) != nil ? "Encrypted" : "Not encrypted")
                LabeledContent("Device ID") {
                    Text(sync.store.deviceId).font(.footnote.monospaced()).textSelection(.enabled)
                }
                LabeledContent(
                    "App version",
                    value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev")
                if session.companies.count > 1 {
                    Picker(
                        "Company",
                        selection: Binding(
                            get: { session.company?.id ?? "" }, set: { session.setActiveCompany($0) })
                    ) {
                        ForEach(session.companies, id: \.id) { Text($0.name).tag($0.id) }
                    }
                }
            }
        }

        @ViewBuilder private var syncSection: some View {
            let status = sync.status
            Section {
                LabeledContent(
                    "Last synced",
                    value: status.lastSyncedAt.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "Never")
                LabeledContent("Waiting to sync", value: "\(status.pending)")
                LabeledContent("Waiting to upload", value: "\(status.uploadsWaiting)")
                if status.phase == .signedOut {
                    Notice(
                        kind: .warning,
                        text: "Your sign-in expired. Sign in again to keep syncing; nothing on this phone is lost.")
                    Button("Sign In Again", action: showReauth).buttonStyle(.secondary)
                } else {
                    Button {
                        Task {
                            syncing = true
                            await sync.syncNow()
                            syncing = false
                        }
                    } label: {
                        if syncing { ProgressView() } else { Text("Sync Now") }
                    }
                    .buttonStyle(.secondary)
                    .disabled(syncing)
                }
            } header: {
                Text("Sync")
            } footer: {
                if status.phase == .offline {
                    Text("This phone is offline. Changes are saved here and sync later.")
                } else if let error = status.error {
                    Text("Last error: \(error)")
                } else if let error = status.lastUploadError {
                    Text("Last upload error: \(error)")
                }
            }
        }

        private var problemsSection: some View {
            Section("Changes that could not be saved") {
                ForEach(problems, id: \.seq) { problem in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(problem.table): \(problem.fields.joined(separator: ", "))").font(
                            .body.weight(.semibold))
                        Text(problem.error).font(.subheadline).foregroundStyle(Color.muted)
                        Button("Discard This Change") { try? sync.discardProblem(problem.seq) }
                            .buttonStyle(.destructiveSecondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }

        private func link(_ title: String, _ path: String) -> some View {
            Button {
                openURL(AppConfig.webURL.appendingPathComponent(path))
            } label: {
                HStack {
                    Text(title).foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "arrow.up.right.square").foregroundStyle(Color.muted)
                }
                .frame(minHeight: minTarget)
            }
        }

        /// Warns about changes and files that haven't reached the office.
        private var signOutMessage: String {
            let changes = sync.status.pending + sync.status.problems
            let files = sync.status.uploadsWaiting
            guard changes + files > 0 else {
                return "Your work is saved to the office. Signing out removes it from this phone."
            }
            let parts = [
                changes > 0 ? (changes == 1 ? "1 change" : "\(changes) changes") : nil,
                files > 0 ? (files == 1 ? "1 photo or recording" : "\(files) photos or recordings") : nil,
            ].compactMap { $0 }.joined(separator: " and ")
            return "\(parts) haven’t reached the office yet. Signing out deletes them from this phone."
        }

        private func deleteAccount() async {
            deleting = true
            defer { deleting = false }
            let client = app.client
            let api = WebAPI(baseURL: AppConfig.webURL) { try? await client.auth.session.accessToken }
            do {
                let reply = try await api.post("api/account/delete")
                if reply["status"]?.string == "deleted" {
                    await session.signOut()
                } else {
                    alert = ("Request Sent", reply["message"]?.string ?? "We’ll email you when it’s done.")
                }
            } catch {
                alert = ("Couldn’t Delete", String(describing: error))
            }
        }
    }

    /// The three welcome cards for the shop's package, then straight to work. Port of
    /// apps/mobile/src/app/(app)/welcome.tsx.
    struct WelcomeView: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var page = 0

        var body: some View {
            let cards = launchCards(session.company?.services ?? .both)
            NavigationStack {
                VStack(spacing: 24) {
                    TabView(selection: $page) {
                        ForEach(Array(cards.enumerated()), id: \.offset) { index, card in
                            VStack(spacing: 20) {
                                Image(systemName: symbol(card.icon))
                                    .font(.system(size: 44))
                                    .foregroundStyle(Color.brandPrimary)
                                    .frame(width: 96, height: 96)
                                    .background(Circle().fill(Color.brandPrimary.opacity(0.12)))
                                Text(card.title).font(.title2.weight(.bold)).multilineTextAlignment(.center)
                                Text(card.message).font(.body).foregroundStyle(Color.muted)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.horizontal, 32)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("\(card.title). \(card.message) Card \(index + 1) of \(cards.count).")
                            .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .always))
                    .indexViewStyle(.page(backgroundDisplayMode: .always))
                    Button(page >= cards.count - 1 ? "Get Started" : "Continue") {
                        if page >= cards.count - 1 { dismiss() } else { withAnimation { page += 1 } }
                    }
                    .buttonStyle(.primary)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
                }
                .navigationTitle("Welcome")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Skip") { dismiss() } }
                }
            }
            // Opening it counts as seen, however it's closed.
            .onAppear { app.walkthrough.finishLaunch() }
        }

        private func symbol(_ icon: LaunchCard.Icon) -> String {
            switch icon {
            case .calendar: "calendar"
            case .checklist: "checklist"
            case .chemistry: "drop.fill"
            case .search: "magnifyingglass"
            case .report: "doc.text"
            case .offline: "wifi.slash"
            }
        }
    }
#endif
