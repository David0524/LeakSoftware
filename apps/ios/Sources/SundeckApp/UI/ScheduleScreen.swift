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
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var view = ScheduleView.day
        @State private var date: String?
        /// A tech's id, "all", or nil for the default (the first person with work in view).
        @State private var tech: String?
        @State private var drive = DriveTimes()
        @State private var board: Board?
        /// A Day stop lifted to reorder its day (`RouteStops`): the page holds still meanwhile.
        @State private var scheduleDrag = ScheduleDragState()
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
        /// Reorder Techs' sheet (owners and admins).
        @State private var reorderingTechs = false
        /// The rows that put the last change back (Undo on its banner), and what Undo says.
        @State private var undo: PendingUndo?
        /// A plan visit being moved, waiting for Change Schedule or Just This Visit.
        @State private var planMove: PlanVisitMove?
        /// A day reordered by dragging shows its new order before it's saved and the board read
        /// again (`routeKey`); its drive times stay hidden until then.
        @State private var settling: String?
        /// The day's order before a drag that's waiting on Change Schedule or Just This Visit, put
        /// back on Cancel.
        @State private var planRevert: RouteOrder?
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
                                // A 44 pt tap area that doesn't make the line taller, so the page
                                // doesn't shift when Today appears (owner, 2026-10-21).
                                .padding(.vertical, 12)
                                .contentShape(Rectangle())
                                .padding(.vertical, -12)
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
                        // Reorder Techs (owners and admins) as a round button at the row's end,
                        // not a row of its own (owner, 2026-10-21).
                        let reorder = board.ctx.isManager && board.ctx.seesAll && board.reorderTechs.count > 1
                        HStack(spacing: 8) {
                            FilterPills(
                                selection: Binding(get: { board.tech }, set: { tech = $0 }),
                                options: board.techs.map(\.id) + ["all"],
                                label: { id in
                                    id == "all" ? "Everyone" : id == board.ctx.userId ? "Me" : board.name(id)
                                },
                                canDrop: { $0 != "all" },
                                // A stop dropped on a person goes last on their day (Day view).
                                onDrop: view == .day
                                    ? { id, job in drop(job, on: .route(tech: id, date: board.date, index: nil)) }
                                    : nil,
                                dot: { id in board.color(id) }
                            )
                            .padding(.leading, -16)
                            .padding(.trailing, reorder ? 0 : -16)
                            .accessibilityLabel("Whose schedule")
                            if reorder { ReorderTechsButton { reorderingTechs = true } }
                        }
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
                        page: "\(board.view.rawValue)|\(board.date)", enabled: !scheduleDrag.liftedStop,
                        previous: { date = step(board.date, -1) },
                        next: { date = step(board.date, 1) }
                    )
                    // A lifted stop draws over Needs a Time when it's dragged there.
                    .zIndex(scheduleDrag.liftedStop ? 1 : 0)
                } else {
                    ScheduleSkeleton()
                }
            }
            .refreshable { await sync.syncNow() }
            // A Day stop lifted to reorder: the finger moves the card, not the page.
            .scrollDisabled(scheduleDrag.liftedStop)
            .environment(scheduleDrag)
            // Never left unscrollable (owner, 2026-10-21: "it sometimes freezes up"): a new page
            // or leaving the screen lets go of any lift still held.
            .onChange(of: "\(view)|\(date ?? "")|\(tech ?? "")") { scheduleDrag.releaseAll() }
            .onDisappear { scheduleDrag.releaseAll() }
            .rootTitleScroll()
            // A change's result has one Undo for the whole change (undo-and-redo.md).
            .resultBanner($banner, onUndo: undo.map { u in { undoLast(u) } })
            .rootTitle("Schedule")
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
                    keys: routePoints(scheduleJobs(sync.store, companyId: company.id), starts: ctx.startPoints))
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
            .sheet(isPresented: $reorderingTechs) {
                if let board {
                    ReorderTechsSheet(techs: board.reorderTechs) { ordered in
                        saveTechOrder(ordered, board)
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
                isPresented: Binding(
                    get: { planMove != nil },
                    set: {
                        if !$0 {
                            planMove = nil
                            // Cancel (or dismissed): a dragged stop goes back to its place. After
                            // the button's own action, so a choice keeps it.
                            Task { @MainActor in restore(planRevert) }
                        }
                    }),
                titleVisibility: .visible, presenting: planMove
            ) { m in
                Button(PlanMoveChoices.changeSchedule) { changeSchedule(m) }
                Button(PlanMoveChoices.justThisVisit) { justThisVisit(m) }
                Button(PlanMoveChoices.cancel, role: .cancel) { restore(planRevert) }
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
            // Only while someone shown starts at the shop (owner, 2026-10-21), as the website.
            if board.ctx.depot == nil,
                board.shownTechs.contains(where: { board.ctx.start(for: $0.id).label == .shop })
            {
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
                    onReorder: { id, index in reorder(id, tech: t.id, date: board.date, index: index) },
                    settling: settling == routeKey(t.id, board.date),
                    lead: board.leadRoute?.techId == t.id
                )
                // A lifted stop draws over the techs below it.
                .zIndex(scheduleDrag.holds(routeKey(t.id, board.date)) ? 1 : 0)
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
                .liftDropZone("day|\(d)", owner: "day|\(d)", cornerRadius: CGFloat(Radius.block)) { id, _ in
                    drop(id, on: .day(d))
                }
                if empty && rows.isEmpty {
                    Text("Nothing scheduled").textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                ForEach(rows) { row in
                    weekTech(row.tech, route: row.route, day: d, board)
                        // A lifted stop draws over the techs below it.
                        .zIndex(scheduleDrag.holds(routeKey(row.tech.id, d)) ? 1 : 0)
                }
                if !unassigned.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("No tech yet").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            .padding(.horizontal, 16)
                            .frame(minHeight: minTarget)
                        // Their own block, with no drive and no order to change: a stop dragged
                        // from here goes to a tech's block or a day.
                        RouteStops(
                            tech: nil, date: d, board: board, route: nil, jobs: unassigned, actions: stopActions,
                            onDrop: { id, _ in drop(id, on: .day(d)) }, onReorder: nil)
                    }
                    .zIndex(scheduleDrag.holds(routeKey(nil, d)) ? 1 : 0)
                }
            }
            // A lifted stop draws over the days below it.
            .zIndex(scheduleDrag.holdsDay(d) ? 1 : 0)
        }

        /// One tech's row on a day: their dot and name with the day's stops and driving (a stop
        /// dropped on it goes last), then their stops as one block, the same tiles and drag as Day
        /// (owner, 2026-10-21: "The drag/drop on the week schedule page should be similar to the
        /// daily one"; docs/design/2026-10-21-schedule-tile.md).
        @ViewBuilder private func weekTech(_ t: TeamMember, route: DayRoute?, day d: String, _ board: Board)
            -> some View
        {
            let jobs = route?.jobs ?? []
            let key = routeKey(t.id, d)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    TechDot(color: t.color)
                    Text(t.name).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text(
                        route.map {
                            "\($0.jobs.count) \($0.jobs.count == 1 ? "stop" : "stops") · \(durationLabel($0.summary.driveMin))"
                                + (board.ctx.start(for: t.id).label == .home ? " · \(startLegLabel(.home))" : "")
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
                // A tile from another block let go here goes last on this tech's day.
                .liftDropZone("head|\(key)", owner: key, cornerRadius: CGFloat(Radius.block)) { id, _ in
                    drop(id, on: .route(tech: t.id, date: d, index: nil))
                }
                .accessibilityElement(children: .combine)
                if let route, !jobs.isEmpty {
                    RouteStops(
                        tech: t, date: d, board: board, route: route, jobs: jobs, actions: stopActions,
                        onDrop: { id, index in drop(id, on: .route(tech: t.id, date: d, index: index)) },
                        onReorder: { id, index in reorder(id, tech: t.id, date: d, index: index) },
                        settling: settling == key)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(t.name), \(formatDay(d, long: true))")
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
        /// Reorder Techs' Done: the places that changed, through the sync layer; the board
        /// reloads in the new order. An error for the sheet, or nil.
        private func saveTechOrder(_ ordered: [String], _ board: Board) -> String? {
            guard let company = session.company else { return nil }
            do {
                try TechOrderWrites.save(sync, companyId: company.id, team: board.team, ordered: ordered)
                undo = nil
                banner = ResultBanner(kind: .success, title: ReorderTechs.saved)
                saved += 1
                return nil
            } catch {
                return String(describing: error)
            }
        }

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

        /// A Day or Week stop dragged to a new place in its day (`RouteStops`), or moved by VoiceOver's
        /// Move Up and Move Down: the new order shows at once, with a spring (owner, 2026-10-21:
        /// "just as smooth"), and saves through the same move as a drop. A move that can't be
        /// saved springs back with the reason on the banner; one waiting on Change Schedule or
        /// Just This Visit keeps its new place until then, and goes back on Cancel.
        private func reorder(_ id: String, tech: String, date: String, index: Int) -> Bool {
            guard let board else { return false }
            let key = routeKey(tech, date)
            guard let before = board.loaded.routes[key]?.jobs, let at = before.firstIndex(where: { $0.id == id })
            else { return drop(id, on: .route(tech: tech, date: date, index: index)) }
            let prior = RouteOrder(key: key, jobs: before)
            let revision = sync.revision
            withAnimation(ReorderMotion.animation(reduceMotion: reduceMotion)) {
                self.board?.loaded.routes[key]?.jobs = ScheduleReorder.order(before, from: at, to: index)
                settling = key
            }
            let moved = drop(id, on: .route(tech: tech, date: date, index: index))
            if !moved {
                restore(prior)
            } else if planMove != nil {
                planRevert = prior
            } else if sync.revision == revision {
                // Nothing was saved (already in that place): the board stays as it is.
                settling = nil
            }
            return moved
        }

        /// A day's order put back as it was before a drag.
        private func restore(_ order: RouteOrder?) {
            planRevert = nil
            guard let order else { return }
            withAnimation(ReorderMotion.animation(reduceMotion: reduceMotion)) {
                board?.loaded.routes[order.key]?.jobs = order.jobs
                if settling == order.key { settling = nil }
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
                    return true
                }
                return justThisVisit(pending)
            } catch {
                fail(error)
                return false
            }
        }

        /// Change Schedule: the plan moves to the new weekday and tech (every coming visit
        /// follows), with Undo.
        private func changeSchedule(_ m: PlanVisitMove) {
            planMove = nil
            let revert = planRevert
            planRevert = nil
            guard let board, let plan = board.plans.first(where: { $0.planId == m.job.servicePlanId }) else {
                return restore(revert)
            }
            do {
                let rows = try changeScheduleRows(m, plan: plan, today: board.ctx.today)
                let tech = m.tech ?? plan.techId ?? ""
                let ok = saveTable(
                    rows,
                    ResultBanner(
                        kind: .success,
                        title: planMovedBanner(
                            m.job.customerName, weekdayNames[weekdayOf(m.date) ?? 0],
                            tech.isEmpty ? "" : board.name(tech)),
                        undoable: true),
                    undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
                if !ok { restore(revert) }
            } catch {
                fail(error)
                restore(revert)
            }
        }

        /// Just This Visit: only this visit moves, marked so remaking the plan's visits never puts
        /// it back; Undo restores it. False when it couldn't be saved (a dragged stop goes back).
        @discardableResult
        private func justThisVisit(_ m: PlanVisitMove) -> Bool {
            planMove = nil
            let revert = planRevert
            planRevert = nil
            let rows = justThisVisitRows(m)
            let ok = saveTable(
                rows, ResultBanner(kind: .success, title: visitMovedBanner, undoable: true),
                undo: PendingUndo(rows: undoRows(sync.store, rows), message: putBackMessage))
            if !ok { restore(revert) }
            return ok
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
            // The saved order is read back with its drive times: they fade in (not while a
            // dragged stop still waits on Change Schedule or Just This Visit).
            if planRevert == nil { settling = nil }
            // Pools on the stops shown that were never looked up on the map: ask in the background.
            let stops = next.shownTechs.flatMap { t in
                next.days.flatMap { next.loaded.routes[routeKey(t.id, $0)]?.jobs ?? [] }
            }
            MissingPins.find(stops, companyId: company.id, queue: app.locate, api: app.api, sync: sync)
        }
    }

    /// A day's stops in the order they were shown (`routeKey`), to put back.
    struct RouteOrder {
        var key: String
        var jobs: [ScheduleJob]
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
            // In the shop's saved order (Reorder Techs, owner 2026-10-21); without one, Me first,
            // then A to Z (core scheduleOrder).
            techs = scheduleTeam(
                team.filter { t in
                    (ctx.seesAll || t.id == ctx.userId)
                        && (t.active || days.contains { loaded.routes[routeKey(t.id, $0)] != nil })
                }, me: ctx.userId)
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
                let start = ctx.start(for: route.techId)
                leadMap = dayMapModel(
                    jobs: route.jobs, depot: start.at, date: self.date, today: ctx.today, tech: route.techName,
                    timeZone: ctx.timeZone, startLabel: start.label)
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

        /// Reorder Techs' list: the active techs in the order shown.
        var reorderTechs: [TeamMember] { techs.filter(\.active) }

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
    /// halfway and taken back. Let go past a third of its width or with a flick and it springs
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
        /// How far the strip is dragged, read only by `StripOffset`: moving the finger redraws
        /// the offset alone, never the 21 days (owner, 2026-10-21: no main-thread work while a
        /// drag moves).
        @State private var motion = StripMotion()
        @State private var axis: PagerRule.Axis?
        @State private var width: CGFloat = 358
        /// A sideways drag is on: a day's button doesn't take the lift as a tap.
        @State private var swiping = false
        @State private var turns = 0

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
                        .modifier(StripOffset(motion: motion, base: CGFloat(shift / 7) * page))
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
            // Only a clearly sideways drag (`SidewaysPan`): up and down always scroll the page,
            // from the strip too (owner, 2026-10-21). Not while the last swipe springs on.
            .gesture(SidewaysPan(claims: { _ in pending == nil }, changed: dragChanged, ended: dragEnded))
            .sensoryFeedback(.impact(weight: .light), trigger: turns)
            .onChange(of: date) { old, new in arrive(from: old, to: new) }
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

        private func dragChanged(_ translation: CGSize) {
            guard pending == nil || axis != nil else { return }
            if axis == nil {
                axis = .horizontal
                swiping = true
            }
            guard !reduceMotion else { return }
            motion.offset = PagerRule.follow(translation.width, width: width, canPrevious: true, canNext: true)
        }

        /// The lift, or the system taking the touch (zero: the strip springs back).
        private func dragEnded(_ translation: CGSize, velocity: CGSize) {
            let wasOurs = axis == .horizontal
            axis = nil
            guard wasOurs else { return }
            release()
            let way = PagerRule.outcome(
                translation.width, velocity: velocity.width, width: width, canPrevious: true, canNext: true)
            guard way != 0 else {
                withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { motion.offset = 0 }
                return
            }
            turn(way, velocity: velocity.width)
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
            let speed = PagerRule.springVelocity(velocity, from: motion.offset, to: end)
            shown = current
            pending = target
            withAnimation(.interpolatingSpring(duration: PagerRule.settle, bounce: 0, initialVelocity: speed)) {
                motion.offset = end
            } completion: {
                var instant = Transaction()
                instant.disablesAnimations = true
                withTransaction(instant) {
                    pending = nil
                    // Stand on the new week until the screen's date gets there.
                    shown = date == from ? target : nil
                    motion.offset = 0
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
            withTransaction(instant) { motion.offset = (after > before ? 1 : -1) * page }
            withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { motion.offset = 0 }
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

    /// The week strip's drag (`WeekStrip`), observed only by `StripOffset`.
    @MainActor @Observable final class StripMotion {
        var offset: CGFloat = 0
    }

    /// A week's place in the strip: `base` plus the drag. Its own view, so the drag redraws it alone.
    private struct StripOffset: ViewModifier {
        var motion: StripMotion
        var base: CGFloat

        func body(content: Content) -> some View {
            content.offset(x: base + motion.offset)
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
        @Environment(ScheduleDragState.self) private var drag: ScheduleDragState?

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
                                    // One full card and the start of the next (owner's review of
                                    // the CI screenshots, 2026-10-21: no half-cut card with
                                    // fragments of text): 12 pt of the next card's edge shows.
                                    .frame(width: max(0, geo.size.width - 24))
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
            // A Day stop dragged by its grip (`RouteStops`) and let go here comes off its day: its
            // frame on screen, and the same `link` ring as a dragged Week row's while it's over.
            .overlay {
                if drag?.overTray == true {
                    RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
                        .strokeBorder(Color.link, lineWidth: 2)
                        .allowsHitTesting(false)
                }
            }
            .onGeometryChange(for: CGRect.self) {
                $0.frame(in: .global)
            } action: { frame in
                drag?.trayFrame = frame
            }
            .onDisappear { drag?.trayFrame = nil }
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
                // The schedule card's two lines, without a time (none is set yet). Only the name
                // opens the job (owner, 2026-10-21: "I find myself accidentally opening jobs all
                // the time"); touch and hold for the menu.
                // No status label: everything in Needs a Time is unscheduled, so it says nothing,
                // and the name gets the room.
                StopLines(
                    job: job, note: note, timeZone: "", notOnMap: notOnMap, showsTime: false, showsStatus: false,
                    onOpen: { openRoute(.job(job.id)) }
                )
                .contentShape(Rectangle())
                .rowMenu(actions.title, actions.menu)
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
                // Drag from the grip only, so the row of cards scrolls under a finger anywhere
                // else. No swipes here: the cards sit in a row that scrolls sideways.
                if canMoveJob(job.status) { ScheduleGrip().scheduleDragSource(job) }
            }
            .well(padding: 8)
            .accessibilityElement(children: .contain)
            .swipeAccessibilityActions(actions.accessibilityActions)
        }
    }

    /// One tech's day (spec 5.6 item 8): the tech, the day's stops and driving, Optimize and the
    /// maps link on a card, then the stops as one block of tiles (`RouteStops`, owner 2026-10-21). The day's stops reorder by dragging their grips (`RouteStops`); a
    /// stop from Needs a Time dropped among them goes where it's let go; on the tech's card or
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
        /// A stop of this day dragged to a new place (job id, its index in the new order).
        var onReorder: (String, Int) -> Bool
        /// The new order shows but isn't saved and worked out yet: no drive times.
        var settling = false
        /// The day's map, facts and buttons are in `DayLead` above Needs a Time.
        var lead = false

        var body: some View {
            let jobs = route?.jobs ?? []
            let open = board.date >= board.ctx.today
            VStack(alignment: .leading, spacing: 8) {
                header(jobs: jobs, open: open)
                    .scheduleDropTarget(cornerRadius: CGFloat(Radius.card)) { onDrop($0, nil) }
                    // A tile from another tech's block let go here goes last.
                    .liftDropZone(
                        "head|\(routeKey(tech.id, board.date))", owner: routeKey(tech.id, board.date),
                        cornerRadius: CGFloat(Radius.card)
                    ) { id, _ in onDrop(id, nil) }
                if let route, !jobs.isEmpty {
                    // One block of touching tiles, the drive home as its last line
                    // (docs/design/2026-10-21-schedule-tile.md).
                    RouteStops(
                        tech: tech, date: board.date, board: board, route: route, jobs: jobs, actions: actions,
                        onDrop: onDrop, onReorder: onReorder, settling: settling)
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
                    [
                        "\(jobs.count) \(jobs.count == 1 ? "stop" : "stops")",
                        "\(durationLabel(route.summary.driveMin)) driving",
                        // Someone who starts from home: their day's driving is counted from there.
                        board.ctx.start(for: route.techId).label == .home ? startLegLabel(.home) : nil,
                    ].compactMap { $0 }.joined(separator: " · ")
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
                        app: board.mapsApp, origin: board.ctx.origin(for: route.techId),
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

    /// A stop's tile in its tech's block, two lines (owner, 2026-10-21: "The tiles should be thin
    /// and touching like in the weekly view. Remember that typically job order number is more
    /// important than expected arrival time"; docs/design/2026-10-21-schedule-tile.md): the stop's
    /// number leads, then the customer with small icons only for what's unusual (a lock, not on
    /// the map, a cleaning due) or the status when it isn't plain Scheduled, over the drive to it
    /// as a chip, the time and the street; the grip. The kind of visit is in the menu's title.
    /// Only the customer's name opens the job (owner, 2026-10-21: "I find myself accidentally
    /// opening jobs all the time"); touch and hold the tile for Move…, the locks, Take Off Schedule
    /// and Directions; drag from the grip (`grip`, with its gesture) to move it (`RouteStops`).
    /// Website components/route-board.tsx `StopCard`.
    struct ScheduleStopCard<Grip: View>: View {
        var number: Int
        var job: ScheduleJob
        /// After the time: a two-tech stop's "With Dana" (`stopTechNote`).
        var note: String?
        var timeZone: String
        var notOnMap = false
        var cleanings: [ScheduledCleaning] = []
        /// The drive to this stop, in minutes (nil: not known, no chip).
        var drive: Int?
        /// The drive chips hold their place but don't show while the day is being reordered.
        var driveHidden = false
        /// The touch-and-hold menu (gestures spec 12).
        var actions: ScheduleStopActions
        /// A tap on the name opens the job; off while it's lifted to drag, and just after it's let go.
        var opens = true
        /// The grip at the trailing edge, shown when the stop can move.
        @ViewBuilder var grip: () -> Grip
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            let movable = canMoveJob(job.status)
            HStack(spacing: 0) {
                HStack(alignment: .center, spacing: 10) {
                    StopBadge(number: number, status: job.status)
                    StopLines(
                        job: job, note: note, timeZone: timeZone, notOnMap: notOnMap, cleanings: cleanings,
                        drive: drive, driveHidden: driveHidden,
                        onOpen: { if opens { openRoute(.job(job.id)) } })
                }
                .padding(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: movable ? 0 : 16))
                .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                .contentShape(Rectangle())
                // Touch and hold the tile (not the grip, which drags at once) for its menu.
                .contentShape(
                    .contextMenuPreview, RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous)
                )
                .rowMenu(actions.title, actions.menu)
                // The grip at the trailing edge (owner, 2026-10-20), 44 pt wide: the only place a
                // drag starts, so the tile never fights the page's scroll.
                if movable { grip() }
            }
            .zoomSource(job.id)
            // One element for VoiceOver; activating it opens the job, as the name does. The kind
            // of visit isn't on the tile any more, so VoiceOver reads it after the rest.
            .accessibilityElement(children: .combine)
            .accessibilityValue(visitKind(job.type))
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Opens the job")
            .accessibilityAction { openRoute(.job(job.id)) }
            // Drag and drop's alternative, and the menu's actions (owner, 2026-10-20).
            .swipeAccessibilityActions(actions.accessibilityActions)
        }
    }

    /// A schedule tile's two lines (Day's and Week's stops, Needs a Time): the customer with the
    /// exceptions on the right, over the drive chip, the time, the note and the street, one line,
    /// cut short. The customer's name, in `link` with a "›", is the only part that opens the job
    /// (`onOpen`), with a 44 pt tall hit area around its line.
    struct StopLines: View {
        var job: ScheduleJob
        var note: String?
        var timeZone: String
        var notOnMap = false
        var cleanings: [ScheduledCleaning] = []
        var showsTime = true
        /// The status label when the stop isn't plain Scheduled (not in Needs a Time, where every
        /// job is unscheduled).
        var showsStatus = true
        /// The drive to this stop as a chip at the start of line 2 (nil: none; Needs a Time has
        /// no drive).
        var drive: Int? = nil
        /// The chip keeps its place but doesn't show (a day being reordered).
        var driveHidden = false
        /// Opens the job: the name is a link. Nil: the name is plain text.
        var onOpen: (() -> Void)? = nil

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    // The name gets the room it needs; the small icons give way first.
                    name
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .layoutPriority(1)
                        // One line, cut short only when it runs past what the icons, the "⋯" and
                        // the grip leave.
                        .lineLimit(1)
                    StopExceptions(job: job, notOnMap: notOnMap, cleanings: cleanings, showsStatus: showsStatus)
                }
                let rest = [note, street].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if drive != nil || showsTime || !rest.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        if let drive {
                            DriveChip(minutes: drive)
                                .opacity(driveHidden ? 0 : 1)
                                .accessibilityHidden(driveHidden)
                        }
                        if showsTime {
                            Text(time).monospacedDigit()
                                // Never squeezed by the rest of the line: a squeezed time stacked
                                // its letters down the card and made it three times as tall.
                                .lineLimit(1).fixedSize()
                        }
                        if !rest.isEmpty {
                            Text(showsTime ? "· " + rest : rest).lineLimit(1)
                        }
                    }
                    .textRole(.secondary).foregroundStyle(Color.textMuted)
                }
            }
            .opacity(job.finished ? 0.7 : 1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        private var time: String {
            job.scheduledStart == nil ? "No time" : formatTime(job.scheduledStart, timeZone: timeZone)
        }

        @ViewBuilder private var name: some View {
            if let onOpen {
                Button(action: onOpen) {
                    // The "›" stays when a long name is cut short, as on the website.
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(job.customerName).truncationMode(.tail)
                        Text(verbatim: "›").fixedSize()
                    }
                    .font(.role(.bodyEmphasis))
                    .foregroundStyle(Color.link)
                    .contentShape(MinHeightHitArea(height: minTarget))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(job.customerName)
                .accessibilityHint("Opens the job")
            } else {
                Text(job.customerName).font(.role(.bodyEmphasis)).foregroundStyle(Color.text)
            }
        }

        /// The street only: "5024 W Las Palmaritas Dr", no city or ZIP.
        private var street: String? {
            let first = job.address.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
            return first?.isEmpty == false ? first : nil
        }
    }

    /// A hit area at least `height` tall around a line of text, without making the line taller:
    /// the customer's name on a schedule card.
    struct MinHeightHitArea: Shape {
        var height: CGFloat

        func path(in rect: CGRect) -> Path {
            Path(rect.insetBy(dx: 0, dy: -max(0, (height - rect.height) / 2)))
        }
    }

    /// What's unusual about a stop, as small icons with their own labels: a lock, not on the map,
    /// a cleaning due; or, when the stop isn't plain Scheduled, its status instead.
    struct StopExceptions: View {
        var job: ScheduleJob
        var notOnMap = false
        var cleanings: [ScheduledCleaning] = []
        /// Off in Needs a Time: everything there is unscheduled, so the label says nothing.
        var showsStatus = true

        var body: some View {
            if job.status != .scheduled && showsStatus {
                StatusChip(status: job.status)
            } else {
                HStack(spacing: 6) {
                    if let lock = lockTag(job), lock.kind != .twoTechs { LockTagLabel(tag: lock) }
                    if notOnMap { NotOnMapTag() }
                    if let first = cleanings.first {
                        CleaningIcon(kind: first.kind, size: 17)
                            .foregroundStyle(Color.textMuted)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(
                                cleanings.count == 1
                                    ? "\(first.name) due"
                                    : "Cleanings due: " + cleanings.map(\.name).joined(separator: ", "))
                    }
                }
                .font(.role(.footnote))
            }
        }
    }

    /// A tech's stops on a day as one block (docs/design/2026-10-21-schedule-tile.md): the tech's
    /// stripe on its leading edge, the tiles touching with hairlines after the stop numbers, each
    /// with the drive to it on a chip, and the drive home as the last line. The same block on Day
    /// and Week (owner, 2026-10-21: "Do that for both schedule pages"; "The drag/drop on the week
    /// schedule page should be similar to the daily one").
    ///
    /// Drag a stop by its grip (owner, 2026-10-21: "I'm still struggling to scroll when I have a
    /// page full of job tiles"; Reorder Techs' feel): it lifts at once with a light haptic, follows
    /// the finger, the others slide up or down by its height so the gap is always where it will
    /// land, and the drive chips fade until the new order is saved and worked out. Let go and it
    /// settles into the gap and saves through the same move as Move…; let go over another tech's
    /// or day's block it moves there, where it's let go (over a header, last); let go over Needs a
    /// Time and it comes off its day, as Take Off Schedule does. A stop from Needs a Time can still
    /// be dropped among them (the system's drag), and goes where it's let go.
    ///
    /// The page never stays still after a drag (owner, 2026-10-21: "it sometimes freezes up"): the
    /// drag in flight is a `@GestureState`, which the system resets however the touch ends
    /// (lifted, cancelled, the menu taking over, a second finger), and the page's lock is let go
    /// on the drag's end, on that reset, and when these stops leave the screen.
    struct RouteStops: View {
        /// Nil: Week's "No tech yet" stops (no route, no drive, no reordering).
        var tech: TeamMember?
        var date: String
        var board: Board
        var route: DayRoute?
        var jobs: [ScheduleJob]
        var actions: (ScheduleJob, String?) -> ScheduleStopActions
        /// A stop dropped on this block (job id, its place or nil for last): from Needs a Time, or
        /// a tile from another block.
        var onDrop: (String, Int?) -> Bool
        /// A stop of this block to a new place (job id, its index in the new order). False when it
        /// can't go there; the day's order puts it back. Nil: the block doesn't reorder.
        var onReorder: ((String, Int) -> Bool)?
        /// The new order shows but isn't saved and worked out yet: no drive times.
        var settling = false
        @Environment(ScheduleDragState.self) private var drag: ScheduleDragState?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @ScaledMetric(relativeTo: .body) private var badge: CGFloat = 32
        /// Each stop's frame, measured while nothing is lifted.
        @State private var frames: [String: CGRect] = [:]
        /// The stop following the finger, and how far it's gone (down is positive).
        @State private var lifted: String?
        @State private var translation: CGFloat = 0
        /// Lifts, for the haptic.
        @State private var lifts = 0
        /// The stop just let go: the lift's touch-up doesn't open it.
        @State private var dropped: String?
        /// The stop let go over Needs a Time or another block, fading where it was let go while
        /// it moves.
        @State private var leaving: String?
        /// The grip being dragged, reset by the system however the touch ends.
        @GestureState private var inFlight: String?

        /// The tiles touch (the hairlines are inside them).
        static let spacing: CGFloat = 0
        private var space: String { "route-stops-\(key)" }
        /// This day's hold on the page's lock (`ScheduleDragState`), and the block's day.
        private var key: String { routeKey(tech?.id, date) }
        /// Where other blocks' tiles land on this one.
        private var zone: String { "block|\(key)" }
        private var motion: Animation? { ReorderMotion.animation(reduceMotion: reduceMotion) }
        /// Where the hairlines start: after the stop number.
        private var hairlineInset: CGFloat { 16 + badge + 10 }

        var body: some View {
            let ids = jobs.map(\.id)
            let heights = ids.map { Double(frames[$0]?.height ?? 58) }
            let from = lifted.flatMap { ids.firstIndex(of: $0) }
            // Over Needs a Time or another block, the others close no gap: it's leaving the day.
            let away = drag?.overTray == true || drag?.overZone != nil
            let to = from.map {
                away || onReorder == nil
                    ? $0
                    : ScheduleReorder.target(
                        from: $0, translation: Double(translation), heights: heights, spacing: Double(Self.spacing))
            }
            let offsets =
                from.map {
                    ScheduleReorder.offsets(from: $0, to: to ?? $0, heights: heights, spacing: Double(Self.spacing))
                } ?? ids.map { _ in 0 }
            let shown = from.map { ScheduleReorder.order(ids, from: $0, to: to ?? $0) } ?? ids
            let start = board.ctx.start(for: tech?.id).at != nil
            let located = jobs.map { !notOnMap($0) }
            let chips =
                route.map { StopDrive.chips(legs: $0.summary.legs, located: located, startLocated: start) }
                ?? jobs.map { _ in nil }
            let home = route.flatMap {
                StopDrive.home(backMin: $0.summary.backLegMin, located: located, startLocated: start)
            }
            let noDrive = lifted != nil || settling
            let space = space
            let mids = ids.map { Double(frames[$0]?.midY ?? 0) }
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: Self.spacing) {
                    ForEach(Array(jobs.enumerated()), id: \.element.id) { i, j in
                        tile(
                            j, index: i, number: (shown.firstIndex(of: j.id) ?? i) + 1, drive: chips[i],
                            noDrive: noDrive, last: shown.last == j.id && home == nil
                        )
                        .offset(y: j.id == lifted || j.id == leaving ? translation : CGFloat(offsets[i]))
                        .animation(j.id == lifted || j.id == leaving ? nil : motion, value: offsets[i])
                        .zIndex(j.id == lifted || j.id == leaving ? 1 : 0)
                        .onGeometryChange(for: CGRect.self) {
                            $0.frame(in: .named(space))
                        } action: { frame in
                            if lifted == nil { frames[j.id] = frame }
                        }
                    }
                }
                .coordinateSpace(.named(space))
                .liftDropZone(tech == nil ? nil : zone, owner: key, mids: mids, cornerRadius: CGFloat(Radius.card)) {
                    onDrop($0, $1)
                }
                // The drive home, the block's last line (hidden when there's none).
                if let home {
                    Label {
                        Text(verbatim: "\(durationLabel(home)) \(backLegLabel(board.ctx.start(for: tech?.id).label))")
                    } icon: {
                        Image(systemName: "house.fill").imageScale(.small)
                    }
                    .labelStyle(.titleAndIcon)
                    .textRole(.footnote).foregroundStyle(Color.textMuted).monospacedDigit()
                    .padding(.leading, hairlineInset)
                    .padding(.trailing, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .opacity(noDrive ? 0 : 1)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: noDrive)
                }
            }
            // The tech's stripe on the block's leading edge, under the tiles, so a lifted tile
            // passes over it; the block itself is a soft card with no outline.
            .background {
                if let color = board.color(tech?.id) {
                    Rectangle().fill(color.color).frame(width: 4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                        .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous))
                        .accessibilityHidden(true)
                }
            }
            .card(padding: 0)
            .sensoryFeedback(.impact(weight: .light), trigger: lifts)
            .onChange(of: inFlight) { _, now in
                // The touch ended without the drag's end (cancelled, the menu, a second finger):
                // back to its place, and the page scrolls again.
                if now == nil, lifted != nil { putDown() }
            }
            .onDisappear {
                lifted = nil
                translation = 0
                drag?.release(key)
            }
            // A stop from Needs a Time: where it's let go among these.
            .dropDestination(for: String.self) { items, location in
                guard let id = items.first else { return false }
                let others = ids.filter { $0 != id }.map { Double(frames[$0]?.midY ?? 0) }
                return onDrop(id, ScheduleReorder.insertion(y: Double(location.y), mids: others))
            }
        }

        /// One stop's tile, with the hairline under it (none under the last) and its lift.
        private func tile(_ j: ScheduleJob, index i: Int, number: Int, drive: Int?, noDrive: Bool, last: Bool)
            -> some View
        {
            let up = j.id == lifted
            let gone = j.id == leaving
            let stopActions = actions(j, key)
            return ScheduleStopCard(
                number: number, job: j,
                note: stopTechNote(j, routeTech: tech?.id, names: board.names),
                timeZone: board.ctx.timeZone, notOnMap: notOnMap(j),
                cleanings: board.cleanings[j.id] ?? [],
                drive: drive, driveHidden: noDrive,
                actions: stopActions,
                opens: !up && dropped != j.id && lifted == nil
            ) {
                ScheduleGrip()
                    .highPriorityGesture(grip(j.id, takeOff: stopActions.onTakeOff))
            }
            .overlay(alignment: .bottom) {
                if !last && !up && !gone { Hairline().padding(.leading, hairlineInset) }
            }
            .background {
                // Lifted, the tile is a card of its own over the others.
                if up || gone {
                    RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous).fill(Color.surface)
                }
            }
            .scaleEffect(up && !reduceMotion ? 1.03 : gone && !reduceMotion ? 0.92 : 1)
            .shadow(color: Color.navy.opacity(up ? 0.2 : 0), radius: 16, x: 0, y: 8)
            .opacity(gone ? 0 : 1)
            .accessibilityActions {
                if let onReorder, canMoveJob(j.status) && i > 0 {
                    Button(TodayReorderText.moveUp) { _ = onReorder(j.id, i - 1) }
                }
                if let onReorder, canMoveJob(j.status) && i < jobs.count - 1 {
                    Button(TodayReorderText.moveDown) { _ = onReorder(j.id, i + 1) }
                }
            }
        }

        /// Not found on the map, or with no map location at all: no drive to it.
        private func notOnMap(_ j: ScheduleJob) -> Bool { (board.routing && j.mapMissing) || j.location == nil }

        /// The grip's drag: it lifts on touch (no hold), and the page holds still until it's let
        /// go (`ScheduleDragState`). The finger is tracked on screen for Needs a Time and the
        /// other blocks.
        private func grip(_ id: String, takeOff: (() -> Void)?) -> some Gesture {
            DragGesture(minimumDistance: 0, coordinateSpace: .global)
                .updating($inFlight) { _, state, _ in state = id }
                .onChanged { value in
                    // A second finger on another grip doesn't take over the first.
                    guard lifted == nil || lifted == id else { return }
                    if lifted != id {
                        withAnimation(motion) { lifted = id }
                        lifts += 1
                    }
                    drag?.hold(key)
                    translation = value.translation.height
                    let over = takeOff != nil && ScheduleReorder.isOver(tray: drag?.trayFrame, finger: value.location)
                    if drag?.overTray != over { drag?.overTray = over }
                    let zone =
                        over ? nil : ScheduleReorder.zone(at: value.location, zones: drag?.zones ?? [:], from: key)
                    if drag?.overZone != zone { drag?.overZone = zone }
                }
                .onEnded { value in
                    guard lifted == id else { return }
                    letGo(id, translation: value.translation.height, finger: value.location, takeOff: takeOff)
                }
        }

        /// Let go: it settles into the gap and the new order shows at once while it saves; a move
        /// that can't be saved slides it back (the day's own order). Over Needs a Time it fades
        /// where it was let go and comes off its day; over another block, it fades there and moves.
        private func letGo(_ id: String, translation: CGFloat, finger: CGPoint, takeOff: (() -> Void)?) {
            let tray = drag?.trayFrame
            let zones = drag?.zones ?? [:]
            let drops = drag?.drops ?? [:]
            drag?.release(key)
            let ids = jobs.map(\.id)
            guard let from = ids.firstIndex(of: id) else { return putDown() }
            let heights = ids.map { Double(frames[$0]?.height ?? 58) }
            var release = ScheduleReorder.release(
                from: from, translation: Double(translation), heights: heights, spacing: Double(Self.spacing),
                finger: finger, tray: tray, canTakeOff: takeOff != nil)
            dropped = id
            if release != .takeOff, let target = ScheduleReorder.zone(at: finger, zones: zones, from: key),
                let zone = zones[target], let onTarget = drops[target]
            {
                self.translation = translation
                withAnimation(motion) {
                    lifted = nil
                    leaving = id
                }
                _ = onTarget(id, ScheduleReorder.index(in: zone, finger: finger))
                return settleLater(id)
            }
            if onReorder == nil, case .reorder = release { release = .stay }
            switch release {
            case .takeOff:
                self.translation = translation
                withAnimation(motion) {
                    lifted = nil
                    leaving = id
                }
                takeOff?()
            case .reorder(let to):
                withAnimation(motion) {
                    lifted = nil
                    self.translation = 0
                    _ = onReorder?(id, to)
                }
            case .stay:
                withAnimation(motion) {
                    lifted = nil
                    self.translation = 0
                }
            }
            settleLater(id)
        }

        /// A moment after it's let go: taps open it again, and one still here (the move couldn't
        /// be saved) slides back to its place.
        private func settleLater(_ id: String) {
            Task {
                try? await Task.sleep(for: .milliseconds(600))
                if dropped == id { dropped = nil }
                if leaving == id {
                    withAnimation(motion) {
                        leaving = nil
                        if lifted == nil { self.translation = 0 }
                    }
                }
            }
        }

        /// Back to its place, nothing moved.
        private func putDown() {
            drag?.release(key)
            withAnimation(motion) {
                lifted = nil
                translation = 0
            }
        }
    }

    /// A stop lifted to reorder its day or move it, for the page around it: while any day holds
    /// a lift, the page doesn't scroll or turn. Each day holds and lets go by its own key, so one
    /// day's drag ending (or leaving the screen) never leaves the page locked by another's.
    @MainActor @Observable final class ScheduleDragState {
        private(set) var holders: Set<String> = []
        /// A stop is lifted: the page doesn't scroll or turn.
        var liftedStop: Bool { !holders.isEmpty }
        /// Needs a Time's frame on screen (global), nil when it isn't shown. Read only by the drag,
        /// so its changes while the page scrolls redraw nothing.
        @ObservationIgnored var trayFrame: CGRect?
        /// The lifted stop is over Needs a Time: the box shows its ring.
        var overTray = false
        /// The blocks and headers on screen a lifted stop can be let go on (global frames), and
        /// what letting go there does (job id, its place or nil for last). Read only by the drag.
        @ObservationIgnored var zones: [String: ScheduleReorder.Zone] = [:]
        @ObservationIgnored var drops: [String: (String, Int?) -> Bool] = [:]
        /// The zone the lifted stop is over: it shows its ring.
        var overZone: String?

        func hold(_ key: String) {
            if !holders.contains(key) { holders.insert(key) }
        }

        /// This day (`routeKey`) holds a lift: its views draw over the rest of the page.
        func holds(_ key: String) -> Bool { holders.contains(key) }

        /// Any tech's stop on this day is lifted.
        func holdsDay(_ date: String) -> Bool { holders.contains { $0.hasSuffix("|\(date)") } }

        func release(_ key: String) {
            if holders.contains(key) { holders.remove(key) }
            if holders.isEmpty {
                if overTray { overTray = false }
                if overZone != nil { overZone = nil }
            }
        }

        func releaseAll() {
            if !holders.isEmpty { holders = [] }
            if overTray { overTray = false }
            if overZone != nil { overZone = nil }
        }
    }

    /// Where a lifted stop can be let go (`RouteStops`): a block of stops (`mids`, its tiles'
    /// middles from its top) or a header (nil: it goes last). A `link` ring while it's over.
    private struct LiftDropZone: ViewModifier {
        /// Nil: not a place to drop.
        var id: String?
        var owner: String
        var mids: [Double]?
        var cornerRadius: CGFloat
        var onDrop: (String, Int?) -> Bool
        @Environment(ScheduleDragState.self) private var drag: ScheduleDragState?

        @ViewBuilder func body(content: Content) -> some View {
            if let id {
                content
                    .overlay {
                        if drag?.overZone == id {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .strokeBorder(Color.link, lineWidth: 2)
                                .allowsHitTesting(false)
                        }
                    }
                    .onGeometryChange(for: CGRect.self) {
                        $0.frame(in: .global)
                    } action: { frame in
                        drag?.zones[id, default: ScheduleReorder.Zone(frame: .zero, mids: mids, owner: owner)].frame =
                            frame
                        drag?.drops[id] = onDrop
                    }
                    .onChange(of: mids, initial: true) { _, now in
                        drag?.zones[id, default: ScheduleReorder.Zone(frame: .zero, mids: now, owner: owner)].mids = now
                        drag?.drops[id] = onDrop
                    }
                    .onDisappear {
                        drag?.zones[id] = nil
                        drag?.drops[id] = nil
                    }
            } else {
                content
            }
        }
    }

    extension View {
        /// Where a lifted stop can be let go (`LiftDropZone`).
        fileprivate func liftDropZone(
            _ id: String?, owner: String, mids: [Double]? = nil, cornerRadius: CGFloat,
            _ onDrop: @escaping (String, Int?) -> Bool
        ) -> some View {
            modifier(LiftDropZone(id: id, owner: owner, mids: mids, cornerRadius: cornerRadius, onDrop: onDrop))
        }
    }

    /// A schedule stop's touch-and-hold menu (gestures spec section 12; the same on Day's stops,
    /// Week's rows and Needs a Time; no swipes since 2026-10-21, so a drag on a card scrolls the
    /// page): Open, Move…, Lock Day, Lock Time (Unlock once locked), Take Off Schedule and
    /// Directions, each only where the stop can take it. VoiceOver gets the same as actions.
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

        /// "Repair", then "Grace Holloway · Job #1040": the kind of visit is off the tile and leads
        /// the menu's title (docs/design/2026-10-21-schedule-tile.md).
        var title: String { visitKind(job.type) + "\n" + job.customerName + (job.number.map { " · Job #\($0)" } ?? "") }

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

        /// VoiceOver's actions: the menu's, less Open (activating the card opens the job, as its name does).
        var accessibilityActions: [SwipeAction] { Array(menu.dropFirst()) }

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

    /// The stop's number in a 32 pt circle, in Barlow ExtraBold, leading each schedule tile (owner,
    /// 2026-10-21: the order matters more than the arrival time): a green check once it's
    /// finished, `link` while it's in progress, gray otherwise.
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
                    Text(verbatim: "\(number)")
                        .font(.custom(BrandFonts.Weight.extraBold.rawValue, size: 18, relativeTo: .body))
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

    /// Touch and hold a Week row's or a Needs a Time card's grip to pick it up (owner, 2026-10-20;
    /// the grip only since 2026-10-21): a haptic, the small card under the finger, and the job's
    /// id for the drop. A canceled job stays put. Day's stops reorder with their own drag instead
    /// (`RouteStops`).
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
                    .contentShape(Rectangle())
                    .dropDestination(for: String.self) { items, _ in
                        items.first.map(onDrop) ?? false
                    } isTargeted: { now in
                        targeted = now
                    }
            } else {
                content
            }
        }
    }

    /// The spring rows move with when they're reordered: Reorder Techs' feel, for stops on Today
    /// and the Schedule (owner, 2026-10-21).
    enum ReorderMotion {
        static let spring = Animation.spring(duration: 0.35, bounce: 0.12)

        /// The spring, or nothing with Reduce Motion.
        static func animation(reduceMotion: Bool) -> Animation? { reduceMotion ? nil : spring }
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
            board.ctx.seesAll
                ? scheduleTeam(board.team.filter(\.active), me: board.ctx.userId)
                : board.team.filter { $0.id == board.ctx.userId }
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

    /// A schedule card's grip (owner, 2026-10-21: "I'm still struggling to scroll when I have a
    /// page full of job tiles"): the only place a drag starts, 44 by 44 pt (or the card's height),
    /// so the rest of the card scrolls the page.
    struct ScheduleGrip: View {
        var body: some View {
            DragGrip(width: minTarget)
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
        }
    }

    /// The handle on a card that can be dragged, at its trailing edge (owner, 2026-10-20): the
    /// three lines iOS lists use for reordering, in `textMuted`. On schedule cards a drag starts
    /// only here (`ScheduleGrip`); VoiceOver and Switch Control use Move instead.
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
