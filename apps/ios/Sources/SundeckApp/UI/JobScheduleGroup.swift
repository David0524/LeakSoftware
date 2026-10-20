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
                                try moveJob(
                                    target.job.id, tech: tech, date: day, index: index, jobs: board.jobs,
                                    ctx: board.ctx, team: board.team, drive: drive)
                            }
                        }, lock: jobLock(target.job),
                        onSave: { tech, day, index, lock, lockOnly in
                            moving = nil
                            apply {
                                // Only the lock changed: save it alone, so the day isn't re-timed.
                                if lockOnly { return lockOnlyChange(lock, jobId: target.job.id) }
                                return try scheduleWithLock(lock, jobId: target.job.id, jobs: board.jobs) { jobs in
                                    try moveJob(
                                        target.job.id, tech: tech, date: day, index: index, jobs: jobs,
                                        ctx: board.ctx, team: board.team, drive: drive)
                                }
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

        /// The route the job is on now ("techId|date"), as the Schedule tab passes it.
        private func from(_ item: ScheduleJob, _ board: Board) -> String? {
            guard let start = item.scheduledStart else { return nil }
            return
                "\(item.assignedUserId ?? "none")|\(localDay(parseISODate(start) ?? Date(), timeZone: board.ctx.timeZone))"
        }

        private func apply(_ change: () throws -> (updates: [JobUpdate], message: String)) {
            guard let company = session.company else { return }
            do {
                let (updates, message) = try change()
                try saveJobUpdates(sync, companyId: company.id, updates)
                result = (message, false)
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
#endif
