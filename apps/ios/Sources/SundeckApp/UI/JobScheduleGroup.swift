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
        @State private var planMove: PlanVisitMove?
        /// A shared job's move waiting on Move Anyway (owner, 2026-10-24).
        @State private var asking: (ask: MoveNeedsConfirm, item: ScheduleJob, tech: String?, day: String?)?

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
                    keys: routePoints(scheduleJobs(sync.store, companyId: company.id), starts: ctx.startPoints))
            }
            .sheet(item: $moving) { target in
                if let board {
                    MoveSheet(
                        target: target, board: board,
                        onMove: { tech, day, index in
                            // Take Off Schedule.
                            moving = nil
                            applyMove(target.job, tech: tech, day: day) {
                                try ScheduleSaves.move(
                                    target.job.id, tech: tech, day: day, index: index, board: board, drive: drive)
                            }
                        }, lock: jobLock(target.job),
                        onSave: { tech, day, index, lock, lockOnly in
                            moving = nil
                            applyMove(target.job, tech: tech, day: day) {
                                try ScheduleSaves.save(
                                    target.job.id, tech: tech, day: day, index: index, lock: lock,
                                    lockOnly: lockOnly, board: board, drive: drive)
                            }
                        })
                }
            }
            .planMoveDialog($planMove) { m, schedule in resolve(m, changeSchedule: schedule) }
            .moveConfirmAlert(
                Binding(get: { asking?.ask }, set: { if $0 == nil { asking = nil } })
            ) { ask in
                guard let a = asking else { return }
                asking = nil
                applyMove(a.item, tech: a.tech, day: a.day) { (ask.updates, ask.message) }
            }
            .sheet(item: $suggesting) { item in
                if let board {
                    SuggestedTimesSheet(job: item, board: board, drive: drive) { s in
                        suggesting = nil
                        applyMove(item, tech: s.slot.techId, day: s.slot.date) {
                            try moveJob(
                                item.id, tech: s.slot.techId, date: s.slot.date, index: s.slot.position,
                                jobs: board.jobs, ctx: board.ctx, team: board.team, drive: drive)
                        }
                    }
                }
            }
        }

        private func from(_ item: ScheduleJob, _ board: Board) -> String? { ScheduleSaves.from(item, board) }

        /// A move of the job: a maintenance plan's visit asks Change Schedule or Just This Visit
        /// first (owner, 2026-10-20), as on Schedule.
        private func applyMove(
            _ item: ScheduleJob, tech: String?, day: String?,
            _ change: () throws -> (updates: [JobUpdate], message: String)
        ) {
            guard let company = session.company, let board else { return }
            do {
                let (updates, message) = try change()
                switch ScheduleSaves.decide(item, tech: tech, day: day, updates: updates, board: board) {
                case .ask(let m):
                    planMove = m
                case .save(let rows):
                    try saveRows(sync, companyId: company.id, rows)
                    // A lock saved alone says nothing (owner, 2026-10-20); the haptic confirms it.
                    result = message.isEmpty ? nil : (message, false)
                    saves += 1
                }
            } catch let ask as MoveNeedsConfirm {
                asking = (ask, item, tech, day)
            } catch {
                result = (userMessage(error), true)
            }
        }

        private func resolve(_ m: PlanVisitMove, changeSchedule: Bool) {
            planMove = nil
            guard let company = session.company, let board else { return }
            do {
                let said = try ScheduleSaves.resolve(
                    m, changeSchedule: changeSchedule, board: board, sync: sync, companyId: company.id)
                result = (said, false)
                saves += 1
            } catch {
                result = (userMessage(error), true)
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

        /// What a move saves, or whether it asks first (`planMoveDecision`).
        static func decide(
            _ item: ScheduleJob, tech: String?, day: String?, updates: [JobUpdate], board: Board
        ) -> PlanMoveDecision {
            planMoveDecision(
                item, tech: tech, date: day, updates: updates, ctx: board.ctx,
                canChangePlan: board.ctx.isManager && board.plans.contains { $0.planId == item.servicePlanId })
        }

        /// The answer to "Move <Customer>'s visits?": Change Schedule (the plan) or Just This
        /// Visit, saved through the sync layer; returns the banner's words.
        static func resolve(
            _ m: PlanVisitMove, changeSchedule: Bool, board: Board, sync: SyncService, companyId: String
        ) throws -> String {
            guard changeSchedule, let plan = board.plans.first(where: { $0.planId == m.job.servicePlanId }) else {
                try saveRows(sync, companyId: companyId, justThisVisitRows(m))
                return visitMovedBanner
            }
            try saveRows(sync, companyId: companyId, try changeScheduleRows(m, plan: plan, today: board.ctx.today))
            let tech = m.tech ?? plan.techId
            return planMovedBanner(
                m.job.customerName, weekdayNames[weekdayOf(m.date) ?? 0], tech.map(board.name) ?? "")
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
        @State private var planMove: PlanVisitMove?
        /// A shared job's move waiting on Move Anyway (owner, 2026-10-24).
        @State private var asking: (ask: MoveNeedsConfirm, item: ScheduleJob, tech: String?, day: String?)?

        var body: some View {
            Group {
                if let board, let item = board.jobs.first(where: { $0.id == jobId }) ?? job.map(ScheduleJob.init) {
                    MoveSheet(
                        target: MoveTarget(job: item, from: ScheduleSaves.from(item, board)), board: board,
                        onMove: { tech, day, index in
                            apply(item, tech: tech, day: day) {
                                try ScheduleSaves.move(
                                    jobId, tech: tech, day: day, index: index, board: board, drive: drive)
                            }
                        }, lock: jobLock(item),
                        onSave: { tech, day, index, lock, lockOnly in
                            apply(item, tech: tech, day: day) {
                                try ScheduleSaves.save(
                                    jobId, tech: tech, day: day, index: index, lock: lock, lockOnly: lockOnly,
                                    board: board, drive: drive)
                            }
                        })
                } else {
                    SkeletonRows(count: 4, label: "Loading the schedule")
                }
            }
            .planMoveDialog($planMove) { m, schedule in resolve(m, changeSchedule: schedule) }
            .moveConfirmAlert(
                Binding(get: { asking?.ask }, set: { if $0 == nil { asking = nil } })
            ) { ask in
                guard let a = asking else { return }
                asking = nil
                apply(a.item, tech: a.tech, day: a.day) { (ask.updates, ask.message) }
            }
            .task {
                guard let company = session.company, let user = session.user else { return }
                let start = job?.job["scheduled_start"]?.string.flatMap(parseISODate)
                let ctx = scheduleContext(sync.store, company: company, userId: user.id)
                drive = await cachedDriveTimes(
                    app, companyId: company.id,
                    keys: routePoints(scheduleJobs(sync.store, companyId: company.id), starts: ctx.startPoints))
                board = Board(
                    store: sync.store, kv: sync.kv, company: company, userId: user.id, view: .day,
                    date: start.map { localDay($0, timeZone: company.timeZone) }, tech: nil, drive: drive)
            }
        }

        private var job: JobView? {
            guard let company = session.company else { return nil }
            return (try? jobView(sync.store, companyId: company.id, jobId: jobId)) ?? nil
        }

        private func apply(
            _ item: ScheduleJob, tech: String?, day: String?,
            _ change: () throws -> (updates: [JobUpdate], message: String)
        ) {
            guard let company = session.company, let board else { return }
            do {
                let (updates, message) = try change()
                switch ScheduleSaves.decide(item, tech: tech, day: day, updates: updates, board: board) {
                case .ask(let m):
                    // A plan's visit: the question first, then the sheet closes.
                    planMove = m
                    return
                case .save(let rows):
                    try saveRows(sync, companyId: company.id, rows)
                    // A lock saved alone says nothing (owner, 2026-10-20).
                    done(message.isEmpty ? nil : ResultBanner(kind: .success, title: message))
                }
            } catch let ask as MoveNeedsConfirm {
                // The question first; the sheet stays until the answer.
                asking = (ask, item, tech, day)
                return
            } catch {
                done(ResultBanner(kind: .error, title: userMessage(error)))
            }
            dismiss()
        }

        private func resolve(_ m: PlanVisitMove, changeSchedule: Bool) {
            planMove = nil
            guard let company = session.company, let board else { return }
            do {
                let said = try ScheduleSaves.resolve(
                    m, changeSchedule: changeSchedule, board: board, sync: sync, companyId: company.id)
                done(ResultBanner(kind: .success, title: said))
            } catch {
                done(ResultBanner(kind: .error, title: userMessage(error)))
            }
            dismiss()
        }
    }
#endif

#if os(iOS)
    extension View {
        /// "Move Jake Turner’s Visit Too?" (owner, 2026-10-24): a plain alert when moving a shared
        /// job runs into its second tech's day, with Move Anyway and Cancel. `anyway` saves it;
        /// `cancel` runs after Cancel.
        func moveConfirmAlert(
            _ ask: Binding<MoveNeedsConfirm?>, cancel: @escaping () -> Void = {},
            anyway: @escaping (MoveNeedsConfirm) -> Void
        ) -> some View {
            alert(
                ask.wrappedValue?.confirm.title ?? "",
                isPresented: Binding(get: { ask.wrappedValue != nil }, set: { if !$0 { ask.wrappedValue = nil } }),
                presenting: ask.wrappedValue
            ) { a in
                Button(a.confirm.action) { anyway(a) }
                Button("Cancel", role: .cancel) { cancel() }
            } message: { a in
                Text(a.confirm.message)
            }
        }

        /// "Move <Customer>'s visits?" (owner, 2026-10-20): Change Schedule, Just This Visit,
        /// Cancel. `answer` gets the move and whether it's Change Schedule.
        func planMoveDialog(
            _ move: Binding<PlanVisitMove?>, answer: @escaping (PlanVisitMove, Bool) -> Void
        ) -> some View {
            confirmationDialog(
                PlanMoveChoices.title(move.wrappedValue?.job.customerName ?? ""),
                isPresented: Binding(get: { move.wrappedValue != nil }, set: { if !$0 { move.wrappedValue = nil } }),
                titleVisibility: .visible, presenting: move.wrappedValue
            ) { m in
                Button(PlanMoveChoices.changeSchedule) { answer(m, true) }
                Button(PlanMoveChoices.justThisVisit) { answer(m, false) }
                Button(PlanMoveChoices.cancel, role: .cancel) {}
            }
        }
    }
#endif
