#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Job › Details › Schedule (spec 5.4; the website's `JobSchedule`): the tech and time, whether
    /// the time was promised, then Schedule Job / Change Schedule (the Schedule tab's Move sheet)
    /// and Suggest Times. Shown for repair jobs and jobs not yet started.
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
            job.type == .repair || job.status == .scheduled || job.status == .unscheduled
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                if let board, let item = board.jobs.first(where: { $0.id == job.id }) {
                    Grouped(label: "Schedule") {
                        ListRow(
                            "Tech",
                            value: item.assignedUserId.flatMap { id in board.team.first { $0.id == id }?.name }
                                ?? "Nobody yet")
                        ListRow(
                            "When",
                            value: item.scheduledStart.flatMap { try? formatSchedule($0, Date(), board.ctx.timeZone) }
                                ?? "Not scheduled")
                        if item.arrivalFixed { ListRow("Time promised to the customer", value: "Yes") }
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
                    MoveSheet(target: target, board: board) { tech, day, index in
                        moving = nil
                        apply {
                            try moveJob(
                                target.job.id, tech: tech, date: day, index: index, jobs: board.jobs, ctx: board.ctx,
                                team: board.team, drive: drive)
                        }
                    }
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
