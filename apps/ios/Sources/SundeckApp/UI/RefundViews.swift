#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Refunds (owner, 2026-11-24: "how would we reverse a charge?"), as on the website
    // (apps/web/src/components/refund-sheet.tsx) and Android: Refund on a card or bank payment
    // opens Refund Payment, Refund Full or Refund Part, and the money goes back through the
    // shop's Stripe account. Words from core refund.ts.

    /// Refund Payment, as a sheet: how the money goes back, Refund Full | Refund Part (with an
    /// Amount for part), then the red Refund button. `done` gets the server's line once refunded,
    /// or nil for Cancel.
    struct RefundSheet: View {
        @State var form: RefundForm
        var done: (String?) -> Void
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app

        /// Refunds go through the server: none without a signal.
        private var offline: Bool { sync.status.phase == .offline }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(refundExplainer(form.start.method)).textRole(.body).foregroundStyle(Color.textMuted)
                        Segmented(
                            selection: $form.part, options: [false, true],
                            label: { $0 ? RefundText.part : RefundText.full }, title: RefundText.button,
                            fillsWidth: true)
                        if form.part {
                            CommitField(
                                label: RefundText.amountLabel, text: $form.typed, placeholder: "25.00",
                                error: form.fieldError, keyboard: .decimalPad, numeric: true)
                        }
                        if offline {
                            Notice(kind: .warning, text: RefundText.offline)
                        } else if let error = form.error {
                            Notice(kind: .error, text: error)
                        }
                        Button(role: .destructive) {
                            Task {
                                if let message = await form.refund(app.api, sync: sync) { done(message) }
                            }
                        } label: {
                            BusyButtonLabel(form.buttonText, busy: form.busy, busyTitle: "Refunding…")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.danger(fullWidth: true))
                        .disabled(form.busy || offline || form.amount.cents == nil)
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle(RefundText.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                }
                .onChange(of: form.part) { form.error = nil }
                .interactiveDismissDisabled(form.busy)
            }
            .sheetPresentation(detents: [.medium, .large])
        }
    }

    extension View {
        /// Presents Refund Payment for `start`; `done` gets the server's line once refunded.
        func refundSheet(_ start: Binding<RefundStart?>, done: @escaping (String) -> Void) -> some View {
            sheet(item: start) { s in
                RefundSheet(form: RefundForm(start: s)) { message in
                    start.wrappedValue = nil
                    if let message { done(message) }
                }
            }
        }
    }
#endif
