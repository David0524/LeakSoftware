#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// A maintenance visit's Visit Report (owner, 2026-10-20; website visit-report-panel.tsx), in
    /// Details until the visit is done, then in the Next Step bar's sheet (owner, 2026-10-22): how
    /// it goes out, View Visit Report, the customer email, Send by Email and Send by Text (or Get
    /// Link to Text without a company number), and its versions. Hidden when the shop turned
    /// visit reports off.
    struct VisitReportSection: View {
        var job: JobView
        /// "Visit Report" above the card; the bar's sheet has it as its title instead.
        var heading = true
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var to: String?
        @State private var busy: VisitReportChannel?
        @State private var step = 0
        @State private var result: (text: String, error: Bool)?
        @State private var share: String?
        @State private var browsing: BrowsedPage?
        @FocusState private var focused: Bool

        var body: some View {
            let _ = sync.revision
            if let company = session.company, visitReportMode(company.settings) != .off {
                let mode = visitReportMode(company.settings)
                let versions = visitReportVersions(sync.store, jobId: job.id)
                let latest = versions.first(where: \.current)
                let hasLine = companyLine(sync.store, companyId: company.id)?.status == "active"
                // Require a Photo (owner, 2026-10-25): why it can't be sent yet, with Add Photo.
                let photoBlock = visitReportPhotoBlock(sync.store, settings: company.settings, jobId: job.id)
                VStack(alignment: .leading, spacing: 12) {
                    if heading { SectionHeading(VisitReportText.title) }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(
                            visitReportStatus(
                                versions, mode: mode, done: job.status == .done, timeZone: company.timeZone)
                        )
                        .textRole(.secondary).foregroundStyle(Color.textMuted)
                        if let token = latest?.token {
                            Button(VisitReportText.view) {
                                browsing = BrowsedPage(url: reportURL(AppConfig.webURL, token))
                            }
                            .buttonStyle(.quiet)
                            .padding(.leading, -20)
                        }
                        if photoBlock != nil {
                            ReportPhotoNotice(jobId: job.id)
                        } else {
                            VStack(alignment: .leading, spacing: 4) {
                                FieldLabel(VisitReportText.customerEmail)
                                TextField("", text: Binding(get: { email }, set: { to = $0 }))
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .textContentType(nil)
                                    .focused($focused)
                                    .accessibilityLabel(VisitReportText.customerEmail)
                                    .fieldBox(focused: focused)
                            }
                            FlowRow(spacing: 12) {
                                Button {
                                    send(.email)
                                } label: {
                                    BusyButtonLabel(
                                        latest == nil ? VisitReportText.sendEmail : VisitReportText.sendAgain,
                                        busy: busy == .email, busyTitle: "Sending…")
                                }
                                .buttonStyle(.primary)
                                .disabled(busy != nil || email.trimmingCharacters(in: .whitespaces).isEmpty)
                                Button {
                                    send(hasLine ? .text : .smsDevice)
                                } label: {
                                    BusyButtonLabel(
                                        hasLine ? VisitReportText.sendText : VisitReportText.getLink,
                                        busy: busy == .text || busy == .smsDevice, busyTitle: "Sending…")
                                }
                                .buttonStyle(.secondary)
                                .disabled(busy != nil)
                            }
                        }
                        if busy != nil {
                            ProgressSteps(steps: ReportProgress.steps(.email), current: step)
                        }
                        if let result { Notice(kind: result.error ? .error : .success, text: result.text) }
                        if versions.count > 1 {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(versions) { v in
                                    HStack(spacing: 8) {
                                        Text(visitReportVersionLabel(v, timeZone: company.timeZone))
                                            .textRole(.secondary).foregroundStyle(Color.textMuted)
                                        if let token = v.token {
                                            Button("View") {
                                                browsing = BrowsedPage(url: reportURL(AppConfig.webURL, token))
                                            }
                                            .buttonStyle(.quiet(size: .small))
                                            .accessibilityLabel("View version \(v.version)")
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .card()
                }
                .browser($browsing)
                // Messages gets the link as a link, with the report's preview card (2026-10-24).
                .linkShareSheet(share) { share = nil }
            }
        }

        private var email: String { to ?? job.customer?["email"]?.string ?? "" }

        private func send(_ channel: VisitReportChannel) {
            focused = false
            busy = channel
            step = 0
            result = nil
            Task {
                defer { busy = nil }
                do {
                    // The steps: saving the visit, the server sending it, then syncing it down.
                    let sent = try await VisitReportServer.send(
                        sync: sync, api: app.api, jobId: job.id, channel: channel,
                        to: channel == .email ? email : nil, onStep: { step = $0 })
                    result = (sent.message, false)
                    share = sent.share
                } catch {
                    result = ((error as? WebAPI.Failure)?.description ?? String(describing: error), true)
                }
            }
        }
    }

    /// "Add a photo to send this report." with Add Photo (take or choose, saved to the visit), where
    /// Send Visit Report would be while the shop's Require a Photo holds it up (owner, 2026-10-25).
    /// Once a photo is saved the send buttons come back.
    struct ReportPhotoNotice: View {
        var jobId: String
        @State private var capture: CaptureController

        init(jobId: String) {
            self.jobId = jobId
            _capture = State(initialValue: CaptureController(target: MediaTarget(jobId: jobId)))
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Notice(kind: .error, text: ReportPhotoText.blocked)
                Button {
                    Task { await capture.takeOrChoose(.photo) }
                } label: {
                    Label(ReportPhotoText.addPhoto, systemImage: "camera")
                }
                .buttonStyle(.primary)
                .disabled(capture.busy != nil)
            }
            .captureFlow(capture)
        }
    }

    /// Settings › Report Templates › Visit reports (pool shops; owner, 2026-10-20 and 2026-10-24):
    /// Each Visit (with Send Automatically) | Monthly | Off, saved to the shop's settings through
    /// sync as one `visit_reports` value (website components/visit-report-setting.tsx).
    struct VisitReportSettingGroup: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var error: String?

        var body: some View {
            if let company = session.company, offersPool(company.settings) {
                let mode = visitReportMode(company.settings)
                let timing = visitReportTiming(mode)
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(VisitReportText.settingsGroup)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(VisitReportTimingText.title).textRole(.bodyMedium).foregroundStyle(Color.text)
                        Segmented(
                            selection: Binding(
                                get: { timing },
                                set: { setMode(company, visitReportModeFor($0, automatic: mode == .auto)) }),
                            options: visitReportTimings, label: \.label, title: VisitReportTimingText.title,
                            fillsWidth: true)
                        switch timing {
                        case .each:
                            Toggle(
                                isOn: Binding(get: { mode == .auto }, set: { setMode(company, $0 ? .auto : .manual) })
                            ) {
                                Text(VisitReportTimingText.automatic).textRole(.bodyMedium).foregroundStyle(Color.text)
                            }
                            .tint(Color.pass)
                            .frame(minHeight: minTarget)
                            Text(mode == .auto ? VisitReportTimingText.automaticOn : VisitReportTimingText.automaticOff)
                                .textRole(.secondary)
                                .foregroundStyle(Color.textMuted)
                        case .monthly:
                            VStack(alignment: .leading, spacing: 0) {
                                monthlyRow(
                                    "doc.text", VisitReportTimingText.monthlyWhat,
                                    VisitReportTimingText.monthlyWhatDetail)
                                Hairline().padding(.leading, 52)
                                monthlyRow(
                                    "creditcard", VisitReportTimingText.monthlyWhen,
                                    VisitReportTimingText.monthlyWhenDetail)
                            }
                            .background(
                                RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous)
                                    .fill(Color.well))
                            Text(VisitReportTimingText.monthlyFooter).textRole(.secondary).foregroundStyle(
                                Color.textMuted)
                        case .off:
                            Text(VisitReportTimingText.off).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        // Require a Photo (owner, 2026-10-25), while visit reports are on.
                        if let hint = reportPhotoHint(mode) {
                            Hairline()
                            Toggle(
                                isOn: Binding(
                                    get: { requiresReportPhoto(company.settings) },
                                    set: { setRequirePhoto(company, $0) })
                            ) {
                                Text(ReportPhotoText.label).textRole(.bodyMedium).foregroundStyle(Color.text)
                            }
                            .tint(Color.pass)
                            .frame(minHeight: minTarget)
                            Text(hint).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    .card()
                    Text(VisitReportText.settingsFooter).textRole(.footnote).foregroundStyle(Color.textMuted)
                    if let error { Notice(kind: .error, text: error) }
                }
            }
        }

        private func monthlyRow(_ symbol: String, _ title: String, _ detail: String) -> some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 20))
                    .foregroundStyle(Color.link)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).textRole(.bodyMedium).foregroundStyle(Color.text)
                    Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }

        private func setRequirePhoto(_ company: CompanyContext, _ on: Bool) {
            do {
                try VisitReportSettingsWrites.setRequirePhoto(
                    sync, companyId: company.id, settings: company.settings, on)
                session.reloadCompanies()
            } catch {
                self.error = String(describing: error)
            }
        }

        private func setMode(_ company: CompanyContext, _ next: VisitReportMode) {
            do {
                try VisitReportSettingsWrites.setMode(sync, companyId: company.id, settings: company.settings, next)
                session.reloadCompanies()
            } catch {
                self.error = String(describing: error)
            }
        }
    }
#endif
