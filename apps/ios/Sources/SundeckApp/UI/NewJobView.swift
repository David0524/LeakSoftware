#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The pushed New Job (spec 5.5, decision 3), made for the signed-in person's company.
    struct NewJobRoute: View {
        var back: String
        @Environment(Session.self) private var session
        @Environment(\.replaceRoute) private var replaceRoute
        @State private var form: NewJobForm?

        var body: some View {
            // A ZStack with a clear layer, not a Group: an empty Group never appears, so its
            // onAppear never ran and New Job opened blank (owner, 2026-10-19: "The plus
            // button does not work on iOS app").
            ZStack {
                Color.clear
                if let form {
                    NewJobView(
                        form: form, back: back, onCreated: { replaceRoute(.job($0)) },
                        onPlanStarted: { replaceRoute(.more(.customer($0))) })
                } else {
                    ProgressView()
                }
            }
            .onAppear {
                if form == nil, let company = session.company, let user = session.user {
                    form = NewJobForm(sync: session.sync, company: company, userId: user.id)
                }
            }
        }
    }

    /// New Job as the website's form (apps/web/src/components/new-job-form.tsx): Customer, Pool,
    /// Visit, and From the Customer (or Notes) as cards of outlined fields, then Create Job. Saves
    /// everything in one transaction, offline. Leaving with entries asks first. Owners and admins
    /// of pool shops can instead start a plan that repeats (Start Plan), which needs a
    /// connection: the server makes its visits, then the customer's page opens.
    struct NewJobView: View {
        @Bindable var form: NewJobForm
        var back = "Jobs"
        var onCreated: (String) -> Void
        /// After Start Plan, with the customer's id.
        var onPlanStarted: (String) -> Void = { _ in }

        @Environment(\.dismiss) private var dismiss
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var saveProblem: String?
        @State private var saved = 0
        @State private var suggestions: (list: [Suggestion], note: String?)?
        @State private var starting = false
        @State private var planProblem: String?
        /// Address suggestions under the street field (owner, 2026-10-20).
        @State private var suggester = AddressSuggester()
        @State private var streetFocused = false

        private var offline: Bool { sync.status.phase == .offline }

        var body: some View {
            ScreenScroll(spacing: 16) {
                PageHeader(subtitle: form.subtitle)
                if form.canMakeJobs {
                    customerCard
                    if form.newPool { poolCard }
                    visitCard
                    calledCard
                    if !form.errors.isEmpty || !form.planErrors.isEmpty || form.feeError != nil {
                        Notice(kind: .error, text: "Fix the highlighted fields.")
                    }
                    if form.isPlan {
                        if let planProblem {
                            Notice(kind: .error, text: planProblem)
                        } else if offline {
                            Notice(kind: .warning, text: NewJobForm.offlinePlanNotice)
                        }
                        Button(action: startPlan) {
                            BusyButtonLabel(form.saveTitle, busy: starting, busyTitle: "Starting…")
                        }
                        .buttonStyle(.primary)
                        .disabled(starting || offline)
                    } else {
                        Button(form.saveTitle, action: save).buttonStyle(.primary)
                    }
                } else {
                    // Owners can stop techs making jobs (owner setting, 2026-10-18).
                    Notice(kind: .info, text: NewJobForm.notAllowedMessage)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: form.jobType) { form.jobTypeChanged() }
            .navigationTitle("New Job")
            // Explicit: the tab roots it's pushed from have an inline bar (RootTitle.swift).
            .navigationBarTitleDisplayMode(.large)
            // Back with something typed asks "Discard changes?" (owner, 2026-10-20: everywhere).
            .discardOnBack(dirty: form.isDirty && saved == 0, back: back)
            .sensoryFeedback(.success, trigger: saved)
            .alert(
                "Couldn’t Save the Job",
                isPresented: Binding(get: { saveProblem != nil }, set: { if !$0 { saveProblem = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveProblem ?? "")
            }
            .sheet(
                isPresented: Binding(get: { suggestions != nil }, set: { if !$0 { suggestions = nil } })
            ) {
                suggestionsSheet
            }
        }

        // MARK: - Cards

        private var customerCard: some View {
            FormCard("Customer") {
                if !form.customers.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Who is it for?")
                        Segmented(
                            selection: $form.mode, options: NewJobForm.Mode.allCases, label: \.label,
                            title: "Who is it for?")
                    }
                }
                if form.mode == .existing {
                    VStack(alignment: .leading, spacing: 4) {
                        SelectField(
                            label: "Customer",
                            selection: Binding(get: { form.customerId }, set: { form.selectCustomer($0) }),
                            options: [nil] + form.customers.map { Optional($0.id) },
                            optionLabel: { id in
                                id.flatMap { id in form.customers.first { $0.id == id } }.map(form.customerLabel)
                                    ?? "Choose…"
                            })
                        if let error = form.errors["customer"] { FieldHint(text: error, error: true) }
                    }
                    if form.selectedCustomer != nil {
                        SelectField(
                            label: "Pool", selection: $form.propertyId,
                            options: form.customerProperties.map { Optional($0.id) } + [nil],
                            optionLabel: { id in
                                id.flatMap { id in form.properties.first { $0.id == id } }.map { addressText($0) }
                                    ?? "Another address…"
                            })
                    }
                } else {
                    OutlinedField(label: "Name", text: $form.input.customerName, error: form.errors["customerName"])
                        .textContentType(.name)
                    OutlinedField(label: "Phone", text: $form.input.customerPhone, keyboard: .phonePad)
                        .textContentType(.telephoneNumber)
                    OutlinedField(
                        label: "Email", text: $form.input.customerEmail, error: form.errors["customerEmail"],
                        keyboard: .emailAddress
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    OutlinedField(
                        label: "Other emails (optional)", text: $form.otherEmails,
                        hint: "They get reports too. Separate with spaces.", keyboard: .emailAddress
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                }
            }
        }

        private var poolCard: some View {
            FormCard("Pool") {
                OutlinedField(
                    label: "Street address", text: $form.input.addressLine1, error: form.errors["addressLine1"],
                    onFocusChange: { streetFocused = $0 }
                )
                .textContentType(.streetAddressLine1)
                .addressLookup(suggester, text: form.input.addressLine1, focused: streetFocused)
                // Address suggestions as you type (owner, 2026-10-20), under the field.
                if !suggester.items.isEmpty {
                    Grouped {
                        AddressSuggestionRows(suggester: suggester) { s in
                            form.input.addressLine1 = s.line1
                            form.input.city = s.city
                            form.input.state = s.state
                            form.input.postalCode = s.postalCode
                        }
                    }
                }
                OutlinedField(label: "City", text: $form.input.city).textContentType(.addressCity)
                HStack(alignment: .top, spacing: 16) {
                    OutlinedField(label: "State", text: $form.input.state)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .onChange(of: form.input.state) { _, v in
                            if v.count > 2 { form.input.state = String(v.prefix(2)) }
                        }
                    OutlinedField(label: "ZIP", text: $form.input.postalCode, keyboard: .numberPad)
                        .textContentType(.postalCode)
                }
                SelectField(
                    label: "Pool type", selection: $form.poolType,
                    options: [nil] + PoolType.allCases.map { Optional($0) },
                    optionLabel: { $0?.label ?? "Not sure" })
                SwitchRow("Has a spa", isOn: $form.hasSpa).padding(.horizontal, -16)
                if form.gallonsInPool { gallonsField }
                if !form.isMaintenance {
                    ShapePicker(
                        value: form.shape, label: "Pool shape (optional)",
                        hint: "Leave it blank if you don’t know yet; it can be set on the job’s Findings."
                    ) { form.shape = $0 }
                }
                OutlinedField(
                    label: "Access notes (optional)", text: $form.accessNotes, hint: "Gate code, dog, where to park.",
                    multiline: true)
            }
        }

        private var visitCard: some View {
            FormCard("Visit") {
                if form.jobTypes.count > 1 {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Job")
                        Segmented(
                            selection: $form.jobType, options: form.jobTypes.map(\.value),
                            label: { t in form.jobTypes.first { $0.value == t }?.label ?? "" }, title: "Job",
                            // Service, Repair, Leak, Inspection fit across a phone in equal
                            // segments (owner, 2026-10-20: "Repair is cut off").
                            fillsWidth: true, segmentPadding: 8)
                    }
                }
                if form.showsRepeat {
                    PlanRepeatPicker(
                        choice: $form.repeatChoice, days: $form.plan.days, once: true,
                        error: form.planErrors["weekdays"])
                }
                if form.isPlan {
                    planFields
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("When")
                        Segmented(
                            selection: $form.when, options: NewJobForm.When.allCases, label: \.label, title: "When")
                    }
                }
                if form.when == .scheduled && !form.isPlan {
                    if let property = form.selectedProperty, form.mode == .existing {
                        VStack(alignment: .leading, spacing: 4) {
                            Button("Suggest Times") { suggest(property) }
                                .buttonStyle(.quiet)
                                .padding(.leading, -20)
                            if let picked = form.picked {
                                Text("Filled in: \(picked)").textRole(.secondary).foregroundStyle(Color.pass)
                            }
                        }
                    }
                    scheduleRow
                }
                VStack(alignment: .leading, spacing: 4) {
                    SelectField(
                        label: "Tech", selection: $form.techId, options: form.techChoices, optionLabel: form.name)
                    if let error = form.errors["tech"] { FieldHint(text: error, error: true) }
                }
                if form.showsSecondTech {
                    VStack(alignment: .leading, spacing: 4) {
                        SelectField(
                            label: "Second tech (optional)", selection: $form.secondTech,
                            options: [nil] + form.team.map { Optional($0.id) },
                            optionLabel: { $0 == nil ? "None" : form.name($0) })
                        if let error = form.errors["secondTech"] { FieldHint(text: error, error: true) }
                    }
                }
                if form.isLeak && !form.feeItems.isEmpty {
                    SelectField(
                        label: "Detection price",
                        selection: Binding(
                            get: { form.feeItems.first { dollars($0.cents) == form.fee } },
                            set: { if let item = $0 { form.pickFee(item) } }),
                        options: [nil] + form.feeItems.map { Optional($0) },
                        optionLabel: { $0?.label ?? "Pick from the price book…" })
                }
                OutlinedField(
                    label: form.feeLabel, text: $form.fee, hint: form.feeHint, error: form.feeError,
                    keyboard: .decimalPad)
            }
        }

        /// A plan's First visit and Time, then Visit length and Last visit, two to a row as on the
        /// website.
        private var planFields: some View {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    PlanDateField(
                        label: "First visit", value: $form.plan.startsOn, timeZone: form.company.timeZone,
                        start: form.today, hint: form.firstVisitHintText, error: form.planErrors["startsOn"]
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                    PlanDateField(
                        label: "Time (optional)", value: $form.plan.time, kind: .time,
                        timeZone: form.company.timeZone, start: "09:00", optional: true, placeholder: "Any time",
                        clearLabel: "Any Time", hint: "Blank: route planning picks it.", error: form.planErrors["time"]
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(alignment: .top, spacing: 16) {
                    OutlinedField(
                        label: "Visit length (minutes)", text: $form.plan.minutes, error: form.planErrors["minutes"],
                        keyboard: .numberPad
                    )
                    .frame(maxWidth: .infinity)
                    PlanDateField(
                        label: "Last visit (optional)", value: $form.plan.endsOn, timeZone: form.company.timeZone,
                        start: form.plan.startsOn.isEmpty ? form.today : form.plan.startsOn, optional: true,
                        placeholder: "No end date", clearLabel: "No End Date", error: form.planErrors["endsOn"]
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }

        /// Date, Start and Hours on one row.
        private var scheduleRow: some View {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Date")
                    DatePicker("Date", selection: dateBinding, displayedComponents: .date)
                        .labelsHidden()
                        .environment(\.timeZone, zone)
                        .tint(Color.link)
                    if let error = form.errors["scheduleDate"] { FieldHint(text: error, error: true) }
                }
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Start")
                    DatePicker("Start", selection: timeBinding, displayedComponents: .hourAndMinute)
                        .labelsHidden()
                        .environment(\.timeZone, zone)
                        .tint(Color.link)
                    if let error = form.errors["scheduleTime"] { FieldHint(text: error, error: true) }
                }
                OutlinedField(
                    label: "Hours", text: $form.hours, error: form.errors["hours"], keyboard: .decimalPad, numeric: true
                )
                .frame(minWidth: 64)
            }
        }

        @ViewBuilder private var calledCard: some View {
            if form.showsRepairCall {
                // From the Customer on a repair (owner, 2026-10-19): what they need fills the Price.
                FormCard(NewJobForm.fromCustomerTitle) {
                    if !form.repairItems.isEmpty {
                        SelectField(
                            label: "What do they need?",
                            selection: Binding(get: { form.repairItem }, set: { form.pickRepairItem($0) }),
                            options: [nil] + form.repairItems.map { Optional($0) },
                            optionLabel: { $0?.label ?? "Pick from the price book…" })
                    }
                    OutlinedField(
                        label: "What they said (optional)", text: $form.notes, hint: "Shown to the tech with the job.",
                        multiline: true)
                }
            } else if form.showsBooking {
                FormCard(NewJobForm.fromCustomerTitle) {
                    gallonsField
                    ForEach(form.questions) { question in
                        switch question.kind {
                        case .multi:
                            // Tap all that apply, as pills (Pool Inspection's features, 2026-10-20).
                            VStack(alignment: .leading, spacing: 8) {
                                FieldLabel(question.label)
                                FlowRow(spacing: 8) {
                                    ForEach(question.options, id: \.self) { option in
                                        let on = form.isPicked(question.key, option)
                                        ChoicePill(title: option, isOn: on) {
                                            form.setPicked(question.key, option, !on)
                                        }
                                    }
                                }
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel(question.label)
                            }
                        case .single:
                            SelectField(
                                label: question.label,
                                selection: Binding(
                                    get: { form.answer(question.key) }, set: { form.setAnswer(question.key, $0) }),
                                options: [""] + question.options, optionLabel: { $0.isEmpty ? "Not asked" : $0 })
                        case .text:
                            OutlinedField(
                                label: question.label,
                                text: Binding(
                                    get: { form.answer(question.key) }, set: { form.setAnswer(question.key, $0) }))
                        }
                    }
                    OutlinedField(label: "Notes for the tech (optional)", text: $form.notes, multiline: true)
                }
            } else {
                FormCard("Notes") {
                    OutlinedField(label: "Notes for the tech (optional)", text: $form.notes, multiline: true)
                }
            }
        }

        /// Gallons (optional), saved on the pool (owner, 2026-10-19: it replaced "Size of the pool").
        private var gallonsField: some View {
            OutlinedField(
                label: NewJobForm.gallonsLabel,
                text: Binding(get: { form.gallons }, set: { form.gallons = $0 }),
                placeholder: "20,000", hint: NewJobForm.gallonsHint, error: form.gallonsError, keyboard: .numberPad)
        }

        private var suggestionsSheet: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if let note = suggestions?.note {
                            Text(note).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        if let list = suggestions?.list, !list.isEmpty {
                            SuggestionList(suggestions: list) { s in
                                form.use(s)
                                suggestions = nil
                            }
                        }
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("Suggested Times")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { suggestions = nil } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
        }

        // MARK: - Actions

        /// Start Plan: the server starts it, then a sync brings the customer, pool, plan and visits
        /// here before the customer's page opens.
        private func startPlan() {
            planProblem = nil
            starting = true
            Task {
                defer { starting = false }
                do {
                    let customer = try await form.startPlan(LenientRPC(client: app.client))
                    await sync.syncNow()
                    // The new pool's gallons, now that its row is here.
                    form.savePlanGallons()
                    saved += 1
                    onPlanStarted(customer)
                } catch NewJobFormError.invalid {
                    // The fields show what to fix.
                } catch {
                    planProblem = String(describing: error)
                }
            }
        }

        private func save() {
            do {
                let id = try form.save()
                saved += 1
                onCreated(id)
            } catch NewJobFormError.invalid {
                // The fields show what to fix.
            } catch {
                saveProblem = String(describing: error)
            }
        }

        /// Suggest Times for the chosen pool, from the routes on this phone.
        private func suggest(_ property: Row) {
            let ctx = scheduleContext(sync.store, company: form.company, userId: form.userId)
            let location: LatLng? = {
                guard let lat = property["latitude"]?.number, let lng = property["longitude"]?.number else {
                    return nil
                }
                return LatLng(lat: lat, lng: lng)
            }()
            let minutes = Double(form.hours).map { Int(($0 * 60).rounded()) } ?? ctx.settings.jobMinutes
            let team = teamMembers(sync.store, kv: sync.kv, companyId: form.company.id, userId: form.userId)
            do {
                let found = try suggestTimes(
                    location: location, durationMin: minutes, excluding: nil,
                    jobs: scheduleJobs(sync.store, companyId: form.company.id), ctx: ctx, team: team,
                    drive: DriveTimes())
                suggestions = (found.suggestions, found.note)
            } catch {
                suggestions = ([], String(describing: error))
            }
        }

        // MARK: - Dates (stored as YYYY-MM-DD and HH:MM in the shop's time zone)

        private func dollars(_ cents: Cents) -> String { String(format: "%d.%02d", cents / 100, cents % 100) }

        private var zone: TimeZone { TimeZone(identifier: form.company.timeZone) ?? .current }

        private var dateBinding: Binding<Date> {
            Binding(
                get: { zonedInstant(form.input.scheduleDate, 12 * 60, timeZone: form.company.timeZone) ?? Date() },
                set: { form.input.scheduleDate = localDay($0, timeZone: form.company.timeZone) })
        }

        private var timeBinding: Binding<Date> {
            Binding(
                get: {
                    zonedInstant(
                        form.input.scheduleDate.isEmpty ? form.today : form.input.scheduleDate,
                        clockToMinutes(form.input.scheduleTime.isEmpty ? "09:00" : form.input.scheduleTime),
                        timeZone: form.company.timeZone) ?? Date()
                },
                set: { form.input.scheduleTime = minutesToClock(localMinutes($0, timeZone: form.company.timeZone)) })
        }
    }

    /// A section label over a card of outlined fields 16 apart (the website's form sections).
    struct FormCard<Content: View>: View {
        var title: String
        @ViewBuilder var content: Content

        init(_ title: String, @ViewBuilder content: () -> Content) {
            self.title = title
            self.content = content()
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(title)
                VStack(alignment: .leading, spacing: 16) { content }.card()
            }
        }
    }
#endif
