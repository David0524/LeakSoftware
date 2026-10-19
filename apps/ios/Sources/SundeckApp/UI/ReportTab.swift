#if os(iOS)
    import SafariServices
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// Wrap-Up's "Report and Sign-Off" and "Signatures" (spec 5.4 Wrap-Up, BUILD_PLAN 6.2 to 6.5):
    /// the report card (write, read and edit the draft, review with the customer, send, versions),
    /// then the job's signatures. Content for the job page's scroll view. Port of
    /// apps/mobile/src/features/report/ReportTab.tsx with the website's look
    /// (apps/web/src/components/report-panel.tsx).
    struct ReportTab: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var flow: ReportFlow?

        init(job: JobView) { self.job = job }

        // Worked out on every render: reading `sync.revision` re-renders after any write or pull.
        var body: some View {
            let _ = sync.revision
            if let company = session.company, let flow, flow.jobId == job.id {
                let model = ReportTabModel(
                    store: sync.store, companyId: company.id, settings: company.settings, job: job,
                    template: flow.template, timeZone: TimeZone(identifier: company.timeZone) ?? .current)
                VStack(alignment: .leading, spacing: 32) {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading("Report and Sign-Off")
                        if model.showsTip, let tip = app.walkthrough.tip(screen: "report", company: company, pkg: .leak)
                        {
                            TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) }
                        }
                        if model.templates.isEmpty {
                            EmptyState(text: "The shop turned off the homeowner report.")
                        } else {
                            Text(ReportTabModel.intro).textRole(.secondary).foregroundStyle(Color.textMuted)
                            ReportCard(job: job, model: model, flow: flow)
                        }
                    }
                    SignaturesPart(job: job, model: model, flow: flow)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if let company = session.company {
                // SwiftUI never runs onAppear on an empty view, so loading shows a real view.
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: minTarget)
                    .onAppear {
                        flow = ReportFlow(sync: sync, companyId: company.id, jobId: job.id, settings: company.settings)
                    }
            }
        }
    }

    // MARK: - The report card

    /// The report card (spec 5.4 Wrap-Up 1).
    private struct ReportCard: View {
        var job: JobView
        var model: ReportTabModel
        @Bindable var flow: ReportFlow

        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var open = false
        @State private var confirmWriteAgain = false
        @State private var showUnsigned = false
        @State private var savedText = false
        @State private var browsing: BrowsedPage?
        /// The version whose Send by Text opened the share sheet.
        @State private var sharingFrom: String?
        @FocusState private var focus: Field?

        enum Field: Hashable {
            case section(String)
            case email(String)
        }

        private var server: ReportServer { ReportServer(sync: sync, api: app.api) }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                titleRow
                if !model.online {
                    Notice(kind: .warning, text: ReportTabModel.offlineNotice)
                } else {
                    writeButtons
                }
                if let error = flow.error, error.at == .draft { Notice(kind: .error, text: error.text) }
                if let message = flow.message { Notice(kind: .success, text: message) }
                if model.hasDraftText, let draft = model.draft {
                    if open {
                        draftBody(draft)
                    } else if let collapsed = model.collapsedText {
                        Text(collapsed).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                if let texted = flow.texted {
                    CopyBox(label: ReportTabModel.textedLabel, text: texted, button: "Copy Message")
                }
                if let title = model.finishedTitle, let finished = model.finished {
                    Hairline().padding(.top, 12)
                    Text(title).textRole(.bodyMedium).foregroundStyle(Color.text)
                    Text(ReportTabModel.finishedNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                    sendControls(reportId: finished.id, primary: model.finishedEmailIsPrimary)
                    if let error = flow.error, error.at == .send, !showUnsigned {
                        Notice(kind: .error, text: error.text)
                    }
                    if let pdf = model.pdfURL() {
                        Button("Download PDF") { browsing = BrowsedPage(url: pdf) }.buttonStyle(.quiet).padding(
                            .leading, -20)
                    }
                }
                if !model.versions.isEmpty { versions }
            }
            .card()
            .onAppear { if model.hasDraftText && flow.message != nil { open = true } }
            .onChange(of: flow.busy) { old, _ in
                // Write Draft opens the draft it wrote.
                if old == .draft, flow.error == nil { open = true }
            }
            .browser($browsing)
            .alert(
                "Couldn’t Save",
                isPresented: Binding(get: { flow.saveError != nil }, set: { if !$0 { flow.saveError = nil } })
            ) {
                Button("OK") { flow.saveError = nil }
            } message: {
                Text(flow.saveError ?? "")
            }
        }

        /// "Homeowner report", Show/Hide Draft, View version n.
        private var titleRow: some View {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) { titleParts }
                VStack(alignment: .leading, spacing: 4) { titleParts }
            }
        }

        @ViewBuilder private var titleParts: some View {
            CardTitle(model.templateName)
            Spacer(minLength: 0)
            if model.hasDraftText {
                Button {
                    flow.saveEdits()
                    withAnimation { open.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(open ? "Hide Draft" : "Show Draft")
                        Image(systemName: "chevron.down").font(.footnote.weight(.semibold))
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .font(.role(.bodyEmphasis))
                    .foregroundStyle(Color.link)
                    .frame(minHeight: minTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
            }
            if let latest = model.viewLatest, let url = latest.url {
                Button {
                    browsing = BrowsedPage(url: url)
                } label: {
                    Text(latest.viewLabel).textRole(.body).underline().foregroundStyle(Color.link)
                        .frame(minHeight: minTarget)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isLink)
            }
        }

        @ViewBuilder private var writeButtons: some View {
            HStack(spacing: 12) {
                Button {
                    if flow.writeNeedsConfirmation {
                        confirmWriteAgain = true
                    } else {
                        Task { await flow.run(.draft, server: server) }
                    }
                } label: {
                    BusyButtonLabel(model.writeTitle, busy: flow.busy == .draft, busyTitle: "Writing…")
                }
                .modifier(KindStyle(primary: model.writeIsPrimary))
                .disabled(flow.busy != nil)
                // Before a draft, the customer can still review and sign offline; the server writes
                // the draft when the report is finished.
                if model.showsReviewBeforeDraft {
                    Button(ReportTabModel.reviewWithCustomer) { openRoute(.review(jobId: job.id)) }
                        .buttonStyle(.secondary)
                        .disabled(flow.busy != nil)
                }
            }
            .confirmationDialog("Write the draft again?", isPresented: $confirmWriteAgain, titleVisibility: .visible) {
                Button("Replace Draft", role: .destructive) { Task { await flow.run(.draft, server: server) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The new draft replaces this one, including your edits.")
            }
        }

        // MARK: Draft

        @ViewBuilder private func draftBody(_ draft: ReportRecord) -> some View {
            if let problems = model.problemsText { Notice(kind: .warning, text: problems) }
            ForEach(model.sections, id: \.key) { section in
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel(section.title)
                    TextField(
                        "",
                        text: Binding(
                            get: { flow.sectionText(section) },
                            set: {
                                flow.edits[section.key] = $0
                                savedText = false
                            }),
                        axis: .vertical
                    )
                    .lineLimit(3...)
                    .focused($focus, equals: .section(section.key))
                    .accessibilityLabel(section.title)
                    .fieldBox(focused: focus == .section(section.key), minHeight: 96)
                }
                .id("\(draft.id)-\(section.key)")
            }
            HStack(spacing: 12) {
                Button("Save Text") {
                    focus = nil
                    flow.saveEdits()
                    savedText = flow.saveError == nil
                }
                .buttonStyle(.secondary)
                if savedText {
                    Text("Saved.").textRole(.secondary).foregroundStyle(Color.pass)
                }
            }
            .onChange(of: focus) { old, _ in
                // Every pending edit is saved in one write when a section loses focus.
                if case .section = old { flow.saveEdits() }
            }

            Hairline().padding(.top, 12)
            if let title = model.finishTitle {
                Text(title).textRole(.bodyMedium).foregroundStyle(Color.text)
            }
            Text(model.finishNote).textRole(.secondary).foregroundStyle(Color.textMuted)
            if model.finishesWithSignature {
                Button {
                    Task { await flow.run(.finish, server: server) }
                } label: {
                    BusyButtonLabel(ReportTabModel.finishReport, busy: flow.busy == .finish, busyTitle: "Finishing…")
                }
                .buttonStyle(.primary)
                .disabled(flow.busy != nil || !model.online)
            } else {
                Button(ReportTabModel.reviewWithCustomer) {
                    flow.saveEdits()
                    // The sign-off finishes the report: the job needs its pool photo first.
                    if flow.canReview() { openRoute(.review(jobId: job.id)) }
                }
                .buttonStyle(.primary)
                .disabled(flow.busy != nil)
            }
            if let error = flow.error, error.at == .finish {
                if flow.photoNeeded { FinishPhotoNotice(jobId: job.id) } else { Notice(kind: .error, text: error.text) }
            }
            Button {
                withAnimation { showUnsigned.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Text(ReportTabModel.sendWithoutSignature)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                        .rotationEffect(.degrees(showUnsigned ? 90 : 0))
                }
                .font(.role(.bodyEmphasis))
                .foregroundStyle(Color.link)
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(showUnsigned ? "Expanded" : "Collapsed")
            if showUnsigned {
                Text(ReportTabModel.sendWithoutSignatureNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                sendControls(reportId: draft.id, primary: false)
                if let error = flow.error, error.at == .send {
                    if flow.photoNeeded {
                        FinishPhotoNotice(jobId: job.id)
                    } else {
                        Notice(kind: .error, text: error.text)
                    }
                }
            }
        }

        // MARK: Sending

        /// Customer email, Send by Email and Send by Text (spec 5.4). The field holds the
        /// customer's address, so iPhone doesn't offer to fill in the tech's own.
        @ViewBuilder private func sendControls(reportId: String, primary: Bool) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Customer email")
                TextField("", text: Binding(get: { flow.emailText(model) }, set: { flow.to = $0 }))
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(nil)
                    .submitLabel(.done)
                    .focused($focus, equals: .email(reportId))
                    .accessibilityLabel("Customer email")
                    .fieldBox(focused: focus == .email(reportId))
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { sendButtons(reportId: reportId, primary: primary) }
                VStack(alignment: .leading, spacing: 12) { sendButtons(reportId: reportId, primary: primary) }
            }
            .sheet(
                isPresented: Binding(
                    get: { flow.share != nil && sharingFrom == reportId },
                    set: { if !$0 { flow.shareFinished() } })
            ) {
                ShareSheet(text: flow.share ?? "")
            }
        }

        @ViewBuilder private func sendButtons(reportId: String, primary: Bool) -> some View {
            Button {
                focus = nil
                Task { await flow.run(.email, reportId: reportId, server: server) }
            } label: {
                BusyButtonLabel("Send by Email", busy: flow.busy == .email, busyTitle: "Sending…")
            }
            .modifier(KindStyle(primary: primary))
            .disabled(flow.busy != nil || !model.online)
            Button {
                focus = nil
                sharingFrom = reportId
                Task { await flow.run(.text, reportId: reportId, server: server) }
            } label: {
                BusyButtonLabel("Send by Text", busy: flow.busy == .text, busyTitle: "Sending…")
            }
            .buttonStyle(.secondary)
            .disabled(flow.busy != nil || !model.online)
        }

        // MARK: Versions

        private var versions: some View {
            VStack(alignment: .leading, spacing: 4) {
                Hairline().padding(.vertical, 12)
                Text("Versions").textRole(.bodyMedium).foregroundStyle(Color.text)
                ForEach(Array(model.versions.enumerated()), id: \.element.id) { index, version in
                    if index > 0 { Hairline() }
                    VStack(alignment: .leading, spacing: 0) {
                        Text(version.label).textRole(.secondary).foregroundStyle(Color.text)
                        if let url = version.url {
                            HStack(spacing: 4) {
                                Button("Report") { browsing = BrowsedPage(url: url) }
                                    .buttonStyle(.quiet(size: .small))
                                    .accessibilityLabel("Version \(version.version) report")
                                if let pdf = version.pdfURL {
                                    Button("PDF") { browsing = BrowsedPage(url: pdf) }
                                        .buttonStyle(.quiet(size: .small))
                                        .accessibilityLabel("Version \(version.version) PDF")
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    // MARK: - Signatures

    /// "Signatures" (spec 5.4 Wrap-Up 2): a card per signature with its drawing, who, why and
    /// when, and Remove; then Sign Work Authorization when the shop uses its own sheet.
    private struct SignaturesPart: View {
        var job: JobView
        var model: ReportTabModel
        var flow: ReportFlow
        @Environment(\.openRoute) private var openRoute
        @State private var removing: SignatureRow?

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Signatures")
                if model.signatures.isEmpty {
                    Text(ReportTabModel.noSignatures).textRole(.body).foregroundStyle(Color.textMuted)
                }
                ForEach(model.signatures) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        SignatureImage(signatureId: s.id, imagePath: s.imagePath)
                            .frame(height: 80)
                            .frame(maxWidth: .infinity)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            .padding(.bottom, 4)
                            .accessibilityLabel("Signature of \(s.name)")
                        (Text(s.name).font(.role(.bodyEmphasis)).foregroundColor(Color.text)
                            + Text(s.role.map { " · \($0)" } ?? "").font(.role(.body)).foregroundColor(Color.textMuted))
                        Text(s.subtitle).textRole(.secondary).foregroundStyle(Color.textMuted)
                        Button("Remove") { removing = s }
                            .buttonStyle(.quiet)
                            .padding(.leading, -20)
                            .accessibilityLabel(s.removeLabel)
                    }
                    .card(padding: 16)
                }
                if model.ownSheet {
                    Button(ReportTabModel.signWorkAuthorization) { openRoute(.signature(jobId: job.id, quoteId: nil)) }
                        .buttonStyle(.secondary)
                }
            }
            .confirmationDialog(
                removing?.removeTitle ?? "",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { s in
                Button("Remove Signature", role: .destructive) { flow.removeSignature(s.id) }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("Reports already finished keep it; new versions won’t show it.")
            }
        }
    }

    /// A saved signature, drawn from its SVG: this phone's copy, else the uploaded one.
    struct SignatureImage: View {
        var signatureId: String
        var imagePath: String?
        @Environment(SyncService.self) private var sync
        @Environment(\.mediaURLSigner) private var signer
        @State private var drawing: SignatureDrawing?

        var body: some View {
            Canvas { context, size in
                guard let drawing else { return }
                let box = drawing.viewBox
                let scale = min(size.width / box[2], size.height / box[3])
                let dx = (size.width - box[2] * scale) / 2 - box[0] * scale
                let dy = (size.height - box[3] * scale) / 2 - box[1] * scale
                let transform = CGAffineTransform(translationX: dx, y: dy).scaledBy(x: scale, y: scale)
                for d in drawing.paths {
                    context.stroke(
                        svgPath(d).applying(transform), with: .color(Color(white: 0.07)),
                        style: StrokeStyle(lineWidth: max(1.5, 3 * scale), lineCap: .round, lineJoin: .round))
                }
            }
            .task(id: signatureId) { await load() }
        }

        private func load() async {
            if let files = sync.media,
                let text = try? String(
                    contentsOf: files.url(SignatureDrawing.localPath(signatureId)), encoding: .utf8)
            {
                drawing = parseSignatureSVG(text)
                return
            }
            guard let imagePath, let signer, let url = try? await signer.url(imagePath),
                let (data, _) = try? await URLSession.shared.data(from: url)
            else { return }
            drawing = parseSignatureSVG(String(decoding: data, as: UTF8.self))
        }

        private func svgPath(_ d: String) -> Path {
            var path = Path()
            for command in svgCommands(d) {
                switch command {
                case .move(let p): path.move(to: CGPoint(x: p.x, y: p.y))
                case .line(let p): path.addLine(to: CGPoint(x: p.x, y: p.y))
                case .curve(let a, let b, let p):
                    path.addCurve(
                        to: CGPoint(x: p.x, y: p.y), control1: CGPoint(x: a.x, y: a.y),
                        control2: CGPoint(x: b.x, y: b.y))
                case .close: path.closeSubpath()
                }
            }
            return path
        }
    }

    // MARK: - Shared pieces

    /// A read-only outlined box with a link or message and a Copy button, plus Share (spec 5.4:
    /// the customer link row; "Message to text the customer" with Copy Message).
    struct CopyBox: View {
        var label: String?
        var text: String
        var button = "Copy Link"
        var monospaced = false
        @State private var copied = false

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                if let label { FieldLabel(label) }
                HStack(spacing: 8) {
                    Text(text)
                        .font(monospaced ? .system(.body, design: .monospaced) : .role(.body))
                        .foregroundStyle(Color.text)
                        .lineLimit(monospaced ? 1 : 4)
                        .truncationMode(.tail)
                        .textSelection(.enabled)
                        .fieldBox()
                    Button(copied ? "Copied" : button) {
                        UIPasteboard.general.string = text
                        copied = true
                    }
                    .buttonStyle(.secondary)
                    .fixedSize()
                    ShareLink(item: text) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Color.link)
                            .frame(width: minTarget, height: minTarget)
                            .background(Circle().fill(Color.iconTint))
                    }
                    .accessibilityLabel("Share")
                }
            }
            .sensoryFeedback(.success, trigger: copied)
        }
    }

    /// The website's pages (reports, PDFs, customer links) in the in-app browser.
    struct SafariView: UIViewControllerRepresentable {
        var url: URL

        func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
        func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
    }

    /// The system share sheet with a text message (Expo's `Share.share`).
    struct ShareSheet: UIViewControllerRepresentable {
        var text: String

        func makeUIViewController(context: Context) -> UIActivityViewController {
            UIActivityViewController(activityItems: [text], applicationActivities: nil)
        }

        func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
    }

    /// Primary or secondary pill.
    struct KindStyle: ViewModifier {
        var primary: Bool

        func body(content: Content) -> some View {
            if primary { content.buttonStyle(.primary) } else { content.buttonStyle(.secondary) }
        }
    }

    /// A website page to show in the in-app browser.
    struct BrowsedPage: Identifiable {
        var url: URL
        var id: String { url.absoluteString }
    }

    extension View {
        /// Shows `page` in the in-app browser while it's set.
        func browser(_ page: Binding<BrowsedPage?>) -> some View {
            sheet(item: page) { SafariView(url: $0.url).ignoresSafeArea() }
        }
    }
#endif
