#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page's Details section (spec 5.4), in the website's order and words: Customer,
    /// Messages, Customer links, Pool, Assigned to, When they booked, On site, then Cancel Job.
    /// Port of the "details" part of apps/web/src/app/(office)/jobs/[id]/page.tsx.
    struct JobDetailsSection: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @Environment(\.openRoute) private var openRoute
        @State private var fee = ""
        @State private var notes = ""
        @State private var loaded: String?
        @State private var confirmCancel = false
        @State private var saveError: String?
        @State private var saves = 0
        @State private var locating = false
        @State private var locationResult: (text: String, ok: Bool)?
        @State private var confirmLink: CustomerLinkRow?
        @State private var turningOff: Set<String> = []
        @State private var turnedOff: Set<String> = []
        @State private var linkError: String?
        @FocusState private var focus: Field?
        @Environment(\.dynamicTypeSize) private var typeSize

        enum Field { case fee, notes }

        var body: some View {
            let _ = sync.revision
            let company = session.company
            let timeZone = company?.timeZone ?? "America/Phoenix"
            let details = JobDetails(job: job, team: sync.kv.team, settings: company?.settings ?? .null)
            let links = customerLinks(sync.store, jobId: job.id, now: Date(), timeZone: timeZone)
                .filter { !turnedOff.contains($0.id) }
            VStack(alignment: .leading, spacing: CGFloat(Spacing.betweenBlocks)) {
                customer(details)
                if let company { messages(details, company: company, timeZone: timeZone) }
                if !links.isEmpty { linksGroup(links) }
                if details.address != nil { pool(details) }
                Grouped(label: "Assigned to") {
                    ListRow("Tech", value: details.tech)
                    if let with = details.with { ListRow("With", value: with) }
                    if let fee = details.fee { ListRow("Detection fee", value: fee) }
                }
                if !details.intake.isEmpty {
                    Grouped(label: details.intakeTitle) {
                        ForEach(Array(details.intake.enumerated()), id: \.offset) { _, answer in
                            StackedRow(caption: answer.question, value: answer.answer)
                        }
                    }
                }
                onSite
                if JobScheduleGroup.shows(job) { JobScheduleGroup(job: job) }
                if isManagerRole(company?.role) { JobTimeline(jobId: job.id) }
                if jobCanCancel(job.status, type: job.type) {
                    Button("Cancel Job", role: .destructive) { confirmCancel = true }
                        .buttonStyle(.danger)
                        .padding(.top, 8)
                }
            }
            .task(id: job.id) { load() }
            .onChange(of: job.job["fee_cents"]) { _, _ in if focus != .fee { load(fee: true, notes: false) } }
            .onChange(of: focus) { old, _ in
                if old == .fee { saveFee() }
                if old == .notes { saveNotes() }
            }
            .onDisappear {
                saveFee()
                saveNotes()
            }
            .sensoryFeedback(.success, trigger: saves)
            .confirmationDialog("Cancel this job?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Cancel Job", role: .destructive) { save(jobStatusValues(.canceled, job: job.job)) }
            }
            .confirmationDialog(
                confirmLink.map { "Turn off this \($0.what.lowercased()) link?" } ?? "",
                isPresented: Binding(get: { confirmLink != nil }, set: { if !$0 { confirmLink = nil } }),
                titleVisibility: .visible, presenting: confirmLink
            ) { link in
                Button("Turn Off Link", role: .destructive) { turnOff(link) }
            } message: { _ in
                Text("The customer won’t be able to open it. Sending it again makes a new link.")
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        // MARK: - Groups

        private func customer(_ details: JobDetails) -> some View {
            let name = details.customerName ?? "the customer"
            return Grouped(label: "Customer") {
                if let customerName = details.customerName, let id = details.customerId {
                    Button {
                        openRoute(.more(.customer(id)))
                    } label: {
                        ListRow(customerName, emphasized: true, chevron: true)
                    }
                    .buttonStyle(.row)
                } else if let customerName = details.customerName {
                    ListRow(customerName, emphasized: true)
                } else {
                    ListRow("No customer")
                }
                if let line = details.contactLine {
                    // Side by side; stacked at accessibility text sizes, where the number would
                    // break across lines beside the buttons.
                    let layout =
                        typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                        : AnyLayout(HStackLayout(spacing: 12))
                    layout {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line).textRole(.body).foregroundStyle(Color.text)
                            if let email = details.contactDetail {
                                Text(email).textRole(.secondary).foregroundStyle(Color.textMuted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        HStack(spacing: 8) {
                            if let phone = details.phone {
                                RoundIconButton(systemImage: "phone", label: "Call \(name), \(phone)") {
                                    open("tel:", phone)
                                }
                                RoundIconButton(systemImage: "message", label: "Text \(name)") {
                                    text(details, phone: phone)
                                }
                            }
                            if let email = details.email {
                                RoundIconButton(systemImage: "envelope", label: "Email \(name), \(email)") {
                                    if let url = URL(string: "mailto:\(email)") { openURL(url) }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .accessibilityElement(children: .contain)
                }
            }
        }

        /// Texts the customer from the company number when the shop has one working (their
        /// conversation, or New Message to them), else from the phone's own Messages app.
        private func text(_ details: JobDetails, phone: String) {
            guard let company = session.company,
                companyLine(sync.store, companyId: company.id)?.status == "active",
                let customerId = details.customerId
            else { return open("sms:", phone) }
            if let thread = conversations(sync.store, companyId: company.id).first(where: {
                $0.customerId == customerId
            }) {
                openRoute(.messages(.conversation(thread.id)))
            } else {
                openRoute(.messages(.newMessage(customerId: customerId)))
            }
        }

        /// The customer's conversation on the company number, when there is one or texting works.
        @ViewBuilder
        private func messages(_ details: JobDetails, company: CompanyContext, timeZone: String) -> some View {
            let texting = companyLine(sync.store, companyId: company.id)?.status == "active"
            let thread = details.customerId.flatMap { id in
                conversations(sync.store, companyId: company.id).first { $0.customerId == id }
            }
            if let name = details.customerName, thread != nil || texting {
                Grouped(label: "Messages") {
                    if let thread {
                        Button {
                            openRoute(.messages(.conversation(thread.id)))
                        } label: {
                            ListRow(
                                thread.name.isEmpty ? name : thread.name, detail: thread.lastPreview,
                                value: try? formatSchedule(thread.lastAt, Date(), timeZone), chevron: true)
                        }
                        .buttonStyle(.row)
                    }
                    if let phone = details.phone {
                        ActionRow("Text \(name)") { text(details, phone: phone) }
                    }
                }
            }
        }

        private func linksGroup(_ links: [CustomerLinkRow]) -> some View {
            Grouped(
                label: "Customer links",
                footer:
                    "Anyone with a link can open it, so turn one off if it went to the wrong person. Links stop working after 180 days; sending again makes a new one."
            ) {
                ForEach(links) { link in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.what).textRole(.body).foregroundStyle(Color.text)
                            Text(link.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        let busy = turningOff.contains(link.id)
                        Button(busy ? "Turning Off…" : "Turn Off") { confirmLink = link }
                            .font(.role(.body))
                            .foregroundStyle(Color.fail)
                            .padding(.horizontal, 12)
                            .frame(minHeight: minTarget)
                            .contentShape(Capsule())
                            .buttonStyle(.plain)
                            .disabled(busy)
                            .accessibilityLabel("Turn Off \(link.what) Link")
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                }
                if let linkError {
                    Text(linkError)
                        .textRole(.footnote)
                        .foregroundStyle(Color.fail)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, 8)
                }
            }
        }

        private func pool(_ details: JobDetails) -> some View {
            Grouped(label: "Pool") {
                Button {
                    let place = MapPlace(address: job.address, location: propertyLocation(job.decodedProperty))
                    if let url = URL(string: nativeMapsUrl(place, "ios")) { openURL(url) }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(details.address ?? "").textRole(.body).foregroundStyle(Color.link)
                        if let detail = details.poolDetail {
                            Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .accessibilityHint("Opens directions")
                if let access = details.accessNotes {
                    StackedRow(caption: "Access", value: access)
                }
                if details.needsMapLocation {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 12) {
                            Text("Not on the map yet.")
                                .textRole(.secondary)
                                .foregroundStyle(Color.textMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button(locating ? "Finding You…" : "Mark Location Here") { markLocation() }
                                .buttonStyle(.secondary)
                                .disabled(locating)
                        }
                        if let result = locationResult {
                            Text(result.text).textRole(.secondary).foregroundStyle(result.ok ? Color.pass : Color.fail)
                        }
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                } else if let result = locationResult {
                    Text(result.text)
                        .textRole(.secondary)
                        .foregroundStyle(result.ok ? Color.pass : Color.fail)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, CGFloat(Spacing.rowVertical))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }

        /// On Site, as a grouped form: the fee, Leak location marked, job notes. Each saves as it
        /// changes through the sync layer; Save confirms and saves a field still being typed in.
        private var onSite: some View {
            VStack(alignment: .leading, spacing: 16) {
                Grouped(label: "On site", footer: "The detection fee is shown on the report.") {
                    HStack(spacing: 12) {
                        Text("Detection fee")
                            .textRole(.body)
                            .foregroundStyle(Color.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("$").textRole(.body).foregroundStyle(Color.textMuted).accessibilityHidden(true)
                        TextField("", text: $fee, prompt: Text("0.00").foregroundStyle(Color.placeholder))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                            .focused($focus, equals: .fee)
                            .onSubmit { focus = nil }
                            .fieldBox(focused: focus == .fee)
                            .frame(width: 112)
                            .accessibilityLabel("Detection fee, dollars")
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, 6)
                    SwitchRow(
                        "Leak location marked",
                        isOn: Binding(
                            get: { job.job["location_marked"]?.bool ?? false },
                            set: { save(["location_marked": .bool($0)]) }))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Job notes").textRole(.secondary).foregroundStyle(Color.textMuted)
                        TextField(
                            "", text: $notes,
                            prompt: Text("Anything the office should know").foregroundStyle(Color.placeholder),
                            axis: .vertical
                        )
                        .lineLimit(3...12)
                        .focused($focus, equals: .notes)
                        .fieldBox(focused: focus == .notes, minHeight: 96)
                        .accessibilityLabel("Job notes")
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.top, CGFloat(Spacing.rowVertical))
                    .padding(.bottom, 12)
                }
                Button("Save") {
                    focus = nil
                    saveFee()
                    saveNotes()
                    saves += 1
                }
                .buttonStyle(.secondary)
            }
        }

        // MARK: - Actions

        private func open(_ scheme: String, _ phone: String) {
            let digits = toE164(phone) ?? phone.filter { $0.isNumber || $0 == "+" }
            if let url = URL(string: scheme + digits) { openURL(url) }
        }

        private func load(fee loadFee: Bool = true, notes loadNotes: Bool = true) {
            if loadFee {
                fee = job.job["fee_cents"]?.number.map { formatDollars(Int($0)) } ?? ""
            }
            if loadNotes, loaded != job.id {
                notes = job.job["summary_notes"]?.string ?? ""
                loaded = job.id
            }
        }

        private func formatDollars(_ cents: Int) -> String {
            String(format: "%d.%02d", cents / 100, abs(cents % 100))
        }

        private func saveFee() {
            let text = fee.trimmingCharacters(in: .whitespaces)
            let cents: JSONValue = text.isEmpty ? .null : parseDollars(text).map { .number(Double($0)) } ?? .null
            if cents != (job.job["fee_cents"] ?? .null) { save(["fee_cents": cents]) }
        }

        private func saveNotes() {
            if (job.job["summary_notes"]?.string ?? "") != notes {
                save(["summary_notes": notes.isEmpty ? .null : .string(notes)])
            }
        }

        private func save(_ values: Row) {
            guard let company = session.company else { return }
            do {
                try sync.write("job", id: job.id, companyId: company.id, values)
            } catch {
                saveError = String(describing: error)
            }
        }

        /// Mark Location Here: the phone's GPS at the pool, saved on the property.
        private func markLocation() {
            guard let company = session.company, let row = job.property, let property = job.decodedProperty else {
                return
            }
            locating = true
            locationResult = nil
            Task {
                let place = await LocationLookup.shared.prepare()
                locating = false
                guard let place else {
                    locationResult = (
                        "Couldn’t find where you are. Turn on Location for Sundeck Pro, or try again outside.", false
                    )
                    return
                }
                do {
                    try sync.write(
                        "property", id: row.id, companyId: company.id,
                        poolLocationValues(property, latitude: place.latitude, longitude: place.longitude))
                    locationResult = ("Pool location saved.", true)
                } catch {
                    locationResult = (String(describing: error), false)
                }
            }
        }

        /// Turn Off: the server turns the link off now; the next sync brings the change back.
        private func turnOff(_ link: CustomerLinkRow) {
            turningOff.insert(link.id)
            linkError = nil
            Task {
                do {
                    try await app.client.rpc("turn_off_share_link", params: ["link_id": link.id]).execute()
                    turnedOff.insert(link.id)
                    await sync.syncNow()
                } catch {
                    linkError = "Couldn’t turn the link off. Try again."
                }
                turningOff.remove(link.id)
            }
        }
    }
#endif
