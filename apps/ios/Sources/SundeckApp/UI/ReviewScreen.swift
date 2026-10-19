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
                    List {
                        Notice(kind: .warning, text: "This job isn’t on this phone.")
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }
                    .listStyle(.insetGrouped)
                } else if let summary, let form {
                    content(summary, form)
                } else {
                    // Not loaded yet. Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.clear
                }
            }
            .navigationTitle("Review and Sign")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: sync.revision) { load() }
        }

        private func binding<T>(_ key: WritableKeyPath<SignatureForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // The page scrolls, but holds still while a finger is on the pad.
        private func content(_ summary: ReviewSummary, _ form: SignatureForm) -> some View {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(summary.companyName).font(.subheadline).foregroundStyle(Color.muted)
                        Text(summary.title).font(.title2.weight(.bold))
                        Text(summary.customerText).font(.headline)
                        if !summary.address.isEmpty {
                            Text(summary.address).font(.subheadline)
                        }
                        Text(Date.now.formatted(date: .numeric, time: .omitted))
                            .font(.subheadline).foregroundStyle(Color.muted)
                    }
                    .padding(.vertical, 4)
                } header: {
                    Text(ReviewSummary.intro).font(.subheadline).foregroundStyle(Color.muted).textCase(nil)
                }

                if summary.sections.isEmpty {
                    Section { Notice(kind: .info, text: ReviewSummary.summaryLater) }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                } else {
                    ForEach(summary.sections, id: \.key) { section in
                        Section {
                            Text(section.text)
                        } header: {
                            Text(section.title).font(.headline).foregroundStyle(.primary).textCase(nil)
                        }
                    }
                }

                Section {
                    Text(summary.tallyText)
                    if let pending = summary.pendingText {
                        Text(pending).font(.subheadline).foregroundStyle(Color.muted)
                    }
                } header: {
                    heading("Checklist")
                }

                if !summary.findings.isEmpty {
                    Section {
                        ForEach(summary.findings) { line in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.title).font(.body.weight(.semibold))
                                if !line.detail.isEmpty {
                                    Text(line.detail).font(.subheadline).foregroundStyle(Color.muted)
                                }
                            }
                            .accessibilityElement(children: .combine)
                        }
                    } header: {
                        heading("Findings")
                    }
                }

                if !summary.tests.isEmpty {
                    Section {
                        ForEach(summary.tests) { test in
                            HStack {
                                Text(test.name)
                                Spacer()
                                OutcomeChip(outcome: test.outcome)
                            }
                            .frame(minHeight: minTarget)
                            .accessibilityElement(children: .combine)
                        }
                    } header: {
                        heading("Tests")
                    }
                }

                signOff(summary, form)
            }
            .listStyle(.insetGrouped)
            .scrollDisabled(drawing)
            .scrollDismissesKeyboard(.interactively)
        }

        private func heading(_ text: String) -> some View {
            Text(text).font(.headline).foregroundStyle(.primary).textCase(nil)
        }

        @ViewBuilder private func signOff(_ summary: ReviewSummary, _ form: SignatureForm) -> some View {
            if let pending = summary.pendingNotice {
                Section { Notice(kind: .warning, text: pending) }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            } else if summary.showsSignOff {
                Section {
                    if form.showsPicker {
                        Picker(form.pickerLabel, selection: binding(\.purpose, nil)) {
                            ForEach(form.purposes, id: \.value) { Text($0.label).tag(Optional($0.value)) }
                        }
                        .frame(minHeight: minTarget)
                    }
                    if let purpose = form.purpose {
                        Text(summary.statement(purpose)).font(.title3).padding(.vertical, 4)
                    }
                } header: {
                    Text("Please Sign").font(.title2.weight(.bold)).foregroundStyle(.primary).textCase(nil)
                }
                // The customer types here, so iPhone doesn't offer the tech's own name.
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(form.nameLabel).font(.subheadline.weight(.semibold))
                        TextField("", text: binding(\.nameText, ""))
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .textContentType(nil)
                            .focused($focus, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focus = .role }
                            .accessibilityLabel(form.nameLabel)
                    }
                    .padding(.vertical, 4)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Role (optional)").font(.subheadline.weight(.semibold))
                        TextField(SignatureForm.rolePlaceholder, text: binding(\.role, ""))
                            .textInputAutocapitalization(.sentences)
                            .textContentType(nil)
                            .focused($focus, equals: .role)
                            .submitLabel(.done)
                            .onSubmit { focus = nil }
                            .accessibilityLabel("Role (optional)")
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    SignaturePad(strokes: form.strokes, onChange: { self.form?.draw($0) }, drawing: $drawing)
                        .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 4, trailing: 12))
                }
            }

            if let error = form.error {
                Section { Notice(kind: .error, text: error) }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }

            if summary.showsButtons {
                Section {
                    VStack(spacing: 12) {
                        Button {
                            finish(customerAway: false)
                        } label: {
                            if busy == .sign { ProgressView().tint(Color.onPrimary) } else { Text(summary.signTitle) }
                        }
                        .buttonStyle(.primary)
                        if summary.showsCustomerNotHere {
                            Text(ReviewSummary.awayNote)
                                .font(.subheadline).foregroundStyle(Color.muted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button {
                                finish(customerAway: true)
                            } label: {
                                if busy == .away { ProgressView() } else { Text("Customer Not Here") }
                            }
                            .buttonStyle(.secondary)
                        }
                    }
                    .disabled(busy != nil)
                }
                .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
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
                    jobId: jobId, location: { await LocationLookup.shared.currentPosition() },
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
