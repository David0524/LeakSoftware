#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page's Details section (spec 5.4), in the website's order and words: Customer,
    /// Messages, Customer links, Pool, Assigned to, From the Customer, On site, a visit's Quotes, then
    /// Cancel Job.
    /// Port of the "details" part of apps/web/src/app/(office)/jobs/[id]/page.tsx.
    struct JobDetailsSection: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @Environment(\.openRoute) private var openRoute
        @State private var fee = ""
        @State private var gallons = ""
        @State private var gallonsError: String?
        @State private var notes = ""
        @State private var loaded: String?
        @State private var confirmCancel = false
        @State private var saveError: String?
        @State private var saves = 0
        @State private var confirmLink: CustomerLinkRow?
        @State private var turningOff: Set<String> = []
        @State private var turnedOff: Set<String> = []
        @State private var linkError: String?
        /// The job's pool, open in Pool Details (owner, 2026-10-20: the address opens it to edit).
        @State private var editingPool = false
        /// The pool's access notes, open in their own sheet (owner, 2026-10-20).
        @State private var editingAccess = false
        @FocusState private var focus: Field?
        @Environment(\.dynamicTypeSize) private var typeSize

        enum Field { case fee, gallons, notes }

        /// A tech's name as a row's value, with their dot before it.
        private func techValue(_ name: String, _ color: TechColor?) -> some View {
            HStack(spacing: 8) {
                if let color { TechDot(color: color) }
                Text(name).textRole(.body).foregroundStyle(Color.textMuted)
            }
        }

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
                    // Each tech's color as a dot before their name (owner, 2026-10-20).
                    let colors = company.map { teamColors(sync.store, companyId: $0.id) } ?? [:]
                    ListRow("Tech") {
                        techValue(details.tech, colors[job.job["assigned_user_id"]?.string ?? ""])
                    }
                    if let with = details.with {
                        ListRow("With") { techValue(with, colors[job.job["second_tech_id"]?.string ?? ""]) }
                    }
                    if details.showsFee, let fee = details.fee { ListRow(details.feeLabel, value: fee) }
                }
                // A repair job's repairs and its price (owner, 2026-10-22).
                if details.showsRepairs { JobRepairsGroup(job: job) }
                if !details.intake.isEmpty {
                    Grouped(label: details.intakeTitle) {
                        ForEach(Array(details.intake.enumerated()), id: \.offset) { _, answer in
                            StackedRow(caption: answer.question, value: answer.answer)
                        }
                    }
                }
                onSite(details)
                if JobScheduleGroup.shows(job) { JobScheduleGroup(job: job) }
                if isManagerRole(company?.role) { JobTimeline(jobId: job.id) }
                // A visit has no Wrap-Up: its quotes are here, before Cancel Job (owner, 2026-10-19).
                // A visit's report (owner, 2026-10-20), above its quotes; hidden when the shop turned it off.
                // Once the visit is done its report is on the Next Step bar (owner, 2026-10-22);
                // until then it stays here, so it can still be sent early.
                if job.type == .maintenance, job.status != .done {
                    VisitReportSection(job: job).padding(.top, 8)
                }
                if !jobHasWrapUp(job.type.rawValue) { QuoteSection(job: job).padding(.top, 8) }
                if jobCanCancel(job.status, type: job.type) {
                    Button("Cancel Job", role: .destructive) { confirmCancel = true }
                        .buttonStyle(.danger)
                        .padding(.top, 8)
                }
            }
            .task(id: job.id) {
                load()
                loadGallons()
            }
            .onChange(of: job.job["fee_cents"]) { _, _ in if focus != .fee { load(fee: true, notes: false) } }
            .onChange(of: job.property?["approx_gallons"]) { _, _ in if focus != .gallons { loadGallons() } }
            .onChange(of: focus) { old, _ in
                if old == .fee { saveFee() }
                if old == .gallons { saveGallons() }
                if old == .notes { saveNotes() }
            }
            .onDisappear {
                saveFee()
                saveGallons()
                saveNotes()
            }
            .sensoryFeedback(.success, trigger: saves)
            .sheet(isPresented: $editingPool) {
                // The customer page's Pool Details: address suggestions, saved through sync, and
                // the map lookup after an address change.
                if let property = job.property {
                    PoolSheet(propertyId: property.id, row: property) { saves += 1 }
                }
            }
            .sheet(isPresented: $editingAccess) {
                if let property = job.property {
                    AccessNotesSheet(propertyId: property.id, notes: property["access_notes"]?.string ?? "") {
                        saves += 1
                    }
                }
            }
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
            let missing =
                propertyMapStatus(job.property, routing: MapLookups.on(sync, companyId: session.company?.id))
                == .missing
            return Grouped(label: "Pool") {
                // The address opens the pool's details to edit; the pin opens Maps (owner,
                // 2026-10-20; the website's Pool group).
                HStack(spacing: 0) {
                    Button {
                        editingPool = true
                    } label: {
                        ListRow(
                            title: details.address ?? "", detail: details.poolDetail, emphasized: true,
                            titleMark: missing ? NotOnMapTag.text() : nil
                        ) { EmptyView() }
                    }
                    .buttonStyle(.row)
                    .disabled(job.property == nil)
                    .accessibilityHint("Opens Pool Details")
                    RoundIconButton(systemImage: "mappin", label: "Open in Maps") {
                        let place = MapPlace(address: job.address, location: propertyLocation(job.decodedProperty))
                        if let url = URL(string: nativeMapsUrl(place, "ios")) { openURL(url) }
                    }
                    .help("Open in Maps")
                    .padding(.trailing, CGFloat(Spacing.rowHorizontal))
                }
                if missing {
                    NotOnMapRow()
                }
                // Right under the address, editable here (owner, 2026-10-20: "You should be able
                // to edit access notes on the job screen underneath the address").
                if job.property != nil {
                    Button {
                        editingAccess = true
                    } label: {
                        AccessNotesRow(notes: details.accessNotes)
                    }
                    .buttonStyle(.row)
                    .accessibilityHint("Opens Access Notes")
                }
            }
        }

        /// On Site, as a grouped form: the price, Leak location marked (leak detection only), job
        /// notes. Each saves as it changes through the sync layer; Save confirms and saves a field
        /// still being typed in. Fee and notes never write location_marked.
        private func onSite(_ details: JobDetails) -> some View {
            VStack(alignment: .leading, spacing: 16) {
                Grouped(label: "On site", footer: details.showsFee ? details.feeFooter : nil) {
                    // A repair job's price is its repairs' (Repairs, owner 2026-10-22).
                    if details.showsFee {
                        HStack(spacing: 12) {
                            Text(details.feeLabel)
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
                                .accessibilityLabel("\(details.feeLabel), dollars")
                        }
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, 6)
                    }
                    if details.poolId != nil {
                        // The pool's gallons (owner, 2026-10-19), saved on the pool; blank clears.
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 12) {
                                Text("Pool gallons")
                                    .textRole(.body)
                                    .foregroundStyle(Color.text)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                TextField(
                                    "", text: $gallons, prompt: Text("20,000").foregroundStyle(Color.placeholder)
                                )
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .monospacedDigit()
                                .focused($focus, equals: .gallons)
                                .fieldBox(error: gallonsError != nil, focused: focus == .gallons)
                                .frame(width: 112)
                                .accessibilityLabel("Pool gallons")
                                .onChange(of: gallons) { _, typed in
                                    let shown = gallonsInput(typed)
                                    if shown != typed { gallons = shown }
                                }
                            }
                            if let gallonsError {
                                Text(gallonsError).textRole(.secondary).foregroundStyle(Color.fail)
                            }
                        }
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, 6)
                    }
                    if details.marksLeakLocation {
                        SwitchRow(
                            "Leak location marked",
                            isOn: Binding(
                                get: { job.job["location_marked"]?.bool ?? false },
                                set: { save(["location_marked": .bool($0)]) }))
                    }
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
                    saveGallons()
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
            // A repair job's price is its repairs' (owner, 2026-10-22): never written from here.
            guard job.type != .repair else { return }
            let text = fee.trimmingCharacters(in: .whitespaces)
            let cents: JSONValue = text.isEmpty ? .null : parseDollars(text).map { .number(Double($0)) } ?? .null
            if cents != (job.job["fee_cents"] ?? .null) { save(["fee_cents": cents]) }
        }

        private func loadGallons() {
            gallons = job.property?["approx_gallons"]?.number.map { gallonsInput(String(Int($0))) } ?? ""
            gallonsError = nil
        }

        /// Pool gallons: saved on the pool through the sync layer when it changed.
        private func saveGallons() {
            guard let company = session.company, let pool = job.property else { return }
            guard let value = poolGallonsValue(gallons) else {
                gallonsError = "Enter the gallons as a number, like 20,000."
                return
            }
            gallonsError = nil
            if value != (pool["approx_gallons"] ?? .null) {
                do {
                    try sync.write("property", id: pool.id, companyId: company.id, ["approx_gallons": value])
                } catch {
                    saveError = userMessage(error)
                }
            }
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
                saveError = userMessage(error)
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

    /// The Pool group's Access Notes row: the notes under a caption, or "Add Access Notes" in
    /// `link` when there are none, with a chevron since it opens a sheet.
    struct AccessNotesRow: View {
        var notes: String?

        var body: some View {
            HStack(spacing: CGFloat(Spacing.rowItems)) {
                if let notes {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Access Notes").textRole(.secondary).foregroundStyle(Color.textMuted)
                        Text(notes).textRole(.body).foregroundStyle(Color.text).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text("Add Access Notes")
                        .textRole(.body)
                        .foregroundStyle(Color.link)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// Access Notes, as a sheet from the job page: one growing field, Cancel and Save in the
    /// navigation bar, saved on the pool (property.access_notes) through the sync layer; blank
    /// clears them. Today's card and the Lock Screen pick them up from the same row.
    struct AccessNotesSheet: View {
        var propertyId: String
        var notes: String
        var saved: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var text = ""
        @State private var loaded = false
        @State private var error: String?
        @State private var confirm = false
        /// The typed notes, kept until saved or discarded (owner, 2026-10-27).
        @State private var draft = DraftHandle()
        @FocusState private var focused: Bool

        private var dirty: Bool { loaded && text != notes }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        DraftNote(draft: draft)
                        Grouped {
                            TextField(
                                "Access Notes", text: $text,
                                prompt: Text("Gate code, dog, where to park.").foregroundStyle(Color.placeholder),
                                axis: .vertical
                            )
                            .lineLimit(3...10)
                            .textRole(.body)
                            .foregroundStyle(Color.text)
                            .focused($focused)
                            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                            .padding(.vertical, CGFloat(Spacing.rowVertical))
                            .frame(minHeight: minTarget)
                            .accessibilityLabel("Access Notes")
                        }
                        if let error { Notice(kind: .error, text: error) }
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(Color.bg)
                .navigationTitle("Access Notes")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { if dirty { confirm = true } else { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { save() }.disabled(!dirty)
                    }
                }
                .confirmationDialog("Discard changes?", isPresented: $confirm, titleVisibility: .visible) {
                    Button("Discard Changes", role: .destructive) {
                        draft.clear()
                        dismiss()
                    }
                }
            }
            .sheetPresentation(dirty: dirty, detents: [.medium, .large])
            .onAppear {
                guard !loaded else { return }
                text = notes
                loaded = true
                focused = true
            }
            .keepsDraft(draft, form: "access-notes", id: propertyId, fields: ["text": text], ready: loaded) {
                changes in
                if let value = changes["text"] { text = value }
            }
        }

        private func save() {
            guard let companyId = session.company?.id else { return }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            do {
                try sync.write(
                    "property", id: propertyId, companyId: companyId,
                    ["access_notes": trimmed.isEmpty ? .null : .string(trimmed)])
                draft.clear()
                saved()
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }
    }
#endif
