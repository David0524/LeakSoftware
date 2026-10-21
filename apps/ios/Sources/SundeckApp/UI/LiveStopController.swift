#if os(iOS) && canImport(ActivityKit)
    import ActivityKit
    import Foundation
    import SundeckCore
    import SundeckLiveStop
    import SundeckSync

    /// Runs the Live Activity for the stop a tech is on, with ActivityKit on the phone (no push, so
    /// it works offline). One at a time, running whenever the app is open during the work day
    /// (owner, 2026-10-20: "It should run anytime you have the app open during the work day"):
    /// - it begins by itself (`check()`: each sync and change, and every minute while open; and
    ///   `foregrounded()`: launch and the app coming back) once `liveStopRuns`, on the stop Today's
    ///   card shows (the shared `todayHero` rule: the one on the way, else one started, else the
    ///   first not done);
    /// - On My Way turns it to the drive for that stop;
    /// - a done stop moves the same activity straight on to the card's next stop, with an alert
    ///   ("Derek Jeter done. Next: Wayne Gretzky"; owner, 2026-10-20), and after the last one it
    ///   ends;
    /// - Settings › Notifications › Live Activity off: none starts, and a running one ends;
    /// - removed from the Lock Screen, it stays off only while the app stays in the background:
    ///   the next time the app is opened or comes back during the work day, it begins again
    ///   (`liveStopBegins`). Signing out ends it.
    @MainActor
    final class LiveStopController {
        private let session: Session
        private let kv: KeyValue
        /// A new activity is being asked for (it isn't in `activities` yet).
        private var requesting = false
        private static let targetKey = KVKey.liveStopTarget
        static let dismissedKey = KVKey.liveStopDismissed

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

        /// The day the tech removed it from the Lock Screen; cleared when the app comes to the
        /// foreground (`foregrounded()`).
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

        private var enabled: Bool {
            Self.available && ActivityAuthorizationInfo().areActivitiesEnabled && switchedOn
        }

        /// Settings › Notifications › Live Activity (owner, 2026-10-20; `notification_prefs.live`):
        /// on unless the person turns it off. Off: no activity starts, and a running one ends.
        private var switchedOn: Bool { notificationOn(NotificationPrefsForm.cached(kv), .live) }

        /// On My Way for a stop: the activity turns to the drive, arriving at `eta` (a time of day).
        /// A tap starts it even after the tech ended it today.
        func start(jobId: String, eta: String?) {
            guard enabled, let day = day() else { return }
            // The stop the day is on (`todayHero`): this one, once the job has On My Way.
            let wanted = LiveStopTarget(jobId: jobId, eta: eta, day: day.today)
            let stop =
                input(wanted) != nil ? wanted : day.open().map { LiveStopTarget(jobId: $0.id, day: day.today) }
            show(stop ?? wanted, day: day.today)
        }

        /// The app was opened or came back: a removal earlier today no longer keeps it off, and
        /// no guess is made about an activity gone while the app was closed (what this app ended
        /// is forgotten then, so iOS ending one could read as the tech removing it).
        func foregrounded() {
            dismissedOn = nil
            check(foreground: true)
        }

        /// Starts, updates, moves on or ends the activity for the tech's day as it is now.
        /// `foreground`: called by `foregrounded()`, which never reads a missing activity as removed.
        func check(foreground: Bool = false) {
            guard enabled else {
                // Switched off in Settings › Notifications: take it down (it stays down).
                if Self.available && !switchedOn && (running != nil || target != nil) { end() }
                return
            }
            guard let day = day() else {
                end()
                return
            }
            let current = target.flatMap { $0.day == day.today ? $0 : nil }
            guard !requesting else { return }
            watchAll()
            guard let running, running.day == day.today else {
                // Not running today. With a target still set (we didn't end it), either the tech
                // removed it or iOS ended it at its time limit; only the first keeps it off, until
                // the app next comes to the foreground. Otherwise it begins now. Older activities
                // are ended (`show` ends others).
                if !foreground && current != nil && running == nil && removedByTech(day: day.today) {
                    dismissedOn = day.today
                }
                target = nil
                guard liveStopBegins(day, dismissedOn: dismissedOn), let first = day.open() else {
                    if running != nil { end() }
                    return
                }
                show(LiveStopTarget(jobId: first.id, eta: nil, day: day.today), day: day.today)
                return
            }
            guard let current, let state = input(current) else {
                // Its stop is done, left the phone (moved, unassigned), or the day is on another
                // stop (On My Way or Start elsewhere, as Today's card shows): that one straight
                // away (owner, 2026-10-20: no minute's hold), else end. A done stop's update
                // carries an alert, so the change is noticed.
                if let next = day.open() {
                    show(
                        LiveStopTarget(jobId: next.id, eta: nil, day: day.today), day: day.today,
                        alert: current.flatMap { doneAlert($0.jobId, next: next.customerName, day: day) })
                } else {
                    end()
                }
                return
            }
            if running.state.stop != state { send(current, state) }
        }

        /// "Derek Jeter done. Next: Wayne Gretzky" when `jobId` is done today; nil otherwise.
        private func doneAlert(_ jobId: String, next: String?, day: LiveStopDay) -> String? {
            guard
                let job = scheduleJobs(session.sync.store, companyId: session.company?.id ?? "").first(where: {
                    $0.id == jobId
                }), job.doneOn(day.today)
            else { return nil }
            return liveStopDoneAlert(customer: job.customerName, next: next)
        }

        /// Ends every activity now (sign out, the last stop done, or the day over).
        func end() {
            guard Self.available else { return }
            target = nil
            markOurs()
            Task { await Self.endAll() }
        }

        // MARK: - Removed by the tech, or ended by iOS

        /// iOS ends a Live Activity on its own after about 8 hours; one gone at least this long
        /// after it began was ended by iOS, not removed by the tech.
        static let systemLimit: TimeInterval = 8 * 3600 - 5 * 60
        static let startedKey = KVKey.liveStopStarted
        /// Activities this app ended (their later `.ended` and `.dismissed` aren't the tech's).
        private var endedByUs: Set<String> = []
        /// Activities iOS ended (seen `.ended` first), and the ones being watched.
        private var endedBySystem: Set<String> = []
        private var watching: Set<String> = []

        private var startedAt: Date? {
            get { kv.get(Self.startedKey).flatMap(Double.init).map { Date(timeIntervalSince1970: $0) } }
            set {
                if let newValue {
                    kv.set(Self.startedKey, String(newValue.timeIntervalSince1970))
                } else {
                    kv.remove(Self.startedKey)
                }
            }
        }

        private func markOurs() {
            for activity in Activity<StopAttributes>.activities { endedByUs.insert(activity.id) }
        }

        /// Whether today's activity, gone while we still had a target, was removed by the tech:
        /// its last state (`.dismissed` after `.active`) when the phone still lists it, else its
        /// age (gone before iOS's limit). An `.ended` one is iOS's, and a fresh one starts.
        private func removedByTech(day: String) -> Bool {
            let today = Activity<StopAttributes>.activities.filter { $0.attributes.day == day }
            if today.contains(where: { $0.activityState == .ended }) { return false }
            if let gone = today.first(where: { $0.activityState == .dismissed }) {
                return !endedByUs.contains(gone.id) && !endedBySystem.contains(gone.id) && !pastSystemLimit
            }
            return !pastSystemLimit
        }

        private var pastSystemLimit: Bool {
            guard let startedAt else { return false }
            return Date().timeIntervalSince(startedAt) >= Self.systemLimit
        }

        /// Follows each activity's state while the app runs (`activityStateUpdates`).
        private func watchAll() {
            for activity in Activity<StopAttributes>.activities where !watching.contains(activity.id) {
                watch(activity.id)
            }
        }

        private func watch(_ id: String) {
            guard watching.insert(id).inserted else { return }
            weak let weakSelf = self
            Task {
                await Self.observe(id) { @MainActor state in weakSelf?.stateChanged(id, state) }
                weakSelf?.watching.remove(id)
            }
        }

        private func stateChanged(_ id: String, _ state: ActivityState) {
            switch state {
            case .ended:
                // Not ours: iOS's time limit. The next check starts a fresh one.
                if !endedByUs.contains(id) { endedBySystem.insert(id) }
            case .dismissed:
                guard !endedByUs.contains(id), !endedBySystem.contains(id), let day = target?.day else { return }
                // The tech removed it: off while the app stays in the background.
                dismissedOn = day
                target = nil
            default:
                break
            }
        }

        private nonisolated static func observe(
            _ id: String, _ changed: @escaping @Sendable (ActivityState) async -> Void
        ) async {
            guard let activity = Activity<StopAttributes>.activities.first(where: { $0.id == id }) else { return }
            for await state in activity.activityStateUpdates { await changed(state) }
        }

        /// Shows a stop: on the running activity when there is one, else a new activity.
        private func show(_ next: LiveStopTarget, day: String, alert: String? = nil) {
            guard let state = input(next) else { return }
            target = next
            let content = LiveStopState(stop: state, jobId: next.jobId, phone: phone(next.jobId))
            requesting = true
            Task { [weak self] in
                defer { self?.requesting = false }
                if await Self.update(content, day: day, alert: alert) { return }
                self?.markOurs()
                await Self.endAll()
                do {
                    let activity = try Activity.request(
                        attributes: StopAttributes(day: day),
                        content: ActivityContent(state: content, staleDate: nil), pushType: nil)
                    self?.startedAt = Date()
                    self?.watch(activity.id)
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
        private nonisolated static func update(_ content: LiveStopState, day: String, alert: String? = nil) async
            -> Bool
        {
            guard
                let activity = Activity<StopAttributes>.activities.first(where: {
                    $0.attributes.day == day && ($0.activityState == .active || $0.activityState == .stale)
                })
            else { return false }
            if let alert {
                await activity.update(
                    ActivityContent(state: content, staleDate: nil),
                    alertConfiguration: AlertConfiguration(
                        title: LocalizedStringResource(stringLiteral: content.stop.customer),
                        body: LocalizedStringResource(stringLiteral: alert), sound: .default))
            } else {
                await activity.update(ActivityContent(state: content, staleDate: nil))
            }
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
