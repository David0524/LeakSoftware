#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Review with Customer: the customer reads the report on the tech's phone and signs at the
    /// bottom; signing finishes the report. Works offline: the report is built from this phone's
    /// data, without the written summary until the draft is written, and the report is finished
    /// once the phone is back online. Port of apps/mobile/src/app/(app)/jobs/[id]/review.tsx.
    struct ReviewScreen: View {
        var jobId: String

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var summary: ReviewSummary?
        @State private var form: SignatureForm?
        @State private var missing = false
        @State private var busy: Busy?
        @State private var drawing = false
        @FocusState private var focus: Field?

        enum Field { case name, role }
        enum Busy { case sign, away }

        init(jobId: String) { self.jobId = jobId }

        var body: some View {
            Group {
                if missing {
                    ScreenScroll { Notice(kind: .warning, text: "This job isn’t on this phone.") }
                } else if let summary, let form {
                    content(summary, form)
                } else {
                    // Not loaded yet. Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.clear
                }
            }
            .navigationTitle("Review and Sign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .task(id: sync.revision) { load() }
        }

        private func binding<T>(_ key: WritableKeyPath<SignatureForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // The page scrolls, but holds still while a finger is on the pad.
        private func content(_ summary: ReviewSummary, _ form: SignatureForm) -> some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(ReviewSummary.intro).textRole(.secondary).foregroundStyle(Color.textMuted)
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(summary.companyName).textRole(.secondary).foregroundStyle(Color.textMuted)
                            Text(summary.title).textRole(.sectionHeading).foregroundStyle(Color.text)
                            Text(summary.customerText).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            if !summary.address.isEmpty {
                                Text(summary.address).textRole(.secondary).foregroundStyle(Color.text)
                            }
                            Text(Date.now.formatted(date: .abbreviated, time: .omitted))
                                .textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        if summary.sections.isEmpty {
                            Notice(kind: .info, text: ReviewSummary.summaryLater)
                        }
                        // The homeowner report's blocks, in its order (REPORT_BLOCKS).
                        ForEach(Array(summary.blocks.enumerated()), id: \.offset) { _, block in
                            reviewBlock(block)
                        }
                    }
                    .card()

                    signOff(summary, form)
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.vertical, 16)
            }
            .background(Color.bg)
            .scrollDisabled(drawing)
            .scrollDismissesKeyboard(.interactively)
        }

        @ViewBuilder private func reviewBlock(_ block: ReviewSummary.Block) -> some View {
            switch block {
            case .section(let section):
                VStack(alignment: .leading, spacing: 4) {
                    SubHeading(section.title)
                    Text(section.text).textRole(.body).foregroundStyle(Color.text)
                }
            case .findings(let title, let text, let lines):
                VStack(alignment: .leading, spacing: 8) {
                    SubHeading(title)
                    if let text, !text.isEmpty { Text(text).textRole(.body).foregroundStyle(Color.text) }
                    ForEach(lines) { line in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            if !line.detail.isEmpty {
                                Text(line.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            case .coverage(let tally, let pending):
                VStack(alignment: .leading, spacing: 4) {
                    SubHeading("What we checked")
                    Text(tally).textRole(.body).foregroundStyle(Color.text)
                    if let pending { Text(pending).textRole(.secondary).foregroundStyle(Color.textMuted) }
                }
            case .tests(let title, let text, let lines):
                VStack(alignment: .leading, spacing: 4) {
                    SubHeading(title)
                    if let text, !text.isEmpty { Text(text).textRole(.body).foregroundStyle(Color.text) }
                    // A phone-width table: each test with where and its result under it, the pill
                    // on the right (the website's Test, Where, Result, Outcome columns).
                    ForEach(Array(lines.enumerated()), id: \.element.id) { index, test in
                        if index > 0 { Hairline() }
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(test.name).textRole(.body).foregroundStyle(Color.text)
                                let detail = [test.place, test.result].compactMap { $0 }.joined(separator: " · ")
                                if !detail.isEmpty {
                                    Text(detail).textRole(.secondary).monospacedDigit().foregroundStyle(
                                        Color.textMuted)
                                }
                            }
                            Spacer(minLength: 0)
                            Chip(text: test.pill.label, tone: test.pill.tone.tone)
                        }
                        .padding(.vertical, 6)
                        .frame(minHeight: minTarget)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }

        @ViewBuilder private func signOff(_ summary: ReviewSummary, _ form: SignatureForm) -> some View {
            if let pending = summary.pendingNotice {
                Notice(kind: .warning, text: pending)
            } else if summary.showsSignOff {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let purpose = form.purpose,
                            let label = form.purposes.first(where: { $0.value == purpose })?.label
                        {
                            Text(label).font(.role(.secondary).weight(.semibold)).foregroundStyle(Color.textMuted)
                        }
                        Text("Please Sign").textRole(.largeTitle).foregroundStyle(Color.text)
                            .accessibilityAddTraits(.isHeader)
                    }
                    if form.showsPicker {
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel(form.pickerLabel)
                            Segmented(
                                selection: binding(\.purpose, nil), options: form.purposes.map { Optional($0.value) },
                                label: { value in form.purposes.first { $0.value == value }?.label ?? "" },
                                title: form.pickerLabel, fillsWidth: true)
                        }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        if let purpose = form.purpose {
                            Text(summary.statement(purpose)).font(.system(size: 19)).foregroundStyle(Color.text)
                        }
                        // The customer types here, so iPhone doesn't offer the tech's own name.
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel(form.nameLabel)
                            TextField(
                                "", text: binding(\.nameText, ""),
                                prompt: Text("Full name").foregroundStyle(Color.placeholder)
                            )
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .textContentType(nil)
                            .focused($focus, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focus = .role }
                            .accessibilityLabel(form.nameLabel)
                            .fieldBox(focused: focus == .name)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel("Role (optional)")
                            TextField(
                                "", text: binding(\.role, ""),
                                prompt: Text(SignatureForm.rolePlaceholder).foregroundStyle(Color.placeholder)
                            )
                            .textInputAutocapitalization(.sentences)
                            .textContentType(nil)
                            .focused($focus, equals: .role)
                            .submitLabel(.done)
                            .onSubmit { focus = nil }
                            .accessibilityLabel("Role (optional)")
                            .fieldBox(focused: focus == .role)
                        }
                    }
                    .card()
                    SignaturePad(strokes: form.strokes, onChange: { self.form?.draw($0) }, drawing: $drawing)
                }
            }

            if let error = form.error {
                if error == finishPhotoMessage {
                    FinishPhotoNotice(jobId: jobId)
                } else {
                    Notice(kind: .error, text: error)
                }
            }

            if summary.showsButtons {
                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        finish(customerAway: false)
                    } label: {
                        BusyButtonLabel(summary.signTitle, busy: busy == .sign, busyTitle: "Saving…")
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    if summary.showsCustomerNotHere {
                        Hairline().padding(.top, 4)
                        Text(ReviewSummary.awayNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                        Button {
                            finish(customerAway: true)
                        } label: {
                            BusyButtonLabel("Customer Not Here", busy: busy == .away, busyTitle: "Finishing…")
                        }
                        .buttonStyle(.quiet)
                        .padding(.leading, -20)
                    }
                }
                .disabled(busy != nil)
            }
        }

        private func load() {
            guard let company = session.company else { return }
            guard
                let current = ReviewSummary(
                    sync.store, companyId: company.id, companyName: company.name, settings: company.settings,
                    jobId: jobId)
            else {
                missing = true
                return
            }
            missing = false
            summary = current
            if form == nil {
                form = SignatureForm(.review, settings: company.settings, customerName: current.customerName)
            } else {
                form?.customerName = current.customerName
            }
        }

        private func finish(customerAway: Bool) {
            guard var current = form, let summary, busy == nil, let company = session.company else { return }
            focus = nil
            busy = customerAway ? .away : .sign
            let server = ReportServer(sync: sync, api: app.api)
            Task {
                let result = await ReviewFinish.run(
                    &current, customerAway: customerAway, summary: summary, sync: sync, companyId: company.id,
                    jobId: jobId,
                    photoBlock: finishPhotoBlock(sync.store, settings: company.settings, jobId: jobId),
                    location: { await LocationLookup.shared.currentPosition() },
                    finish: { reportId, away in _ = try await server.finish(reportId: reportId, customerAway: away) })
                form?.error = current.error
                switch result {
                case .back:
                    dismiss()
                case .stay:
                    busy = nil
                }
            }
        }
    }
#endif
