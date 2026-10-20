#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Job › Details › Schedule (spec 5.4; the website's `JobSchedule`): the tech and time, its lock
    /// (with a padlock), then Schedule Job / Change Schedule (the Schedule tab's Move sheet)
    /// and Suggest Times. Shown until the job's work is done, started jobs included (owner,
    /// 2026-10-20: core `jobReschedulable`); repairs always.
    struct JobScheduleGroup: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var board: Board?
        @State private var drive = DriveTimes()
        @State private var moving: MoveTarget?
        @State private var suggesting: ScheduleJob?
        @State private var result: (text: String, failed: Bool)?
        @State private var saves = 0

        static func shows(_ job: JobView) -> Bool {
            jobReschedulable(type: job.type.rawValue, status: job.status.rawValue)
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                // The job as the schedule sees it; one not on any board yet (no time, nobody) is
                // read from the job itself, so it still gets Schedule Job.
                if let board {
                    let item = board.jobs.first(where: { $0.id == job.id }) ?? ScheduleJob(job)
                    Grouped(label: "Schedule") {
                        ListRow(
                            "Tech",
                            value: item.assignedUserId.flatMap { id in board.team.first { $0.id == id }?.name }
                                ?? "Nobody yet")
                        ListRow(
                            "When",
                            value: item.scheduledStart.flatMap { try? formatSchedule($0, Date(), board.ctx.timeZone) }
                                ?? "Not scheduled")
                        if let tag = jobLock(item).tag {
                            ListRow("Lock") {
                                Label(tag, systemImage: "lock.fill")
                                    .textRole(.body)
                                    .foregroundStyle(Color.textMuted)
                            }
                        }
                        ActionRow(item.scheduledStart == nil ? "Schedule Job" : "Change Schedule") {
                            moving = MoveTarget(job: item, from: from(item, board))
                        }
                        if canUnschedule(item.status) {
                            ActionRow("Suggest Times") { suggesting = item }
                        }
                    }
                    if let result {
                        Text(result.text)
                            .textRole(.secondary)
                            .foregroundStyle(result.failed ? Color.fail : Color.pass)
                            .padding(.horizontal, 16)
                    }
                }
            }
            .sensoryFeedback(.success, trigger: saves)
            .task(id: "\(sync.revision)|\(drive.known.count)") { reload() }
            .task(id: job.id) {
                guard let company = session.company, let user = session.user else { return }
                let ctx = scheduleContext(sync.store, company: company, userId: user.id)
                drive = await cachedDriveTimes(
                    app, companyId: company.id,
                    keys: routePoints(scheduleJobs(sync.store, companyId: company.id), depot: ctx.depot))
            }
            .sheet(item: $moving) { target in
                if let board {
                    MoveSheet(
                        target: target, board: board,
                        onMove: { tech, day, index in
                            // Take Off Schedule.
                            moving = nil
                            apply {
                                try ScheduleSaves.move(
                                    target.job.id, tech: tech, day: day, index: index, board: board, drive: drive)
                            }
                        }, lock: jobLock(target.job),
                        onSave: { tech, day, index, lock, lockOnly in
                            moving = nil
                            apply {
                                try ScheduleSaves.save(
                                    target.job.id, tech: tech, day: day, index: index, lock: lock,
                                    lockOnly: lockOnly, board: board, drive: drive)
                            }
                        })
                }
            }
            .sheet(item: $suggesting) { item in
                if let board {
                    SuggestedTimesSheet(job: item, board: board, drive: drive) { s in
                        suggesting = nil
                        apply {
                            try moveJob(
                                item.id, tech: s.slot.techId, date: s.slot.date, index: s.slot.position,
                                jobs: board.jobs, ctx: board.ctx, team: board.team, drive: drive)
                        }
                    }
                }
            }
        }

        private func from(_ item: ScheduleJob, _ board: Board) -> String? { ScheduleSaves.from(item, board) }

        private func apply(_ change: () throws -> (updates: [JobUpdate], message: String)) {
            guard let company = session.company else { return }
            do {
                let (updates, message) = try change()
                try saveJobUpdates(sync, companyId: company.id, updates)
                // A lock saved alone says nothing (owner, 2026-10-20); the haptic confirms it.
                result = message.isEmpty ? nil : (message, false)
                saves += 1
            } catch {
                result = (String(describing: error), true)
            }
        }

        private func reload() {
            guard let company = session.company, let user = session.user else { return }
            let start = job.job["scheduled_start"]?.string.flatMap(parseISODate)
            board = Board(
                store: sync.store, kv: sync.kv, company: company, userId: user.id, view: .day,
                date: start.map { localDay($0, timeZone: company.timeZone) }, tech: nil, drive: drive)
        }
    }

    /// The Move sheet's saves, the same from the job page's Schedule group and from a list's
    /// Move… (gestures spec section 12).
    @MainActor
    enum ScheduleSaves {
        /// The route the job is on now ("techId|date"), as the Schedule tab passes it.
        static func from(_ item: ScheduleJob, _ board: Board) -> String? {
            guard let start = item.scheduledStart else { return nil }
            return
                "\(item.assignedUserId ?? "none")|\(localDay(parseISODate(start) ?? Date(), timeZone: board.ctx.timeZone))"
        }

        /// Move, or Take Off Schedule (no tech and day).
        static func move(
            _ jobId: String, tech: String?, day: String?, index: Int, board: Board, drive: DriveTimes
        ) throws -> (updates: [JobUpdate], message: String) {
            try moveJob(
                jobId, tech: tech, date: day, index: index, jobs: board.jobs, ctx: board.ctx, team: board.team,
                drive: drive)
        }

        /// Save Schedule with its lock; only the lock changed: saved alone, so the day isn't re-timed.
        static func save(
            _ jobId: String, tech: String?, day: String?, index: Int, lock: JobLock, lockOnly: Bool, board: Board,
            drive: DriveTimes
        ) throws -> (updates: [JobUpdate], message: String) {
            if lockOnly { return lockOnlyChange(lock, jobId: jobId) }
            return try scheduleWithLock(lock, jobId: jobId, jobs: board.jobs) { jobs in
                try moveJob(
                    jobId, tech: tech, date: day, index: index, jobs: jobs, ctx: board.ctx, team: board.team,
                    drive: drive)
            }
        }
    }

    /// Move… from a list (Jobs): the job page's Change Schedule sheet, with its Lock, the board
    /// read for the job's day as it opens. `done` gets what the save said (nil: nothing to say).
    struct JobMoveSheet: View {
        var jobId: String
        var done: (ResultBanner?) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var board: Board?
        @State private var drive = DriveTimes()

        var body: some View {
            Group {
                if let board, let item = board.jobs.first(where: { $0.id == jobId }) ?? job.map(ScheduleJob.init) {
                    MoveSheet(
                        target: MoveTarget(job: item, from: ScheduleSaves.from(item, board)), board: board,
                        onMove: { tech, day, index in
                            apply {
                                try ScheduleSaves.move(
                                    jobId, tech: tech, day: day, index: index, board: board, drive: drive)
                            }
                        }, lock: jobLock(item),
                        onSave: { tech, day, index, lock, lockOnly in
                            apply {
                                try ScheduleSaves.save(
                                    jobId, tech: tech, day: day, index: index, lock: lock, lockOnly: lockOnly,
                                    board: board, drive: drive)
                            }
                        })
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                }
            }
            .task {
                guard let company = session.company, let user = session.user else { return }
                let start = job?.job["scheduled_start"]?.string.flatMap(parseISODate)
                let ctx = scheduleContext(sync.store, company: company, userId: user.id)
                drive = await cachedDriveTimes(
                    app, companyId: company.id,
                    keys: routePoints(scheduleJobs(sync.store, companyId: company.id), depot: ctx.depot))
                board = Board(
                    store: sync.store, kv: sync.kv, company: company, userId: user.id, view: .day,
                    date: start.map { localDay($0, timeZone: company.timeZone) }, tech: nil, drive: drive)
            }
        }

        private var job: JobView? {
            guard let company = session.company else { return nil }
            return (try? jobView(sync.store, companyId: company.id, jobId: jobId)) ?? nil
        }

        private func apply(_ change: () throws -> (updates: [JobUpdate], message: String)) {
            guard let company = session.company else { return }
            do {
                let (updates, message) = try change()
                try saveJobUpdates(sync, companyId: company.id, updates)
                // A lock saved alone says nothing (owner, 2026-10-20).
                done(message.isEmpty ? nil : ResultBanner(kind: .success, title: message))
            } catch {
                done(ResultBanner(kind: .error, title: String(describing: error)))
            }
            dismiss()
        }
    }
#endif
