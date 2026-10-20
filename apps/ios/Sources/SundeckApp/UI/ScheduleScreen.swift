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
    /// day, or to Needs a Time (owner, 2026-10-20), the same move as Move…. Every change is a write
    /// through the sync layer. Port of apps/web/src/app/(office)/schedule/page.tsx and
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
        /// The tech whose day Optimize is working on.
        @State private var optimizing: String?
        /// Plan Week is working.
        @State private var planningRun = false
        /// The next board animates in (stops sliding to their new places after Optimize or a move).
        @State private var animateNext = false
        @State private var saved = 0
        @State private var failed = 0
        /// Plan Week's sheet, and the rows that put the week back (Undo on its result).
        @State private var planningWeek = false
        @State private var weekUndo: [WeekUndoRow]?

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
                                ? { id, job in drop(job, on: .route(tech: id, date: board.date, index: nil)) } : nil
                        )
                        .padding(.horizontal, -16)
                        .accessibilityLabel("Whose schedule")
                    }
                    if let route = board.leadRoute {
                        DayLead(route: route, board: board, busy: optimizing == route.techId) {
                            plan(route.techId, board)
                        }
                    }
                    notices(board)
                    if board.ctx.isManager && view != .month {
                        NeedsATimeCard(
                            jobs: board.tray, board: board, onMove: move, onSuggest: { suggesting = $0 },
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
                    .contentShape(Rectangle())
                    .pageSwipe(
                        previous: { date = step(board.date, -1) },
                        next: { date = step(board.date, 1) })
                } else {
                    ScheduleSkeleton()
                }
            }
            .refreshable { await sync.syncNow() }
            // Plan Week's result has one Undo for the whole change (undo-and-redo.md).
            .resultBanner($banner, onUndo: weekUndo.map { rows in { undoWeek(rows) } })
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
                        apply {
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
                        apply {
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
                    busy: optimizing == t.id, onPlan: { plan(t.id, board) }, onMove: move,
                    onDrop: { id, index in drop(id, on: .route(tech: t.id, date: board.date, index: index)) },
                    lead: board.leadRoute?.techId == t.id)
            }
        }

        @ViewBuilder private func weekView(_ board: Board) -> some View {
            // Owners and admins: put the week's movable jobs on days for the least driving.
            if board.ctx.isManager && !planWeekDates(board.days, today: board.ctx.today).isEmpty {
                Button {
                    planningWeek = true
                } label: {
                    BusyLabel(title: "Plan Week", busyTitle: "Planning…", busy: planningRun)
                }
                .buttonStyle(.secondary(fullWidth: true))
                .disabled(planningRun)
                .accessibilityHint("Opens a sheet to plan this week’s routes")
            }
            ForEach(board.days, id: \.self) { d in
                let list = board.weekList(d)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Button {
                            pick(d)
                        } label: {
                            Text(formatDay(d, long: true) + (d == board.ctx.today ? " · Today" : ""))
                                .textRole(.subHeading)
                                .foregroundStyle(d == board.ctx.today ? Color.link : Color.text)
                                .frame(minHeight: minTarget)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(.isHeader)
                        if list.isEmpty {
                            Text("Nothing scheduled").textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    if !list.isEmpty {
                        GroupedRows(
                            list.map {
                                WeekItem(job: $0.job, tech: $0.tech, cleanings: board.cleanings[$0.job.id] ?? [])
                            }
                        ) { item in
                            Button {
                                openRoute(.job(item.job.id))
                            } label: {
                                WeekRow(item: item, timeZone: board.ctx.timeZone, movable: canMoveJob(item.job.status))
                            }
                            .buttonStyle(.row)
                            .zoomSource(item.job.id)
                            .scheduleDragSource(item.job)
                        }
                    }
                }
                // A stop dropped on a day keeps its tech and goes last that day.
                .scheduleDropTarget(cornerRadius: CGFloat(Radius.card)) { drop($0, on: .day(d)) }
            }
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

        private func move(_ job: ScheduleJob, from: String?) { moving = MoveTarget(job: job, from: from) }

        /// Optimize: the day planned off the main thread (the button shows Optimizing… at once),
        /// then saved through the sync layer, the stops sliding into their new order, and the
        /// result on the banner.
        private func plan(_ techId: String, _ board: Board) {
            guard optimizing == nil else { return }
            optimizing = techId
            let (date, jobs, ctx, team, drive) = (board.date, board.jobs, board.ctx, board.team, drive)
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
                    let undo = week.undo.isEmpty ? nil : week.undo
                    save(
                        week.updates,
                        ResultBanner(kind: .success, title: week.message, detail: week.detail, undoable: undo != nil),
                        undo: undo)
                case .failure(let error):
                    fail(error)
                }
            }
        }

        /// Undo Plan Week: every job back as it was.
        private func undoWeek(_ rows: [WeekUndoRow]) {
            save(undoWeekPlan(rows), ResultBanner(kind: .success, title: weekPlanUndone))
        }

        /// A stop dropped on the schedule: the same move as Move…, through the sync layer. False
        /// (the stop slides back) when the move is refused, with the reason above the routes.
        private func drop(_ jobId: String, on target: ScheduleDrop) -> Bool {
            guard let board else { return false }
            return apply {
                try dropJob(jobId, on: target, jobs: board.jobs, ctx: board.ctx, team: board.team, drive: drive)
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
        private func save(_ updates: [JobUpdate], _ result: ResultBanner, undo: [WeekUndoRow]? = nil) -> Bool {
            guard let company = session.company else { return false }
            do {
                try saveJobUpdates(sync, companyId: company.id, updates)
                weekUndo = undo
                animateNext = !updates.isEmpty
                banner = result
                saved += 1
                return true
            } catch {
                fail(error)
                return false
            }
        }

        private func fail(_ error: any Error) {
            weekUndo = nil
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
            if let route = leadRoute {
                leadMap = dayMapModel(
                    jobs: route.jobs, depot: ctx.depot, date: self.date, today: ctx.today, tech: route.techName,
                    timeZone: ctx.timeZone)
            }
        }

        func name(_ id: String) -> String { names[id] ?? "Teammate" }

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

        /// A day's jobs for the week list: the shown people's (not as second tech), and with
        /// Everyone the day's jobs with no tech.
        func weekList(_ d: String) -> [(job: ScheduleJob, tech: String)] {
            var list: [(ScheduleJob, String)] = []
            for t in shownTechs {
                for j in loaded.routes[routeKey(t.id, d)]?.jobs ?? [] where j.assignedUserId == t.id {
                    list.append((j, t.name))
                }
            }
            if tech == "all" { list += (loaded.unassigned[d] ?? []).map { ($0, "No tech yet") } }
            return list
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

    /// Day view's week strip (spec 5.6): Monday to Sunday; a swipe moves a week. A stop dragged
    /// over a day opens that day after a moment (spring loading), and dropped on it goes there.
    struct WeekStrip: View {
        var date: String
        var today: String
        var pick: (String) -> Void
        /// A stop dropped on a day (day, job id): true when it moved.
        var onDrop: ((String, String) -> Bool)?
        @State private var drag: CGFloat = 0
        @State private var targeted: String?

        var body: some View {
            let start = (try? weekStart(date)) ?? date
            GeometryReader { geo in
                HStack(spacing: 4) {
                    ForEach(0..<7, id: \.self) { i in
                        let d = (try? addDays(start, i)) ?? start
                        day(d)
                    }
                }
                .offset(x: drag)
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged {
                            drag = abs($0.translation.width) > abs($0.translation.height) ? $0.translation.width : 0
                        }
                        .onEnded { value in
                            let w = value.translation.width
                            let flick = value.predictedEndTranslation.width - w
                            withAnimation(.easeOut(duration: 0.2)) { drag = 0 }
                            if w < -geo.size.width / 4 || flick < -200 {
                                pick((try? addDays(date, 7)) ?? date)
                            } else if w > geo.size.width / 4 || flick > 200 {
                                pick((try? addDays(date, -7)) ?? date)
                            }
                        })
            }
            .frame(height: 56)
            // Seven days fill the row, so the strip stops growing at the largest standard size;
            // Large Content Viewer shows a day at full size, and each day's label is the full date.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityShowsLargeContentViewer()
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Week")
        }

        @ViewBuilder private func day(_ d: String) -> some View {
            let chosen = d == date
            let over = targeted == d
            let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
            let button = Button {
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
        var onMove: (ScheduleJob, String?) -> Void
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
                                        onMove: { onMove(j, nil) }, onSuggest: { onSuggest(j) }
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
        var onMove: () -> Void
        var onSuggest: () -> Void
        @Environment(\.openRoute) private var openRoute

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
            .scheduleDragSource(job)
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Move") { onMove() }
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
        var onMove: (ScheduleJob, String?) -> Void
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
                            timeZone: board.ctx.timeZone, routing: board.routing, cleanings: board.cleanings[j.id] ?? []
                        ) { onMove(j, routeKey(tech.id, board.date)) }
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
                CardTitle(tech.name)
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    .padding(.top, 8)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    CardTitle(tech.name)
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

    /// A tech's day in numbers, then what to do with it: "5 stops · 1 hr 10 min driving · back by
    /// 3:40 PM", a warning when it runs past the end of the day, and Optimize (owner, 2026-10-20:
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
                        + (route.summary.backMin.map { " · back by \(minutesLabel($0))" } ?? "")
                )
                .textRole(.secondary).foregroundStyle(Color.textMuted)
                .monospacedDigit()
                .contentTransition(.numericText())
                if route.summary.overtimeMin > 0 {
                    Text("Runs \(durationLabel(route.summary.overtimeMin)) past the end of the day.")
                        .textRole(.secondary).fontWeight(.semibold).foregroundStyle(Color.warning)
                }
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
                            Label(
                                board.mapsApp == .google ? "Google Maps" : "Apple Maps",
                                systemImage: "mappin.and.ellipse")
                        }
                        .buttonStyle(.secondary(fullWidth: true))
                        .accessibilityLabel(
                            board.mapsApp == .google ? "Open Route in Google Maps" : "Next Stop in Apple Maps")
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
        var onMove: () -> Void
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            SwipeActionsRow(
                actions: canMoveJob(job.status)
                    ? [
                        SwipeAction(
                            title: "Move", systemImage: "arrow.up.and.down.and.arrow.left.and.right", tint: Color.link,
                            action: onMove)
                    ]
                    : [],
                menu: false
            ) {
                HStack(spacing: 0) {
                    content
                    // The grip at the trailing edge (owner, 2026-10-20: "Schedule dragging should
                    // be on the right side of the card"); the whole card still picks up.
                    if canMoveJob(job.status) { DragGrip() }
                }
                .padding(EdgeInsets(top: 8, leading: 12, bottom: 12, trailing: canMoveJob(job.status) ? 0 : 8))
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
                        .accessibilityActions {
                            // Drag and drop's alternative (owner, 2026-10-20).
                            if canMoveJob(job.status) { Button("Move", action: onMove) }
                        }
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
                            Text("#\(n)").textRole(.footnote).foregroundStyle(Color.textMuted)
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

    struct WeekItem: Identifiable {
        var job: ScheduleJob
        var tech: String
        var cleanings: [ScheduledCleaning] = []
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
                        + Text(" · \(item.tech)").foregroundStyle(Color.textMuted))
                        .textRole(.secondary)
                    ScheduledCleaningsRow(cleanings: item.cleanings)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                StatusChip(status: item.job.status)
                if movable { DragGrip(width: 24) } else { Chevron() }
            }
            .padding(.leading, 16)
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
                                        ForEach(movers) { Text($0.name).tag(Optional($0.id)) }
                                    }
                                    .pickerStyle(.inline)
                                } label: {
                                    MenuValue(text: techLabel)
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
