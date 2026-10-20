#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Settings pages built in the app (owner, 2026-10-20: "From the app, do not link to the
    // website if you can help it"): Company and Branding, Scheduling and Routes, Report
    // Templates, and Phone and Texting, with the website's sections, fields and wording
    // (apps/web/src/app/(office)/settings/*). Synced settings save through the sync layer, so
    // they work offline; the logo, the next job number and the company number need a connection.

    /// A section's save button, with what happened under it.
    private struct SaveRow: View {
        var title = "Save"
        var busy = false
        var result: (text: String, error: Bool)?
        var action: () -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                if let result { Notice(kind: result.error ? .error : .success, text: result.text) }
                Button(action: action) { BusyButtonLabel(title, busy: busy, busyTitle: "Saving…") }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(busy)
            }
        }
    }

    private func firstError(_ errors: [String: String], _ order: [String]) -> String? {
        order.compactMap { errors[$0] }.first
    }

    // MARK: - Company and Branding

    struct CompanySettingsScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var profile = CompanyProfileForm()
        @State private var followups = FollowupsForm(nil)
        @State private var branding = BrandingForm(nil)
        @State private var disclaimer = ""
        @State private var nextNumber = ""
        @State private var lastNumber = 0
        @State private var loaded = false
        @State private var results: [String: (text: String, error: Bool)] = [:]
        @State private var busy: String?
        @State private var choosingLogo = false
        @State private var logo: UIImage?

        var body: some View {
            ScreenScroll {
                Text("Shown on reports, quotes, and invoices.").textRole(.body).foregroundStyle(Color.textMuted)
                companyProfile
                reminders
                if offersLeak(session.company?.settings) { reportTerms }
                jobNumbers
                brandingSection
            }
            .navigationTitle(SettingsPage.company.title)
            .navigationBarTitleDisplayMode(.large)
            .onAppear(perform: load)
            .sheet(isPresented: $choosingLogo) {
                LibraryPicker(kind: .photo) { result in
                    choosingLogo = false
                    if case .photo(let data)? = result { pickLogo(data) }
                }
                .ignoresSafeArea()
            }
            .task(id: "logo|\(sync.revision)") { await loadLogo() }
        }

        private var companyId: String { session.company?.id ?? "" }
        private var row: Row? { try? sync.store.get("company", companyId) }

        private func load() {
            guard !loaded, let company = session.company else { return }
            let row = self.row
            profile = CompanyProfileForm(row)
            followups = FollowupsForm(company.settings)
            branding = BrandingForm(row)
            disclaimer = row?["report_disclaimer"]?.string ?? ""
            lastNumber = lastJobNumber(sync.store, companyId: company.id)
            nextNumber = String(lastNumber + 1)
            loaded = true
        }

        private var companyProfile: some View {
            VStack(alignment: .leading, spacing: 12) {
                Grouped(
                    label: "Company profile",
                    footer: "Review link: your Google or Yelp page. Review requests link here."
                ) {
                    LabeledFieldRow(label: "Company name", text: $profile.name, labelWidth: 132)
                    LabeledFieldRow(
                        label: "Legal name", text: $profile.legalName, placeholder: "If different, for invoices",
                        labelWidth: 132)
                    LabeledFieldRow(
                        label: "Phone", text: $profile.phone, keyboard: .phonePad, labelWidth: 132,
                        contentType: .telephoneNumber)
                    LabeledFieldRow(
                        label: "Email", text: $profile.email, keyboard: .emailAddress, labelWidth: 132,
                        contentType: .emailAddress)
                    LabeledFieldRow(
                        label: "Street address", text: $profile.street, labelWidth: 132,
                        contentType: .streetAddressLine1)
                    LabeledFieldRow(
                        label: "Address line 2", text: $profile.unit, labelWidth: 132, contentType: .streetAddressLine2)
                    LabeledFieldRow(label: "City", text: $profile.city, labelWidth: 132, contentType: .addressCity)
                    LabeledFieldRow(label: "State", text: $profile.state, labelWidth: 132, contentType: .addressState)
                    LabeledFieldRow(
                        label: "ZIP", text: $profile.zip, keyboard: .numberPad, labelWidth: 132,
                        contentType: .postalCode)
                    LabeledPickerRow(
                        label: "Time zone", selection: $profile.timeZone, options: timeZoneChoices(profile.timeZone),
                        optionLabel: { $0.replacingOccurrences(of: "_", with: " ") })
                    LabeledFieldRow(
                        label: "Review link", text: $profile.reviewURL, keyboard: .URL, labelWidth: 132,
                        contentType: .URL)
                }
                SaveRow(result: results["profile"]) { saveProfile() }
            }
        }

        private var reminders: some View {
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: "Reminders and Reviews", footer: FollowupsForm.note) {
                    LabeledFieldRow(
                        label: "Quote reminders", text: $followups.quoteDays, placeholder: "3, 7",
                        keyboard: .numbersAndPunctuation, labelWidth: 150)
                    LabeledFieldRow(
                        label: "Invoice reminders", text: $followups.invoiceDays, placeholder: "7, 14, 30",
                        keyboard: .numbersAndPunctuation, labelWidth: 150)
                    SwitchRow(
                        "Ask for a review after a job is paid",
                        detail: profile.reviewURL.isEmpty
                            ? "Add your review link under Company profile to send review requests." : nil,
                        isOn: $followups.reviewRequests)
                }
                Text(
                    "Days after sending. Quote reminders are for quotes not yet accepted; invoice reminders for invoices not yet paid in full. Leave empty for none."
                )
                .textRole(.secondary).foregroundStyle(Color.textMuted)
                SaveRow(result: results["followups"]) { saveFollowups() }
            }
        }

        private var reportTerms: some View {
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: "Report terms", footer: reportDisclaimerHint) {
                    LabeledFieldRow(label: "Disclaimer", text: $disclaimer, labelWidth: 104, multiline: true)
                }
                SaveRow(result: results["terms"]) { saveTerms() }
            }
        }

        private var jobNumbers: some View {
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: "Job numbers", footer: nextJobNumberHint(lastNumber: lastNumber)) {
                    LabeledFieldRow(label: "Next job number", text: $nextNumber, keyboard: .numberPad, labelWidth: 150)
                }
                SaveRow(busy: busy == "number", result: results["number"]) { Task { await saveNextNumber() } }
            }
        }

        private var brandingSection: some View {
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: "Branding", footer: "PNG or JPEG, under 2 MB. A wide logo works best.") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Logo").textRole(.body).foregroundStyle(Color.text)
                        if let logo {
                            Image(uiImage: logo).resizable().scaledToFit().frame(maxHeight: 80)
                                .accessibilityLabel("\(profile.name) logo")
                        } else {
                            Text("No logo yet. Reports show your company name instead.")
                                .textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        Button(logo == nil ? "Choose Logo" : "Change Logo") { choosingLogo = true }
                            .buttonStyle(.secondary)
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    LabeledFieldRow(
                        label: "Main color", text: $branding.primary, placeholder: "#12263A", labelWidth: 132)
                    LabeledFieldRow(
                        label: "Accent color", text: $branding.secondary, placeholder: "Optional", labelWidth: 132)
                }
                SaveRow(busy: busy == "logo", result: results["branding"]) { saveBranding() }
            }
        }

        // MARK: Saves

        private func saveProfile() {
            if let e = firstError(profile.errors, ["name", "timezone"]) {
                results["profile"] = (e, true)
                return
            }
            do {
                try ShopSettingsWrites.saveProfile(sync, companyId: companyId, profile, locate: app.locate)
                session.reloadCompanies()
                results["profile"] = ("Saved.", false)
            } catch {
                results["profile"] = (String(describing: error), true)
            }
        }

        private func saveFollowups() {
            if let e = firstError(followups.errors, ["quote_days", "invoice_days"]) {
                results["followups"] = (e, true)
                return
            }
            do {
                try ShopSettingsWrites.saveSettings(
                    sync, companyId: companyId, followups.settings(session.company?.settings))
                session.reloadCompanies()
                results["followups"] = ("Saved.", false)
            } catch {
                results["followups"] = (String(describing: error), true)
            }
        }

        private func saveTerms() {
            if let e = reportDisclaimerProblem(disclaimer) {
                results["terms"] = (e, true)
                return
            }
            do {
                try ShopSettingsWrites.saveDisclaimer(sync, companyId: companyId, disclaimer)
                results["terms"] = ("Saved.", false)
            } catch {
                results["terms"] = (String(describing: error), true)
            }
        }

        private struct NextNumber: Encodable {
            var targetCompany: String
            var nextNumber: Int

            enum CodingKeys: String, CodingKey {
                case targetCompany = "target_company"
                case nextNumber = "next_number"
            }
        }

        /// Numbers only go up (set_next_job_number): on the server, so it needs a connection.
        private func saveNextNumber() async {
            if let e = nextJobNumberProblem(nextNumber) {
                results["number"] = (e, true)
                return
            }
            let n = Int(nextNumber.trimmingCharacters(in: .whitespaces)) ?? 0
            busy = "number"
            defer { busy = nil }
            do {
                try await app.client.rpc(
                    "set_next_job_number", params: NextNumber(targetCompany: companyId, nextNumber: n)
                ).execute()
                results["number"] = ("The next job will be #\(n).", false)
            } catch {
                let message = String(describing: error)
                results["number"] = (isNetworkFailure(message) ? WebAPI.Failure.noConnection : message, true)
            }
        }

        @State private var pendingLogo: (data: Data, type: String)?

        private func pickLogo(_ data: Data) {
            // A PNG keeps its transparency; anything else is sent as JPEG.
            let png = data.starts(with: [0x89, 0x50, 0x4E, 0x47])
            // Photos are re-encoded to the PNG or JPEG the website accepts.
            guard let image = UIImage(data: data),
                let encoded = png ? image.pngData() : image.jpegData(compressionQuality: 0.9)
            else {
                results["branding"] = ("Use a PNG, JPEG, or SVG file.", true)
                return
            }
            let mime = png ? "image/png" : "image/jpeg"
            if let e = logoFileProblem(contentType: mime, bytes: encoded.count).error {
                results["branding"] = (e, true)
                return
            }
            logo = image
            pendingLogo = (encoded, mime)
            results["branding"] = nil
        }

        private func loadLogo() async {
            guard pendingLogo == nil, let path = row?["logo_path"]?.string,
                let url = try? await app.client.storage.from("company-assets").createSignedURL(
                    path: path, expiresIn: 3600),
                let (data, _) = try? await URLSession.shared.data(from: url)
            else { return }
            logo = UIImage(data: data)
        }

        private func saveBranding() {
            if let e = firstError(branding.errors, ["brand_primary", "brand_secondary"]) {
                results["branding"] = (e, true)
                return
            }
            guard let pendingLogo else {
                write(logoPath: nil)
                return
            }
            busy = "logo"
            Task {
                defer { busy = nil }
                // A new name each time, so reports already sent keep pointing at the old logo.
                let ext = pendingLogo.type == "image/png" ? "png" : "jpg"
                let path = "\(companyId)/logo-\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
                do {
                    try await app.client.storage.from("company-assets")
                        .upload(path, data: pendingLogo.data, options: FileOptions(contentType: pendingLogo.type))
                    self.pendingLogo = nil
                    write(logoPath: path)
                } catch {
                    let message = String(describing: error)
                    results["branding"] = (isNetworkFailure(message) ? WebAPI.Failure.noConnection : message, true)
                }
            }
        }

        private func write(logoPath: String?) {
            do {
                try ShopSettingsWrites.saveBranding(sync, companyId: companyId, branding, logoPath: logoPath)
                results["branding"] = ("Saved.", false)
            } catch {
                results["branding"] = (String(describing: error), true)
            }
        }
    }

    // MARK: - Scheduling and Routes

    struct SchedulingSettingsScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var form = SchedulingForm(nil)
        @State private var loaded = false
        @State private var result: (text: String, error: Bool)?
        @State private var locateResult: (text: String, error: Bool)?
        @State private var finding = false

        var body: some View {
            let company = session.company
            let shop = shopLocationText(try? sync.store.get("company", company?.id ?? ""))
            ScreenScroll {
                Text("Every tech’s route starts and ends at the shop.").textRole(.body).foregroundStyle(Color.textMuted)
                VStack(alignment: .leading, spacing: 12) {
                    Grouped(label: "Working day") {
                        TimeFieldRow(label: "Day starts", clock: $form.dayStart)
                        TimeFieldRow(label: "Back at the shop by", clock: $form.dayEnd)
                        LabeledFieldRow(
                            label: "Usual job length (hours)", text: $form.jobHours, keyboard: .decimalPad,
                            labelWidth: 200)
                    }
                    Text("Usual job length is for jobs booked without an end time.")
                        .textRole(.secondary).foregroundStyle(Color.textMuted)
                    if offersPool(company?.settings) {
                        Grouped(
                            footer: "For new maintenance plans, and how far ahead plans put visits on the schedule."
                        ) {
                            LabeledFieldRow(
                                label: "Maintenance visit (minutes)", text: $form.visitMinutes, keyboard: .numberPad,
                                labelWidth: 220)
                            LabeledFieldRow(
                                label: "Schedule maintenance ahead (weeks)", text: $form.weeksAhead,
                                keyboard: .numberPad, labelWidth: 220)
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Working days")
                        Text("Suggested times use these days.").textRole(.secondary).foregroundStyle(Color.textMuted)
                        HStack(spacing: 6) {
                            ForEach(0..<7, id: \.self) { d in
                                let on = form.workDays.contains(d)
                                Button {
                                    if on { form.workDays.remove(d) } else { form.workDays.insert(d) }
                                } label: {
                                    Text(SchedulingForm.dayLetters[d])
                                        .font(.role(.secondary).weight(.medium))
                                        .foregroundStyle(on ? Color.onHeader : Color.text)
                                        .frame(width: minTarget, height: minTarget)
                                        .background(Circle().fill(on ? Color.link : Color.fill))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(SchedulingForm.dayNames[d])
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Arrival time customers are told")
                        ScrollView(.horizontal, showsIndicators: false) {
                            Segmented(
                                selection: $form.windowMin, options: SchedulingForm.windows.map(\.minutes),
                                label: { m in SchedulingForm.windows.first { $0.minutes == m }?.label ?? "" },
                                title: "Arrival time customers are told", segmentPadding: 12)
                        }
                        Text(form.windowNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                    SaveRow(result: result) { save() }
                }
                VStack(alignment: .leading, spacing: 12) {
                    Grouped(label: "Shop location") {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(shop.address).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            Text(shop.status).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, CGFloat(Spacing.rowVertical))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        NavigationLink(value: MoreRoute.settingsPage(.company)) {
                            ListRow("Change the Address")
                        }
                        ActionRow(finding ? "Finding…" : "Find From Address") { Task { await findShop() } }
                            .disabled(finding)
                    }
                    if let locateResult {
                        Notice(kind: locateResult.error ? .error : .success, text: locateResult.text)
                    }
                }
                Grouped(label: "Drive times", footer: "Pools are found from their address when a route is planned.") {
                    Text(unlocatedPoolsText(sync.store, companyId: company?.id ?? ""))
                        .textRole(.body).foregroundStyle(Color.text)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, CGFloat(Spacing.rowVertical))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .navigationTitle(SettingsPage.scheduling.title)
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                if !loaded {
                    form = SchedulingForm(session.company?.settings)
                    loaded = true
                }
            }
        }

        private func save() {
            guard let company = session.company else { return }
            if let e = firstError(
                form.errors,
                [
                    "day_start", "day_end", "job_hours", "visit_minutes", "weeks_ahead", "work_days",
                    "arrival_window_minutes",
                ])
            {
                result = (e, true)
                return
            }
            do {
                try ShopSettingsWrites.saveSettings(sync, companyId: company.id, form.settings(company.settings))
                session.reloadCompanies()
                result = ("Saved.", false)
            } catch {
                result = (String(describing: error), true)
            }
        }

        private func findShop() async {
            guard let company = session.company else { return }
            finding = true
            defer { finding = false }
            do {
                _ = try await app.api.post("api/locate", ["company_id": .string(company.id), "shop": true])
                locateResult = ("Found. The shop is on the map.", false)
                await sync.syncNow()
            } catch {
                locateResult = (String(describing: error), true)
            }
        }
    }

    /// A time of day ("08:00") with the system's time picker.
    private struct TimeFieldRow: View {
        var label: String
        @Binding var clock: String

        var body: some View {
            DatePicker(
                selection: Binding(
                    get: {
                        let m = clockToMinutes(clock)
                        return Calendar.current.date(
                            bySettingHour: m / 60, minute: m % 60, second: 0, of: Date(timeIntervalSince1970: 0))
                            ?? Date()
                    },
                    set: { date in
                        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
                        clock = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
                    }), displayedComponents: .hourAndMinute
            ) {
                Text(label).textRole(.body).foregroundStyle(Color.text)
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, 4)
            .frame(minHeight: minTarget)
        }
    }

    // MARK: - Report Templates

    struct ReportTemplatesScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var items: [ReportTemplateItem] = []
        @State private var editing: ReportTemplateItem?
        @State private var notice: String?

        var body: some View {
            ScreenScroll {
                Text(reportTemplatesSubtitle).textRole(.body).foregroundStyle(Color.textMuted)
                if let notice { Notice(kind: .success, text: notice) }
                Grouped {
                    ForEach(items) { item in
                        Button {
                            if item.editable { editing = item }
                        } label: {
                            ListRow(item.name, detail: item.detail, value: item.value, chevron: item.editable)
                        }
                        .buttonStyle(.row)
                        .disabled(!item.editable)
                    }
                }
                VisitReportSettingGroup()
                SavedReportsGroup()
            }
            .refreshable { await sync.syncNow() }
            .navigationTitle(SettingsPage.reports.title)
            .navigationBarTitleDisplayMode(.large)
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") {
                items = reportTemplateItems(sync.store, companyId: session.company?.id ?? "")
            }
            .sheet(item: $editing) { item in
                ReportTemplateSheet(item: item) { notice = $0 }
            }
        }
    }

    private struct ReportTemplateSheet: View {
        var item: ReportTemplateItem
        var done: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var enabled = false
        @State private var error: String?
        @State private var loaded = false

        var body: some View {
            FormSheet(title: item.name, dirty: loaded && (name != item.name || enabled != item.enabled)) {
                Grouped {
                    LabeledFieldRow(label: "Name", text: $name, labelWidth: 80)
                }
                Grouped {
                    SwitchRow("Techs can send this report", isOn: $enabled)
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Save") { save() }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear {
                if !loaded {
                    name = item.name
                    enabled = item.enabled
                    loaded = true
                }
            }
        }

        private func save() {
            guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
                error = "Enter a name."
                return
            }
            guard let company = session.company else { return }
            do {
                try ShopSettingsWrites.saveReportTemplate(
                    sync, companyId: company.id, id: item.id, name: name, enabled: enabled)
                done("Saved.")
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    // MARK: - Phone and Texting

    /// The company number (owner, 2026-10-16): customers text and call one number the whole team
    /// shares; texting needs it. "My mobile number" is separate: only where this person's calls ring.
    struct PhoneSettingsScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var model: PhoneSettingsModel?
        @State private var onMyWay = OnMyWayChoice.messages
        @State private var confirmCancel = false

        var body: some View {
            let manager = isManagerRole(session.company?.role)
            ScreenScroll {
                Text(PhoneText.subtitle).textRole(.body).foregroundStyle(Color.textMuted)
                if let model {
                    if let result = model.result { Notice(kind: result.error ? .error : .success, text: result.text) }
                    if model.loaded {
                        if manager {
                            if let line = model.line {
                                companyNumber(model, line)
                                textsAndCalls(model)
                            } else {
                                getNumber(model)
                                keepNumber(model)
                            }
                            onMyWaySection
                        } else if model.line == nil {
                            Notice(kind: .info, text: "\(PhoneText.needsNumber) Ask an owner to set one up.")
                        }
                        myMobile(model)
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
            }
            .refreshable { await model?.load() }
            .navigationTitle(PhoneText.title)
            .navigationBarTitleDisplayMode(.large)
            .task(id: session.company?.id) {
                guard let company = session.company else { return }
                onMyWay = OnMyWayChoice(company.settings)
                let model = PhoneSettingsModel(api: app.api, companyId: company.id)
                self.model = model
                await model.load()
            }
            .confirmationDialog(PhoneText.cancelConfirm, isPresented: $confirmCancel, titleVisibility: .visible) {
                Button(PhoneText.cancel, role: .destructive) { Task { await model?.cancel() } }
            }
        }

        private func companyNumber(_ model: PhoneSettingsModel, _ line: PhoneLineView) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(PhoneText.companyNumber)
                VStack(alignment: .leading, spacing: 4) {
                    Text(formatPhone(line.number)).textRole(.sectionHeading).foregroundStyle(Color.text)
                    Text(line.status == "active" ? PhoneText.active : PhoneText.pending)
                        .textRole(.body).foregroundStyle(Color.textMuted)
                    if line.status == "pending" {
                        Button(PhoneText.cancel, role: .destructive) { confirmCancel = true }
                            .buttonStyle(.danger(fullWidth: false, size: .field))
                            .padding(.top, 8)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
            }
        }

        private func getNumber(_ model: PhoneSettingsModel) -> some View {
            @Bindable var model = model
            return VStack(alignment: .leading, spacing: 12) {
                SectionLabel(PhoneText.newNumber)
                Text(PhoneText.needsNumber).textRole(.body).foregroundStyle(Color.textMuted)
                Grouped {
                    LabeledFieldRow(
                        label: PhoneText.areaCode, text: $model.areaCode, placeholder: "480", keyboard: .numberPad)
                }
                if let e = model.fieldErrors["area_code"] { Notice(kind: .error, text: e) }
                Button {
                    Task { await model.search() }
                } label: {
                    BusyButtonLabel(
                        PhoneText.search, busy: model.busy == PhoneText.searching, busyTitle: PhoneText.searching)
                }
                .buttonStyle(.secondary)
                .disabled(model.busy != nil)
                if !model.numbers.isEmpty {
                    Grouped {
                        ForEach(model.numbers) { n in
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(formatPhone(n.number)).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                                    if let place = n.place {
                                        Text(place).textRole(.secondary).foregroundStyle(Color.textMuted)
                                    }
                                }
                                Spacer()
                                Button(PhoneText.useThis) { Task { await model.take(n.number) } }
                                    .buttonStyle(.secondary)
                                    .disabled(model.busy != nil)
                            }
                            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                            .padding(.vertical, CGFloat(Spacing.rowVertical))
                            .frame(minHeight: minTarget)
                        }
                    }
                    .accessibilityLabel("Numbers you can take")
                }
            }
        }

        private func keepNumber(_ model: PhoneSettingsModel) -> some View {
            @Bindable var model = model
            return VStack(alignment: .leading, spacing: 12) {
                Grouped(label: PhoneText.keepTitle, footer: PhoneText.keepHint) {
                    LabeledFieldRow(
                        label: "Number", text: $model.keepNumber, placeholder: "(480) 555-0100", keyboard: .phonePad)
                }
                if let e = model.fieldErrors["number"] { Notice(kind: .error, text: e) }
                Button {
                    Task { await model.keep() }
                } label: {
                    BusyButtonLabel(PhoneText.keepButton, busy: model.busy == "keep", busyTitle: "Saving…")
                }
                .buttonStyle(.secondary)
                .disabled(model.busy != nil)
            }
        }

        private func textsAndCalls(_ model: PhoneSettingsModel) -> some View {
            @Bindable var model = model
            return VStack(alignment: .leading, spacing: 12) {
                Grouped(label: PhoneText.textsAndCalls) {
                    SwitchRow(PhoneText.pictures, detail: PhoneText.picturesHint, isOn: $model.pictures)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(PhoneText.greeting).textRole(.body).foregroundStyle(Color.text)
                        TextField(
                            "", text: $model.greeting,
                            prompt: Text(PhoneText.greetingPlaceholder(session.company?.name ?? "us")), axis: .vertical
                        )
                        .lineLimit(3...6)
                        .textRole(.body)
                        .accessibilityLabel(PhoneText.greeting)
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                }
                Grouped(label: PhoneText.callsRing, footer: PhoneText.callsRingHint) {
                    ForEach(model.team) { m in
                        SwitchRow(
                            PhoneText.ringLabel(m),
                            isOn: Binding(
                                get: { model.rings.contains(m.id) },
                                set: { on in
                                    if on { model.rings.insert(m.id) } else { model.rings.remove(m.id) }
                                }))
                    }
                }
                SaveRow(busy: model.busy == "save") { Task { await model.saveLine() } }
            }
        }

        private var onMyWaySection: some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(PhoneText.onMyWay)
                Segmented(
                    selection: Binding(
                        get: { onMyWay },
                        set: { choice in
                            onMyWay = choice
                            guard let company = session.company else { return }
                            try? ShopSettingsWrites.saveOnMyWay(
                                sync, companyId: company.id, settings: company.settings, choice)
                            session.reloadCompanies()
                        }), options: OnMyWayChoice.allCases, label: \.label, title: "Send from", fillsWidth: true)
                Text(onMyWay.note).textRole(.secondary).foregroundStyle(Color.textMuted)
            }
        }

        private func myMobile(_ model: PhoneSettingsModel) -> some View {
            @Bindable var model = model
            return VStack(alignment: .leading, spacing: 12) {
                Grouped(label: PhoneText.myMobile, footer: PhoneText.myMobileHint) {
                    LabeledFieldRow(
                        label: "Mobile", text: $model.myPhone, placeholder: "(480) 555-0100", keyboard: .phonePad,
                        contentType: .telephoneNumber)
                }
                if let e = model.fieldErrors["phone"] { Notice(kind: .error, text: e) }
                Button {
                    Task { await model.saveMyPhone() }
                } label: {
                    BusyButtonLabel(PhoneText.saveMobile, busy: model.busy == "my_phone", busyTitle: "Saving…")
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
                .disabled(model.busy != nil)
            }
        }
    }
#endif
