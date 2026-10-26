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
        @Environment(\.openURL) private var openURL

        static func telURL(_ phone: String) -> URL? {
            let digits = phone.filter { $0.isNumber || $0 == "+" }
            return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
        }
        @State private var search = ""
        @State private var sort = CustomerSort.name
        @State private var show: String
        @State private var rows: [CustomerListItem] = []
        /// Each Show choice's count (owner, 2026-10-22), of what the search finds.
        @State private var counts: CustomerCounts?
        @State private var loaded = false
        /// The company number works: Message opens New Message, as the customer's page does.
        @State private var lineWorking = false
        /// Email Customers (owner, 2026-10-22), owners and admins.
        @State private var emailing = false
        @Environment(\.openRoute) private var openRoute

        /// `show`: the Show choice to open on (the Dashboard's trackers open On a Plan).
        init(show: String = "all") {
            _show = State(initialValue: show)
        }

        var body: some View {
            let company = session.company
            let services = company?.services ?? .both
            let shows = customerShows(services, counts: counts)
            List {
                // The search and pickers aren't clipped by the list's rounded corners (owner,
                // 2026-10-22): see ListTopSection.
                ListTopSection {
                    VStack(alignment: .leading, spacing: 16) {
                        SearchField(text: $search, placeholder: "Name, phone, or email")
                        // Sort above Show, so Show's count is never cut off ("On a Plan (65)").
                        VStack(alignment: .leading, spacing: 12) {
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
                            // Swipe left for Call and Message where there's a phone; touch and
                            // hold for the menu. The customer's page has each (gestures spec 12).
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if let phone = c.phone, let url = Self.telURL(phone) {
                                    Button("Call", systemImage: "phone.fill") { openURL(url) }.tint(Color.pass)
                                    Button("Message", systemImage: "message.fill") { message(c.id, phone) }
                                        .tint(Color.link)
                                }
                            }
                            .rowMenu(c.name, menu(c))
                        }
                    }
                }
            }
            .groupedList()
            .refreshable { await sync.syncNow() }
            .navigationTitle("Customers")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if isManagerRole(company?.role) {
                    ToolbarItem(placement: .topBarTrailing) {
                        BarIconButton(systemImage: "envelope", label: MassEmailText.title) { emailing = true }
                    }
                }
            }
            .navigationDestination(isPresented: $emailing) { MassEmailScreen() }
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(search)|\(sort.rawValue)|\(show)") { reload() }
        }

        private func reload() {
            guard let company = session.company else { return }
            rows = customerList(
                sync.store, companyId: company.id, search: search, sort: sort, show: show, timeZone: company.timeZone)
            counts = customerCounts(sync.store, companyId: company.id, search: search, timeZone: company.timeZone)
            lineWorking = companyLine(sync.store, companyId: company.id)?.status == "active"
            loaded = true
        }

        /// Open, Call, Message, Directions (their pool). New Job for a customer isn't on the phone.
        private func menu(_ c: CustomerListItem) -> [SwipeAction] {
            var list = [
                SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link) {
                    openRoute(.more(.customer(c.id)))
                }
            ]
            if let phone = c.phone, let url = Self.telURL(phone) {
                list.append(SwipeAction(title: "Call", systemImage: "phone", tint: Color.pass) { openURL(url) })
                list.append(
                    SwipeAction(title: "Message", systemImage: "message", tint: Color.link) { message(c.id, phone) })
            }
            if let place = c.place {
                list.append(
                    SwipeAction(title: "Directions", systemImage: "location", tint: Color.link) {
                        if let url = directionsURL(place, choice: sync.kv.directionsChoice) { openURL(url) }
                    })
            }
            return list
        }

        /// The customer page's Text: New Message on the company number, else Messages.
        private func message(_ customerId: String, _ phone: String) {
            if lineWorking {
                openRoute(.messages(.newMessage(customerId: customerId)))
            } else if let url = URL(string: "sms:\(phone.filter { $0.isNumber || $0 == "+" })") {
                openURL(url)
            }
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
            // First under Recent in search (docs/plans/search-and-activity.md).
            .task(id: detail.map { recent($0) }) {
                if let detail { RecentSearches(kv: sync.kv).opened(recent(detail)) }
            }
        }

        private func recent(_ c: CustomerDetail) -> RecentItem {
            recentItem(customerId: c.id, name: c.name, phone: c.phone, email: c.email)
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
                    ListRow(CustomerEmailsText.label, value: c.remindersOn ? "On" : "Off")
                    if let notes = c.notes { ListRow("Notes", detail: notes) }
                    ActionRow("Edit Contact Details") { editingContact = true }
                }
                if c.pools.isEmpty { EmptyState(text: "No pools.") }
                ForEach(Array(c.pools.enumerated()), id: \.element.id) { index, pool in
                    poolGroups(pool, customer: c, title: c.pools.count > 1 ? "Pool \(index + 1)" : "Pool")
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
                PoolSheet(propertyId: pool.id, row: pool.row) { saved = "Saved." }
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

        @ViewBuilder private func poolGroups(_ pool: CustomerPool, customer: CustomerDetail, title: String)
            -> some View
        {
            let services = session.company?.services ?? .both
            let leak = services != .pool
            Grouped(label: title) {
                Button {
                    editingPool = pool
                } label: {
                    // Its address wasn't found on the map: the symbol right after it (owner, 2026-10-20).
                    let missing =
                        propertyMapStatus(pool.row, routing: MapLookups.on(sync, companyId: session.company?.id))
                        == .missing
                    ListRow(
                        title: pool.address.isEmpty ? "Address" : pool.address, detail: pool.detail,
                        emphasized: true, titleMark: missing ? NotOnMapTag.text() : nil
                    ) {
                        Text("Edit").textRole(.body).foregroundStyle(Color.link)
                    }
                }
                .buttonStyle(.row)
                .accessibilityHint("Opens Pool Details")
                if let notes = pool.accessNotes { ListRow("Access notes", detail: notes) }
                // Pool shops: Chemical for this pool, with its latest readings (owner, 2026-10-19).
                if services != .leak {
                    Button {
                        openRoute(.more(.chemicals(ChemicalTarget(propertyId: pool.id))))
                    } label: {
                        LinkDetailRow(title: "Chemical", detail: pool.chemicalLine ?? ChemicalLogText.poolRowEmpty)
                    }
                    .buttonStyle(.row)
                }
                ActionRow("Get Directions") {
                    if let url = directionsURL(pool.place, choice: sync.kv.directionsChoice) { openURL(url) }
                }
            }
            // Pool shops: the pool's visit plans; owners and admins change them here.
            if services != .leak {
                MaintenancePlansGroup(
                    customerId: customer.id, pool: pool, canEdit: isManagerRole(session.company?.role)
                ) { saved = $0 }
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
                    .zoomSource(job.id)
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
            guard !deleting else { return }
            deleting = true
            defer { deleting = false }
            do {
                try await app.client.rpc("delete_customer", params: ["target_customer": c.id]).execute()
                await sync.syncNow()
                dismiss()
            } catch let failure as PostgrestError {
                deleteError = friendlyError(failure.message)
            } catch {
                deleteError = "No connection. Try again when you're online."
            }
        }
    }

    /// Edit Contact Details: the customer's name, type, company, phone, email, notes, and the
    /// reminder, review and shop emails switch (one unsubscribe covers all three, 2026-10-22).
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
                    SwitchRow(CustomerEmailsText.offLabel, isOn: $noReminders)
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
                self.error = userMessage(error)
            }
        }
    }

    /// Pool Details: the address, the pool type, gallons, the spa, and access notes.
    struct PoolSheet: View {
        var propertyId: String
        var row: Row
        var saved: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var street = ""
        /// Address suggestions under Street (owner, 2026-10-20).
        @State private var suggester = AddressSuggester()
        @State private var streetFocused = false
        @State private var unit = ""
        @State private var city = ""
        @State private var state = ""
        @State private var zip = ""
        @State private var poolType = ""
        @State private var gallons = ""
        @State private var hasSpa = false
        @State private var access = ""
        @State private var original: [String] = []
        @State private var error: String?

        private var current: [String] { [street, unit, city, state, zip, poolType, gallons, String(hasSpa), access] }

        var body: some View {
            FormSheet(title: "Pool Details", dirty: !original.isEmpty && current != original) {
                Grouped {
                    LabeledFieldRow(
                        label: "Street", text: $street, contentType: .streetAddressLine1,
                        onFocusChange: { streetFocused = $0 }
                    )
                    .addressLookup(suggester, text: street, focused: streetFocused)
                    AddressSuggestionRows(suggester: suggester) { s in
                        street = s.line1
                        city = s.city
                        state = s.state
                        zip = s.postalCode
                    }
                    LabeledFieldRow(label: "Unit", text: $unit, placeholder: "Optional")
                    LabeledFieldRow(label: "City", text: $city, contentType: .addressCity)
                    LabeledFieldRow(label: "State", text: $state, contentType: .addressState)
                    LabeledFieldRow(label: "ZIP", text: $zip, keyboard: .numberPad, contentType: .postalCode)
                }
                Grouped(footer: "Gate code, dog, where to park.") {
                    LabeledPickerRow(
                        label: "Pool type", selection: $poolType, options: [""] + PoolType.allCases.map(\.rawValue),
                        optionLabel: { PoolType(rawValue: $0)?.label ?? "Not sure" })
                    // Typed as "20,000" (commas added as they're typed); blank clears it.
                    LabeledFieldRow(
                        label: "Gallons",
                        text: Binding(get: { gallons }, set: { gallons = gallonsWithCommas($0) }),
                        placeholder: "20,000", keyboard: .numberPad)
                    SwitchRow("Has a spa", isOn: $hasSpa)
                    LabeledFieldRow(label: "Access notes", text: $access, multiline: true)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") { save() }.buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear {
                guard original.isEmpty else { return }
                let r = row
                street = r["address_line1"]?.string ?? ""
                unit = r["address_line2"]?.string ?? ""
                city = r["city"]?.string ?? ""
                state = r["state"]?.string ?? ""
                zip = r["postal_code"]?.string ?? ""
                poolType = r["pool_type"]?.string ?? ""
                gallons = poolGallonsField(r["approx_gallons"])
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
            let approxGallons: JSONValue
            do {
                approxGallons = try parsePoolGallons(gallons)
            } catch {
                self.error = error.message
                return
            }
            do {
                try CustomerWrites.savePool(
                    sync, companyId: companyId, propertyId: propertyId,
                    [
                        "address_line1": .string(street.trimmingCharacters(in: .whitespaces)),
                        "address_line2": opt(unit), "city": opt(city), "state": opt(state.uppercased()),
                        "postal_code": opt(zip), "pool_type": opt(poolType), "has_spa": .bool(hasSpa),
                        "approx_gallons": approxGallons, "access_notes": opt(access),
                    ], locate: app.locate)
                saved()
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }
    }
#endif
