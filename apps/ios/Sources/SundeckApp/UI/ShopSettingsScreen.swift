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
        /// Which checklist Checklist Components shows (pool visits, leak or pool inspections).
        @State private var list: ChecklistList = .leak
        @State private var editing: ConfigSheetTarget?
        @State private var notice: String?
        @State private var browser: BrowserPage?
        @State private var loaded = false

        var body: some View {
            let company = session.company
            let services = company?.services ?? .both
            let manager = isManagerRole(company?.role)
            let canAdd = manager && (page == .priceBook || page == .exclusions)
            List {
                Section {
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
                if page == .team {
                    Section {
                        ForEach(team) { m in
                            ListRow(m.isMe ? "\(m.name) (you)" : m.name, detail: m.email, value: m.value).surfaceRow()
                                .listRowInsets(EdgeInsets())
                        }
                    } header: {
                        SectionLabel("People")
                    } footer: {
                        Text("Invite people, change roles, and turn people off on the website.")
                            .textRole(.footnote).foregroundStyle(Color.textMuted)
                    }
                    if manager, let company { completingAJob(company) }
                    Section {
                        ActionRow("Open Team on the Website") { browser = .site(page.webPath) }
                            .surfaceRow().listRowInsets(EdgeInsets())
                    }
                } else if loaded && groups.allSatisfy(\.items.isEmpty) {
                    Section { EmptyState(text: "No items yet.").plainListRow() }
                } else {
                    ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
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
                            }
                        } header: {
                            if let title = group.title { SectionLabel(title) }
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
            .browserSheet($browser)
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(list.rawValue)") { reload() }
            .onAppear { if !loaded { list = ChecklistList.lists(services).first ?? .leak } }
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
            default: groups = []
            }
            loaded = true
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
