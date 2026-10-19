#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// More › Help › Request a Feature (owner, 2026-10-19): a sheet with one box and Send Request,
    /// then the thanks and Done. Offline or refused, it says why and keeps what was typed. Port of
    /// apps/web/src/components/feature-request.tsx.
    struct FeatureRequestSheet: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var form = FeatureRequestForm()
        @FocusState private var focused: Bool

        var body: some View {
            FormSheet(title: FeatureRequestForm.title, dirty: form.sent == nil && !form.text.isEmpty) {
                if let sent = form.sent {
                    Notice(kind: .success, text: sent)
                    Button("Done") { dismiss() }.buttonStyle(.primary(fullWidth: true))
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(FeatureRequestForm.prompt).textRole(.body).foregroundStyle(Color.text)
                        TextField(
                            "", text: $form.text,
                            prompt: Text(FeatureRequestForm.placeholder).foregroundStyle(Color.placeholder),
                            axis: .vertical
                        )
                        .lineLimit(6...14)
                        .textRole(.body)
                        .foregroundStyle(Color.text)
                        .focused($focused)
                        .fieldBox(error: form.fieldError != nil, focused: focused, minHeight: 150)
                        .accessibilityLabel(FeatureRequestForm.prompt)
                        .onChange(of: form.text) { _, text in
                            if text.count > FeatureRequestForm.maxLength {
                                form.text = String(text.prefix(FeatureRequestForm.maxLength))
                            }
                        }
                        if let error = form.fieldError {
                            Text(error).textRole(.secondary).foregroundStyle(Color.fail)
                        }
                    }
                    if let error = form.error { Notice(kind: .error, text: error) }
                    Button(form.sendTitle) {
                        focused = false
                        Task { await form.send(app.api, companyId: session.company?.id) }
                    }
                    .buttonStyle(.primary(fullWidth: true))
                    .disabled(form.sending)
                }
            }
            .onAppear { focused = true }
        }
    }
#endif
