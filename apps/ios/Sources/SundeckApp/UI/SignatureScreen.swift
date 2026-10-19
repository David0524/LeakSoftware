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
            .task(id: sync.revision) { load() }
            .sensoryFeedback(.success, trigger: saved)
        }

        private func notice(_ text: String) -> some View {
            List {
                Notice(kind: .warning, text: text).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
            .listStyle(.insetGrouped)
        }

        private func binding<T>(_ key: WritableKeyPath<SignatureForm, T>, _ fallback: T) -> Binding<T> {
            Binding(get: { self.form?[keyPath: key] ?? fallback }, set: { self.form?[keyPath: key] = $0 })
        }

        // The page scrolls (Save must stay reachable on small phones and with the keyboard up), but
        // holds still while a finger is on the pad, so a drag draws instead of moving the page.
        private func content(_ form: SignatureForm) -> some View {
            List {
                Section {
                    if form.showsPicker {
                        Picker(form.pickerLabel, selection: binding(\.purpose, nil)) {
                            ForEach(form.purposes, id: \.value) { Text($0.label).tag(Optional($0.value)) }
                        }
                        .frame(minHeight: minTarget)
                    }
                    // The signer is the customer, so iPhone doesn't offer to fill in the tech's own name.
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
                } header: {
                    if let heading = form.heading {
                        Text(heading).font(.headline).foregroundStyle(.primary).textCase(nil)
                    }
                }

                Section("Signature") {
                    SignaturePad(
                        strokes: form.strokes, onChange: { self.form?.draw($0) }, drawing: $drawing
                    )
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 4, trailing: 12))
                }

                if let error = form.error {
                    Section { Notice(kind: .error, text: error) }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }

                Section {
                    Button {
                        save()
                    } label: {
                        if saving { ProgressView().tint(Color.onPrimary) } else { Text("Save Signature") }
                    }
                    .buttonStyle(.primary)
                    .disabled(saving)
                }
                .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
            .listStyle(.insetGrouped)
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
