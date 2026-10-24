#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // More › Settings (spec 5.12; website app/(office)/settings). Managers only. The index lists
    // the shop's pages in their groups, built in the app (owner, 2026-10-20: "From the app, do
    // not link to the website"): read from synced rows and written through the sync layer, and
    // Phone and Texting through /api/phone. Payments opens Stripe's onboarding on the website;
    // Import stays on a computer.

    struct ShopSettingsScreen: View {
        @Environment(Session.self) private var session
        @State private var browser: BrowserPage?
        @State private var importNote = false

        var body: some View {
            let company = session.company
            let services = company?.services ?? .both
            List {
                if !isManagerRole(company?.role) {
                    Section {
                        Notice(kind: .warning, text: settingsTechNotice(company?.name ?? "your shop")).plainListRow()
                    }
                } else {
                    ForEach(settingsGroups(services), id: \.title) { group in
                        Section {
                            ForEach(group.pages, id: \.self) { page in row(page, services: services) }
                        } header: {
                            SectionLabel(group.title)
                        }
                    }
                }
            }
            .groupedList()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .browserSheet($browser)
            .alert("Import from a Computer", isPresented: $importNote) {
                Button("OK") {}
            } message: {
                Text("Import customers from a spreadsheet at sundeckpro.com, in Settings › Import Customers.")
            }
        }

        @ViewBuilder private func row(_ page: SettingsPage, services: Services) -> some View {
            let label = ListRow(page.title, detail: page.detail(services))
            if page.isNative {
                NavigationLink(value: MoreRoute.settingsPage(page)) { label }
                    .surfaceRow()
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
            } else {
                Button {
                    if page == .importCustomers { importNote = true } else { browser = .site(page.webPath) }
                } label: {
                    ListRow(page.title, detail: page.detail(services), chevron: true)
                }
                .buttonStyle(.row)
                .surfaceRow()
                .listRowInsets(EdgeInsets())
                .accessibilityHint(page == .importCustomers ? "" : "Opens the website")
            }
        }
    }

    /// A settings list page: its rows in grouped lists, each opening its edit form in a sheet; "+"
    /// in the bar where rows can be added from the phone.
    struct SettingsListScreen: View {
        var page: SettingsPage
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var groups: [(title: String?, items: [ConfigItem])] = []
        @State private var team: [SettingsTeamMember] = []
        /// Settings › Team › Profiles (owners and admins).
        @State private var profiles: [ProfileListRow] = []
        @State private var editingProfile: ProfileSheetTarget?
        /// The team member whose profile is open.
        @State private var editingMember: SettingsTeamMember?
        /// Turning someone off from their row's switch, asked first.
        @State private var turningOff: SettingsTeamMember?
        /// Which checklist Checklist Components shows (pool visits, leak or pool inspections).
        @State private var list: ChecklistList = .leak
        @State private var editing: ConfigSheetTarget?
        @State private var notice: String?
        @State private var browser: BrowserPage?
        @State private var loaded = false
        /// Delete from a row's swipe or menu, asked first.
        @State private var removing: ConfigItem?
        @State private var banner: ResultBanner?

        var body: some View {
            let company = session.company
            let services = company?.services ?? .both
            let manager = isManagerRole(company?.role)
            let canAdd = manager && (page == .priceBook || page == .exclusions)
            // Charge for Chemicals (owner, 2026-10-24) sits with the prices it uses, just above the
            // price book's Chemicals group, as on the website: owners and admins of pool shops.
            let charge = page == .priceBook && manager && company.map { offersPool($0.settings) } == true
            List {
                // The segmented control isn't clipped by the list's rounded corners (ListTopSection).
                ListTopSection {
                    VStack(alignment: .leading, spacing: 16) {
                        if let subtitle = settingsSubtitle(page, services: services, list: list) {
                            Text(subtitle).textRole(.body).foregroundStyle(Color.textMuted)
                        }
                        if page == .components && ChecklistList.lists(services).count > 1 {
                            Segmented(
                                selection: $list, options: ChecklistList.lists(services), label: \.label,
                                title: "Checklist")
                        }
                        if let notice { Notice(kind: .success, text: notice) }
                    }
                    .plainListRow()
                }
                if charge, let company, !groups.contains(where: { $0.title == "Chemicals" }) {
                    ChargeChemicalsSection(company: company)
                }
                if page == .team {
                    teamGroups(manager: manager, owner: company?.role == "owner")
                    if manager { profilesGroup }
                    if manager, let company { completingAJob(company) }
                    Section {
                        ActionRow("Open Team on the Website") { browser = .site(page.webPath) }
                            .surfaceRow().listRowInsets(EdgeInsets())
                    }
                } else if loaded && groups.allSatisfy(\.items.isEmpty) {
                    Section { EmptyState(text: "No items yet.").plainListRow() }
                } else {
                    ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                        let chemicals = charge && group.title == "Chemicals"
                        if chemicals, let company { ChargeChemicalsSection(company: company) }
                        Section {
                            ForEach(group.items) { item in
                                Button {
                                    if manager { editing = .edit(item) }
                                } label: {
                                    ListRow(title: item.name, detail: item.detail, value: item.value) {
                                        if let hex = item.color {
                                            Circle().fill(severityColor(hex)).frame(width: 20, height: 20)
                                                .accessibilityHidden(true)
                                        }
                                        if manager { Chevron() }
                                    }
                                }
                                .buttonStyle(.row)
                                .disabled(!manager)
                                .surfaceRow()
                                .listRowInsets(EdgeInsets())
                                // Swipe left for Delete; touch and hold for Edit and Delete… (gestures
                                // spec section 12). Both ask first, as the item's sheet does.
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if manager {
                                        Button("Delete", systemImage: "trash") { removing = item }.tint(Color.fail)
                                    }
                                }
                                .rowMenu(item.name, manager ? menu(item) : [])
                            }
                        } header: {
                            if let title = group.title, !chemicals { SectionLabel(title) }
                        }
                    }
                }
            }
            .groupedList()
            .refreshable { await sync.syncNow() }
            .navigationTitle(page.title)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if canAdd {
                    ToolbarItem(placement: .topBarTrailing) {
                        BarIconButton(systemImage: "plus", label: page == .priceBook ? "Add Item" : "Add Reason") {
                            editing = .add
                        }
                    }
                }
            }
            .sheet(item: $editing) { target in
                if page == .priceBook {
                    PriceItemSheet(item: target.item) { notice = $0 }
                } else if page == .components && list == .inspection, let item = target.item {
                    InspectionQuestionSheet(item: item) { notice = $0 }
                } else {
                    ConfigItemSheet(page: page, item: target.item, poolChecklist: list == .pool) { notice = $0 }
                }
            }
            .sheet(item: $editingProfile) { target in
                PersonProfileSheet(target: target) { notice = $0 }
            }
            .sheet(item: $editingMember) { member in
                TeamMemberSheet(
                    member: member, profile: profiles.first { $0.userId == member.userId },
                    owner: company?.role == "owner"
                ) { notice = $0 }
            }
            .confirmationDialog(
                TeamText.turnOffQuestion(turningOff?.name ?? ""),
                isPresented: Binding(get: { turningOff != nil }, set: { if !$0 { turningOff = nil } }),
                titleVisibility: .visible, presenting: turningOff
            ) { member in
                Button(TeamText.turnOff, role: .destructive) { setActive(member, false) }
                Button("Cancel", role: .cancel) {}
            }
            .browserSheet($browser)
            .resultBanner($banner)
            .confirmationDialog(
                removeWords.confirm, isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { item in
                Button(removeWords.button, role: .destructive) { remove(item) }
                Button("Cancel", role: .cancel) {}
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(list.rawValue)") { reload() }
            .onAppear { if !loaded { list = ChecklistList.lists(services).first ?? .leak } }
        }

        /// Settings › Team (owner, 2026-10-20: "Mix the tech profiles with the role/on and off
        /// switch"): one list, the active people A to Z, then those turned off, the most recent
        /// first. Each row is the tech's dot, their name over their role, and the switch (owners
        /// and admins; not for yourself); the row opens their profile.
        @ViewBuilder private func teamGroups(manager: Bool, owner: Bool) -> some View {
            let sections = teamSections(team)
            Section {
                ForEach(sections.active) { teamRow($0, manager: manager) }
            } header: {
                SectionLabel(TeamText.active)
            } footer: {
                if sections.off.isEmpty {
                    Text(TeamText.footer).textRole(.footnote).foregroundStyle(Color.textMuted)
                }
            }
            if !sections.off.isEmpty {
                Section {
                    ForEach(sections.off) { teamRow($0, manager: manager) }
                } header: {
                    SectionLabel(TeamText.off)
                } footer: {
                    Text(TeamText.footer).textRole(.footnote).foregroundStyle(Color.textMuted)
                }
            }
        }

        private func teamRow(_ m: SettingsTeamMember, manager: Bool) -> some View {
            HStack(spacing: 0) {
                Button {
                    if manager { editingMember = m }
                } label: {
                    HStack(spacing: CGFloat(Spacing.rowItems)) {
                        TechDot(color: m.color)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.isMe ? "\(m.name) (you)" : m.name).textRole(.body).foregroundStyle(Color.text)
                            Text(roleLabel(m.role)).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .disabled(!manager)
                .accessibilityHint(manager ? "Opens their profile" : "")
                if manager {
                    Toggle(
                        TeamText.on,
                        isOn: Binding(
                            get: { m.active },
                            set: { on in if on { setActive(m, true) } else { turningOff = m } })
                    )
                    .labelsHidden()
                    .tint(Color.pass)
                    .disabled(m.isMe)
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .accessibilityLabel("\(m.name) on")
                    .accessibilityHint(m.isMe ? TeamText.yourself : "")
                }
            }
            .surfaceRow()
            .listRowInsets(EdgeInsets())
        }

        private func setActive(_ m: SettingsTeamMember, _ on: Bool) {
            turningOff = nil
            guard let company = session.company else { return }
            do {
                try TeamWrites.setActive(sync, companyId: company.id, membershipId: m.id, on)
                banner = ResultBanner(kind: .success, title: on ? "\(m.name) is on." : "\(m.name) is turned off.")
            } catch {
                banner = ResultBanner(kind: .error, title: String(describing: error))
            }
        }

        /// People without the app (owner, 2026-10-20), and Add Person; team members' profiles open
        /// from their rows above.
        private var profilesGroup: some View {
            Section {
                ForEach(profiles.filter { $0.userId == nil }) { row in
                    Button {
                        editingProfile = .row(row)
                    } label: {
                        ListRow(row.title, detail: row.detail, value: row.value, chevron: true)
                    }
                    .buttonStyle(.row)
                    .surfaceRow()
                    .listRowInsets(EdgeInsets())
                }
                ActionRow(ProfileText.addPerson) { editingProfile = .addPerson }
                    .surfaceRow().listRowInsets(EdgeInsets())
            } header: {
                SectionLabel(TeamText.without)
            } footer: {
                Text(ProfileText.footer).textRole(.footnote).foregroundStyle(Color.textMuted)
            }
        }

        /// Completing a job (owners and admins, 2026-10-19): what Complete Job waits for.
        private func completingAJob(_ company: CompanyContext) -> some View {
            Section {
                ForEach(CompleteJobSetting.allCases, id: \.self) { setting in
                    SwitchRow(
                        setting.label, detail: setting.hint,
                        isOn: Binding(
                            get: { setting.isOn(company.settings) },
                            set: { on in
                                do {
                                    try ConfigWrites.setCompleteJob(
                                        sync, companyId: company.id, settings: company.settings, setting, on: on)
                                    session.reloadCompanies()
                                } catch {
                                    notice = String(describing: error)
                                }
                            })
                    )
                    .surfaceRow()
                    .listRowInsets(EdgeInsets())
                }
            } header: {
                SectionLabel(CompleteJobSetting.title)
            }
        }

        /// Edit and Delete… (Duplicate, Move Up and Move Down aren't on the phone: order is the
        /// Order field in Edit).
        private func menu(_ item: ConfigItem) -> [SwipeAction] {
            [
                SwipeAction(title: "Edit", systemImage: "pencil", tint: Color.link) { editing = .edit(item) },
                SwipeAction(title: "Delete…", systemImage: "trash", tint: Color.fail, role: .destructive) {
                    removing = item
                },
            ]
        }

        /// The item sheet's question and button for this page.
        private var removeWords: (confirm: String, button: String) {
            switch page {
            case .priceBook: ("Remove this item from the price book?", "Remove Item")
            case .components:
                switch list {
                case .inspection: ("Remove this question from new checklists?", "Remove Component")
                case .pool: ("Remove this component from new visits?", "Remove Component")
                default: ("Remove this component from new checklists?", "Remove Component")
                }
            case .tests: ("Remove this test type?", "Remove Test Type")
            case .severities: ("Remove this severity?", "Remove Severity")
            default: ("Remove this reason?", "Remove")
            }
        }

        /// The sheet's Remove, through the same write.
        private func remove(_ item: ConfigItem) {
            removing = nil
            do {
                try ConfigWrites.remove(sync, page: page, id: item.id)
                banner = ResultBanner(kind: .success, title: "Removed \(item.name).")
            } catch {
                banner = ResultBanner(kind: .error, title: String(describing: error))
            }
        }

        private func reload() {
            guard let company = session.company else { return }
            let store = sync.store
            switch page {
            case .priceBook: groups = priceBookGroups(store, companyId: company.id)
            case .components: groups = componentGroups(store, companyId: company.id, list: list)
            case .tests: groups = [(nil, testTypeItems(store, companyId: company.id))]
            case .severities: groups = [(nil, severityItems(store, companyId: company.id))]
            case .exclusions: groups = [(nil, exclusionItems(store, companyId: company.id))]
            case .team:
                team = teamMembers(store, kv: sync.kv, companyId: company.id, me: session.user?.id)
                profiles = profileRows(personProfiles(store, companyId: company.id), team: team)
            default: groups = []
            }
            loaded = true
        }
    }

    /// Settings › Price Book › Charge for Chemicals: a switch that saves when flipped, through the
    /// sync layer, with what on and off mean under it (website components/charge-chemicals.tsx).
    struct ChargeChemicalsSection: View {
        var company: CompanyContext
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var error: String?

        var body: some View {
            let on = chargesChemicals(company.settings)
            Section {
                SwitchRow(
                    ChargeChemicalsText.label,
                    isOn: Binding(
                        get: { on },
                        set: { next in
                            do {
                                try ChargeChemicalsWrites.set(sync, company: company, on: next)
                                session.reloadCompanies()
                            } catch {
                                self.error = String(describing: error)
                            }
                        })
                )
                .surfaceRow()
                .listRowInsets(EdgeInsets())
            } header: {
                SectionLabel("Chemicals")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(on ? ChargeChemicalsText.on : ChargeChemicalsText.off)
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                    if let error { Text(error).textRole(.footnote).foregroundStyle(Color.fail) }
                }
            }
        }
    }

    /// Which profile the profile sheet edits: a row of the Profiles group, or Add Person.
    enum ProfileSheetTarget: Identifiable {
        case row(ProfileListRow)
        case addPerson

        var id: String {
            switch self {
            case .row(let row): row.id
            case .addPerson: "add-person"
            }
        }
    }

    /// A person's profile (owner, 2026-10-20; website settings/team `ProfileFields`): Name, Phone,
    /// Email and Address, the emergency contact's Name and Phone, and Notes; Save (Save Profile
    /// for a new one) and Delete Profile. Written through the sync layer.
    struct PersonProfileSheet: View {
        var target: ProfileSheetTarget
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form = PersonProfileForm()
        @State private var original = PersonProfileForm()
        @State private var error: String?
        @State private var confirmDelete = false
        @State private var loaded = false

        private var row: ProfileListRow? {
            if case .row(let row) = target { return row }
            return nil
        }
        private var profile: PersonProfile? { row?.profile }

        var body: some View {
            FormSheet(title: row?.title ?? ProfileText.addPerson, dirty: form != original) {
                if row == nil {
                    Text(ProfileText.addPersonHint).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                Grouped {
                    LabeledFieldRow(label: "Name", text: $form.name, labelWidth: 96)
                    LabeledFieldRow(label: "Phone", text: $form.phone, keyboard: .phonePad, labelWidth: 96)
                    LabeledFieldRow(label: "Email", text: $form.email, keyboard: .emailAddress, labelWidth: 96)
                    LabeledFieldRow(label: "Address", text: $form.address, labelWidth: 96)
                }
                Grouped(label: ProfileText.emergency) {
                    LabeledFieldRow(label: "Name", text: $form.emergencyName, labelWidth: 96)
                    LabeledFieldRow(label: "Phone", text: $form.emergencyPhone, keyboard: .phonePad, labelWidth: 96)
                }
                Grouped {
                    LabeledFieldRow(label: "Notes", text: $form.notes, labelWidth: 96, multiline: true)
                }
                if let error { Notice(kind: .error, text: error) }
                Button(profile == nil ? ProfileText.saveNew : ProfileText.save) { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                if profile != nil {
                    Hairline()
                    Button(ProfileText.delete, role: .destructive) { confirmDelete = true }
                        .buttonStyle(.danger(fullWidth: true, size: .field))
                }
            }
            .confirmationDialog(ProfileText.deleteConfirm, isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(ProfileText.delete, role: .destructive) { delete() }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                form = PersonProfileForm(profile: profile, name: row?.memberName, email: row?.memberEmail)
                original = form
            }
        }

        private func save() {
            if let problem = form.error {
                error = problem
                return
            }
            guard let company = session.company else { return }
            do {
                let said = try ProfileWrites.save(
                    sync, companyId: company.id, id: profile?.id, userId: profile == nil ? row?.userId : nil, form)
                done(said)
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }

        private func delete() {
            guard let profile else { return }
            do {
                try ProfileWrites.delete(sync, id: profile.id)
                done("Removed.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// A team member's profile (owner, 2026-10-20: "Mix the tech profiles with the role/on and
    /// off switch"): their contact details, emergency contact and notes, then Role (owners
    /// only), Color, and the On switch (not for yourself; turning off asks first). Save writes
    /// the profile and the membership through the sync layer; the switch acts at once, as the
    /// list's does.
    struct TeamMemberSheet: View {
        var member: SettingsTeamMember
        var profile: ProfileListRow?
        var owner: Bool
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form = PersonProfileForm()
        @State private var original = PersonProfileForm()
        @State private var role = "tech"
        @State private var color = TechColor.blue
        @State private var active = true
        @State private var confirmOff = false
        @State private var error: String?
        @State private var loaded = false
        @Environment(AppEnvironment.self) private var app
        /// Start My Day From (owner, 2026-10-21): owners and admins set anyone's.
        @State private var start = StartFromForm()
        @State private var startOriginal = StartFromForm()
        @State private var startSaved: MemberStart?

        private var dirty: Bool {
            form != original || role != member.role || color != member.color || start != startOriginal
        }

        var body: some View {
            FormSheet(title: member.name, dirty: dirty) {
                Grouped {
                    LabeledFieldRow(label: "Name", text: $form.name, labelWidth: 96)
                    LabeledFieldRow(label: "Phone", text: $form.phone, keyboard: .phonePad, labelWidth: 96)
                    LabeledFieldRow(label: "Email", text: $form.email, keyboard: .emailAddress, labelWidth: 96)
                    LabeledFieldRow(label: "Address", text: $form.address, labelWidth: 96)
                }
                Grouped(label: ProfileText.emergency) {
                    LabeledFieldRow(label: "Name", text: $form.emergencyName, labelWidth: 96)
                    LabeledFieldRow(label: "Phone", text: $form.emergencyPhone, keyboard: .phonePad, labelWidth: 96)
                }
                Grouped {
                    LabeledFieldRow(label: "Notes", text: $form.notes, labelWidth: 96, multiline: true)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Grouped {
                        ListRow(TeamText.role) {
                            if owner {
                                Menu {
                                    Picker(TeamText.role, selection: $role) {
                                        ForEach(Role.allCases, id: \.self) { Text($0.label).tag($0.rawValue) }
                                    }
                                    .pickerStyle(.inline)
                                } label: {
                                    MenuValue(text: roleLabel(role))
                                }
                                .accessibilityLabel(TeamText.role)
                                .accessibilityValue(roleLabel(role))
                            } else {
                                Text(roleLabel(role)).textRole(.body).foregroundStyle(Color.textMuted)
                            }
                        }
                        ListRow(TeamText.color) {
                            Menu {
                                Picker(TeamText.color, selection: $color) {
                                    ForEach(TechColor.allCases, id: \.self) { c in
                                        Label {
                                            Text(c.label)
                                        } icon: {
                                            c.menuImage
                                        }.tag(c)
                                    }
                                }
                                .pickerStyle(.inline)
                            } label: {
                                HStack(spacing: 8) {
                                    TechDot(color: color)
                                    MenuValue(text: color.label)
                                }
                            }
                            .accessibilityLabel(TeamText.color)
                            .accessibilityValue(color.label)
                        }
                        SwitchRow(
                            TeamText.on, detail: member.isMe ? TeamText.yourself : nil,
                            isOn: Binding(
                                get: { active },
                                set: { on in if on { setActive(true) } else { confirmOff = true } })
                        )
                        .disabled(member.isMe)
                    }
                    if !owner {
                        Text(TeamText.ownerOnly).textRole(.footnote).foregroundStyle(Color.textMuted)
                            .padding(.horizontal, 16)
                    }
                }
                StartFromSection(form: $start, saved: startSaved, userId: member.userId)
                if let error { Notice(kind: .error, text: error) }
                Button(ProfileText.save) { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .confirmationDialog(
                TeamText.turnOffQuestion(member.name), isPresented: $confirmOff, titleVisibility: .visible
            ) {
                Button(TeamText.turnOff, role: .destructive) { setActive(false) }
                Button("Cancel", role: .cancel) {}
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                form = PersonProfileForm(
                    profile: profile?.profile, name: profile?.memberName ?? member.name,
                    email: profile?.memberEmail ?? member.email)
                original = form
                role = member.role
                color = member.color
                active = member.active
                if let company = session.company {
                    startSaved = memberStart(sync.store, companyId: company.id, userId: member.userId)
                }
                start = StartFromForm(startSaved)
                startOriginal = start
            }
        }

        private func setActive(_ on: Bool) {
            guard let company = session.company else { return }
            do {
                try TeamWrites.setActive(sync, companyId: company.id, membershipId: member.id, on)
                active = on
            } catch {
                self.error = String(describing: error)
            }
        }

        private func save() {
            guard let company = session.company else { return }
            if form != original, let problem = form.error {
                error = problem
                return
            }
            do {
                try sync.batch {
                    if form != original {
                        try ProfileWrites.save(
                            sync, companyId: company.id, id: profile?.profile?.id,
                            userId: profile?.profile == nil ? member.userId : nil, form)
                    }
                    try TeamWrites.save(
                        sync, companyId: company.id, membershipId: member.id,
                        role: owner && role != member.role ? role : nil,
                        color: color != member.color ? color : nil)
                    if start != startOriginal {
                        try StartFromWrites.save(
                            sync, companyId: company.id, userId: member.userId, start, locate: app.locate)
                    }
                }
                done("Saved.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// Which row a settings sheet edits (nil: a new one).
    enum ConfigSheetTarget: Identifiable {
        case add
        case edit(ConfigItem)

        var id: String {
            switch self {
            case .add: "new"
            case .edit(let item): item.id
            }
        }

        var item: ConfigItem? {
            if case .edit(let item) = self { return item }
            return nil
        }
    }

    /// A price book item's form: name, price, unit, category, order, description, taxable, and
    /// whether it's offered on quotes; Remove Item at the bottom.
    struct PriceItemSheet: View {
        var item: ConfigItem?
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form = PriceItemForm()
        @State private var original = PriceItemForm()
        @State private var error: String?
        @State private var confirmRemove = false

        var body: some View {
            FormSheet(title: item?.name ?? "Add Item", dirty: form != original) {
                Grouped {
                    LabeledFieldRow(label: "Name", text: $form.name, labelWidth: 120)
                    LabeledFieldRow(label: "Price ($)", text: $form.price, keyboard: .decimalPad, labelWidth: 120)
                    LabeledFieldRow(label: "Unit", text: $form.unit, labelWidth: 120)
                    LabeledFieldRow(label: "Category", text: $form.category, labelWidth: 120)
                    LabeledFieldRow(label: "Order", text: $form.order, keyboard: .numberPad, labelWidth: 120)
                }
                Grouped(footer: "Shown on quotes.") {
                    LabeledFieldRow(label: "Description", text: $form.description, labelWidth: 120, multiline: true)
                }
                Grouped {
                    SwitchRow("Taxable", isOn: $form.taxable)
                    if item != nil { SwitchRow("Available on quotes", isOn: $form.active) }
                }
                if let error { Notice(kind: .error, text: error) }
                Button(item == nil ? "Add Item" : "Save Item") { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                if item != nil {
                    Hairline()
                    Button("Remove Item", role: .destructive) { confirmRemove = true }
                        .buttonStyle(.danger(fullWidth: true, size: .field))
                }
            }
            .confirmationDialog(
                "Remove this item from the price book?", isPresented: $confirmRemove, titleVisibility: .visible
            ) {
                Button("Remove Item", role: .destructive) { remove() }
            }
            .onAppear {
                if let item, original == PriceItemForm() {
                    form = PriceItemForm(item.row)
                    original = form
                }
            }
        }

        private func save() {
            if let problem = form.error {
                error = problem
                return
            }
            guard let company = session.company else { return }
            do {
                try ConfigWrites.savePriceItem(sync, companyId: company.id, id: item?.id, form)
                done("Saved.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }

        private func remove() {
            guard let item else { return }
            do {
                try ConfigWrites.remove(sync, page: .priceBook, id: item.id)
                done("Removed.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// A component's, test type's, severity's or exclusion reason's form: the name, the order,
    /// whether it's offered, and (severities) the summary rule. Fields only the website edits
    /// (methods, test fields, pin colors) stay there.
    struct ConfigItemSheet: View {
        var page: SettingsPage
        var item: ConfigItem?
        var poolChecklist: Bool
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form = ConfigItemForm()
        @State private var original = ConfigItemForm()
        @State private var error: String?
        @State private var confirmRemove = false

        private var words: (add: String, remove: String, confirm: String, active: String, name: String) {
            switch page {
            case .components:
                let what = poolChecklist ? "visits" : "checklists"
                return (
                    "Add Component", "Remove Component", "Remove this component from new \(what)?", "On new \(what)",
                    "Name"
                )
            case .tests:
                return (
                    "Add Test Type", "Remove Test Type", "Remove this test type?", "Techs can record this test", "Name"
                )
            case .severities:
                return ("Add Severity", "Remove Severity", "Remove this severity?", "Techs can pick this", "Name")
            default: return ("Add Reason", "Remove", "Remove this reason?", "Offered", "Reason")
            }
        }

        var body: some View {
            FormSheet(title: item?.name ?? words.add, dirty: form != original) {
                Grouped {
                    LabeledFieldRow(label: words.name, text: $form.name)
                    LabeledFieldRow(label: "Order", text: $form.order, keyboard: .numberPad)
                }
                Grouped(
                    footer: page == .exclusions ? nil : "Other fields are on the website, in Settings › \(page.title)."
                ) {
                    if page == .severities { SwitchRow("Must appear in the report summary", isOn: $form.mustMention) }
                    if item != nil || page == .exclusions { SwitchRow(words.active, isOn: $form.active) }
                }
                if let error { Notice(kind: .error, text: error) }
                Button(item == nil ? words.add : "Save") { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                if item != nil {
                    Hairline()
                    Button(words.remove, role: .destructive) { confirmRemove = true }
                        .buttonStyle(.danger(fullWidth: true, size: .field))
                }
            }
            .confirmationDialog(words.confirm, isPresented: $confirmRemove, titleVisibility: .visible) {
                Button(words.remove, role: .destructive) { remove() }
            }
            .onAppear {
                if let item, original == ConfigItemForm() {
                    form = ConfigItemForm(item)
                    original = form
                }
            }
        }

        private func save() {
            if let problem = form.error {
                error = problem
                return
            }
            guard let company = session.company else { return }
            do {
                try ConfigWrites.saveItem(sync, companyId: company.id, page: page, id: item?.id, form)
                done("Saved.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }

        private func remove() {
            guard let item else { return }
            do {
                try ConfigWrites.remove(sync, page: page, id: item.id)
                done("Removed.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// A pool inspection question's form (2026-10-20; website settings/components
    /// `InspectionFields`): the question, its group, choices, banner, order, and whether new
    /// checklists get it; its section and answer kind are set on the website.
    struct InspectionQuestionSheet: View {
        var item: ConfigItem
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form = InspectionQuestionForm()
        @State private var original = InspectionQuestionForm()
        @State private var error: String?
        @State private var confirmRemove = false

        var body: some View {
            FormSheet(title: item.name, dirty: form != original) {
                Grouped {
                    LabeledFieldRow(label: "Question", text: $form.name, labelWidth: 120, multiline: true)
                    ListRow("Section", value: form.section.label)
                    LabeledFieldRow(label: "Group", text: $form.group, labelWidth: 120)
                    ListRow("Answer", value: form.answerLabel)
                    LabeledFieldRow(label: "Order", text: $form.order, keyboard: .numberPad, labelWidth: 120)
                }
                if form.asksOptions {
                    Grouped(
                        footer:
                            "One per line. Add (needs attention), (leaking), or (not applicable) after a choice that means that, and (folds the group) to a first question’s No to fold its group away."
                    ) {
                        LabeledFieldRow(label: "Choices", text: $form.options, labelWidth: 120, multiline: true)
                    }
                }
                Grouped(footer: "Shown above the question, and as a recommendation on the report.") {
                    LabeledFieldRow(label: "Banner", text: $form.notice, labelWidth: 120, multiline: true)
                }
                Grouped(footer: "Section and answer are changed on the website, in Settings › Checklist Components.") {
                    SwitchRow("On new checklists", isOn: $form.active)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                Hairline()
                Button("Remove Component", role: .destructive) { confirmRemove = true }
                    .buttonStyle(.danger(fullWidth: true, size: .field))
            }
            .confirmationDialog(
                "Remove this question from new checklists?", isPresented: $confirmRemove, titleVisibility: .visible
            ) {
                Button("Remove Component", role: .destructive) { remove() }
            }
            .onAppear {
                if original == InspectionQuestionForm() {
                    form = InspectionQuestionForm(item.row)
                    original = form
                }
            }
        }

        private func save() {
            if let problem = form.error {
                error = problem
                return
            }
            guard let company = session.company else { return }
            do {
                try ConfigWrites.saveInspectionQuestion(sync, companyId: company.id, id: item.id, form)
                done("Saved.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }

        private func remove() {
            do {
                try ConfigWrites.remove(sync, page: .components, id: item.id)
                done("Removed.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }
#endif
