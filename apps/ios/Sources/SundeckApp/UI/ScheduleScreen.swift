#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// Schedule (spec 5.6, 6.3): Day, Week and Month from the phone's synced jobs. Day shows each
    /// tech's route with drive times, Optimize, the maps link and Move…; managers also see Needs a
    /// Time with Suggest Times. What a change did shows as a banner at the top (`resultBanner`).
    /// The board is built off the main thread and swapped in when ready, and Optimize and Plan
    /// Week plan off it too, so the screen never stops while they work (owner, 2026-10-20: "The
    /// Liquid Glass literally freezes up when I press 'plan route'"). A stop can also be dragged (touch and hold) to another place, tech or
    /// day, or to Needs a Time (owner, 2026-10-20), the same move as Move…. Week holds the routes work
    /// (owner, 2026-10-20: "Let's just build that all into Week"): every tech's row on each day,
    /// Optimize in each day's "⋯", Customers to Add with Suggest Days, and dragging between days
    /// and techs. Moving a maintenance plan's visit asks Change Schedule or Just This Visit. Every
    /// change is a write through the sync layer. Port of apps/web/src/app/(office)/schedule/page.tsx and
    /// components/route-board.tsx.
    struct ScheduleScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @State private var view = ScheduleView.day
        @State private var date: String?
        /// A tech's id, "all", or nil for the default (the first person with work in view).
        @State private var tech: String?
        @State private var drive = DriveTimes()
        @State private var board: Board?
        @State private var moving: MoveTarget?
        @State private var suggesting: ScheduleJob?
        @State private var picking = false
        /// What the last change did, at the top of the screen (owner, 2026-10-20).
        @State private var banner: ResultBanner?
        /// The day Optimize is working on (`routeKey`).
        @State private var optimizing: String?
        /// Plan Week is working.
        @State private var planningRun = false
        /// The next board animates in (stops sliding to their new places after Optimize or a move).
        @State private var animateNext = false
        @State private var saved = 0
        @State private var failed = 0
        /// Plan Week's sheet.
        @State private var planningWeek = false
        /// The rows that put the last change back (Undo on its banner), and what Undo says.
        @State private var undo: PendingUndo?
        /// A plan visit being moved, waiting for Change Schedule or Just This Visit.
        @State private var planMove: PlanVisitMove?
        /// Customers to Add: the plan whose Move sheet is open, and Suggest Days' results.
        @State private var movingPlan: PlanMoveTarget?
        @State private var suggestingDays = false
        @State private var suggestedDays: SuggestedDays?

        /// `view` opens on Week or Month (the screenshot tests); Day by default.
        init(view: ScheduleView = .day) { _view = State(initialValue: view) }

        var body: some View {
            ScreenScroll(spacing: 16) {
                if let board, let company = session.company {
                    PageHeader {
                        Text(board.title)
                        if board.date != board.ctx.today {
                            Text("·")
                            Button("Today") { date = board.ctx.today }
                                .font(.role(.bodyEmphasis))
                                .foregroundStyle(Color.link)
                                .frame(minHeight: minTarget)
                        }
                    }
                    if let tip = tipFor(
                        platform: .web, screen: "schedule", role: company.role, services: company.services,
                        seen: app.walkthrough.seen)
                    {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                    }
                    controls(board)
                    if view == .day {
                        WeekStrip(
                            date: board.date, today: board.ctx.today, pick: { date = $0 },
                            onDrop: { day, id in drop(id, on: .day(day)) })
                    }
                    if board.techs.count > 1 {
                        FilterPills(
                            selection: Binding(get: { board.tech }, set: { tech = $0 }),
                            options: board.techs.map(\.id) + ["all"],
                            label: { id in id == "all" ? "Everyone" : id == board.ctx.userId ? "Me" : board.name(id) },
                            canDrop: { $0 != "all" },
                            // A stop dropped on a person goes last on their day (Day view).
                            onDrop: view == .day
                                ? { id, job in drop(job, on: .route(tech: id, date: board.date, index: nil)) } : nil,
                            dot: { id in board.color(id) }
                        )
                        .padding(.horizontal, -16)
                        .accessibilityLabel("Whose schedule")
                    }
                    if let route = board.leadRoute {
                        DayLead(route: route, board: board, busy: optimizing == route.id) {
                            plan(route.techId, date: board.date, board)
                        }
                    }
                    notices(board)
                    if board.ctx.isManager && view != .month {
                        NeedsATimeCard(
                            jobs: board.tray, board: board, actions: stopActions, onSuggest: { suggesting = $0 },
                            onDrop: { drop($0, on: .needsATime) })
                    }
                    // Swipe left or right for the next or previous day, week or month (the arrows
                    // above do the same).
                    VStack(alignment: .leading, spacing: 16) {
                        switch view {
                        case .day: dayView(board)
                        case .week: weekView(board)
                        case .month: MonthGrid(board: board) { pick($0) }
                        }
                        if board.jobsShown == 0 {
                            Text(
                                "No jobs scheduled \(view == .day ? "this day" : view == .week ? "this week" : "this month")."
                            )
                            .textRole(.body).foregroundStyle(Color.textMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 240, alignment: .topLeading)
                    // The page follows the finger (owner, 2026-10-21), and the next one slides in
                    // when it's ready.
                    .pagingSwipe(
                        page: "\(board.view.rawValue)|\(board.date)",
                        previous: { date = step(board.date, -1) },
                        next: { date = step(board.date, 1) })
                } else {
                    ScheduleSkeleton()
                }
            }
            .refreshable { await sync.syncNow() }
            // A change's result has one Undo for the whole change (undo-and-redo.md).
            .resultBanner($banner, onUndo: undo.map { u in { undoLast(u) } })
            .navigationTitle("Schedule")
            .toolbar { NewJobToolbar(back: "Schedule") }
            .sensoryFeedback(.success, trigger: saved)
            .sensoryFeedback(.error, trigger: failed)
            .task(
                id:
                    "\(sync.revision)|\(session.company?.id ?? "")|\(view)|\(date ?? "")|\(tech ?? "")|\(drive.known.count)"
            ) {
                await reload()
            }
            .task(id: session.company?.id) {
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
                        move(target.job, tech: tech, date: day) {
                            try moveJob(
                                target.job.id, tech: tech, date: day, index: index, jobs: board.jobs, ctx: board.ctx,
                                team: board.team, drive: drive)
                        }
                    }
                }
            }
            .sheet(item: $suggesting) { job in
                if let board {
                    SuggestedTimesSheet(job: job, board: board, drive: drive) { s in
                        suggesting = nil
                        move(job, tech: s.slot.techId, date: s.slot.date) {
                            try moveJob(
                                job.id, tech: s.slot.techId, date: s.slot.date, index: s.slot.position,
                                jobs: board.jobs,
                                ctx: board.ctx, team: board.team, drive: drive)
                        }
                    }
                }
            }
            .sheet(isPresented: $planningWeek) {
                if let board {
                    PlanWeekSheet(board: board) { techs, tray in
                        planningWeek = false
                        planWeek(techs: techs, tray: tray, board)
                    }
                }
            }
            .sheet(item: $movingPlan) { target in
                if let board {
                    PlanMoveSheet(target: target, board: board) { day, tech in
                        movingPlan = nil
                        setPlan(target.plan, to: day, tech: tech)
                    }
                }
            }
            .sheet(item: $suggestedDays) { found in
                if let board {
                    SuggestedDaysSheet(found: found, board: board) {
                        suggestedDays = nil
                        keepDays(found)
                    }
                }
            }
            // Moving a maintenance plan's visit asks first (owner, 2026-10-20: "have a pop up ask
            // 'change schedule' or 'just today'").
            .confirmationDialog(
                PlanMoveChoices.title(planMove?.job.customerName ?? ""),
                isPresented: Binding(get: { planMove != nil }, set: { if !$0 { planMove = nil } }),
                titleVisibility: .visible, presenting: planMove
            ) { m in
                Button(PlanMoveChoices.changeSchedule) { changeSchedule(m) }
                Button(PlanMoveChoices.justThisVisit) { justThisVisit(m) }
                Button(PlanMoveChoices.cancel, role: .cancel) {}
            }
            .sheet(isPresented: $picking) {
                if let board {
                    DatePickSheet(date: board.date) {
                        date = $0
                        picking = false
                    }
                }
            }
        }

        // MARK: - Parts

        /// The arrows and the date button, then Day | Week | Month: one row, or two when they don't
        /// fit (large text).
        private func controls(_ board: Board) -> some View {
            let arrows = HStack(spacing: 8) {
                CircleButton(systemImage: "chevron.left", label: "Previous \(view.rawValue)") {
                    date = step(board.date, -1)
                }
                CircleButton(systemImage: "calendar", label: "Go to date") { picking = true }
                CircleButton(systemImage: "chevron.right", label: "Next \(view.rawValue)") {
                    date = step(board.date, 1)
                }
            }
            let views = Segmented(
                selection: $view, options: ScheduleView.allCases, label: \.title, title: "View", segmentPadding: 12)
            return ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    arrows
                    Spacer(minLength: 0)
                    views
                }
                VStack(alignment: .leading, spacing: 12) {
                    arrows
                    views
                }
            }
        }

        @ViewBuilder private func notices(_ board: Board) -> some View {
            if board.ctx.depot == nil {
                Notice(
                    kind: .warning,
                    text: "Routes start and end at the shop, which has no map location yet. "
                        + (board.ctx.isManager
                            ? "Set it in More › Settings › Scheduling and Routes."
                            : "An owner can set it in Settings › Scheduling."))
            }
            if board.unlocated {
                Text(
                    "Pools marked “No map location” aren’t counted in drive times: their address wasn’t found on the map. Check the address on the customer’s pool."
                )
                .textRole(.secondary).foregroundStyle(Color.textMuted)
            }
        }

        @ViewBuilder private func dayView(_ board: Board) -> some View {
            ForEach(board.shownTechs) { t in
                RouteCard(
                    tech: t, board: board, route: board.loaded.routes[routeKey(t.id, board.date)],
                    busy: optimizing == routeKey(t.id, board.date), onPlan: { plan(t.id, date: board.date, board) },
                    actions: stopActions,
                    onDrop: { id, index in drop(id, on: .route(tech: t.id, date: board.date, index: index)) },
                    lead: board.leadRoute?.techId == t.id)
            }
        }

        /// Week (owner, 2026-10-20: "On routes, you can't optimize or rearrange placement … Let's
        /// just build that all into Week"): Customers to Add, Optimize Week (Plan Week), then each
        /// day with every tech's row; each day's "⋯" optimizes a tech's day; stops drag within a
        /// day or to another day or tech.
        @ViewBuilder private func weekView(_ board: Board) -> some View {
            if board.ctx.isManager {
                CustomersToAddCard(
                    plans: board.toAdd, busy: suggestingDays,
                    onMove: { movingPlan = PlanMoveTarget(plan: $0, day: nil) },
                    onSuggest: { suggestDays(board) })
            }
            // Owners and admins: put the week's movable jobs on days for the least driving.
            if board.ctx.isManager && !planWeekDates(board.days, today: board.ctx.today).isEmpty {
                Button {
                    planningWeek = true
                } label: {
                    BusyLabel(title: "Optimize Week", busyTitle: "Planning…", busy: planningRun)
                }
                .buttonStyle(.secondary(fullWidth: true))
                .disabled(planningRun)
                .accessibilityHint("Opens Plan Week, to plan this week’s routes")
            }
            ForEach(board.days, id: \.self) { d in weekDay(d, board) }
        }

        @ViewBuilder private func weekDay(_ d: String, _ board: Board) -> some View {
            let rows = board.weekTechs(d)
            let unassigned = board.tech == "all" ? board.loaded.unassigned[d] ?? [] : []
            let empty = rows.allSatisfy { ($0.route?.jobs ?? []).isEmpty } && unassigned.isEmpty
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 8) {
                    Button {
                        pick(d)
                    } label: {
                        Text(formatDay(d, long: true) + (d == board.ctx.today ? " · Today" : ""))
                            .textRole(.subHeading)
                            .foregroundStyle(d == board.ctx.today ? Color.link : Color.text)
                            .multilineTextAlignment(.leading)
                            .frame(minHeight: minTarget)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityHint("Opens the day")
                    Spacer(minLength: 0)
                    dayMenu(d, rows: rows, board)
                }
                // A stop dropped on a day keeps its tech and goes last that day.
                .scheduleDropTarget(cornerRadius: CGFloat(Radius.block)) { drop($0, on: .day(d)) }
                if empty && rows.isEmpty {
                    Text("Nothing scheduled").textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                ForEach(rows) { row in
                    weekTech(row.tech, route: row.route, day: d, board)
                }
                if !unassigned.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("No tech yet").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            .padding(.horizontal, 16)
                            .frame(minHeight: minTarget)
                        weekRows(
                            unassigned.map {
                                WeekItem(
                                    job: $0, tech: "No tech yet", cleanings: board.cleanings[$0.id] ?? [],
                                    note: stopNote($0, routeTech: nil, names: board.names))
                            }, day: d, tech: nil, board)
                    }
                }
            }
        }

        /// One tech's row on a day: their dot and name with the day's stops and driving (a stop
        /// dropped on it goes last), then the stops (a stop dropped on one takes its place).
        @ViewBuilder private func weekTech(_ t: TeamMember, route: DayRoute?, day d: String, _ board: Board)
            -> some View
        {
            let jobs = route?.jobs ?? []
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    TechDot(color: t.color)
                    Text(t.name).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text(
                        route.map {
                            "\($0.jobs.count) \($0.jobs.count == 1 ? "stop" : "stops") · \(durationLabel($0.summary.driveMin))"
                        } ?? "Nothing scheduled"
                    )
                    .textRole(.secondary).foregroundStyle(Color.textMuted).monospacedDigit()
                    .contentTransition(.numericText())
                    .multilineTextAlignment(.trailing)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
                .scheduleDropTarget(cornerRadius: CGFloat(Radius.block)) {
                    drop($0, on: .route(tech: t.id, date: d, index: nil))
                }
                .accessibilityElement(children: .combine)
                if !jobs.isEmpty {
                    weekRows(
                        jobs.map {
                            WeekItem(
                                job: $0, tech: t.name, cleanings: board.cleanings[$0.id] ?? [],
                                note: stopNote($0, routeTech: t.id, names: board.names),
                                color: board.color($0.assignedUserId))
                        }, day: d, tech: t.id, board)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(t.name), \(formatDay(d, long: true))")
        }

        private func weekRows(_ items: [WeekItem], day d: String, tech: String?, _ board: Board) -> some View {
            // Not lazy: a lazy stack inside the page's lazy stack can leave rows undrawn after the
            // board changes under it (the week's rows are a few a day).
            GroupedRows(items, lazy: false) { item in
                // Swipe left for Move…, right to lock; touch and hold for the menu, and drag from
                // it to move (gestures spec section 12).
                let actions = stopActions(item.job, from: "\(item.job.assignedUserId ?? "none")|\(d)")
                SwipeActionsRow(
                    actions: actions.trailing, leading: actions.leading, menuTitle: actions.title,
                    menuItems: actions.menu, gripWidth: actions.movable ? 32 : 0
                ) {
                    Button {
                        openRoute(.job(item.job.id))
                    } label: {
                        WeekRow(item: item, timeZone: board.ctx.timeZone, movable: actions.movable)
                            .techStripe(item.color)
                    }
                    .buttonStyle(.row)
                    .zoomSource(item.job.id)
                }
                .scheduleDragSource(item.job)
                .scheduleDropTarget(cornerRadius: 0) { id in
                    let index = items.firstIndex { $0.id == item.id }
                    let target: ScheduleDrop =
                        tech.map { ScheduleDrop.route(tech: $0, date: d, index: index) } ?? .day(d)
                    return drop(id, on: target)
                }
            }
        }

        /// A day's "⋯": Open Day, and Optimize for each tech with stops (today and later).
        private func dayMenu(_ d: String, rows: [WeekTechRow], _ board: Board)
            -> some View
        {
            let planned = d >= board.ctx.today ? rows.filter { !($0.route?.jobs ?? []).isEmpty } : []
            return Menu {
                Button("Open Day", systemImage: "calendar") { pick(d) }
                ForEach(planned) { row in
                    Button {
                        plan(row.tech.id, date: d, board)
                    } label: {
                        Label {
                            Text(planned.count == 1 && board.tech != "all" ? "Optimize" : "Optimize \(row.tech.name)")
                        } icon: {
                            row.tech.color.menuImage
                        }
                    }
                    .disabled(optimizing != nil)
                }
            } label: {
                Group {
                    if let busy = optimizing, rows.contains(where: { routeKey($0.tech.id, d) == busy }) {
                        ProgressView().controlSize(.small).tint(Color.link)
                    } else {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(Color.link)
                    }
                }
                .frame(width: minTarget, height: minTarget)
                .contentShape(Circle())
            }
            .accessibilityLabel("Actions for \(formatDay(d, long: true))")
        }

        // MARK: - Actions

        private func pick(_ day: String) {
            date = day
            view = .day
        }

        private func step(_ d: String, _ n: Int) -> String {
            switch view {
            case .day: (try? addDays(d, n)) ?? d
            case .week: (try? addDays(d, 7 * n)) ?? d
            case .month: (try? addMonths(d, n)) ?? d
            }
        }

        private func openMove(_ job: ScheduleJob, from: String?) { moving = MoveTarget(job: job, from: from) }

        /// A stop's swipes and menu (gestures spec section 12), each the same as its button: Move…
        /// opens the Move sheet, the locks save as the Move sheet's Lock does (alone, so the day
        /// isn't re-timed), Take Off Schedule is the sheet's, and Directions the address's.
        private func stopActions(_ job: ScheduleJob, from: String?) -> ScheduleStopActions {
            ScheduleStopActions(
                job: job, onMove: { openMove(job, from: from) }, onLock: { lock(job, $0) },
                onTakeOff: from != nil && canUnschedule(job.status) ? { takeOff(job) } : nil,
                onOpen: { openRoute(.job(job.id)) },
                onDirections: job.address.isEmpty
                    ? nil
                    : {
                        if let url = directionsURL(job.place, app: MapsApp(sync.kv)) { openURL(url) }
                    })
        }

        /// Lock Day or Lock Time (or Unlock): the lock alone, with no message (owner, 2026-10-20:
        /// "Don't do lock messages"); the card's lock icon and the haptic say it.
        ///
        /// Nothing moves, so the board swaps in without animating (owner, 2026-10-21: "when you
        /// try to lock the time in the schedule, it removes almost everyone from the routes"):
        /// an animated swap of every route while the row's menu or swipe was still closing left
        /// the stacked rows undrawn until the app was reopened.
        private func lock(_ job: ScheduleJob, _ lock: JobLock) {
            saveTable(lockOnlyChange(lock, jobId: job.id).updates.map(TableUpdate.init), nil, animate: false)
        }

        /// Take Off Schedule, as the Move sheet's: back to Needs a Time.
        private func takeOff(_ job: ScheduleJob) {
            guard let board else { return }
            move(job, tech: nil, date: nil) {
                try moveJob(
                    job.id, tech: nil, date: nil, index: 0, jobs: board.jobs, ctx: board.ctx, team: board.team,
                    drive: drive)
            }
        }

        /// Optimize: the day planned off the main thread (the button shows Optimizing… at once),
        /// then saved through the sync layer, the stops sliding into their new order, and the
        /// result on the banner.
        private func plan(_ techId: String, date: String, _ board: Board) {
            guard optimizing == nil else { return }
            optimizing = routeKey(techId, date)
            let (jobs, ctx, team, drive) = (board.jobs, board.ctx, board.team, drive)
            Task {
                let outcome = await Task.detached(priority: .userInitiated) {
                    Result {
                        try optimizeDay(techId: techId, date: date, jobs: jobs, ctx: ctx, team: team, drive: drive)
                    }
                }.value
                optimizing = nil
                switch outcome {
                case .success(let planned):
                    let summary = planned.summary
                    save(
                        planned.updates,
                        ResultBanner(
                            kind: summary.warning == nil ? .success : .warning, title: summary.title,
                            detail: summary.warning))
                case .failure(let error):
                    fail(error)
                }
            }
        }

        /// Plan Week, on the phone: core `planWeek` on the synced jobs, off the main thread, every
        /// change saved through the sync layer in one transaction, then its result with Undo.
        private func planWeek(techs: [String], tray: Bool, _ board: Board) {
            guard !planningRun else { return }
            planningRun = true
            let dates = planWeekDates(board.days, today: board.ctx.today)
            let (jobs, ctx, team, drive) = (board.jobs, board.ctx, board.team, drive)
            Task {
                let outcome = await Task.detached(priority: .userInitiated) {
                    Result {
                        try planTheWeek(
                            dates: dates, techs: techs, tray: tray, jobs: jobs, ctx: ctx, team: team, drive: drive)
                    }
                }.value
                planningRun = false
                switch outcome {
                case .success(let week):
                    let undo =
                        week.undo.isEmpty
                        ? nil
                        : PendingUndo(rows: undoWeekPlan(week.undo).map(TableUpdate.init), message: weekPlanUndone)
                    save(
                        week.updates,
                        ResultBanner(kind: .success, title: week.message, detail: week.detail, undoable: undo != nil),
                        undo: undo)
                case .failure(let error):
                    fail(error)
                }
            }
        }

        /// Undo: every row back as it was.
        private func undoLast(_ u: PendingUndo) {
            saveTable(u.rows, ResultBanner(kind: .success, title: u.message))
        }

        /// A stop or a Customers to Add tile dropped on the schedule: the same move as Move…,
        /// through the sync layer. False (it slides back) when the move is refused, with the
        /// reason on the banner.
        private func drop(_ item: String, on target: ScheduleDrop) -> Bool {
            guard let board else { return false }
            if let planId = planDragId(item) { return dropPlan(planId, on: target, board) }
            guard let job = board.jobs.first(where: { $0.id == item }) else { return false }
            let to: (tech: String?, date: String?) =
                switch target {
                case .route(let tech, let date, _): (tech, date)
                case .day(let date): (job.assignedUserId, date)
                case .needsATime: (nil, nil)
                }
            return move(job, tech: to.tech, date: to.date) {
                try dropJob(item, on: target, jobs: board.jobs, ctx: board.ctx, team: board.team, drive: drive)
            }
        }

        /// Any move of a job: a maintenance plan's visit going to another day or tech asks first
        /// (Change Schedule or Just This Visit); anything else is saved at once.
        @discardableResult
        private func move(
            _ job: ScheduleJob, tech: String?, date: String?,
            _ change: () throws -> (updates: [JobUpdate], message: String)?
        ) -> Bool {
            guard let board else { return false }
            // Off the schedule (Needs a Time, Take Off Schedule) or to Nobody yet, a plan visit is
            // always a one-off: no question, but marked so the plan never puts it back; Undo
            // restores both.
            if date == nil || tech == nil, job.servicePlanId != nil {
                do {
                    guard let (updates, message) = try change() else { return true }
                    let rows = justThisVisitRows(PlanVisitMove(job: job, tech: tech, date: "", updates: updates))
                    return saveTable(
                        rows, ResultBanner(kind: .success, title: message.isEmpty ? "Moved" : message, undoable: true),
                        undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
                } catch {
                    fail(error)
                    return false
                }
            }
            guard let date, asksToMovePlanVisit(job, tech: tech, date: date, ctx: board.ctx) else {
                return apply(change)
            }
            do {
                guard let (updates, _) = try change() else { return true }
                let pending = PlanVisitMove(job: job, tech: tech, date: date, updates: updates)
                // Only owners and admins change a plan; a tech's move is this visit only.
                if board.ctx.isManager && board.plans.contains(where: { $0.planId == job.servicePlanId }) {
                    planMove = pending
                } else {
                    justThisVisit(pending)
                }
                return true
            } catch {
                fail(error)
                return false
            }
        }

        /// Change Schedule: the plan moves to the new weekday and tech (every coming visit
        /// follows), with Undo.
        private func changeSchedule(_ m: PlanVisitMove) {
            planMove = nil
            guard let board, let plan = board.plans.first(where: { $0.planId == m.job.servicePlanId }) else { return }
            do {
                let rows = try changeScheduleRows(m, plan: plan, today: board.ctx.today)
                let tech = m.tech ?? plan.techId ?? ""
                saveTable(
                    rows,
                    ResultBanner(
                        kind: .success,
                        title: planMovedBanner(
                            m.job.customerName, weekdayNames[weekdayOf(m.date) ?? 0],
                            tech.isEmpty ? "" : board.name(tech)),
                        undoable: true),
                    undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
            } catch {
                fail(error)
            }
        }

        /// Just This Visit: only this visit moves, marked so remaking the plan's visits never puts
        /// it back; Undo restores it.
        private func justThisVisit(_ m: PlanVisitMove) {
            planMove = nil
            let rows = justThisVisitRows(m)
            saveTable(
                rows, ResultBanner(kind: .success, title: visitMovedBanner, undoable: true),
                undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
        }

        /// A Customers to Add tile dropped on a tech's day: the plan goes on that weekday with
        /// them. On a day with several techs showing, its Move sheet opens on that day.
        private func dropPlan(_ planId: String, on target: ScheduleDrop, _ board: Board) -> Bool {
            guard let plan = board.plans.first(where: { $0.planId == planId }) else { return false }
            switch target {
            case .route(let tech, let date, _):
                guard let day = weekdayOf(date) else { return false }
                setPlan(plan, to: day, tech: tech)
                return true
            case .day(let date):
                guard let day = weekdayOf(date) else { return false }
                let techs = board.shownTechs.filter(\.active)
                if techs.count == 1 {
                    setPlan(plan, to: day, tech: techs[0].id)
                } else {
                    movingPlan = PlanMoveTarget(plan: plan, day: day)
                }
                return true
            case .needsATime:
                return false
            }
        }

        /// A plan on a weekday with a tech (its coming visits follow), with Undo.
        private func setPlan(_ plan: RoutePlanCard, to day: Int, tech: String) {
            guard let board else { return }
            do {
                let row = try planDayUpdate(plan, from: nil, to: day, tech: tech, today: board.ctx.today)
                saveTable(
                    [row],
                    ResultBanner(
                        kind: .success,
                        title: planMovedBanner(plan.customer, weekdayNames[day], board.name(tech)),
                        undoable: true),
                    undo: PendingUndo(rows: undoRows(sync.store, [row]), message: putBackMessage))
            } catch {
                fail(error)
            }
        }

        /// Suggest Days for Customers to Add, among the techs shown (Everyone: every active tech),
        /// off the main thread; nothing is saved until Keep.
        private func suggestDays(_ board: Board) {
            guard !suggestingDays, !board.toAdd.isEmpty else { return }
            suggestingDays = true
            let techs = board.shownTechs.filter(\.active).map(\.id)
            let (toAdd, all, ctx, drive) = (board.toAdd, board.plans, board.ctx, drive)
            Task {
                let found = await Task.detached(priority: .userInitiated) {
                    suggestPlanDays(toAdd: toAdd, all: all, techs: techs, ctx: ctx, drive: drive)
                }.value
                suggestingDays = false
                if found.suggestions.isEmpty {
                    banner = ResultBanner(
                        kind: .warning, title: noSuggestionsMessage(leftOutNote(toAdd, left: found.left)))
                } else {
                    suggestedDays = SuggestedDays(
                        suggestions: found.suggestions, note: leftOutNote(toAdd, left: found.left))
                }
            }
        }

        /// Keep: each suggested day and tech saved, with one Undo.
        private func keepDays(_ found: SuggestedDays) {
            guard let board else { return }
            do {
                let rows = try found.suggestions.compactMap { s -> TableUpdate? in
                    guard let plan = board.plans.first(where: { $0.planId == s.id }) else { return nil }
                    return try planDayUpdate(plan, from: nil, to: s.day, tech: s.techId, today: board.ctx.today)
                }
                saveTable(
                    rows, ResultBanner(kind: .success, title: keptDaysMessage(rows.count), undoable: true),
                    undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
            } catch {
                fail(error)
            }
        }

        /// Saves a planning change through the sync layer and says what happened on the banner.
        /// Nil from `change` is nothing to do (a stop dropped where it was).
        @discardableResult
        private func apply(_ change: () throws -> (updates: [JobUpdate], message: String)?) -> Bool {
            do {
                guard let (updates, message) = try change() else { return true }
                return save(updates, ResultBanner(kind: .success, title: message.isEmpty ? "Moved" : message))
            } catch {
                fail(error)
                return false
            }
        }

        /// The rows, in one transaction; the next board animates in, and the banner says so.
        @discardableResult
        private func save(_ updates: [JobUpdate], _ result: ResultBanner?, undo: PendingUndo? = nil) -> Bool {
            saveTable(updates.map(TableUpdate.init), result, undo: undo)
        }

        @discardableResult
        private func saveTable(
            _ updates: [TableUpdate], _ result: ResultBanner?, undo: PendingUndo? = nil, animate: Bool = true
        ) -> Bool {
            guard let company = session.company else { return false }
            do {
                try saveRows(sync, companyId: company.id, updates)
                self.undo = undo
                animateNext = animate && !updates.isEmpty
                if let result { banner = result }
                saved += 1
                return true
            } catch {
                fail(error)
                return false
            }
        }

        private func fail(_ error: any Error) {
            undo = nil
            banner = ResultBanner(kind: .error, title: String(describing: error))
            failed += 1
        }

        /// The board for what's chosen, read from the phone's database off the main thread; the
        /// last one stays on screen until the new one is ready, so nothing blinks. After a change
        /// the stops slide to their new places; a new day, week or view cross-fades in.
        private func reload() async {
            guard let company = session.company, let user = session.user else { return }
            let (store, kv, view, date, tech, drive) = (sync.store, sync.kv, view, date, tech, drive)
            let next = await Task.detached(priority: .userInitiated) {
                Board(
                    store: store, kv: kv, company: company, userId: user.id, view: view, date: date, tech: tech,
                    drive: drive)
            }.value
            guard !Task.isCancelled else { return }
            let moved = board.map { $0.date != next.date || $0.view != next.view || $0.tech != next.tech } ?? false
            withAnimation(animateNext || moved ? Motion.snappy : nil) { board = next }
            animateNext = false
            // Pools on the stops shown that were never looked up on the map: ask in the background.
            let stops = next.shownTechs.flatMap { t in
                next.days.flatMap { next.loaded.routes[routeKey(t.id, $0)]?.jobs ?? [] }
            }
            MissingPins.find(stops, companyId: company.id, queue: app.locate, api: app.api, sync: sync)
        }
    }

    /// Who and where a Move… is for: the job and the route it's on ("techId|date", nil from Needs a Time).
    struct MoveTarget: Identifiable {
        var job: ScheduleJob
        var from: String?
        var id: String { job.id }
    }

    /// Everything the schedule shows for a view and date, worked out once when the data changes
    /// (never in a view's body), off the main thread.
    struct Board: Sendable {
        var ctx: ScheduleContext
        var team: [TeamMember]
        var jobs: [ScheduleJob]
        var date: String
        var view: ScheduleView
        var days: [String]
        var loaded: LoadedRoutes
        /// People with a route in view: you first, then everyone else.
        var techs: [TeamMember]
        /// A tech's id or "all".
        var tech: String
        var tray: [ScheduleJob]
        var mapsApp: MapsApp
        /// Each visit's plan cleanings on its checklist (owner, 2026-10-20: "The filter/salt
        /// cells don't show up on the dates they're due").
        var cleanings: [String: [ScheduledCleaning]] = [:]
        /// The server looks addresses up, so "Not on map" can show (`MapLookups`).
        var routing = false
        /// Each teammate's name by id (every stop's note reads it).
        var names: [String: String] = [:]
        /// The map that leads Day view with one tech chosen (`leadRoute`).
        var leadMap: DayMapModel?
        /// Each teammate's color by id (their dot and their cards' stripe).
        var colors: [String: TechColor] = [:]
        /// Managers: the running maintenance plans, and Week's Customers to Add.
        var plans: [RoutePlanCard] = []
        var toAdd: [RoutePlanCard] = []

        init(
            store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, view: ScheduleView, date: String?,
            tech wanted: String?, drive: DriveTimes
        ) {
            ctx = scheduleContext(store, company: company, userId: userId)
            team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
            jobs = scheduleJobs(store, companyId: company.id)
            self.date = date ?? ctx.today
            self.view = view
            days = (try? scheduleDays(view, self.date)) ?? [self.date]
            loaded = loadRoutes(jobs, ctx: ctx, dates: days, team: team, drive: drive)
            let (ctx, days, loaded) = (ctx, days, loaded)
            techs = team.filter { t in
                (ctx.seesAll || t.id == ctx.userId)
                    && (t.active || days.contains { loaded.routes[routeKey(t.id, $0)] != nil })
            }
            let techs = techs
            if wanted == "all" && techs.count > 1 {
                tech = "all"
            } else if let wanted, techs.contains(where: { $0.id == wanted }) {
                tech = wanted
            } else {
                tech =
                    techs.first { t in days.contains { loaded.routes[routeKey(t.id, $0)] != nil } }?.id
                    ?? techs.first?.id ?? "all"
            }
            tray = ctx.isManager ? needsATime(jobs, ctx: ctx) : []
            mapsApp = MapsApp(kv)
            routing = MapLookups.on(kv, company: try? store.get("company", company.id))
            let shown = Set(
                loaded.routes.values.flatMap { $0.jobs.map(\.id) } + loaded.unassigned.values.flatMap { $0.map(\.id) })
            cleanings = scheduledCleanings(store, companyId: company.id, jobIds: shown)
            names = Dictionary(team.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
            colors = Dictionary(team.map { ($0.id, $0.color) }, uniquingKeysWith: { a, _ in a })
            if ctx.isManager {
                plans = routePlans(store, companyId: company.id, today: ctx.today)
                if view == .week { toAdd = customersToAdd(plans, techIds: team.filter(\.active).map(\.id)) }
            }
            if let route = leadRoute {
                leadMap = dayMapModel(
                    jobs: route.jobs, depot: ctx.depot, date: self.date, today: ctx.today, tech: route.techName,
                    timeZone: ctx.timeZone)
            }
        }

        func name(_ id: String) -> String { names[id] ?? "Teammate" }

        func color(_ id: String?) -> TechColor? { id.flatMap { colors[$0] } }

        /// Week: the techs' rows on a day: every shown active tech on a working day (so a stop can
        /// be dropped on anyone), and on other days only those with stops.
        func weekTechs(_ d: String) -> [WeekTechRow] {
            let working = weekdayOf(d).map { ctx.settings.workDays.contains($0) } ?? true
            return shownTechs.compactMap { t in
                let route = loaded.routes[routeKey(t.id, d)].flatMap { $0.jobs.isEmpty ? nil : $0 }
                return route != nil || (working && t.active) ? WeekTechRow(tech: t, route: route) : nil
            }
        }

        var shownTechs: [TeamMember] { techs.filter { tech == "all" || $0.id == tech } }

        /// Day view with one tech chosen who has stops: their day, whose map leads the screen.
        var leadRoute: DayRoute? {
            guard view == .day, tech != "all", let route = loaded.routes[routeKey(tech, date)],
                !route.jobs.isEmpty
            else { return nil }
            return route
        }

        var title: String {
            switch view {
            case .day: formatDay(date, long: true)
            case .week: "\(formatDay(days.first ?? date)) – \(formatDay(days.last ?? date))"
            case .month: formatMonth(date)
            }
        }

        var unlocated: Bool {
            shownTechs.contains { t in
                days.contains { d in loaded.routes[routeKey(t.id, d)]?.jobs.contains { $0.location == nil } ?? false }
            }
        }

        var jobsShown: Int {
            let routed = shownTechs.reduce(0) { n, t in
                n + days.reduce(0) { $0 + (loaded.routes[routeKey(t.id, $1)]?.jobs.count ?? 0) }
            }
            let extra = tech == "all" ? days.reduce(0) { $0 + (loaded.unassigned[$1]?.count ?? 0) } : 0
            return routed + extra
        }

        /// Month cell counts: jobs (maintenance visits counted as cleanings).
        func counts(_ d: String) -> (jobs: Int, cleanings: Int) {
            var jobs = 0
            var cleanings = 0
            for t in shownTechs {
                for j in loaded.routes[routeKey(t.id, d)]?.jobs ?? [] {
                    if j.type == .maintenance && j.secondTechId == nil { cleanings += 1 } else { jobs += 1 }
                }
            }
            if tech == "all" { jobs += loaded.unassigned[d]?.count ?? 0 }
            return (jobs, cleanings)
        }

        /// The cleanings on a day's shown visits, by name, once each (the month cell's VoiceOver).
        func cleaningNames(_ d: String) -> [String] {
            var names: [String] = []
            var jobs = shownTechs.flatMap { loaded.routes[routeKey($0.id, d)]?.jobs ?? [] }
            if tech == "all" { jobs += loaded.unassigned[d] ?? [] }
            for j in jobs {
                for c in cleanings[j.id] ?? [] where !names.contains(c.name) { names.append(c.name) }
            }
            return names
        }

        /// The kinds of cleaning on a day's shown visits, once each, for the month cell's icons.
        func cleaningKinds(_ d: String) -> [CleaningKind] {
            var kinds: [CleaningKind] = []
            var jobs = shownTechs.flatMap { loaded.routes[routeKey($0.id, d)]?.jobs ?? [] }
            if tech == "all" { jobs += loaded.unassigned[d] ?? [] }
            for j in jobs {
                for c in cleanings[j.id] ?? [] where !kinds.contains(c.kind) { kinds.append(c.kind) }
            }
            return kinds
        }
    }

    /// A 44 round secondary button (the schedule's ‹, date, ›).
    struct CircleButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.link)
                    .frame(width: minTarget, height: minTarget)
                    .glassSurface(Circle(), tint: Color.tinted, interactive: true, fallback: .tinted)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    /// Day view's week strip (spec 5.6): Monday to Sunday. A stop dragged over a day opens that
    /// day after a moment (spring loading), and dropped on it goes there.
    ///
    /// Swiping it moves a week (owner, 2026-10-21: "Should be able to drag it as fast or slow as
    /// you want, hold halfway, etc."; `PagerRule`): the weeks before and after sit beside this
    /// one, so the strip follows the finger 1:1 and shows the week coming in; it can be held
    /// halfway and taken back. Let go past a quarter of its width or with a flick and it springs
    /// on to that week, on the same weekday, at the finger's speed; otherwise it springs back. A
    /// new week from the arrows or Today slides in from its side. Up and down still scroll the
    /// page. With Reduce Motion the strip doesn't follow the finger and the week cross-fades.
    struct WeekStrip: View {
        var date: String
        var today: String
        var pick: (String) -> Void
        /// A stop dropped on a day (day, job id): true when it moved.
        var onDrop: ((String, String) -> Bool)?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var targeted: String?
        /// The day the strip stands on while its swipe settles (the screen's date follows).
        @State private var shown: String?
        /// The day a swipe is springing on to.
        @State private var pending: String?
        @State private var offset: CGFloat = 0
        @State private var axis: PagerRule.Axis?
        @State private var width: CGFloat = 358
        /// A sideways drag is on: a day's button doesn't take the lift as a tap.
        @State private var swiping = false
        @State private var turns = 0
        @GestureState private var held = false

        /// The space between weeks as they pass.
        private let gap: CGFloat = 4
        private var current: String { shown ?? date }
        private var page: CGFloat { width + gap }

        var body: some View {
            let start = (try? weekStart(current)) ?? current
            ZStack(alignment: .topLeading) {
                ForEach([-7, 0, 7], id: \.self) { shift in
                    let first = (try? addDays(start, shift)) ?? start
                    week(first)
                        .frame(width: width)
                        .offset(x: CGFloat(shift / 7) * page + offset)
                        // Only this week is touched and read aloud; its neighbors are scenery.
                        .allowsHitTesting(shift == 0)
                        .accessibilityHidden(shift != 0)
                        .id(reduceMotion && shift == 0 ? first : "\(shift)")
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 56, maxHeight: 56, alignment: .topLeading)
            .onGeometryChange(for: CGFloat.self) {
                $0.size.width
            } action: {
                width = max($0, 1)
            }
            .clipped()
            .contentShape(Rectangle())
            .simultaneousGesture(drag)
            .sensoryFeedback(.impact(weight: .light), trigger: turns)
            .onChange(of: date) { old, new in arrive(from: old, to: new) }
            .onChange(of: held) { _, now in
                guard !now else { return }
                Task {
                    try? await Task.sleep(for: .milliseconds(60))
                    guard !held, axis != nil else { return }
                    axis = nil
                    release()
                    withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { offset = 0 }
                }
            }
            // Seven days fill the row, so the strip stops growing at the largest standard size;
            // Large Content Viewer shows a day at full size, and each day's label is the full date.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityShowsLargeContentViewer()
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Week")
        }

        private func week(_ first: String) -> some View {
            HStack(spacing: 4) {
                ForEach(0..<7, id: \.self) { i in
                    day((try? addDays(first, i)) ?? first)
                }
            }
        }

        private var drag: some Gesture {
            DragGesture(minimumDistance: PagerRule.lockDistance)
                .updating($held) { _, state, _ in state = true }
                .onChanged { value in
                    if axis == nil {
                        // The last swipe is still springing on (a third of a second).
                        guard pending == nil, let locked = PagerRule.lock(value.translation) else { return }
                        axis = locked
                        if locked == .horizontal { swiping = true }
                    }
                    guard axis == .horizontal, !reduceMotion else { return }
                    offset = PagerRule.follow(value.translation.width, width: width, canPrevious: true, canNext: true)
                }
                .onEnded { value in
                    let wasOurs = axis == .horizontal
                    axis = nil
                    guard wasOurs else { return }
                    release()
                    let way = PagerRule.outcome(
                        value.translation.width, velocity: value.velocity.width, width: width, canPrevious: true,
                        canNext: true)
                    guard way != 0 else {
                        withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { offset = 0 }
                        return
                    }
                    turn(way, velocity: value.velocity.width)
                }
        }

        /// On to the week before (-1) or after (1), on the same weekday: the strip springs the
        /// rest of the way at the finger's speed, then stands on it (no jump: that week was
        /// already drawn beside this one).
        private func turn(_ way: Int, velocity: CGFloat) {
            let from = date
            let target = (try? addDays(current, 7 * way)) ?? current
            turns += 1
            if reduceMotion {
                withAnimation(.easeInOut(duration: 0.25)) { shown = target }
                pick(target)
                return
            }
            let end = -CGFloat(way) * page
            let speed = PagerRule.springVelocity(velocity, from: offset, to: end)
            shown = current
            pending = target
            withAnimation(.interpolatingSpring(duration: PagerRule.settle, bounce: 0, initialVelocity: speed)) {
                offset = end
            } completion: {
                var instant = Transaction()
                instant.disablesAnimations = true
                withTransaction(instant) {
                    pending = nil
                    // Stand on the new week until the screen's date gets there.
                    shown = date == from ? target : nil
                    offset = 0
                }
            }
            pick(target)
        }

        /// The screen's date changed. From this strip's swipe: it's already there. From the arrows,
        /// Today or the date picker, into another week: that week slides in from its side.
        private func arrive(from old: String, to new: String) {
            // A swipe still settling stands on its own day when it's done.
            guard pending == nil else { return }
            if shown == new {
                shown = nil
                return
            }
            shown = nil
            let before = (try? weekStart(old)) ?? old
            let after = (try? weekStart(new)) ?? new
            guard before != after, axis == nil, !reduceMotion else { return }
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { offset = (after > before ? 1 : -1) * page }
            withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { offset = 0 }
        }

        private func release() {
            Task {
                try? await Task.sleep(for: .milliseconds(300))
                swiping = false
            }
        }

        @ViewBuilder private func day(_ d: String) -> some View {
            let chosen = d == current
            let over = targeted == d
            let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
            let button = Button {
                guard !swiping else { return }
                pick(d)
            } label: {
                VStack(spacing: 0) {
                    // Seven to a row: at large text sizes they shrink to fit rather than
                    // cut off ("W…"); the full date is the accessibility label.
                    Text(formatDay(d).prefix(3)).font(.role(.footnote).weight(.medium))
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Text("\(Int(d.suffix(2)) ?? 0)")
                        .font(.custom(BrandFonts.Weight.bold.rawValue, size: 20, relativeTo: .title3))
                        .monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
                .foregroundStyle(chosen ? Color.bg : d == today ? Color.link : Color.text)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(shape.fill(chosen ? Color.text : over ? Color.tinted : .clear))
                .overlay { if over { shape.strokeBorder(Color.link, lineWidth: 2) } }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(formatDay(d, long: true) + (d == today ? ", today" : ""))
            .accessibilityAddTraits(chosen ? .isSelected : [])
            if let onDrop {
                button
                    .springLoadingBehavior(.enabled)
                    .dropDestination(for: String.self) { items, _ in
                        items.first.map { onDrop(d, $0) } ?? false
                    } isTargeted: { on in
                        if on { targeted = d } else if targeted == d { targeted = nil }
                    }
            } else {
                button
            }
        }
    }

    /// Needs a Time (spec 5.6): jobs waiting for a time, in a sideways row, each with "…". A stop
    /// dropped on it comes off the schedule (only one that hasn't started).
    struct NeedsATimeCard: View {
        var jobs: [ScheduleJob]
        var board: Board
        var actions: (ScheduleJob, String?) -> ScheduleStopActions
        var onSuggest: (ScheduleJob) -> Void
        var onDrop: ((String) -> Bool)?

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                CardTitle("Needs a Time" + (jobs.isEmpty ? "" : " (\(jobs.count))"))
                if jobs.isEmpty {
                    Text("Every job has a time. Drag a job here to take it off the schedule.")
                        .textRole(.secondary).foregroundStyle(Color.textMuted)
                } else {
                    GeometryReader { geo in
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(jobs) { j in
                                    TrayCard(
                                        job: j, notOnMap: board.routing && j.mapMissing, note: note(j),
                                        actions: actions(j, nil), onSuggest: { onSuggest(j) }
                                    )
                                    .frame(width: geo.size.width * 0.85)
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.viewAligned)
                    }
                    .frame(height: 76)
                }
            }
            .card(padding: 16)
            .scheduleDropTarget(cornerRadius: CGFloat(Radius.card), onDrop)
        }

        private func note(_ j: ScheduleJob) -> String {
            let booked = j.start.map {
                "No tech yet · booked \(formatDay(localDay($0, timeZone: board.ctx.timeZone))) at \(formatTime(j.scheduledStart, timeZone: board.ctx.timeZone))"
            }
            return [booked, stopNote(j, routeTech: nil, names: board.names)]
                .compactMap { $0 }
                .filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }

    struct TrayCard: View {
        var job: ScheduleJob
        /// Its address wasn't found on the map: the symbol right after the address.
        var notOnMap = false
        /// What follows the address: "No tech yet · booked …", the kind of job.
        var note: String
        var actions: ScheduleStopActions
        var onSuggest: () -> Void
        @Environment(\.openRoute) private var openRoute
        private var onMove: () -> Void { actions.onMove }

        var body: some View {
            HStack(spacing: 4) {
                Button {
                    openRoute(.job(job.id))
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(job.customerName).fontWeight(.semibold).foregroundStyle(Color.text)
                            + Text(job.number.map { " · #\($0)" } ?? "").foregroundStyle(Color.textMuted))
                            .textRole(.body).lineLimit(1)
                        HStack(spacing: 6) {
                            (Text(job.address) + (notOnMap ? NotOnMapTag.text() : Text(""))
                                + Text(job.address.isEmpty || note.isEmpty ? note : " · \(note)"))
                                .textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                            // The lock's icon stays in view when the line is cut short.
                            if let lock = lockTag(job) { LockTagLabel(tag: lock).layoutPriority(1) }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .zoomSource(job.id)
                Menu {
                    Button("Suggest Times", action: onSuggest)
                    Button("Move…", action: onMove)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Color.link)
                        .frame(width: minTarget, height: minTarget)
                        .contentShape(Circle())
                }
                .accessibilityLabel("Actions for \(job.customerName)")
                if canMoveJob(job.status) { DragGrip(width: 24) }
            }
            .well(padding: 8)
            // Touch and hold for the menu (and drag from it to move). No swipes here: the cards sit
            // in a row that scrolls sideways, so a sideways swipe scrolls it.
            .rowMenu(actions.title, actions.menu)
            .scheduleDragSource(job)
            .accessibilityElement(children: .contain)
            .swipeAccessibilityActions(actions.leading + actions.trailing)
        }
    }

    /// One tech's day (spec 5.6 item 8): the tech, the day's stops and driving, Optimize and the
    /// maps link on a card, then each stop as its own card with the drive between them, as on
    /// Today (owner, 2026-10-20). A stop dropped on a stop takes its place; on the tech's card or
    /// the empty day, it goes last.
    struct RouteCard: View {
        var tech: TeamMember
        var board: Board
        var route: DayRoute?
        /// Optimize is working on this day.
        var busy = false
        var onPlan: () -> Void
        /// A stop's swipes and menu, from the route it's on.
        var actions: (ScheduleJob, String?) -> ScheduleStopActions
        /// A stop dropped on this day (job id, place in the route or nil for last).
        var onDrop: (String, Int?) -> Bool
        /// The day's map, facts and buttons are in `DayLead` above Needs a Time.
        var lead = false

        var body: some View {
            let jobs = route?.jobs ?? []
            let open = board.date >= board.ctx.today
            VStack(alignment: .leading, spacing: 4) {
                header(jobs: jobs, open: open)
                    .scheduleDropTarget(cornerRadius: CGFloat(Radius.card)) { onDrop($0, nil) }
                if let route, !jobs.isEmpty {
                    ForEach(Array(jobs.enumerated()), id: \.element.id) { i, j in
                        LegLine(
                            minutes: route.summary.legs[routeIndex: i] ?? 0, label: i == 0 ? "from the shop" : "drive",
                            short: route.summary.short[routeIndex: i] ?? 0, inset: 31)
                        ScheduleStopCard(
                            number: i + 1, job: j,
                            note: stopNote(j, routeTech: tech.id, names: board.names),
                            timeZone: board.ctx.timeZone, routing: board.routing,
                            cleanings: board.cleanings[j.id] ?? [],
                            actions: actions(j, routeKey(tech.id, board.date)),
                            stripe: board.color(j.assignedUserId)
                        )
                        .scheduleDropTarget(cornerRadius: CGFloat(Radius.card)) { onDrop($0, i) }
                    }
                    LegLine(minutes: route.summary.backLegMin, label: "back to the shop", short: 0, inset: 31)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(tech.name)
        }

        @ViewBuilder private func header(jobs: [ScheduleJob], open: Bool) -> some View {
            if lead {
                // Phones with one tech chosen: the map, the day's facts and the buttons lead the
                // screen above Needs a Time (DayLead), so the stops start under the tech's name.
                HStack(spacing: 8) {
                    TechDot(color: tech.color)
                    CardTitle(tech.name)
                }
                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                .padding(.top, 8)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        TechDot(color: tech.color)
                        CardTitle(tech.name)
                    }
                    if let route, !jobs.isEmpty {
                        RouteFacts(route: route, board: board, busy: busy, onPlan: onPlan)
                    } else {
                        Text(open ? "Nothing scheduled. Drop a job here." : "Nothing scheduled.")
                            .textRole(.body).foregroundStyle(Color.textMuted)
                            .frame(maxWidth: .infinity)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous)
                                    .fill(Color.well)
                            )
                            .padding(.top, 8)
                    }
                }
                .card(padding: 16)
            }
        }
    }

    /// A tech's day in numbers, then what to do with it: "5 stops · 1 hr 10 min driving" (no clock
    /// times, owner 2026-10-21), a warning when it runs past the end of the day, and Optimize (owner, 2026-10-20:
    /// "Plan Route" → "Optimize") beside the day in the maps app. The numbers roll to their new
    /// values after Optimize.
    struct RouteFacts: View {
        var route: DayRoute
        var board: Board
        var busy = false
        var onPlan: () -> Void
        @Environment(\.openURL) private var openURL

        var body: some View {
            let jobs = route.jobs
            VStack(alignment: .leading, spacing: 4) {
                Text(
                    "\(jobs.count) \(jobs.count == 1 ? "stop" : "stops") · \(durationLabel(route.summary.driveMin)) driving"
                )
                .textRole(.secondary).foregroundStyle(Color.textMuted)
                .monospacedDigit()
                .contentTransition(.numericText())
                HStack(spacing: 8) {
                    if board.date >= board.ctx.today {
                        Button(action: onPlan) {
                            BusyLabel(title: "Optimize", busyTitle: "Optimizing…", busy: busy)
                        }
                        .buttonStyle(.secondary(fullWidth: true))
                        .disabled(busy)
                        .accessibilityHint("Puts the stops in driving order")
                    }
                    if let link = dayDirections(
                        app: board.mapsApp, origin: board.ctx.origin,
                        stops: jobs.map { (place: $0.place, done: $0.done) })
                    {
                        Button {
                            openURL(link)
                        } label: {
                            // "Maps", never the maps company (owner, 2026-10-20).
                            Label(MapsLabels.maps, systemImage: "mappin.and.ellipse")
                        }
                        .buttonStyle(.secondary(fullWidth: true))
                        .accessibilityLabel(dayMapsLabel(board.mapsApp))
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    /// Phones, one tech's day (the website's DayLead): the map leads, right under the tech pills
    /// (owner: "uses the maps all the time"), then the day's facts and the buttons.
    struct DayLead: View {
        var route: DayRoute
        var board: Board
        var busy = false
        var onPlan: () -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                if let model = board.leadMap {
                    DayMapSection(model: model)
                }
                RouteFacts(route: route, board: board, busy: busy, onPlan: onPlan)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Route")
        }
    }

    /// A stop on a route (owner, 2026-10-20: "make the schedule cards a little more appealing. Refer
    /// to what the Today page looks like"): a soft card with the stop's number in a circle (a check
    /// once it's finished), the time and the customer (they open the job) with Move… on the same
    /// row, then what the stop is as a pill with its status, lock, map and job number, the address
    /// (directions), the access notes with a key, and the cleanings due. Swipe left for Move; touch
    /// and hold to drag it. Website components/route-board.tsx `StopCard`.
    struct ScheduleStopCard: View {
        var number: Int
        var job: ScheduleJob
        var note: String?
        var timeZone: String
        var routing = false
        var cleanings: [ScheduledCleaning] = []
        /// Swipe left for Move…, right to lock; touch and hold for the menu (gestures spec 12).
        var actions: ScheduleStopActions
        /// The tech's color, as a 4 pt stripe on the card's leading edge (owner, 2026-10-20).
        var stripe: TechColor? = nil
        @Environment(\.openRoute) private var openRoute
        private var onMove: () -> Void { actions.onMove }

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            // A swipe never starts on the grip, and touch and hold opens the menu, from which the
            // card can still be dragged to another place.
            SwipeActionsRow(
                actions: actions.trailing, leading: actions.leading, menuTitle: actions.title,
                menuItems: actions.menu, gripWidth: actions.movable ? 32 : 0
            ) {
                HStack(spacing: 0) {
                    content
                    // The grip at the trailing edge (owner, 2026-10-20: "Schedule dragging should
                    // be on the right side of the card"); the whole card still picks up.
                    if canMoveJob(job.status) { DragGrip() }
                }
                .padding(EdgeInsets(top: 8, leading: 12, bottom: 12, trailing: canMoveJob(job.status) ? 0 : 8))
                .techStripe(stripe)
            }
            .clipShape(shape)
            .card(padding: 0)
            .scheduleDragSource(job)
            .accessibilityElement(children: .contain)
        }

        private var content: some View {
            let lock = lockTag(job)
            return HStack(alignment: .top, spacing: 8) {
                StopBadge(number: number, status: job.status)
                    .padding(.top, 6)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .top, spacing: 4) {
                        Button {
                            openRoute(.job(job.id))
                        } label: {
                            (Text(time)
                                .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                                .foregroundStyle(Color.text)
                                + Text("  ")
                                + Text(job.customerName + " ›")
                                .font(.role(.bodyEmphasis))
                                .foregroundStyle(Color.link))
                                .monospacedDigit()
                                .multilineTextAlignment(.leading)
                                .opacity(job.finished ? 0.7 : 1)
                                .padding(.vertical, 4)
                                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .zoomSource(job.id)
                        .accessibilityLabel(spoken)
                        .accessibilityHint("Opens the job")
                        // Drag and drop's alternative (owner, 2026-10-20), and the swipes.
                        .swipeAccessibilityActions(actions.leading + actions.trailing)
                        if canMoveJob(job.status) {
                            Button("Move…", action: onMove)
                                .buttonStyle(.quiet(size: .small))
                                .accessibilityLabel("Move \(job.customerName)")
                        }
                    }
                    // The kind of visit (or the second tech's note), then any state worth saying:
                    // most stops are Scheduled, so that chip is left out.
                    FlowRow(spacing: 8) {
                        if let note { NotePill(text: note) }
                        if job.status != .scheduled { StatusChip(status: job.status) }
                        if let lock { LockTagLabel(tag: lock) }
                        // Not found on the map: the symbol after the address below (owner,
                        // 2026-10-20).
                        if !(routing && job.mapMissing), job.location == nil {
                            Text("No map location").font(.role(.footnote).weight(.semibold))
                                .foregroundStyle(Color.warning)
                        }
                        if let n = job.number {
                            Text(verbatim: "#\(n)").textRole(.footnote).foregroundStyle(Color.textMuted)
                                .accessibilityLabel("Job \(n)")
                        }
                    }
                    if !job.address.isEmpty {
                        AddressButton(place: job.place, muted: true, notOnMap: routing && job.mapMissing)
                    }
                    if !job.finished, let notes = job.accessNotes { AccessLine(notes: notes) }
                    ScheduledCleaningsRow(cleanings: cleanings)
                }
            }
        }

        private var time: String {
            job.scheduledStart == nil ? "No time" : formatTime(job.scheduledStart, timeZone: timeZone)
        }

        /// "Stop 1, 9:00 AM, Grace Holloway".
        private var spoken: String {
            ["Stop \(number)", time, job.customerName].joined(separator: ", ")
        }
    }

    /// A schedule stop's swipes and menu (gestures spec section 12; the same on Day's stops, Week's
    /// rows and Needs a Time): swipe left for Move…, right for Lock Day and Lock Time (Unlock once
    /// locked); the menu has Open, Move…, Lock Day, Lock Time, Take Off Schedule and Directions,
    /// each only where the stop can take it.
    struct ScheduleStopActions {
        var job: ScheduleJob
        var onMove: () -> Void
        var onLock: (JobLock) -> Void
        /// On a route and not started: back to Needs a Time.
        var onTakeOff: (() -> Void)?
        var onOpen: () -> Void
        var onDirections: (() -> Void)?

        var movable: Bool { canMoveJob(job.status) }
        private var lock: JobLock { jobLock(job) }
        private var dayLocked: Bool { lock == .day || lock == .both }
        private var timeLocked: Bool { lock == .time || lock == .both }

        /// "Grace Holloway · Job #1040".
        var title: String { job.customerName + (job.number.map { " · Job #\($0)" } ?? "") }

        private var move: SwipeAction {
            SwipeAction(
                title: "Move…", systemImage: "arrow.up.and.down.and.arrow.left.and.right", tint: Color.link,
                action: onMove)
        }

        private var lockDay: SwipeAction {
            SwipeAction(
                title: dayLocked ? "Unlock Day" : "Lock Day", systemImage: dayLocked ? "lock.open" : "lock",
                tint: Color.navy
            ) { onLock(jobLock(lockDay: !dayLocked, lockTime: timeLocked, arrivalFixed: false)) }
        }

        /// Only a stop with a time can keep it.
        private var lockTime: SwipeAction? {
            guard job.scheduledStart != nil else { return nil }
            return SwipeAction(
                title: timeLocked ? "Unlock Time" : "Lock Time", systemImage: timeLocked ? "lock.open" : "clock",
                tint: Color.link
            ) { onLock(jobLock(lockDay: dayLocked, lockTime: !timeLocked, arrivalFixed: false)) }
        }

        var trailing: [SwipeAction] { movable ? [move] : [] }
        var leading: [SwipeAction] { movable ? [lockDay] + [lockTime].compactMap { $0 } : [] }

        var menu: [SwipeAction] {
            var list = [SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link, action: onOpen)]
            if movable {
                list.append(move)
                list.append(lockDay)
                if let lockTime { list.append(lockTime) }
            }
            if let onTakeOff {
                list.append(
                    SwipeAction(
                        title: "Take Off Schedule", systemImage: "tray.and.arrow.down", tint: Color.link,
                        action: onTakeOff))
            }
            if let onDirections {
                list.append(
                    SwipeAction(title: "Directions", systemImage: "location", tint: Color.link, action: onDirections))
            }
            return list
        }
    }

    /// The stop's number in a circle (Today's stop rows): a green check once it's finished, `link`
    /// while it's in progress.
    struct StopBadge: View {
        var number: Int
        var status: JobStatus
        @ScaledMetric(relativeTo: .body) private var size: CGFloat = 32

        var body: some View {
            let finished = isFinished(status)
            ZStack {
                Circle().fill(finished ? Color.pass : status == .inProgress ? Color.link : Color.bg)
                if finished {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color.onStatus)
                } else {
                    Text("\(number)")
                        .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                        .monospacedDigit()
                        .foregroundStyle(status == .inProgress ? Color.bg : Color.text)
                        .minimumScaleFactor(0.6)
                }
            }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
        }
    }

    /// What a stop is ("Leak detection", "Second tech, with Tony") as a small pill.
    struct NotePill: View {
        var text: String

        var body: some View {
            Text(text)
                .font(.role(.footnote).weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .foregroundStyle(Color.text)
                .background(Capsule().fill(Color.fill))
        }
    }

    /// The pool's access notes (gate code, which gate, dogs) with a key, as on Today.
    struct AccessLine: View {
        var notes: String

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "key.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.warning)
                    .accessibilityHidden(true)
                Text(notes)
                    .lineLimit(2)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.text)
            }
            .textRole(.secondary)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CleaningText.accessSpoken(notes))
        }
    }

    /// The small card under the finger while a stop is dragged: the customer and the address.
    struct StopDragPreview: View {
        var job: ScheduleJob

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(job.customerName).textRole(.bodyEmphasis).foregroundStyle(Color.text).lineLimit(1)
                if !job.address.isEmpty {
                    Text(job.address).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(width: 280, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.surface))
        }
    }

    /// Touch and hold a stop to pick it up (owner, 2026-10-20): a haptic, the small card under the
    /// finger, and the job's id for the drop. A canceled job stays put.
    private struct ScheduleDragSource: ViewModifier {
        var job: ScheduleJob
        @State private var picked = 0

        @ViewBuilder func body(content: Content) -> some View {
            if canMoveJob(job.status) {
                content
                    .onDrag {
                        picked += 1
                        return NSItemProvider(object: job.id as NSString)
                    } preview: {
                        StopDragPreview(job: job)
                    }
                    .sensoryFeedback(.impact(weight: .medium), trigger: picked)
            } else {
                content
            }
        }
    }

    /// Where a dragged stop can land: a `link` ring while it's over, and the job's id on the drop
    /// (true when it moved; false slides it back).
    private struct ScheduleDropTarget: ViewModifier {
        var cornerRadius: CGFloat
        var onDrop: ((String) -> Bool)?
        @State private var targeted = false

        @ViewBuilder func body(content: Content) -> some View {
            if let onDrop {
                content
                    .overlay {
                        if targeted {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .strokeBorder(Color.link, lineWidth: 2)
                                .allowsHitTesting(false)
                        }
                    }
                    .dropDestination(for: String.self) { items, _ in
                        items.first.map(onDrop) ?? false
                    } isTargeted: {
                        targeted = $0
                    }
            } else {
                content
            }
        }
    }

    extension View {
        fileprivate func scheduleDragSource(_ job: ScheduleJob) -> some View {
            modifier(ScheduleDragSource(job: job))
        }

        fileprivate func scheduleDropTarget(cornerRadius: CGFloat, _ onDrop: ((String) -> Bool)?) -> some View {
            modifier(ScheduleDropTarget(cornerRadius: cornerRadius, onDrop: onDrop))
        }
    }

    /// A tech's row on a day in Week, and their route that day (nil: nothing scheduled).
    struct WeekTechRow: Identifiable {
        var tech: TeamMember
        var route: DayRoute?
        var id: String { tech.id }
    }

    struct WeekItem: Identifiable {
        var job: ScheduleJob
        var tech: String
        var cleanings: [ScheduledCleaning] = []
        /// What the stop is ("Maintenance", "Second tech, with Dana"), under the customer.
        var note: String? = nil
        /// The job's tech's color: the row's leading stripe.
        var color: TechColor? = nil
        var id: String { job.id }
    }

    /// A visit's plan cleanings: the cleaning icon and name, in a row that wraps.
    struct ScheduledCleaningsRow: View {
        var cleanings: [ScheduledCleaning]

        var body: some View {
            if !cleanings.isEmpty {
                FlowRow(spacing: 12) {
                    ForEach(Array(cleanings.enumerated()), id: \.offset) { _, c in
                        HStack(spacing: 4) {
                            CleaningIcon(kind: c.kind, size: 18).foregroundStyle(Color.text)
                            Text(c.name).textRole(.secondary).fontWeight(.medium).foregroundStyle(Color.text)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Cleanings due: " + cleanings.map(\.name).joined(separator: ", "))
            }
        }
    }

    /// A week row: "**8:00 AM · #1343**" over "Customer · Tech", the status chip, then the drag
    /// grip (or a chevron when it can't move).
    struct WeekRow: View {
        var item: WeekItem
        var timeZone: String
        /// It can be dragged: the grip at the trailing edge in place of the chevron (the row still
        /// opens the job, as rows in Mail do).
        var movable = false

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(formatTime(item.job.scheduledStart, timeZone: timeZone)) · \(item.job.numberText)")
                        .textRole(.bodyEmphasis).foregroundStyle(Color.text).monospacedDigit()
                    (Text(item.job.customerName).foregroundStyle(Color.text)
                        + Text(" · \(item.note ?? item.tech)").foregroundStyle(Color.textMuted))
                        .textRole(.secondary)
                    ScheduledCleaningsRow(cleanings: item.cleanings)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                StatusChip(status: item.job.status)
                if movable { DragGrip(width: 24) } else { Chevron() }
            }
            .padding(.leading, item.color == nil ? 16 : 20)
            .padding(.trailing, movable ? 8 : 16)
            .padding(.vertical, 10)
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// Month view (spec 5.6 item 10).
    struct MonthGrid: View {
        var board: Board
        var pick: (String) -> Void

        var body: some View {
            let month = String(board.date.prefix(7))
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) {
                        Text($0).font(.role(.footnote).weight(.semibold)).foregroundStyle(Color.textMuted)
                            .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityHidden(true)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                    ForEach(board.days, id: \.self) { d in
                        let c = board.counts(d)
                        Button {
                            pick(d)
                        } label: {
                            VStack(spacing: 0) {
                                Text("\(Int(d.suffix(2)) ?? 0)")
                                    .font(.custom(BrandFonts.Weight.bold.rawValue, size: 18, relativeTo: .headline))
                                    .foregroundStyle(Color.text)
                                if c.jobs > 0 {
                                    Text("\(c.jobs) \(c.jobs == 1 ? "job" : "jobs")")
                                        .font(.role(.footnote).weight(.semibold)).foregroundStyle(Color.text)
                                }
                                if c.cleanings > 0 {
                                    Text("\(c.cleanings) clean").textRole(.footnote).foregroundStyle(Color.textMuted)
                                }
                                // The day's plan cleanings, as their icons (owner, 2026-10-20).
                                let kinds = board.cleaningKinds(d)
                                if !kinds.isEmpty {
                                    HStack(spacing: 2) {
                                        ForEach(kinds, id: \.self) { CleaningIcon(kind: $0, size: 14) }
                                    }
                                    .foregroundStyle(Color.text)
                                    .padding(.top, 2)
                                }
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, minHeight: 64, alignment: .top)
                            .padding(.vertical, 4)
                            .overlay {
                                if d == board.ctx.today {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(
                                        Color.link, lineWidth: 2)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .opacity(d.hasPrefix(month) ? 1 : 0.4)
                        .accessibilityLabel(
                            [
                                formatDay(d, long: true),
                                c.jobs > 0 ? "\(c.jobs) \(c.jobs == 1 ? "job" : "jobs")" : nil,
                                c.cleanings > 0 ? "\(c.cleanings) \(c.cleanings == 1 ? "cleaning" : "cleanings")" : nil,
                                board.cleaningNames(d).isEmpty
                                    ? nil : "cleanings due: " + board.cleaningNames(d).joined(separator: ", "),
                            ].compactMap { $0 }.joined(separator: ", "))
                    }
                }
            }
            .card(padding: 8)
        }
    }

    // MARK: - Sheets

    /// Move {Customer} (spec 6.3): tech, day, and place in the route; Move or Take Off Schedule.
    /// From the job (Schedule Job, Change Schedule) it's the job's schedule: titled Schedule, with
    /// its Lock (owner, 2026-10-20: None · Day · Time · Both) and Save Schedule.
    /// A menu's value in a grouped row, as the system's menu picker draws it (the tint and the
    /// up-down chevron), but wrapping onto more lines so the row grows to fit its text instead of
    /// being cut off (owner, 2026-10-20, of the Move sheet's "Place in the route").
    struct MenuValue: View {
        var text: String

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(text)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .textRole(.body)
            .foregroundStyle(Color.link)
            .frame(minHeight: minTarget, alignment: .trailing)
            .contentShape(Rectangle())
        }
    }

    struct MoveSheet: View {
        var target: MoveTarget
        var board: Board
        var onMove: (_ tech: String?, _ date: String?, _ index: Int) -> Void
        /// The job's lock now: shows the Lock picker and saves through `onSave`.
        var lock: JobLock? = nil
        /// Save Schedule: the choice, its lock, and whether only the lock changed.
        var onSave: ((_ tech: String?, _ date: String?, _ index: Int, _ lock: JobLock, _ lockOnly: Bool) -> Void)? = nil
        @Environment(\.dismiss) private var dismiss
        @State private var tech: String?
        @State private var day = Date()
        @State private var place = 0
        @State private var ready = false
        @State private var chosenLock = JobLock.none
        /// Where the job was when the sheet opened (tech, day, place), to tell a lock-only change.
        @State private var start: (tech: String?, day: String, place: Int)?

        private var zone: TimeZone { TimeZone(identifier: board.ctx.timeZone) ?? .current }
        private var dayString: String { localDay(day, timeZone: board.ctx.timeZone) }
        private var movers: [TeamMember] {
            board.ctx.seesAll ? board.team.filter(\.active) : board.team.filter { $0.id == board.ctx.userId }
        }
        /// The other stops on the chosen tech's day, worked out when the tech or day changes (not
        /// on every render: it lays out the whole day).
        @State private var others: [ScheduleJob] = []

        /// The Tech row's value: the tech's name, or Nobody yet.
        private var techLabel: String {
            tech.flatMap { id in movers.first { $0.id == id }?.name } ?? "Nobody yet (waits in Needs a Time)"
        }

        /// "First stop", or "After Lebron James (8:00 AM)".
        private func placeLabel(_ index: Int) -> String {
            guard index > 0, others.indices.contains(index - 1) else { return "First stop" }
            let s = others[index - 1]
            return "After \(s.customerName)"
                + (s.scheduledStart.map { " (\(formatTime($0, timeZone: board.ctx.timeZone)))" } ?? "")
        }

        private func otherStops(_ tech: String?, _ day: String) -> [ScheduleJob] {
            guard let tech else { return [] }
            return loadRoutes(board.jobs, ctx: board.ctx, dates: [day], team: board.team, drive: DriveTimes())
                .routes[routeKey(tech, day)]?.jobs.filter { $0.id != target.job.id } ?? []
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(spacing: 24) {
                        Text(target.job.address).textRole(.secondary).foregroundStyle(Color.textMuted)
                            .multilineTextAlignment(.center)
                        Grouped {
                            ListRow("Tech") {
                                // A menu whose label wraps, so a long name grows the row instead of
                                // being cut off (owner, 2026-10-20: "Make place in the route taller").
                                Menu {
                                    Picker("Tech", selection: $tech) {
                                        if movers.count > 1 {
                                            Text("Nobody yet (waits in Needs a Time)").tag(String?.none)
                                        }
                                        ForEach(movers) { m in
                                            Label {
                                                Text(m.name)
                                            } icon: {
                                                m.color.menuImage
                                            }.tag(Optional(m.id))
                                        }
                                    }
                                    .pickerStyle(.inline)
                                } label: {
                                    HStack(spacing: 8) {
                                        if let color = board.color(tech) { TechDot(color: color) }
                                        MenuValue(text: techLabel)
                                    }
                                }
                                .accessibilityLabel("Tech")
                                .accessibilityValue(techLabel)
                            }
                            ListRow("Day") {
                                DatePicker(
                                    "Day", selection: $day,
                                    in: (zonedInstant(board.ctx.today, 0, timeZone: board.ctx.timeZone) ?? Date())...,
                                    displayedComponents: .date
                                )
                                .labelsHidden()
                                .environment(\.timeZone, zone)
                                .tint(Color.link)
                            }
                            if tech != nil && !others.isEmpty {
                                ListRow("Place in the route") {
                                    Menu {
                                        Picker("Place in the route", selection: $place) {
                                            Text("First stop").tag(0)
                                            ForEach(Array(others.enumerated()), id: \.element.id) { i, s in
                                                Text(placeLabel(i + 1)).tag(i + 1)
                                            }
                                        }
                                        .pickerStyle(.inline)
                                    } label: {
                                        MenuValue(text: placeLabel(place))
                                    }
                                    .accessibilityLabel("Place in the route")
                                    .accessibilityValue(placeLabel(place))
                                }
                            }
                        }
                        if lock != nil { lockPicker }
                        VStack(spacing: 8) {
                            Button(lock != nil ? "Save Schedule" : "Move") {
                                let index = tech != nil ? min(place, others.count) : 9_999
                                if let onSave {
                                    let same =
                                        target.from != nil
                                        && start.map {
                                            $0.tech == tech && $0.day == dayString && $0.place == place
                                        } == true
                                    onSave(tech, dayString, index, chosenLock, same)
                                } else {
                                    onMove(tech, dayString, index)
                                }
                            }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                            if target.from != nil && canUnschedule(target.job.status) {
                                Button("Take Off Schedule") { onMove(nil, nil, 0) }
                                    .buttonStyle(.secondary(fullWidth: true, size: .field))
                            }
                        }
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle(lock != nil ? "Schedule" : "Move \(target.job.customerName)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .onChange(of: tech) { _, t in others = otherStops(t, dayString) }
            .onChange(of: dayString) { _, d in others = otherStops(tech, d) }
            .onAppear {
                guard !ready else { return }
                ready = true
                let parts = target.from?.split(separator: "|").map(String.init)
                let fromTech = parts?.first.flatMap { $0 == "none" ? nil : $0 }
                tech = movers.count == 1 ? movers[0].id : fromTech
                let fromDate = parts.flatMap { $0.count > 1 ? $0[1] : nil }
                let start = fromDate.flatMap { $0 >= board.ctx.today ? $0 : nil } ?? board.ctx.today
                day = zonedInstant(start, 12 * 60, timeZone: board.ctx.timeZone) ?? Date()
                others = otherStops(tech, dayString)
                let at = others.firstIndex { $0.id == target.job.id }
                place = at ?? others.count
                if let fromTech, fromDate == start,
                    let i = loadRoutes(
                        board.jobs, ctx: board.ctx, dates: [start], team: board.team, drive: DriveTimes()
                    )
                    .routes[routeKey(fromTech, start)]?.jobs.firstIndex(where: { $0.id == target.job.id })
                {
                    place = i
                }
                chosenLock = lock ?? .none
                self.start = (tech, dayString, place)
            }
        }

        /// Lock: None · Day · Time · Both, with what the choice keeps under it.
        private var lockPicker: some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                SectionLabel("Lock")
                Segmented(
                    selection: $chosenLock, options: jobLocks, label: \.segment, title: "Lock", fillsWidth: true)
                Text(chosenLock.help)
                    .textRole(.footnote)
                    .foregroundStyle(Color.textMuted)
                    .padding(.horizontal, 16)
                    .contentTransition(.opacity)
                    .animation(Motion.snappy, value: chosenLock)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Suggested Times (spec 6.3): where the job fits best in the planned routes, each with Use.
    struct SuggestedTimesSheet: View {
        var job: ScheduleJob
        var board: Board
        var drive: DriveTimes
        var onUse: (Suggestion) -> Void
        @Environment(\.dismiss) private var dismiss
        /// Worked out off the main thread when the sheet opens (it tries every gap in a week).
        @State private var found: Result<(suggestions: [Suggestion], note: String?), any Error>?

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        switch found {
                        case nil:
                            SuggestionList(suggestions: [], onUse: { _ in }, placeholders: 3)
                        case .failure(let error):
                            Text(String(describing: error)).textRole(.secondary).foregroundStyle(Color.fail)
                        case .success(let result):
                            if let note = result.note {
                                Text(note).textRole(.secondary).foregroundStyle(Color.textMuted)
                            }
                            if !result.suggestions.isEmpty {
                                SuggestionList(suggestions: result.suggestions, onUse: onUse)
                            }
                        }
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("Suggested Times")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .task(id: job.id) {
                let (job, jobs, ctx, team, drive) = (job, board.jobs, board.ctx, board.team, drive)
                let result = await Task.detached(priority: .userInitiated) {
                    Result {
                        try suggestTimes(
                            location: job.location, durationMin: job.minutes(ctx.settings), excluding: job.id,
                            jobs: jobs, ctx: ctx, team: team, drive: drive)
                    }
                }.value
                withAnimation(Motion.snappy) { found = result }
            }
        }
    }

    /// Suggestions as a grouped list: "Tue, Oct 20 · 9:00 AM · Tony Tech" over the driving it adds,
    /// with Use.
    struct SuggestionList: View {
        var suggestions: [Suggestion]
        var onUse: (Suggestion) -> Void
        /// Rows drawn as placeholders while the suggestions are worked out.
        var placeholders = 0

        var body: some View {
            Grouped {
                ForEach(0..<placeholders, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Tue, Oct 20 · 9:00 AM · Tony Tech").textRole(.bodyEmphasis)
                        Text("Adds 12 min of driving, near a stop").textRole(.secondary)
                    }
                    .foregroundStyle(Color.textMuted)
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .redacted(reason: .placeholder)
                    .accessibilityHidden(true)
                }
                ForEach(suggestions) { s in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(s.dayLabel) · \(s.timeLabel) · \(s.slot.techName)").textRole(.bodyEmphasis)
                                .foregroundStyle(Color.text)
                            Text(s.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Button("Use") { onUse(s) }
                            .buttonStyle(.quiet)
                            .accessibilityLabel("Use \(s.dayLabel) at \(s.timeLabel) with \(s.slot.techName)")
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
            }
        }
    }

    /// Go to date: the system calendar in a sheet.
    struct DatePickSheet: View {
        var date: String
        var pick: (String) -> Void
        @State private var chosen = Date()
        @Environment(\.dismiss) private var dismiss

        var body: some View {
            NavigationStack {
                DatePicker("Go to date", selection: $chosen, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                    .tint(Color.link)
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Color.bg)
                    .navigationTitle("Go to Date")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Go") { pick(localDay(chosen, timeZone: "UTC")) }
                        }
                    }
            }
            .sheetPresentation(detents: [.medium, .large])
            .onAppear { chosen = zonedInstant(date, 12 * 60, timeZone: "UTC") ?? Date() }
        }
    }

    /// A button's title with a spinner in front while its work runs ("Optimizing…"), so the press
    /// answers at once.
    struct BusyLabel: View {
        var title: String
        var busyTitle: String
        var busy: Bool

        var body: some View {
            HStack(spacing: 8) {
                if busy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Color.link)
                        .transition(.opacity)
                }
                Text(busy ? busyTitle : title)
                    .contentTransition(.opacity)
            }
            .animation(Motion.snappy, value: busy)
        }
    }

    /// The handle on a card that can be dragged, at its trailing edge (owner, 2026-10-20): the
    /// three lines iOS lists use for reordering, in `textMuted`. The whole card picks up with a
    /// touch and hold; VoiceOver and Switch Control use Move instead.
    struct DragGrip: View {
        var width: CGFloat = 32

        var body: some View {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.textMuted)
                .frame(width: width)
                .frame(maxHeight: .infinity)
                .accessibilityHidden(true)
        }
    }

    /// Schedule while its first board is read: the shapes of the controls and a day's stops,
    /// redacted, instead of an empty page (loading.md: show something as soon as possible).
    struct ScheduleSkeleton: View {
        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tuesday, October 20").textRole(.body)
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.fill).frame(height: 56)
                ForEach(0..<3, id: \.self) { _ in
                    HStack(alignment: .top, spacing: 8) {
                        Circle().fill(Color.fill).frame(width: 32, height: 32)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("9:00 AM  Customer name").textRole(.bodyEmphasis)
                            Text("1423 Palm Court, Phoenix").textRole(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .card(padding: 0)
                }
            }
            .foregroundStyle(Color.textMuted)
            .redacted(reason: .placeholder)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading the schedule")
        }
    }
#endif
