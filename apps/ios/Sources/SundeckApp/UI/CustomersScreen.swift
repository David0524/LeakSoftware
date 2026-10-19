#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // More › Customers and a customer's page (spec 5.9; website app/(office)/customers). The list
    // filters as you type from the phone's rows (no Search button, spec 9).

    struct CustomersScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var search = ""
        @State private var sort = CustomerSort.name
        @State private var show = "all"
        @State private var rows: [CustomerListItem] = []
        @State private var loaded = false

        var body: some View {
            let company = session.company
            let services = company?.services ?? .both
            let shows = customerShows(services)
            List {
                if let company, let tip = screenTip("customers", company: company, app: app) {
                    Section {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                            .plainListRow()
                    }
                }
                Section {
                    VStack(alignment: .leading, spacing: 16) {
                        SearchField(text: $search, placeholder: "Name, phone, or email")
                        HStack(alignment: .top, spacing: 12) {
                            SelectField(
                                label: "Sort", selection: $sort, options: CustomerSort.allCases, optionLabel: \.label)
                            SelectField(
                                label: "Show",
                                selection: Binding(
                                    get: { shows.first { $0.value == show } ?? shows[0] }, set: { show = $0.value }),
                                options: shows, optionLabel: \.label)
                        }
                    }
                    .plainListRow()
                }
                if loaded && rows.isEmpty {
                    Section { EmptyState(text: customersEmptyText(search: search, show: show)).plainListRow() }
                } else {
                    Section {
                        ForEach(rows) { c in
                            NavigationLink(value: MoreRoute.customer(c.id)) {
                                CustomerListRow(
                                    customer: c,
                                    value: customerRowValue(
                                        c, sort: sort, timeZone: company?.timeZone ?? "America/Phoenix"))
                            }
                            .surfaceRow()
                        }
                    }
                }
            }
            .groupedList()
            .refreshable { await sync.syncNow() }
            .navigationTitle("Customers")
            .navigationBarTitleDisplayMode(.large)
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(search)|\(sort.rawValue)|\(show)") { reload() }
        }

        private func reload() {
            guard let company = session.company else { return }
            rows = customerList(sync.store, companyId: company.id, search: search, sort: sort, show: show)
            loaded = true
        }
    }

    /// A customer in the list: name (and company), phone, each pool's address, and the sort's value.
    struct CustomerListRow: View {
        var customer: CustomerListItem
        var value: String?

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    (Text(customer.name).font(.role(.bodyEmphasis)).foregroundStyle(Color.text)
                        + Text(customer.companyName.map { " · \($0)" } ?? "").font(.role(.body)).foregroundStyle(
                            Color.textMuted))
                    Text(customer.contactLine).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    if !customer.addresses.isEmpty {
                        Text(customer.addresses.joined(separator: "; ")).textRole(.secondary).foregroundStyle(
                            Color.text)
                    }
                }
                Spacer(minLength: 0)
                if let value {
                    Text(value).textRole(.body).foregroundStyle(Color.textMuted).monospacedDigit()
                }
            }
            .padding(.vertical, 6)
            .frame(minHeight: minTarget)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - A customer's page

    /// A customer, laid out like a contact card in iOS: call, text and email up top, details as
    /// grouped rows, each group edited in a sheet.
    struct CustomerScreen: View {
        var customerId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @Environment(\.dismiss) private var dismiss
        @State private var detail: CustomerDetail?
        @State private var loaded = false
        @State private var lineWorking = false
        @State private var editingContact = false
        @State private var editingPool: CustomerPool?
        @State private var newMessage = false
        @State private var confirmDelete = false
        @State private var deleting = false
        @State private var deleteError: String?
        @State private var saved: String?

        var body: some View {
            Group {
                if let detail {
                    page(detail)
                } else if loaded {
                    ScreenScroll { EmptyState(text: "This customer isn’t on this phone.") }
                } else {
                    Color.bg
                }
            }
            .navigationTitle(detail?.name ?? "")
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(isPresented: $newMessage) { NewMessageScreen(customerId: customerId) }
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") { reload() }
        }

        private func page(_ c: CustomerDetail) -> some View {
            let manager = isManagerRole(session.company?.role)
            return ScreenScroll {
                VStack(alignment: .leading, spacing: 12) {
                    if !c.subtitle.isEmpty {
                        Text(c.subtitle).textRole(.body).foregroundStyle(Color.textMuted)
                    }
                    contactButtons(c)
                }
                if let saved { Notice(kind: .success, text: saved) }
                Grouped(label: "Contact") {
                    ListRow("Phone", value: c.phone ?? "None")
                    ListRow("Email", value: c.email ?? "None")
                    if !c.otherEmails.isEmpty {
                        ListRow("Other emails", detail: c.otherEmails.joined(separator: ", "))
                    }
                    ListRow("Reminder and review emails", value: c.remindersOn ? "On" : "Off")
                    if let notes = c.notes { ListRow("Notes", detail: notes) }
                    ActionRow("Edit Contact Details") { editingContact = true }
                }
                if c.pools.isEmpty { EmptyState(text: "No pools.") }
                ForEach(Array(c.pools.enumerated()), id: \.element.id) { index, pool in
                    poolGroups(pool, title: c.pools.count > 1 ? "Pool \(index + 1)" : "Pool")
                }
                if manager {
                    VStack(alignment: .leading, spacing: 8) {
                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            BusyButtonLabel("Delete Customer", busy: deleting, busyTitle: "Deleting…")
                        }
                        .buttonStyle(.danger)
                        .disabled(deleting)
                        if let deleteError { Notice(kind: .error, text: deleteError) }
                        Text(
                            "Removes \(c.name) and their pools from Sundeck Pro. Only possible when every job is paid or canceled; finished jobs, reports, and invoices are kept."
                        )
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                    }
                }
            }
            .refreshable { await sync.syncNow() }
            .sheet(isPresented: $editingContact) {
                ContactSheet(customer: c) { saved = "Saved." }
            }
            .sheet(item: $editingPool) { pool in
                PoolSheet(pool: pool) { saved = "Saved." }
            }
            .confirmationDialog("Delete \(c.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Customer", role: .destructive) { Task { await delete(c) } }
            } message: {
                Text("Removes \(c.name) and their pools from Sundeck Pro.")
            }
        }

        private func contactButtons(_ c: CustomerDetail) -> some View {
            HStack(spacing: 8) {
                if let phone = c.phone {
                    RoundIconButton(systemImage: "phone", label: "Call \(c.name), \(phone)") {
                        if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") { openURL(url) }
                    }
                    RoundIconButton(systemImage: "message", label: "Text \(c.name)") {
                        if lineWorking {
                            newMessage = true
                        } else if let url = URL(string: "sms:\(phone.filter { $0.isNumber || $0 == "+" })") {
                            openURL(url)
                        }
                    }
                }
                if let email = c.email {
                    RoundIconButton(systemImage: "envelope", label: "Email \(c.name), \(email)") {
                        if let url = URL(string: "mailto:\(email)") { openURL(url) }
                    }
                }
                if let shown = c.phone ?? c.email {
                    Text(shown).textRole(.secondary).foregroundStyle(Color.textMuted).padding(.leading, 4)
                }
            }
        }

        @ViewBuilder private func poolGroups(_ pool: CustomerPool, title: String) -> some View {
            let leak = (session.company?.services ?? .both) != .pool
            Grouped(label: title) {
                Button {
                    editingPool = pool
                } label: {
                    ListRow(
                        title: pool.address.isEmpty ? "Address" : pool.address, detail: pool.detail, emphasized: true
                    ) {
                        Text("Edit").textRole(.body).foregroundStyle(Color.link)
                    }
                }
                .buttonStyle(.row)
                .accessibilityHint("Opens Pool Details")
                if let notes = pool.accessNotes { ListRow("Access notes", detail: notes) }
                ActionRow("Get Directions") {
                    if let url = directionsURL(pool.place, choice: sync.kv.directionsChoice) { openURL(url) }
                }
            }
            Grouped(label: leak ? "Leak detection and repairs" : "Repairs") {
                if pool.jobs.isEmpty {
                    Text("No visits yet")
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                }
                ForEach(pool.jobs) { job in
                    Button {
                        openRoute(.job(job.id))
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                (Text(job.title).font(.role(.bodyEmphasis)).foregroundStyle(Color.text)
                                    + Text(" · \(job.typeLabel)").font(.role(.body)).foregroundStyle(Color.textMuted))
                                Text(job.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                            }
                            Spacer(minLength: 0)
                            StatusChip(status: job.status)
                            Chevron()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .frame(minHeight: minTarget)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.row)
                    .accessibilityElement(children: .combine)
                }
            }
        }

        private func reload() {
            guard let company = session.company else { return }
            detail = customerDetail(
                sync.store, companyId: company.id, customerId: customerId, names: teamNames(sync.kv),
                timeZone: company.timeZone)
            lineWorking = companyLine(sync.store, companyId: company.id)?.status == "active"
            loaded = true
        }

        /// The server checks every job is paid or canceled, then removes the customer and pools.
        private func delete(_ c: CustomerDetail) async {
            deleting = true
            defer { deleting = false }
            do {
                try await app.client.rpc("delete_customer", params: ["target_customer": c.id]).execute()
                await sync.syncNow()
                dismiss()
            } catch let failure as PostgrestError {
                deleteError = failure.message
            } catch {
                deleteError = "No connection. Try again when you're online."
            }
        }
    }

    /// Edit Contact Details: the customer's name, type, company, phone, email, notes, and the
    /// reminder and review emails switch.
    struct ContactSheet: View {
        var customer: CustomerDetail
        var saved: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var kind = "homeowner"
        @State private var company = ""
        @State private var phone = ""
        @State private var email = ""
        @State private var notes = ""
        @State private var noReminders = false
        @State private var error: String?
        @State private var ready = false

        private var dirty: Bool {
            ready
                && (name != customer.name || kind != customer.kind || company != (customer.companyName ?? "")
                    || phone != (customer.phone ?? "") || email != (customer.email ?? "")
                    || notes != (customer.notes ?? "") || noReminders == customer.remindersOn)
        }

        var body: some View {
            FormSheet(title: "Contact Details", dirty: dirty) {
                Grouped {
                    LabeledFieldRow(label: "Name", text: $name, contentType: .name)
                    LabeledPickerRow(
                        label: "Type", selection: $kind, options: customerKinds,
                        optionLabel: { customerKindLabel($0) ?? $0 })
                    LabeledFieldRow(label: "Company", text: $company, placeholder: "Optional")
                    LabeledFieldRow(label: "Phone", text: $phone, keyboard: .phonePad)
                    LabeledFieldRow(label: "Email", text: $email, keyboard: .emailAddress)
                }
                Grouped(
                    footer: customer.otherEmails.isEmpty
                        ? nil
                        : "Other emails: \(customer.otherEmails.joined(separator: ", ")). Change them on the website."
                ) {
                    LabeledFieldRow(label: "Notes", text: $notes, multiline: true)
                    SwitchRow("No reminder or review emails", isOn: $noReminders)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") { save() }.buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear {
                guard !ready else { return }
                name = customer.name
                kind = customer.kind
                company = customer.companyName ?? ""
                phone = customer.phone ?? ""
                email = customer.email ?? ""
                notes = customer.notes ?? ""
                noReminders = !customer.remindersOn
                ready = true
            }
        }

        private func save() {
            if let problem = validateCustomerContact(name: name, phone: phone, email: email) {
                error = problem
                return
            }
            guard let companyId = session.company?.id else { return }
            do {
                try CustomerWrites.saveContact(
                    sync, companyId: companyId, customerId: customer.id, name: name, kind: kind, companyName: company,
                    phone: phone, email: email, notes: notes, noReminders: noReminders)
                saved()
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// Pool Details: the address, the pool type, the spa, and access notes.
    struct PoolSheet: View {
        var pool: CustomerPool
        var saved: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var street = ""
        @State private var unit = ""
        @State private var city = ""
        @State private var state = ""
        @State private var zip = ""
        @State private var poolType = ""
        @State private var hasSpa = false
        @State private var access = ""
        @State private var original: [String] = []
        @State private var error: String?

        private var current: [String] { [street, unit, city, state, zip, poolType, String(hasSpa), access] }

        var body: some View {
            FormSheet(title: "Pool Details", dirty: !original.isEmpty && current != original) {
                Grouped {
                    LabeledFieldRow(label: "Street", text: $street, contentType: .streetAddressLine1)
                    LabeledFieldRow(label: "Unit", text: $unit, placeholder: "Optional")
                    LabeledFieldRow(label: "City", text: $city, contentType: .addressCity)
                    LabeledFieldRow(label: "State", text: $state, contentType: .addressState)
                    LabeledFieldRow(label: "ZIP", text: $zip, keyboard: .numberPad, contentType: .postalCode)
                }
                Grouped(footer: "Gate code, dog, where to park.") {
                    LabeledPickerRow(
                        label: "Pool type", selection: $poolType, options: [""] + PoolType.allCases.map(\.rawValue),
                        optionLabel: { PoolType(rawValue: $0)?.label ?? "Not sure" })
                    SwitchRow("Has a spa", isOn: $hasSpa)
                    LabeledFieldRow(label: "Access notes", text: $access, multiline: true)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") { save() }.buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear {
                guard original.isEmpty else { return }
                let r = pool.row
                street = r["address_line1"]?.string ?? ""
                unit = r["address_line2"]?.string ?? ""
                city = r["city"]?.string ?? ""
                state = r["state"]?.string ?? ""
                zip = r["postal_code"]?.string ?? ""
                poolType = r["pool_type"]?.string ?? ""
                hasSpa = r["has_spa"]?.bool ?? false
                access = r["access_notes"]?.string ?? ""
                original = current
            }
        }

        private func save() {
            guard !street.trimmingCharacters(in: .whitespaces).isEmpty else {
                error = "Enter the street address."
                return
            }
            guard let companyId = session.company?.id else { return }
            let opt = { (s: String) -> JSONValue in
                let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
                return t.isEmpty ? .null : .string(t)
            }
            do {
                try CustomerWrites.savePool(
                    sync, companyId: companyId, propertyId: pool.id,
                    [
                        "address_line1": .string(street.trimmingCharacters(in: .whitespaces)),
                        "address_line2": opt(unit), "city": opt(city), "state": opt(state.uppercased()),
                        "postal_code": opt(zip), "pool_type": opt(poolType), "has_spa": .bool(hasSpa),
                        "access_notes": opt(access),
                    ])
                saved()
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }
#endif
