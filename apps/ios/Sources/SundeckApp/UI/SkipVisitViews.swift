#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Skip Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md): a sheet to pick why
    /// (required, from Settings › Skip Reasons), add a note and a photo, then Skip. Written on the
    /// phone first (row and outbox together), so it works offline. The visit shows as skipped at once,
    /// with Undo for five seconds; a customer with a phone number is offered Text the Customer next,
    /// in the phone's own Messages (as On My Way does). A photo is saved to the visit as it's taken.
    /// Website components/skip-visit.tsx; Android features/job/SkipVisit.tsx.
    struct SkipVisitSheet: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @Environment(\.openURL) private var openURL
        @State private var reason = ""
        @State private var note = ""
        @State private var error: String?
        @State private var textBody: String?
        @State private var capture: CaptureController
        @FocusState private var noteFocused: Bool

        init(job: JobView) {
            self.job = job
            _capture = State(initialValue: CaptureController(target: MediaTarget(jobId: job.id)))
        }

        var body: some View {
            let _ = sync.revision
            let reasons = session.company.map { skipReasons(sync.store, companyId: $0.id) } ?? []
            let photos = jobPhotoCount(sync.store, jobId: job.id)
            FormSheet(title: skipVisitLabel, dirty: !reason.isEmpty || !note.isEmpty) {
                Grouped(label: "Reason") {
                    ForEach(reasons, id: \.id) { r in
                        Button {
                            reason = r.label
                            error = nil
                        } label: {
                            ListRow(r.label) {
                                if reason == r.label {
                                    Image(systemName: "checkmark").foregroundStyle(Color.link)
                                }
                            }
                        }
                        .buttonStyle(.row)
                        .accessibilityAddTraits(reason == r.label ? .isSelected : [])
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Note").textRole(.secondary).foregroundStyle(Color.textMuted)
                    TextField(
                        "", text: $note, prompt: Text("Optional").foregroundStyle(Color.placeholder), axis: .vertical
                    )
                    .lineLimit(3...12)
                    .focused($noteFocused)
                    .fieldBox(focused: noteFocused, minHeight: 96)
                    .accessibilityLabel("Note")
                }
                VStack(alignment: .leading, spacing: 8) {
                    Button {
                        Task { await capture.takeOrChoose(.photo) }
                    } label: {
                        Label("Add Photo", systemImage: "camera")
                    }
                    .buttonStyle(.secondary)
                    .disabled(capture.busy != nil)
                    if photos > 0 {
                        Text(photos == 1 ? "1 photo is on this visit." : "\(photos) photos are on this visit.")
                            .textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                if let error { Notice(kind: .error, text: error) }
                Button("Skip") { skip() }
                    .buttonStyle(.danger(fullWidth: true, size: .field))
            }
            .captureFlow(capture)
            .confirmationDialog(
                "\(skipTextLabel)?", isPresented: Binding(get: { textBody != nil }, set: { if !$0 { finish() } }),
                titleVisibility: .visible, presenting: textBody
            ) { body in
                Button(skipTextLabel) {
                    if let phone = job.customer?["phone"]?.string,
                        let url = StopTextRoute.smsURL(phone, body: body)
                    {
                        openURL(url)
                    }
                    finish()
                }
                Button("Not Now", role: .cancel) { finish() }
            } message: { body in
                Text(body)
            }
        }

        private func finish() {
            textBody = nil
            dismiss()
        }

        private func skip() {
            guard !reason.isEmpty else {
                error = skipReasonRequired
                return
            }
            guard let company = session.company else { return }
            let undo = unskipValues(job)
            let jobId = job.id
            do {
                try sync.write("job", id: jobId, companyId: company.id, skipJobValues(reason: reason, note: note))
            } catch {
                self.error = userMessage(error)
                return
            }
            // Undo puts it back where it was: on its time, or waiting for one.
            app.removals.showUndoable(skipBanner) { [weak sync] in
                guard let sync else { return }
                try? sync.write("job", id: jobId, companyId: company.id, undo)
            }
            let api = app.api
            let service = sync
            Task { await announceSkip(jobId: jobId, sync: service, api: api) }
            if let phone = job.customer?["phone"]?.string, !phone.isEmpty {
                let me = sync.kv.team.first { $0.id == session.user?.id }
                let tech = me?.fullName?.trimmingCharacters(in: .whitespaces)
                textBody = skipCustomerText(
                    customer: job.customer?["name"]?.string, tech: tech?.isEmpty == false ? tech! : "your technician",
                    shop: customerBusinessName(
                        sync.store, companyId: company.id, fallbackName: company.name, job: job.job),
                    reason: reason)
            } else {
                dismiss()
            }
        }
    }

    /// A skipped visit at the top of Details: why, who and when, and what the office does next
    /// (owners and admins: Reschedule opens the schedule sheet, Dismiss keeps it skipped and marks it
    /// handled). Undo Skip is the job's own button.
    struct SkippedCard: View {
        var job: JobView
        var isManager: Bool
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var saveError: String?

        var body: some View {
            let _ = sync.revision
            let timeZone = session.company?.timeZone ?? "America/Phoenix"
            let state = skipJob(job)
            let actions = skipActions(state, isManager: isManager)
            let by = job.job["skipped_by"]?.string.flatMap { id in
                sync.kv.team.first { $0.id == id }.map { $0.fullName ?? $0.email ?? "Teammate" }
            }
            let when = state.skippedAt.flatMap { try? formatSchedule($0, Date(), timeZone) }
            VStack(alignment: .leading, spacing: 12) {
                Grouped(label: "Skipped") {
                    ListRow("Reason", value: state.skipReason ?? "No reason")
                    if let note = job.job["skip_note"]?.string, !note.isEmpty {
                        StackedRow(caption: "Note", value: note)
                    }
                    ListRow(
                        "Skipped", value: skipSummary(SkipJob(status: "skipped"), by: by ?? "Sundeck Pro", when: when))
                    ListRow("Photos", value: String(jobPhotoCount(sync.store, jobId: job.id)))
                    if let handled = state.skipHandledAt, !handled.isEmpty {
                        ListRow("Dismissed", value: (try? formatSchedule(handled, Date(), timeZone)) ?? "")
                    }
                }
                if actions.reschedule || actions.dismiss {
                    HStack(spacing: 12) {
                        if actions.reschedule {
                            Button(skipRescheduleLabel) {
                                NotificationCenter.default.post(name: .rescheduleVisit, object: job.id)
                            }
                            .buttonStyle(.primary)
                        }
                        if actions.dismiss {
                            Button(skipDismissLabel) { dismissSkip() }.buttonStyle(.secondary)
                        }
                    }
                }
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func dismissSkip() {
            guard let company = session.company else { return }
            do {
                try sync.write(
                    "job", id: job.id, companyId: company.id,
                    ["skip_handled_at": .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000))])
            } catch {
                saveError = userMessage(error)
            }
        }
    }

    extension Notification.Name {
        /// Reschedule on a skipped visit's card: its schedule group opens Move (object: the job's id).
        static let rescheduleVisit = Notification.Name("sundeck.rescheduleVisit")
    }
#endif
