#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Capture a customer's signature on the job; with a quote, the customer accepts it on site.
    /// Works offline; the drawing uploads later. Port of
    /// apps/mobile/src/app/(app)/jobs/[id]/signature.tsx.
    struct SignatureScreen: View {
        var jobId: String
        var quoteId: String?

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var form: SignatureForm?
        @State private var missing = false
        @State private var saving = false
        @State private var drawing = false
        @State private var saved = 0
        @FocusState private var focus: Field?

        enum Field { case name, role }

        init(jobId: String, quoteId: String?) {
            self.jobId = jobId
            self.quoteId = quoteId
        }

        var body: some View {
            Group {
                if missing {
                    notice("This job isn’t on this phone.")
                } else if let form {
                    if form.isOff {
                        notice("Signatures are turned off in your company settings.")
                    } else {
                        content(form)
                    }
                } else {
                    // Not loaded yet. Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.clear
                }
            }
            .navigationTitle("Signature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .task(id: sync.revision) { load() }
            .sensoryFeedback(.success, trigger: saved)
        }

        private func notice(_ text: String) -> some View {
            ScreenScroll { Notice(kind: .warning, text: text) }
        }

        private func binding<T>(_ key: WritableKeyPath<SignatureForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // The page scrolls (Sign must stay reachable on small phones and with the keyboard up), but
        // holds still while a finger is on the pad, so a drag draws instead of moving the page.
        private func content(_ form: SignatureForm) -> some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 16) {
                        if let heading = form.heading { CardTitle(heading) }
                        if form.showsPicker {
                            SelectField(
                                label: form.pickerLabel, selection: binding(\.purpose, nil),
                                options: form.purposes.map { Optional($0.value) },
                                optionLabel: { value in form.purposes.first { $0.value == value }?.label ?? "Choose…" })
                        }
                        // The signer is the customer, so iPhone doesn't offer to fill in the tech's own name.
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel(form.nameLabel)
                            TextField("", text: binding(\.nameText, ""))
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

                    if let error = form.error { Notice(kind: .error, text: error) }

                    Button {
                        save()
                    } label: {
                        BusyButtonLabel("Sign", busy: saving, busyTitle: "Saving…")
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(saving)
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.vertical, 16)
            }
            .background(Color.bg)
            .scrollDisabled(drawing)
            .scrollDismissesKeyboard(.interactively)
        }

        private func load() {
            guard let company = session.company else { return }
            guard let job = try? sync.store.get("job", jobId) else {
                missing = true
                return
            }
            missing = false
            if form == nil {
                form = SignatureForm.forJob(
                    .signature(quoteId: quoteId), sync.store, jobId: jobId, settings: company.settings)
            } else {
                form?.customerName = jobCustomerName(sync.store, job)
            }
        }

        private func save() {
            guard var current = form, !saving, let company = session.company else { return }
            focus = nil
            guard current.validate() else {
                form = current
                return
            }
            saving = true
            Task {
                let place = await LocationLookup.shared.currentPosition()
                do {
                    try current.save(sync, companyId: company.id, jobId: jobId, at: place)
                    saved += 1
                    dismiss()
                } catch {
                    form?.error = String(describing: error)
                    saving = false
                }
            }
        }
    }
#endif
