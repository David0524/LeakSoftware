#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// Signatures, then write, edit, and send the report (BUILD_PLAN 6.2 to 6.5). List content
    /// (sections) for the job page's List. Port of apps/mobile/src/features/report/ReportTab.tsx.
    struct ReportTab: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @State private var flow: ReportFlow?
        @State private var removing: SignatureRow?
        @State private var confirmWriteAgain = false
        /// The version whose Send by Text opened the share sheet.
        @State private var sharingFrom: String?
        @FocusState private var focus: Field?

        enum Field: Hashable {
            case section(String)
            /// The email fields, once for the draft and once for the finished version.
            case email(String)
            case other(String)
        }

        init(job: JobView) { self.job = job }

        // Worked out on every render: reading `sync.revision` re-renders after any write or pull.
        // Each dialog hangs on the view that opens it: modifiers on list content repeat per row.
        var body: some View {
            let _ = sync.revision
            if let company = session.company, let flow, flow.jobId == job.id {
                let model = ReportTabModel(
                    store: sync.store, companyId: company.id, settings: company.settings, job: job,
                    template: flow.template)
                content(model, flow, company)
            } else if let company = session.company {
                // SwiftUI never runs onAppear on an empty view, so loading shows a real row.
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: minTarget)
                        .onAppear { flow = ReportFlow(sync: sync, companyId: company.id, jobId: job.id) }
                }
            }
        }

        private var server: ReportServer { ReportServer(sync: sync, api: app.api) }

        @ViewBuilder
        private func content(_ model: ReportTabModel, _ flow: ReportFlow, _ company: CompanyContext) -> some View {
            if model.showsTip, let tip = app.walkthrough.tip(screen: "report", company: company, pkg: .leak) {
                Section { TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) } }
            }
            signatures(model, flow)
            if model.showsTemplatePicker {
                Section("Report for") {
                    Picker(
                        "Report for",
                        selection: Binding(get: { flow.template }, set: { flow.switchTemplate($0) })
                    ) {
                        ForEach(model.templates) { Text($0.label).tag($0.value) }
                    }
                    .pickerStyle(.segmented)
                }
            }
            writeSection(model, flow)
            if model.hasDraftText, let draft = model.draft {
                draftSections(model, flow, draft)
            }
            if let title = model.finishedTitle, let finished = model.finished {
                Section {
                    sendFields(model, flow, reportId: finished.id)
                } header: {
                    Text(title)
                }
                Section {
                    sendButtons(model, flow, reportId: finished.id, emailPrimary: model.finishedEmailIsPrimary)
                    if let url = model.pdfURL() {
                        Button("Open PDF") { openURL(url) }
                            .buttonStyle(.borderless)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color.brandPrimary)
                            .frame(maxWidth: .infinity, minHeight: minTarget)
                    }
                    if let error = flow.error, error.at == .send {
                        Notice(kind: .error, text: error.text)
                    }
                } footer: {
                    Text(ReportTabModel.finishedNote)
                }
                .modifier(ButtonRows())
            }
            if !model.versions.isEmpty {
                Section("Versions") {
                    ForEach(model.versions) { version in
                        if let url = version.url {
                            Button {
                                openURL(url)
                            } label: {
                                HStack {
                                    Text(version.label).foregroundStyle(.primary)
                                    Spacer()
                                    Text("View").foregroundStyle(Color.brandPrimary)
                                }
                                .frame(minHeight: minTarget)
                                .contentShape(Rectangle())
                            }
                            .accessibilityLabel(version.viewLabel)
                            .accessibilityAddTraits(.isLink)
                        } else {
                            Text(version.label).frame(minHeight: minTarget)
                        }
                    }
                }
            }
        }

        // MARK: - Signatures

        @ViewBuilder
        private func signatures(_ model: ReportTabModel, _ flow: ReportFlow) -> some View {
            Section {
                if model.signatures.isEmpty {
                    Text(ReportTabModel.noSignatures)
                        .font(.subheadline).foregroundStyle(Color.muted)
                }
                ForEach(model.signatures) { s in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(.body.weight(.semibold))
                            Text(s.subtitle).font(.subheadline).foregroundStyle(Color.muted)
                        }
                        Spacer(minLength: 8)
                        Button("Remove") { removing = s }
                            .buttonStyle(.borderless)
                            .foregroundStyle(Color.fail)
                            .frame(minHeight: minTarget)
                            .accessibilityLabel(s.removeLabel)
                    }
                    .frame(minHeight: minTarget)
                    // Swipe left to remove, or use the row's Remove button.
                    .swipeActions {
                        Button("Remove", role: .destructive) { removing = s }
                    }
                    .confirmationDialog(
                        s.removeTitle,
                        isPresented: Binding(
                            get: { removing?.id == s.id }, set: { if !$0, removing?.id == s.id { removing = nil } }),
                        titleVisibility: .visible
                    ) {
                        Button("Remove", role: .destructive) { flow.removeSignature(s.id) }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("Reports already finished keep it; new versions won’t show it.")
                    }
                }
            } header: {
                HStack {
                    Text("Signatures")
                    Spacer()
                    if model.ownSheet {
                        Button(ReportTabModel.signWorkAuthorization) {
                            openRoute(.signature(jobId: job.id, quoteId: nil))
                        }
                        .font(.subheadline.weight(.semibold))
                        .textCase(nil)
                        .frame(minHeight: minTarget)
                    }
                }
                .modifier(SaveAlert(flow: flow))
            }
        }

        // MARK: - Writing

        @ViewBuilder
        private func writeSection(_ model: ReportTabModel, _ flow: ReportFlow) -> some View {
            Section {
                if !model.online {
                    Notice(kind: .warning, text: ReportTabModel.offlineNotice)
                } else {
                    Button {
                        if flow.writeNeedsConfirmation {
                            confirmWriteAgain = true
                        } else {
                            Task { await flow.run(.draft, server: server) }
                        }
                    } label: {
                        BusyLabel(title: model.writeTitle, busy: flow.busy == .draft)
                    }
                    .modifier(KindStyle(primary: model.writeIsPrimary))
                    .disabled(flow.busy != nil)
                    // Writing again replaces the draft's text, so it asks first.
                    .confirmationDialog(
                        "Write the draft again?", isPresented: $confirmWriteAgain, titleVisibility: .visible
                    ) {
                        Button("Write Again", role: .destructive) {
                            Task { await flow.run(.draft, server: server) }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("The new draft replaces this one, including your edits.")
                    }
                }
                if model.showsReviewBeforeDraft {
                    Button(ReportTabModel.reviewWithCustomer) { openRoute(.review(jobId: job.id)) }
                        .buttonStyle(.secondary)
                        .disabled(flow.busy != nil)
                }
                if let error = flow.error, error.at == .draft {
                    Notice(kind: .error, text: error.text)
                }
                if let message = flow.message {
                    Notice(kind: .info, text: message)
                }
            }
            .modifier(ButtonRows())
        }

        @ViewBuilder
        private func draftSections(_ model: ReportTabModel, _ flow: ReportFlow, _ draft: ReportRecord) -> some View {
            if let problems = model.problemsText {
                Section { Notice(kind: .warning, text: problems) }
                    .modifier(ButtonRows())
            }
            ForEach(model.sections, id: \.key) { section in
                Section(section.title) {
                    TextField(
                        section.title,
                        text: Binding(
                            get: { flow.sectionText(section) },
                            set: { flow.edits[section.key] = $0 }),
                        axis: .vertical
                    )
                    .lineLimit(3...)
                    .focused($focus, equals: .section(section.key))
                    .accessibilityLabel(section.title)
                    // Every pending edit is saved in one write when a section loses focus.
                    .onChange(of: focus) { old, _ in
                        if old == .section(section.key) { flow.saveEdits() }
                    }
                }
                .id("\(draft.id)-\(section.key)")
            }
            if let title = model.finishTitle {
                Section {
                    if model.finishesWithSignature {
                        Button {
                            Task { await flow.run(.finish, server: server) }
                        } label: {
                            BusyLabel(title: ReportTabModel.finishReport, busy: flow.busy == .finish)
                        }
                        .buttonStyle(.primary)
                        .disabled(flow.busy != nil || !model.online)
                    } else {
                        Button(ReportTabModel.reviewWithCustomer) {
                            flow.saveEdits()
                            openRoute(.review(jobId: job.id))
                        }
                        .buttonStyle(.primary)
                        .disabled(flow.busy != nil)
                    }
                    if let error = flow.error, error.at == .finish {
                        Notice(kind: .error, text: error.text)
                    }
                } header: {
                    Text(title)
                } footer: {
                    Text(model.finishNote)
                }
                .modifier(ButtonRows())
            }
            Section {
                sendFields(model, flow, reportId: draft.id)
            } header: {
                Text(ReportTabModel.sendWithoutSignature)
            }
            Section {
                sendButtons(model, flow, reportId: draft.id, emailPrimary: false)
                if let error = flow.error, error.at == .send, model.finished == nil {
                    Notice(kind: .error, text: error.text)
                }
            } footer: {
                Text(ReportTabModel.sendWithoutSignatureNote)
            }
            .modifier(ButtonRows())
        }

        // MARK: - Sending

        /// The email fields, shared by sending a draft and sending a finished version. They hold
        /// the customer's addresses, so iPhone doesn't offer to fill in the tech's own.
        @ViewBuilder
        private func sendFields(_ model: ReportTabModel, _ flow: ReportFlow, reportId: String) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                Text("Customer email").font(.subheadline).foregroundStyle(Color.muted)
                TextField(
                    "Customer email",
                    text: Binding(get: { flow.emailText(model) }, set: { flow.to = $0 })
                )
                .emailField()
                .focused($focus, equals: .email(reportId))
                .submitLabel(model.hasCustomer ? .next : .done)
                .onSubmit { if model.hasCustomer { focus = .other(reportId) } }
            }
            .frame(minHeight: minTarget)
            if model.hasCustomer {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Other emails (optional)").font(.subheadline).foregroundStyle(Color.muted)
                    TextField(
                        "Other emails (optional)",
                        text: Binding(get: { flow.otherEmailsText(model) }, set: { flow.otherEmails = $0 })
                    )
                    .emailField()
                    .focused($focus, equals: .other(reportId))
                    .submitLabel(.done)
                    .onSubmit { flow.saveOtherEmails() }
                    .onChange(of: focus) { old, _ in
                        if old == .other(reportId) { flow.saveOtherEmails() }
                    }
                    Text(ReportTabModel.otherEmailsHint).font(.footnote).foregroundStyle(Color.muted)
                }
                .frame(minHeight: minTarget)
            }
        }

        /// Send by Email and Send by Text, full width and stacked so the labels never squeeze
        /// at large text sizes.
        @ViewBuilder
        private func sendButtons(_ model: ReportTabModel, _ flow: ReportFlow, reportId: String, emailPrimary: Bool)
            -> some View
        {
            let online = model.online
            Button {
                focus = nil
                Task { await flow.run(.email, reportId: reportId, server: server) }
            } label: {
                BusyLabel(title: "Send by Email", busy: flow.busy == .email)
            }
            .modifier(KindStyle(primary: emailPrimary))
            .disabled(flow.busy != nil || !online)
            Button {
                focus = nil
                sharingFrom = reportId
                Task { await flow.run(.text, reportId: reportId, server: server) }
            } label: {
                BusyLabel(title: "Send by Text", busy: flow.busy == .text)
            }
            .buttonStyle(.secondary)
            .disabled(flow.busy != nil || !online)
            // The system share sheet with the text message and link (Expo's `Share.share`).
            .sheet(
                isPresented: Binding(
                    get: { flow.share != nil && sharingFrom == reportId },
                    set: { if !$0 { flow.shareFinished() } })
            ) {
                ShareSheet(text: flow.share ?? "")
            }
        }
    }

    /// A local write that failed.
    private struct SaveAlert: ViewModifier {
        @Bindable var flow: ReportFlow

        func body(content: Content) -> some View {
            content
                .alert(
                    "Couldn’t Save",
                    isPresented: Binding(get: { flow.saveError != nil }, set: { if !$0 { flow.saveError = nil } })
                ) {
                    Button("OK") { flow.saveError = nil }
                } message: {
                    Text(flow.saveError ?? "")
                }
        }
    }

    /// The system share sheet with the text message (Expo's `Share.share`).
    private struct ShareSheet: UIViewControllerRepresentable {
        var text: String

        func makeUIViewController(context: Context) -> UIActivityViewController {
            UIActivityViewController(activityItems: [text], applicationActivities: nil)
        }

        func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
    }

    /// A button title, or a spinner while its call runs.
    private struct BusyLabel: View {
        var title: String
        var busy: Bool

        var body: some View {
            if busy {
                ProgressView().accessibilityLabel(title)
            } else {
                Text(title)
            }
        }
    }

    /// Primary or secondary pill.
    private struct KindStyle: ViewModifier {
        var primary: Bool

        func body(content: Content) -> some View {
            if primary { content.buttonStyle(.primary) } else { content.buttonStyle(.secondary) }
        }
    }

    /// Buttons and notices sit on the page, not in white rows.
    private struct ButtonRows: ViewModifier {
        func body(content: Content) -> some View {
            content
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        }
    }

    extension View {
        /// An email address field with no capitals, corrections, or autofill.
        fileprivate func emailField() -> some View {
            self.keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(nil)
        }
    }
#endif
