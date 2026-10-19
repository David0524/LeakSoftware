#if os(iOS) && canImport(ActivityKit)
    import ActivityKit
    import Foundation
    import SundeckCore
    import SundeckLiveStop
    import SundeckSync

    /// Runs the Live Activity for the stop a tech is on, with ActivityKit on the phone (no push, so
    /// it works offline). One at a time, one a work day (owner, 2026-10-19: "Live Activity should
    /// begin at the beginning of the workday"):
    /// - it begins by itself (`check()`: launch, the app coming back, each sync and change, and
    ///   every minute while open) once `liveStopRuns`, on the first stop not done today;
    /// - On My Way turns it to the drive for that stop;
    /// - a done stop shows done for a minute, then the same activity moves on to the next stop not
    ///   done, and after the last one it ends;
    /// - ended from the Lock Screen, it stays off until the next work day; signing out ends it.
    @MainActor
    final class LiveStopController {
        private let session: Session
        private let kv: KeyValue
        /// The done stop's minute, before moving on (its job id).
        private var lingering: (jobId: String, task: Task<Void, Never>)?
        /// A new activity is being asked for (it isn't in `activities` yet).
        private var requesting = false
        private static let targetKey = KVKey.liveStopTarget
        static let dismissedKey = "live_stop:dismissed_on"

        init(session: Session) {
            self.session = session
            kv = session.sync.kv
        }

        /// ActivityKit, like notifications, exists only in the real app, not a test bundle.
        static var available: Bool { NotificationPermission.available }

        private var target: LiveStopTarget? {
            get { kv.getJSON(Self.targetKey, as: LiveStopTarget.self) }
            set {
                if let newValue { kv.setJSON(Self.targetKey, newValue) } else { kv.remove(Self.targetKey) }
            }
        }

        /// The day the tech ended it from the Lock Screen.
        private var dismissedOn: String? {
            get { kv.get(Self.dismissedKey) }
            set { if let newValue { kv.set(Self.dismissedKey, newValue) } else { kv.remove(Self.dismissedKey) } }
        }

        /// The running activity's day and what it shows (read on the main actor; ActivityKit's
        /// own calls happen in the nonisolated helpers below, which take only plain values).
        private var running: (day: String, state: LiveStopState)? {
            Activity<StopAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
                .map { ($0.attributes.day, $0.content.state) }
        }

        private var enabled: Bool { Self.available && ActivityAuthorizationInfo().areActivitiesEnabled }

        /// On My Way for a stop: the activity turns to the drive, arriving at `eta` (a time of day).
        /// A tap starts it even after the tech ended it today.
        func start(jobId: String, eta: String?) {
            guard enabled, let day = day() else { return }
            cancelLinger()
            show(LiveStopTarget(jobId: jobId, eta: eta, day: day.today), day: day.today)
        }

        /// Starts, updates, moves on or ends the activity for the tech's day as it is now.
        func check() {
            guard enabled else { return }
            guard let day = day() else {
                end()
                return
            }
            let current = target.flatMap { $0.day == day.today ? $0 : nil }
            guard !requesting else { return }
            guard let running, running.day == day.today else {
                // Not running today: it was ended from the Lock Screen (we had a target and none
                // runs), or it begins now. An earlier day's activity is ended (`show` ends others).
                if current != nil && running == nil { dismissedOn = day.today }
                cancelLinger()
                target = nil
                guard dismissedOn != day.today, day.runs, let first = day.open() else {
                    if running != nil { end() }
                    return
                }
                show(LiveStopTarget(jobId: first.id, eta: nil, day: day.today), day: day.today)
                return
            }
            guard let current, let state = input(current) else {
                // Its stop left the phone (moved, unassigned): on to the next one, else end.
                if let next = day.open() {
                    show(LiveStopTarget(jobId: next.id, eta: nil, day: day.today), day: day.today)
                } else {
                    end()
                }
                return
            }
            if state.phase == .done {
                if running.state.stop != state { send(current, state) }
                guard lingering?.jobId != current.jobId else { return }
                let jobId = current.jobId
                cancelLinger()
                lingering = (
                    jobId,
                    Task { [weak self] in
                        try? await Task.sleep(for: .seconds(liveStopDoneLingerSeconds))
                        guard !Task.isCancelled else { return }
                        self?.moveOn(from: jobId)
                    }
                )
                return
            }
            cancelLinger()
            if running.state.stop != state { send(current, state) }
        }

        /// After the done stop's minute: the next stop not done, else the activity ends.
        private func moveOn(from jobId: String) {
            lingering = nil
            guard let day = day(), target?.jobId == jobId else { return }
            if let next = day.open(after: jobId) {
                show(LiveStopTarget(jobId: next.id, eta: nil, day: day.today), day: day.today)
            } else {
                end()
            }
        }

        /// Ends every activity now (sign out, the last stop done, or the day over).
        func end() {
            guard Self.available else { return }
            cancelLinger()
            target = nil
            Task { await Self.endAll() }
        }

        private func cancelLinger() {
            lingering?.task.cancel()
            lingering = nil
        }

        /// Shows a stop: on the running activity when there is one, else a new activity.
        private func show(_ next: LiveStopTarget, day: String) {
            guard let state = input(next) else { return }
            target = next
            let content = LiveStopState(stop: state, jobId: next.jobId, phone: phone(next.jobId))
            requesting = true
            Task { [weak self] in
                defer { self?.requesting = false }
                if await Self.update(content, day: day) { return }
                await Self.endAll()
                do {
                    _ = try Activity.request(
                        attributes: StopAttributes(day: day),
                        content: ActivityContent(state: content, staleDate: nil), pushType: nil)
                } catch {
                    // Not allowed now (Live Activities off): try again on the next check.
                    if self?.target == next { self?.target = nil }
                }
            }
        }

        private func send(_ target: LiveStopTarget, _ state: LiveStopInput) {
            let content = LiveStopState(stop: state, jobId: target.jobId, phone: phone(target.jobId))
            let day = target.day ?? ""
            Task { await Self.update(content, day: day) }
        }

        private nonisolated static func endAll() async {
            for activity in Activity<StopAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        /// Shows `content` on the day's activity; false when none runs.
        private nonisolated static func update(_ content: LiveStopState, day: String) async -> Bool {
            guard
                let activity = Activity<StopAttributes>.activities.first(where: {
                    $0.attributes.day == day && ($0.activityState == .active || $0.activityState == .stale)
                })
            else { return false }
            await activity.update(ActivityContent(state: content, staleDate: nil))
            return true
        }

        private func day() -> LiveStopDay? {
            guard let company = session.company, let user = session.user else { return nil }
            return liveStopDay(session.sync.store, kv: kv, company: company, userId: user.id)
        }

        private func input(_ target: LiveStopTarget) -> LiveStopInput? {
            guard let company = session.company, let user = session.user else { return nil }
            return liveStopInput(session.sync.store, kv: kv, company: company, userId: user.id, target: target)
        }

        private func phone(_ jobId: String) -> String? {
            scheduleJobs(session.sync.store, companyId: session.company?.id ?? "").first { $0.id == jobId }?
                .customerPhone
        }
    }
#endif
