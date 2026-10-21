#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// On My Way (spec 5.1): the text that tells the customer an arrival time. It lives in Message
    /// (owner, 2026-10-20: "the message button should default to the 'on my way' text when you're
    /// actually on your [way], but the tech can always edit the message. So let's just remove the
    /// car icon and have the one text icon"; docs/design/2026-10-20-gestures.md section 2):
    /// - from the company number when the shop sends that way and its line works: the in-app
    ///   compose sheet (`OnMyWaySheet`), editable, sent through the company line;
    /// - otherwise the phone's own Messages with the text filled in, recorded when opened, as the
    ///   old fallback did (no number: the share sheet).
    /// Sending records On My Way on the job (`on_my_way_at`, `arrive_at`) and turns the Live
    /// Activity to the drive.
    @MainActor enum OnMyWay {
        /// "Hi Derek, this is Ana from Blue Water. I'm on my way and should arrive around 9:40 AM."
        static func text(_ job: ScheduleJob, day: TodayDay, leg: Int) -> String {
            let me = day.techs.first { $0.id == day.ctx.userId }?.name
            return onMyWayText(
                customer: job.customerName == "Customer" ? nil : job.customerName,
                tech: me == "Teammate" || me == nil ? "your tech" : me!, shop: day.ctx.shopName,
                arriveMin: localMinutes(Date(), timeZone: day.ctx.timeZone) + max(5, leg),
                windowMin: day.ctx.settings.windowMin)
        }

        /// The shop sends On My Way from its company number, and the number works.
        static func viaCompany(_ job: ScheduleJob, day: TodayDay) -> Bool {
            !day.ctx.onMyWayFromPhone && day.lineActive && job.customerPhone != nil && job.customerId != nil
        }

        /// On My Way kept on the job (Today's card, the website, the office and a second phone show
        /// it), then the Lock Screen's Live Activity for this stop, arriving at the time the text
        /// gives.
        static func record(_ job: ScheduleJob, day: TodayDay, leg: Int, session: Session, app: AppEnvironment) {
            if let company = session.company {
                try? StopWrites.recordOnMyWay(session.sync, companyId: company.id, jobId: job.id, driveMinutes: leg)
            }
            app.liveStop.start(
                jobId: job.id, eta: liveStopETA(now: Date(), timeZone: day.ctx.timeZone, driveMinutes: leg))
        }

        /// Messages with `body` filled in, to `phone`.
        static func smsURL(_ phone: String, body: String?) -> URL? {
            StopTextRoute.smsURL(phone, body: body)
        }
    }

    /// The Live Activity's On My Way for a row's stop (Today opens the row and this sends it):
    /// nothing on screen (the car is gone, owner 2026-10-20). From the company number when the
    /// shop sends that way and it works; when it doesn't work yet, it asks before using the phone's
    /// Messages; otherwise the Messages app, else the share sheet. What happened is read aloud.
    struct OnMyWayTrigger: View {
        var job: ScheduleJob
        var day: TodayDay
        var leg: Int
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @Environment(\.openURL) private var openURL
        @State private var asking = false

        var body: some View {
            Color.clear
                .frame(width: 1, height: 1)
                .accessibilityHidden(true)
                .onChange(of: app.stopRequest, initial: true) { _, request in
                    guard let request, request.jobId == job.id, request.action == .onMyWay else { return }
                    app.stopRequest = nil
                    send()
                }
                .confirmationDialog(
                    "On My Way goes out from your company number, which isn’t working yet.", isPresented: $asking,
                    titleVisibility: .visible
                ) {
                    Button("Send From My Phone") { fromPhone() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(
                        day.ctx.isManager
                            ? "Set it up in Settings › Phone and Texting. You can send this one from your phone."
                            : "Ask an owner to set it up. You can send this one from your phone.")
                }
        }

        private func say(_ text: String) { AccessibilityNotification.Announcement(text).post() }

        private func send() {
            let viaCompany = !day.ctx.onMyWayFromPhone
            if job.customerPhone != nil && viaCompany && !day.lineActive {
                asking = true
                return
            }
            if OnMyWay.viaCompany(job, day: day), let customerId = job.customerId {
                let body = OnMyWay.text(job, day: day, leg: leg)
                Task {
                    do {
                        _ = try await TextingServer(sync: sync, api: app.api).send(
                            customerId: customerId, body: body, jobId: job.id)
                        OnMyWay.record(job, day: day, leg: leg, session: session, app: app)
                        say("Texted On My Way to \(job.customerName)")
                    } catch {
                        say("On My Way wasn’t sent")
                    }
                }
                return
            }
            fromPhone()
        }

        private func fromPhone() {
            OnMyWay.record(job, day: day, leg: leg, session: session, app: app)
            let body = OnMyWay.text(job, day: day, leg: leg)
            if let phone = job.customerPhone, let url = OnMyWay.smsURL(phone, body: body) {
                openURL(url)
                return
            }
            if !presentShareSheet(body) {
                UIPasteboard.general.string = body
                say("Copied the On My Way text")
            }
        }
    }

    /// The compose sheet Message opens on the tech's own stop before they arrive (owner,
    /// 2026-10-20): the On My Way text already filled in, editable, sent from the company number.
    /// Sending records On My Way as the car did; the tech's edits are what's sent. Swipe down
    /// asks first once the text was changed.
    struct OnMyWaySheet: View {
        var job: ScheduleJob
        var day: TodayDay
        var leg: Int
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var original = ""
        @State private var text = ""
        @State private var sending = false
        @State private var error: String?
        @FocusState private var focused: Bool

        static let title = "On My Way"
        static let send = "Send"

        var body: some View {
            FormSheet(title: Self.title, dirty: !sending && text != original) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("To \(job.customerName)").textRole(.secondary).foregroundStyle(Color.textMuted)
                    TextField("", text: $text, axis: .vertical)
                        .lineLimit(4...12)
                        .textRole(.body)
                        .foregroundStyle(Color.text)
                        .focused($focused)
                        .fieldBox(error: false, focused: focused, minHeight: 120)
                        .accessibilityLabel("Message to \(job.customerName)")
                }
                if let error { Notice(kind: .error, text: error) }
                Button(sending ? "Sending…" : Self.send) { send() }
                    .buttonStyle(.primary(fullWidth: true))
                    .disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .onAppear {
                guard original.isEmpty else { return }
                original = OnMyWay.text(job, day: day, leg: leg)
                text = original
            }
        }

        private func send() {
            guard let customerId = job.customerId else { return }
            sending = true
            error = nil
            let body = text
            Task {
                do {
                    _ = try await TextingServer(sync: sync, api: app.api).send(
                        customerId: customerId, body: body, jobId: job.id)
                    OnMyWay.record(job, day: day, leg: leg, session: session, app: app)
                    AccessibilityNotification.Announcement("Texted \(job.customerName)").post()
                    dismiss()
                } catch {
                    self.error = String(describing: error)
                    sending = false
                }
            }
        }
    }
#endif
