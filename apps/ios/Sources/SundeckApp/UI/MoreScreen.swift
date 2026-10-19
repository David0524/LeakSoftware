#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Where the More tab goes.
    enum MoreRoute: Hashable {
        case customers
        case customer(String)
        case invoices
        /// The Chemical Calculator; a visit passes the pool's gallons.
        case chemicals(gallons: Double?)
        case settings
        case settingsPage(SettingsPage)
        case sync
        case myPhone
    }

    /// The screens the More tab pushes.
    struct MoreDestination: View {
        var route: MoreRoute
        var showReauth: () -> Void

        var body: some View {
            switch route {
            case .customers: CustomersScreen()
            case .customer(let id): CustomerScreen(customerId: id)
            case .invoices: InvoicesScreen()
            case .chemicals(let gallons): ChemicalsScreen(gallons: gallons)
            case .settings: ShopSettingsScreen()
            case .settingsPage(let page): SettingsListScreen(page: page)
            case .sync: SettingsView(showWelcome: {}, showReauth: showReauth)
            case .myPhone: MyPhoneScreen()
            }
        }
    }

    /// The person's profile on the server (not a synced row): their mobile number for calls from
    /// the company number, and whether two-step sign-in is on.
    struct MyProfile: Decodable, Equatable {
        var phone: String?
        var twoStep: Bool?

        enum CodingKeys: String, CodingKey {
            case phone
            case twoStep = "two_step"
        }
    }

    /// More (spec 5.8; website app/(office)/more): the sections that don't fit in the tab bar, the
    /// person's account, this phone, sync, help, and signing out.
    struct MoreScreen: View {
        var showWelcome: () -> Void
        var showReauth: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @State private var profile: MyProfile?
        @State private var browser: BrowserPage?
        @State private var directions = DirectionsChoice.automatic
        @State private var confirmSignOut = false

        var body: some View {
            let company = session.company
            List {
                Section {
                    PageHeader(subtitle: displayName).plainListRow()
                }
                Section {
                    ForEach(moreLinks(role: company?.role, services: company?.services ?? .both), id: \.self) { link in
                        NavigationLink(value: route(link)) { ListRow(link.title) }
                            .surfaceRow()
                            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                    }
                }
                account
                Section {
                    AppearanceRow().surfaceRow().listRowInsets(EdgeInsets())
                    ListRow("Directions open in") {
                        CompactSelect(
                            title: "Directions open in", selection: $directions, options: DirectionsChoice.allCases,
                            optionLabel: \.label)
                    }
                    .surfaceRow()
                    .listRowInsets(EdgeInsets())
                } header: {
                    SectionLabel("On this device")
                }
                Section {
                    NavigationLink(value: MoreRoute.sync) {
                        ListRow(title: "Sync", detail: syncRowDetail(sync.status)) {
                            if sync.status.problems > 0 {
                                Circle().fill(Color.fail).frame(width: 10, height: 10)
                                    .accessibilityLabel("Changes could not be saved")
                            }
                        }
                    }
                    .surfaceRow()
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                } header: {
                    SectionLabel("Sync")
                }
                help
                Section {
                    ActionRow("Sign Out", role: .destructive) {
                        if signOutWarning(sync.status) != nil {
                            confirmSignOut = true
                        } else {
                            Task { await session.signOut() }
                        }
                    }
                    .surfaceRow()
                    .listRowInsets(EdgeInsets())
                }
                Section {
                    DeleteAccountCard().plainListRow()
                }
            }
            .groupedList()
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.large)
            .browserSheet($browser)
            .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
            } message: {
                Text(signOutWarning(sync.status) ?? "")
            }
            .onAppear { directions = sync.kv.directionsChoice }
            .onChange(of: directions) { _, choice in sync.kv.directionsChoice = choice }
            .task { await loadProfile() }
        }

        private var displayName: String {
            let me = sync.kv.team.first { $0.id == session.user?.id }
            if let name = me?.fullName, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
            return session.user?.email ?? ""
        }

        private func route(_ link: MoreLink) -> MoreRoute {
            switch link {
            case .customers: .customers
            case .invoices: .invoices
            case .chemicals: .chemicals(gallons: nil)
            case .settings: .settings
            }
        }

        @ViewBuilder private var account: some View {
            Section {
                // Turning two-step on needs the website's server (it confirms with an admin key).
                Button {
                    browser = .site("more/two-step")
                } label: {
                    ListRow(
                        "Two-Step Sign-In", detail: "A code from your phone after your password",
                        value: profile?.twoStep.map { $0 ? "On" : "Off" }, chevron: true)
                }
                .buttonStyle(.row)
                .surfaceRow()
                .listRowInsets(EdgeInsets())
                NavigationLink(value: MoreRoute.myPhone) {
                    ListRow(
                        "My Mobile Number",
                        value: profile.map { p in p.phone.map { formatPhone(toE164($0) ?? $0) } ?? "Not set" })
                }
                .surfaceRow()
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                if session.companies.count > 1 {
                    LabeledPickerRow(
                        label: "Company",
                        selection: Binding(get: { session.company?.id ?? "" }, set: { session.setActiveCompany($0) }),
                        options: session.companies.map(\.id),
                        optionLabel: { id in session.companies.first { $0.id == id }?.name ?? "" }
                    )
                    .surfaceRow()
                    .listRowInsets(EdgeInsets())
                } else {
                    ListRow("Company", value: session.company?.name).surfaceRow().listRowInsets(EdgeInsets())
                }
            } header: {
                SectionLabel("Your account")
            }
        }

        private var help: some View {
            Section {
                helpRow("Help and Support") {
                    if let url = URL(string: "mailto:support@sundeckpro.com") { openURL(url) }
                }
                helpRow("Privacy Policy") { browser = .site("privacy") }
                helpRow("Terms of Service") { browser = .site("terms") }
                helpRow("System Status") { browser = .site("status") }
                ActionRow("Show Tips Again") {
                    app.walkthrough.reset()
                    showWelcome()
                }
                .surfaceRow()
                .listRowInsets(EdgeInsets())
                ListRow(
                    versionText(
                        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
                        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
                )
                .foregroundStyle(Color.textMuted)
                .surfaceRow()
                .listRowInsets(EdgeInsets())
            } header: {
                SectionLabel("Help")
            }
        }

        private func helpRow(_ title: String, action: @escaping () -> Void) -> some View {
            Button(action: action) { ListRow(title, chevron: true) }
                .buttonStyle(.row)
                .surfaceRow()
                .listRowInsets(EdgeInsets())
        }

        private func loadProfile() async {
            guard let id = session.user?.id,
                let rows: [MyProfile] = try? await app.client.from("profile").select("phone, two_step")
                    .eq("id", value: id).execute().value
            else { return }
            profile = rows.first
        }
    }

    /// Delete My Account (App Store rule 5.1.1(v)): folded away, confirmed by typing DELETE.
    struct DeleteAccountCard: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var open = false
        @State private var confirm = ""
        @State private var deleting = false
        @State private var result: (text: String, error: Bool)?

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    withAnimation { open.toggle() }
                } label: {
                    HStack {
                        Text("Delete My Account").font(.role(.bodyMedium)).foregroundStyle(Color.fail)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fail)
                            .rotationEffect(.degrees(open ? 90 : 0))
                    }
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(open ? [.isSelected] : [])
                if open {
                    Text(
                        "Removes your sign-in. The jobs, reports, and invoices you worked on stay with the shop. If you’re the shop’s only owner, we’ll delete the shop’s data too, within 30 days."
                    )
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
                    OutlinedField(label: "Type DELETE to confirm", text: $confirm)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    if let result { Notice(kind: result.error ? .error : .success, text: result.text) }
                    Button {
                        Task { await delete() }
                    } label: {
                        BusyButtonLabel("Delete My Account", busy: deleting, busyTitle: "Deleting…")
                    }
                    .buttonStyle(.danger)
                    .disabled(deleting)
                    .padding(.bottom, 10)
                }
            }
            .card(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        }

        private func delete() async {
            guard confirm.trimmingCharacters(in: .whitespaces) == "DELETE" else {
                result = ("Type DELETE to confirm.", true)
                return
            }
            deleting = true
            defer { deleting = false }
            do {
                let reply = try await app.api.post("api/account/delete")
                if reply["status"]?.string == "deleted" {
                    await session.signOut()
                } else {
                    result = (reply["message"]?.string ?? "We’ll email you when it’s done.", false)
                }
            } catch {
                result = (String(describing: error), true)
            }
        }
    }

    /// My Mobile Number: calls placed from the company number ring it first. Saved to the
    /// person's profile on the server.
    struct MyPhoneScreen: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var phone = ""
        @State private var saving = false
        @State private var result: (text: String, error: Bool)?

        var body: some View {
            ScreenScroll {
                Grouped(footer: "Calls you place from Messages ring here first, then connect from the company number.")
                {
                    LabeledFieldRow(label: "Mobile", text: $phone, keyboard: .phonePad, contentType: .telephoneNumber)
                }
                if let result { Notice(kind: result.error ? .error : .success, text: result.text) }
                Button {
                    Task { await save() }
                } label: {
                    BusyButtonLabel("Save Number", busy: saving, busyTitle: "Saving…")
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
                .disabled(saving)
            }
            .navigationTitle("My Mobile Number")
            .navigationBarTitleDisplayMode(.large)
            .task {
                guard let id = session.user?.id,
                    let rows: [MyProfile] = try? await app.client.from("profile").select("phone, two_step")
                        .eq("id", value: id).execute().value,
                    let saved = rows.first?.phone, phone.isEmpty
                else { return }
                phone = formatPhone(toE164(saved) ?? saved)
            }
        }

        private func save() async {
            guard let e164 = toE164(phone) else {
                result = ("Enter a US mobile number.", true)
                return
            }
            guard let id = session.user?.id else { return }
            saving = true
            defer { saving = false }
            do {
                try await app.client.from("profile").update(["phone": e164]).eq("id", value: id).execute()
                phone = formatPhone(e164)
                result = ("Saved. Calls you place from Messages ring this number first.", false)
            } catch {
                result = ("Couldn’t save. Try again when you’re online.", true)
            }
        }
    }
#endif
