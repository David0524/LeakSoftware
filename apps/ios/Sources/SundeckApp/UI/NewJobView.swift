#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// New Job: a sheet with the customer, booking questions, pool address, and when. Port of
    /// apps/mobile/src/app/(app)/jobs/new.tsx. The form saves everything in one transaction, offline.
    struct NewJobView: View {
        @Bindable var form: NewJobForm
        var onCreated: (String) -> Void

        @Environment(\.dismiss) private var dismiss
        @State private var confirmingDiscard = false
        @State private var saveProblem: String?
        @State private var saved = 0

        var body: some View {
            NavigationStack {
                Group {
                    if form.canMakeJobs {
                        fields
                    } else {
                        // Owners can stop techs making jobs (owner setting, 2026-10-18).
                        ScrollView {
                            Notice(kind: .info, text: NewJobForm.notAllowedMessage).padding(16)
                        }
                    }
                }
                .navigationTitle("New Job")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", action: cancel)
                            .confirmationDialog(
                                "Discard this job?", isPresented: $confirmingDiscard, titleVisibility: .visible
                            ) {
                                Button("Discard", role: .destructive) { dismiss() }
                                Button("Keep Editing", role: .cancel) {}
                            }
                    }
                }
            }
            // Anything typed? Then a swipe down doesn't close it by accident.
            .interactiveDismissDisabled(form.isDirty)
            .sensoryFeedback(.success, trigger: saved)
            .alert(
                "Couldn't Save the Job",
                isPresented: Binding(get: { saveProblem != nil }, set: { if !$0 { saveProblem = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveProblem ?? "")
            }
        }

        // MARK: - The form

        private var fields: some View {
            Form {
                if form.jobTypes.count > 1 {
                    Section {
                        Picker("Job", selection: $form.jobType) {
                            ForEach(form.jobTypes, id: \.value) { Text($0.label).tag($0.value) }
                        }
                        .pickerStyle(.segmented)
                        .frame(minHeight: minTarget)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                    }
                }
                customerSections
                if form.showsBooking { bookingSection }
                addressSection
                whenSection
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { saveBar }
        }

        @ViewBuilder private var customerSections: some View {
            if let customer = form.selectedCustomer {
                Section("Customer") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(customer["name"]?.string ?? "Customer").font(.body.weight(.semibold))
                        if let phone = customer["phone"]?.string, !phone.isEmpty {
                            Text(phone).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .frame(minHeight: minTarget, alignment: .leading)
                    Button("Change Customer") { form.changeCustomer() }
                        .frame(minHeight: minTarget)
                }
            } else {
                if !form.customers.isEmpty {
                    Section("Customer") {
                        LabeledField("Find an existing customer") {
                            TextField("Name, phone, or email", text: $form.search)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        ForEach(form.matches, id: \.id) { customer in
                            Button {
                                form.selectCustomer(customer.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(customer["name"]?.string ?? "Customer")
                                        .font(.body.weight(.semibold)).foregroundStyle(.primary)
                                    Text(contactLine(customer)).font(.subheadline).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .accessibilityHint("Picks this customer")
                        }
                    }
                }
                Section {
                    LabeledField("Name", error: form.errors["customerName"]) {
                        TextField("Name", text: $form.input.customerName)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)
                    }
                    LabeledField("Phone") {
                        TextField("Phone", text: $form.input.customerPhone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                    }
                    LabeledField("Email", error: form.errors["customerEmail"]) {
                        emailField("Email", text: $form.input.customerEmail)
                    }
                    LabeledField("Other emails (optional)") {
                        emailField("Other emails", text: $form.otherEmails)
                    }
                } header: {
                    Text(form.customers.isEmpty ? "Customer" : "Or add a new customer")
                } footer: {
                    Text("Other emails get the report too. Separate them with spaces.")
                }
            }
        }

        private var bookingSection: some View {
            Section {
                ForEach(form.questions) { question in
                    switch question.kind {
                    case .multi:
                        VStack(alignment: .leading, spacing: 0) {
                            Text(question.label).font(.subheadline).foregroundStyle(.secondary)
                                .padding(.top, 8)
                            ForEach(question.options, id: \.self) { option in
                                Toggle(
                                    option,
                                    isOn: Binding(
                                        get: { form.isPicked(question.key, option) },
                                        set: { form.setPicked(question.key, option, $0) })
                                )
                                .frame(minHeight: minTarget)
                            }
                        }
                    case .single:
                        Picker(
                            question.label,
                            selection: Binding(
                                get: { form.answer(question.key) }, set: { form.setAnswer(question.key, $0) })
                        ) {
                            Text("Choose").tag("")
                            ForEach(question.options, id: \.self) { Text($0).tag($0) }
                        }
                        .frame(minHeight: minTarget)
                    case .text:
                        LabeledField(question.label) {
                            TextField(
                                question.label,
                                text: Binding(
                                    get: { form.answer(question.key) }, set: { form.setAnswer(question.key, $0) }))
                        }
                    }
                }
                LabeledField("Detection fee ($)", error: form.feeError) {
                    TextField("0.00", text: Binding(get: { form.feeText }, set: { form.fee = $0 }))
                        .keyboardType(.decimalPad)
                }
            } header: {
                Text("Booking")
            } footer: {
                Text("The detection fee is shown on the report.")
            }
        }

        private var addressSection: some View {
            Section {
                if !form.customerProperties.isEmpty {
                    Picker("Address", selection: $form.propertyId) {
                        ForEach(form.customerProperties, id: \.id) { property in
                            Text(property["address_line1"]?.string ?? "Address").tag(Optional(property.id))
                        }
                        Text("New address").tag(String?.none)
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                if let property = form.selectedProperty {
                    Text(addressText(property))
                        .font(.subheadline)
                        .frame(minHeight: minTarget, alignment: .leading)
                } else {
                    newAddressFields
                }
            } header: {
                Text("Pool address")
            } footer: {
                if form.selectedProperty == nil && form.isLeak {
                    Text("Leave the pool shape blank if you don’t know yet; set it later on Findings.")
                }
            }
        }

        @ViewBuilder private var newAddressFields: some View {
            LabeledField("Street address", error: form.errors["addressLine1"]) {
                TextField("Street address", text: $form.input.addressLine1)
                    .textContentType(.streetAddressLine1)
                    .textInputAutocapitalization(.words)
            }
            HStack(alignment: .top, spacing: 12) {
                LabeledField("City") {
                    TextField("City", text: $form.input.city)
                        .textContentType(.addressCity)
                        .textInputAutocapitalization(.words)
                }
                .frame(maxWidth: .infinity)
                Divider()
                LabeledField("State") {
                    TextField("AZ", text: $form.input.state)
                        .textContentType(.addressState)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .onChange(of: form.input.state) { _, value in
                            if value.count > 2 { form.input.state = String(value.prefix(2)) }
                        }
                }
                .frame(width: 72)
            }
            LabeledField("ZIP") {
                TextField("ZIP", text: $form.input.postalCode)
                    .keyboardType(.numberPad)
                    .textContentType(.postalCode)
                    .onChange(of: form.input.postalCode) { _, value in
                        if value.count > 10 { form.input.postalCode = String(value.prefix(10)) }
                    }
            }
            Picker("Pool type", selection: $form.poolType) {
                ForEach(PoolType.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .frame(minHeight: minTarget)
            Toggle("Has a spa", isOn: $form.hasSpa)
                .frame(minHeight: minTarget)
            if form.isLeak {
                Picker("Pool shape (optional)", selection: $form.shape) {
                    Text("Not set").tag(DiagramShape?.none)
                    ForEach(DiagramShape.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
                }
                .frame(minHeight: minTarget)
            }
            LabeledField("Access notes") {
                TextField("Gate code, dogs, where to park", text: $form.accessNotes, axis: .vertical)
                    .lineLimit(2...5)
            }
        }

        private var whenSection: some View {
            Section("When") {
                Picker("When", selection: $form.when) {
                    ForEach(NewJobForm.When.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(minHeight: minTarget)
                if form.when == .scheduled { scheduleFields }
                // When techs see only their own jobs, a tech's new job is always theirs.
                if form.seesAll {
                    Toggle("Assign to me", isOn: $form.assignToMe)
                        .frame(minHeight: minTarget)
                }
                if form.showsSecondTech {
                    Picker("Second tech", selection: $form.secondTech) {
                        Text("None").tag(String?.none)
                        ForEach(form.team) { Text($0.displayName).tag(Optional($0.id)) }
                    }
                    .frame(minHeight: minTarget)
                }
            }
        }

        @ViewBuilder private var scheduleFields: some View {
            Picker("Day", selection: quickDay) {
                Text("Today").tag(form.today)
                Text("Tomorrow").tag(form.tomorrow)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(minHeight: minTarget)
            VStack(alignment: .leading, spacing: 4) {
                if let date = dayDate {
                    DatePicker("Date", selection: dateBinding(date), displayedComponents: .date)
                        .environment(\.timeZone, zone)
                        .frame(minHeight: minTarget)
                } else {
                    HStack {
                        Text("Date")
                        Spacer()
                        Button("Pick a Date") { form.input.scheduleDate = form.today }
                            .frame(minHeight: minTarget)
                    }
                }
                if let error = form.errors["scheduleDate"] { ErrorText(error) }
            }
            VStack(alignment: .leading, spacing: 4) {
                DatePicker("Time", selection: timeBinding, displayedComponents: .hourAndMinute)
                    .environment(\.timeZone, zone)
                    .frame(minHeight: minTarget)
                if let error = form.errors["scheduleTime"] { ErrorText(error) }
            }
        }

        private var saveBar: some View {
            VStack(spacing: 8) {
                if !form.errors.isEmpty { Notice(kind: .error, text: "Fix the highlighted fields.") }
                Button(form.saveTitle, action: save)
                    .buttonStyle(.primary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(.bar)
        }

        // MARK: - Actions

        private func cancel() {
            if form.isDirty { confirmingDiscard = true } else { dismiss() }
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

        // MARK: - Helpers

        private func emailField(_ title: String, text: Binding<String>) -> some View {
            TextField(title, text: text)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }

        private func contactLine(_ customer: Row) -> String {
            let parts = [customer["phone"]?.string, customer["email"]?.string].compactMap { $0 }.filter { !$0.isEmpty }
            return parts.isEmpty ? "No contact details" : parts.joined(separator: " · ")
        }

        private func addressText(_ row: Row) -> String {
            guard let property = try? JSONValue.object(row).decode(Property.self) else {
                return row["address_line1"]?.string ?? ""
            }
            return formatAddress(property)
        }

        // Dates are stored as YYYY-MM-DD and HH:MM in the shop's time zone.

        private var zone: TimeZone { TimeZone(identifier: form.company.timeZone) ?? .current }

        private var calendar: Calendar {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            return calendar
        }

        private var quickDay: Binding<String> {
            Binding(
                get: { [form.today, form.tomorrow].contains(form.input.scheduleDate) ? form.input.scheduleDate : "" },
                set: { form.input.scheduleDate = $0 })
        }

        /// The typed date, if it is one.
        private var dayDate: Date? {
            let parts = form.input.scheduleDate.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
        }

        private func dateBinding(_ current: Date) -> Binding<Date> {
            Binding(
                get: { current },
                set: { date in
                    let c = calendar.dateComponents([.year, .month, .day], from: date)
                    form.input.scheduleDate = String(
                        format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
                })
        }

        /// A blank time is 08:00, the time the job gets when none is set.
        private var timeBinding: Binding<Date> {
            Binding(
                get: {
                    let parts = form.input.scheduleTime.split(separator: ":").compactMap { Int($0) }
                    let (hour, minute) = parts.count == 2 ? (parts[0], parts[1]) : (8, 0)
                    let day = dayDate ?? Date()
                    return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
                },
                set: { date in
                    let c = calendar.dateComponents([.hour, .minute], from: date)
                    form.input.scheduleTime = String(format: "%02d:%02d", c.hour ?? 8, c.minute ?? 0)
                })
        }
    }

    /// A field with its label above and its error below, at least a tap target tall.
    private struct LabeledField<Content: View>: View {
        var label: String
        var error: String?
        @ViewBuilder var content: Content

        init(_ label: String, error: String? = nil, @ViewBuilder content: () -> Content) {
            self.label = label
            self.error = error
            self.content = content()
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.subheadline).foregroundStyle(.secondary)
                content.frame(minHeight: 28)
                if let error { ErrorText(error) }
            }
            .padding(.vertical, 4)
            .frame(minHeight: minTarget)
            .accessibilityElement(children: .contain)
        }
    }

    private struct ErrorText: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Label(text, systemImage: "exclamationmark.circle.fill")
                .font(.subheadline)
                .foregroundStyle(Color.fail)
        }
    }
#endif
