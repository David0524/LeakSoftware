#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// Customers › Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"):
    /// To (Show, City, Last Job) with the live count, Subject and Message, Send to N Customers
    /// after an alert, Send Test to Me, and the mass emails sent before. Port of
    /// apps/web/src/components/mass-email.tsx, with the website's words.
    struct MassEmailScreen: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var form: MassEmailForm
        @State private var confirming = false
        /// The subject and message, kept until sent or discarded (owner, 2026-10-27).
        @State private var draft = DraftHandle()
        /// Screenshots pass loaded data and nothing is fetched.
        private let preview: Bool

        init(form: MassEmailForm? = nil) {
            _form = State(initialValue: form ?? MassEmailForm())
            preview = form != nil
        }

        private var companyId: String { session.company?.id ?? "" }
        private var filterKey: String { "\(form.show)|\(form.city)|\(form.days.map(String.init) ?? "")" }

        var body: some View {
            Group {
                if let setup = form.setup {
                    page(setup)
                } else if let error = form.loadError {
                    ScreenScroll { Notice(kind: .error, text: error) }
                } else {
                    ScreenScroll { SkeletonRows(count: 6) }
                }
            }
            .navigationTitle(MassEmailText.title)
            .navigationBarTitleDisplayMode(.large)
            // A message typed and not sent: Back asks "Discard changes?" (owner, 2026-10-20: everywhere).
            .discardOnBack(
                dirty: textChanged(form.subject, from: "") || textChanged(form.body, from: ""), draft: draft
            )
            .keepsDraft(
                draft, form: "mass-email", fields: ["subject": form.subject, "body": form.body],
                ready: form.setup != nil
            ) { changes in
                if let value = changes["subject"] { form.subject = value }
                if let value = changes["body"] { form.body = value }
            }
            .task {
                guard !preview, form.setup == nil else { return }
                await form.load(app.api, companyId: companyId)
            }
            .task(id: filterKey) {
                guard !preview, form.setup != nil || form.loadError == nil else { return }
                await form.recount(app.api, companyId: companyId)
            }
            .alert(form.confirm.title, isPresented: $confirming) {
                Button("Cancel", role: .cancel) {}
                Button(form.confirm.confirmLabel) {
                    Task {
                        await form.send(app.api, companyId: companyId)
                        if form.subject.isEmpty && form.body.isEmpty { draft.clear() }
                    }
                }
                .keyboardShortcut(.defaultAction)
            } message: {
                Text(form.confirm.message)
            }
        }

        private func page(_ setup: MassEmailSetup) -> some View {
            ScreenScroll {
                VStack(alignment: .leading, spacing: 24) {
                    if setup.address == nil { Notice(kind: .warning, text: MassEmailText.noAddress) }
                    if !setup.configured {
                        Notice(kind: .warning, text: "Email isn’t set up yet. Try again later.")
                    }
                    DraftNote(draft: draft)
                    to(setup)
                    message
                    buttons
                    history(setup)
                }
            }
        }

        private func to(_ setup: MassEmailSetup) -> some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                Grouped(label: "To") {
                    LabeledPickerRow(
                        label: "Show", selection: $form.show, options: setup.shows.map(\.value),
                        optionLabel: { v in setup.shows.first { $0.value == v }?.label ?? v })
                    LabeledPickerRow(
                        label: "City", selection: $form.city, options: [""] + setup.cities,
                        optionLabel: { $0.isEmpty ? MassEmailText.anyCity : $0 })
                    LabeledPickerRow(
                        label: "Last Job", selection: $form.days, options: LastJobChoice.all.map(\.days),
                        optionLabel: { d in LastJobChoice.all.first { $0.days == d }?.label ?? "" })
                }
                VStack(alignment: .leading, spacing: 4) {
                    if let words = form.countText {
                        (Text(words.count).fontWeight(.semibold).foregroundStyle(Color.text)
                            + Text(words.skipped.map { " \($0)" } ?? ""))
                    } else {
                        Text(form.counting ? "Counting…" : "Couldn’t count. Check your connection.")
                    }
                    if form.count != nil && form.overLimit {
                        Text(massEmailLimitText(setup.left)).foregroundStyle(Color.fail)
                    }
                }
                .textRole(.footnote)
                .foregroundStyle(Color.textMuted)
                .padding(.horizontal, 16)
                .accessibilityElement(children: .combine)
            }
        }

        private var message: some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                Grouped(label: "Message") {
                    LabeledFieldRow(label: "Subject", text: $form.subject, labelWidth: 80)
                    LabeledFieldRow(
                        label: "Message", text: $form.body, placeholder: "Hi {first name},", labelWidth: 80,
                        multiline: true)
                }
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(["subject", "body"], id: \.self) { key in
                        if let e = form.fieldErrors[key] { Text(e).foregroundStyle(Color.fail) }
                    }
                    Text(MassEmailText.messageNote).foregroundStyle(Color.textMuted)
                }
                .textRole(.footnote)
                .padding(.horizontal, 16)
            }
        }

        private var buttons: some View {
            VStack(spacing: 12) {
                if let error = form.error { Notice(kind: .error, text: error) }
                if let message = form.message { Notice(kind: .success, text: message) }
                Button(form.sendTitle) {
                    if form.readyToSend() { confirming = true }
                }
                .buttonStyle(.primary(fullWidth: true))
                .disabled(!form.canSend)
                Button(MassEmailText.sendTest) {
                    Task { await form.sendTest(app.api, companyId: companyId) }
                }
                .buttonStyle(.secondary(fullWidth: true))
                .disabled(form.sending || form.blocked)
            }
        }

        private func history(_ setup: MassEmailSetup) -> some View {
            Grouped(label: "Sent") {
                if setup.history.isEmpty {
                    Text(MassEmailText.historyEmpty)
                        .textRole(.body).foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                } else {
                    ForEach(setup.history) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.subject).font(.role(.bodyEmphasis)).foregroundStyle(Color.text)
                            Text("\(shortDay(row.createdAt)) · \(row.detail)")
                                .textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .padding(.vertical, CGFloat(Spacing.rowVertical))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }

        /// "Oct 20", with the year when it isn't this year, in the shop's time zone.
        private func shortDay(_ iso: String) -> String {
            let parse = ISO8601DateFormatter()
            parse.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let plain = ISO8601DateFormatter()
            guard let date = parse.date(from: iso) ?? plain.date(from: iso) else { return "" }
            let zone = TimeZone(identifier: session.company?.timeZone ?? "") ?? .current
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US")
            f.timeZone = zone
            f.dateFormat =
                calendar.component(.year, from: date) == calendar.component(.year, from: Date())
                ? "MMM d" : "MMM d, yyyy"
            return f.string(from: date)
        }
    }
#endif
