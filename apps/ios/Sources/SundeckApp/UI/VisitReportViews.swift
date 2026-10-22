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
                .sheet(isPresented: Binding(get: { share != nil }, set: { if !$0 { share = nil } })) {
                    ShareSheet(text: share ?? "")
                }
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

    /// Settings › Report Templates › Visit reports (pool shops): Automatic / By Hand / Off, saved
    /// to the shop's settings through sync, with the chosen mode's hint.
    struct VisitReportSettingGroup: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var error: String?

        var body: some View {
            if let company = session.company, offersPool(company.settings) {
                let mode = visitReportMode(company.settings)
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(VisitReportText.settingsGroup)
                    VStack(alignment: .leading, spacing: 8) {
                        Segmented(
                            selection: Binding(
                                get: { mode },
                                set: { next in
                                    do {
                                        try VisitReportSettingsWrites.setMode(
                                            sync, companyId: company.id, settings: company.settings, next)
                                        session.reloadCompanies()
                                    } catch {
                                        self.error = String(describing: error)
                                    }
                                }), options: visitReportModes, label: \.label, title: "Visit reports",
                            fillsWidth: true)
                        Text(mode.hint).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                    .card()
                    Text(VisitReportText.settingsFooter).textRole(.footnote).foregroundStyle(Color.textMuted)
                    if let error { Notice(kind: .error, text: error) }
                }
            }
        }
    }
#endif
