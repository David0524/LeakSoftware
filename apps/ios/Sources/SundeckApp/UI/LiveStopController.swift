#if os(iOS) && canImport(ActivityKit)
    import ActivityKit
    import Foundation
    import SundeckCore
    import SundeckLiveStop
    import SundeckSync

    /// Runs the Live Activity for the stop a tech is on, with ActivityKit on the phone (no push, so
    /// it works offline). One at a time: On My Way starts it (ending any other); every change on
    /// the phone refreshes it (Start Job, the checklist, Mark Complete); a finished stop shows its
    /// done state for a minute, then ends; signing out ends it.
    @MainActor
    final class LiveStopController {
        private let session: Session
        private let kv: KeyValue
        private var lingering: Task<Void, Never>?
        private static let targetKey = KVKey.liveStopTarget

        init(session: Session) {
            self.session = session
            kv = session.sync.kv
        }

        private var target: LiveStopTarget? {
            get { kv.getJSON(Self.targetKey, as: LiveStopTarget.self) }
            set {
                if let newValue { kv.setJSON(Self.targetKey, newValue) } else { kv.remove(Self.targetKey) }
            }
        }

        /// The running activity's job and what it shows (read on the main actor; ActivityKit's
        /// own calls happen in the nonisolated helpers below, which take only plain values).
        private var running: (jobId: String, state: LiveStopInput)? {
            Activity<StopAttributes>.activities.first.map { ($0.attributes.jobId, $0.content.state) }
        }

        /// On My Way for a stop: a new activity for it, arriving at `eta` (a time of day).
        func start(jobId: String, eta: String?) {
            guard Self.available, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            let next = LiveStopTarget(jobId: jobId, eta: eta)
            guard let state = input(next) else { return }
            lingering?.cancel()
            target = next
            let job = scheduleJobs(session.sync.store, companyId: session.company?.id ?? "").first { $0.id == jobId }
            let attributes = StopAttributes(jobId: jobId, customer: state.customer, phone: job?.customerPhone)
            Task {
                await Self.end(except: jobId)
                if await Self.update(jobId: jobId, state, ending: false) { return }
                _ = try? Activity.request(
                    attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
            }
        }

        /// ActivityKit, like notifications, exists only in the real app, not a test bundle.
        static var available: Bool { NotificationPermission.available }

        /// After any change on the phone: the running activity shows its stop as it is now. A stop
        /// that's done stays a minute, then the activity ends (unless On My Way starts the next).
        func refresh() {
            guard Self.available else { return }
            guard let target, let running, running.jobId == target.jobId else { return }
            guard let state = input(target) else {
                end()
                return
            }
            guard state != running.state else { return }
            let jobId = target.jobId
            Task { await Self.update(jobId: jobId, state, ending: false) }
            if state.phase == .done {
                lingering?.cancel()
                lingering = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(liveStopDoneLingerSeconds))
                    guard !Task.isCancelled else { return }
                    await Self.update(jobId: jobId, state, ending: true)
                    if self?.target?.jobId == jobId { self?.target = nil }
                }
            }
        }

        /// Ends every activity now (sign out).
        func end() {
            guard Self.available else { return }
            lingering?.cancel()
            target = nil
            Task { await Self.end(except: nil) }
        }

        private nonisolated static func end(except jobId: String?) async {
            for activity in Activity<StopAttributes>.activities where activity.attributes.jobId != jobId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        /// Shows `state` on the job's activity (or ends it with that last state); false when none runs.
        @discardableResult
        private nonisolated static func update(jobId: String, _ state: LiveStopInput, ending: Bool) async -> Bool {
            guard let activity = Activity<StopAttributes>.activities.first(where: { $0.attributes.jobId == jobId })
            else { return false }
            let content = ActivityContent(state: state, staleDate: nil)
            if ending {
                await activity.end(content, dismissalPolicy: .immediate)
            } else {
                await activity.update(content)
            }
            return true
        }

        private func input(_ target: LiveStopTarget) -> LiveStopInput? {
            guard let company = session.company, let user = session.user else { return nil }
            return liveStopInput(session.sync.store, kv: kv, company: company, userId: user.id, target: target)
        }
    }
#endif
