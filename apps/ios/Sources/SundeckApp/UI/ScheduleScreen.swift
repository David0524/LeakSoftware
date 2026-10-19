#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// Schedule (spec 5.6, 6.3): Day, Week and Month from the phone's synced jobs. Day shows each
    /// tech's route with drive times, Plan Route, the maps link and Move…; managers also see Needs a
    /// Time with Suggest Times. Every change is a write through the sync layer. Port of
    /// apps/web/src/app/(office)/schedule/page.tsx and components/route-board.tsx.
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
        @State private var result: (text: String, error: Bool)?
        @State private var saved = 0

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
                        WeekStrip(date: board.date, today: board.ctx.today) { date = $0 }
                    }
                    if board.techs.count > 1 {
                        FilterPills(
                            selection: Binding(get: { board.tech }, set: { tech = $0 }),
                            options: board.techs.map(\.id) + ["all"],
                            label: { id in id == "all" ? "Everyone" : id == board.ctx.userId ? "Me" : board.name(id) }
                        )
                        .padding(.horizontal, -16)
                        .accessibilityLabel("Whose schedule")
                    }
                    notices(board)
                    if let result {
                        Notice(kind: result.error ? .error : .success, text: result.text)
                    }
                    if board.ctx.isManager && view != .month {
                        NeedsATimeCard(jobs: board.tray, board: board, onMove: move, onSuggest: { suggesting = $0 })
                    }
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
            }
            .refreshable { await sync.syncNow() }
            .navigationTitle("Schedule")
            .toolbar { NewJobToolbar(back: "Schedule") }
            .sensoryFeedback(.success, trigger: saved)
            .task(
                id:
                    "\(sync.revision)|\(session.company?.id ?? "")|\(view)|\(date ?? "")|\(tech ?? "")|\(drive.known.count)"
            ) {
                reload()
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

        private func controls(_ board: Board) -> some View {
            HStack(spacing: 8) {
                CircleButton(systemImage: "chevron.left", label: "Previous \(view.rawValue)") {
                    date = step(board.date, -1)
                }
                CircleButton(systemImage: "calendar", label: "Go to date") { picking = true }
                CircleButton(systemImage: "chevron.right", label: "Next \(view.rawValue)") {
                    date = step(board.date, 1)
                }
                Spacer(minLength: 0)
                Segmented(
                    selection: $view, options: ScheduleView.allCases, label: \.title, title: "View", segmentPadding: 12)
            }
        }

        @ViewBuilder private func notices(_ board: Board) -> some View {
            if board.ctx.depot == nil {
                Notice(
                    kind: .warning,
                    text: "Routes start and end at the shop, which has no map location yet. "
                        + (board.ctx.isManager
                            ? "Set it on the website in Settings › Scheduling."
                            : "An owner can set it in Settings › Scheduling."))
            }
            if board.unlocated {
                Text(
                    "Pools marked “No map location” aren’t counted in drive times. Open the job and use Mark Location Here at the pool"
                        + (board.ctx.isManager ? ", or Find Pool Locations in Settings › Scheduling" : "") + "."
                )
                .textRole(.secondary).foregroundStyle(Color.textMuted)
            }
        }

        @ViewBuilder private func dayView(_ board: Board) -> some View {
            ForEach(board.shownTechs) { t in
                RouteCard(
                    tech: t, board: board, route: board.loaded.routes[routeKey(t.id, board.date)],
                    onPlan: { plan(t.id, board) }, onMove: move)
            }
        }

        @ViewBuilder private func weekView(_ board: Board) -> some View {
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
                        GroupedRows(list.map { WeekItem(job: $0.job, tech: $0.tech) }) { item in
                            Button {
                                openRoute(.job(item.job.id))
                            } label: {
                                WeekRow(item: item, timeZone: board.ctx.timeZone)
                            }
                            .buttonStyle(.row)
                        }
                    }
                }
            }
        }

        // MARK: - Actions

        private func pick(_ day: String) {
            date = day
            view = .day
        }

        private func step(_ d: String, _ n: Int) -> String {
            switch view {
            case .day: addDays(d, n)
            case .week: addDays(d, 7 * n)
            case .month: addMonths(d, n)
            }
        }

        private func move(_ job: ScheduleJob, from: String?) { moving = MoveTarget(job: job, from: from) }

        private func plan(_ techId: String, _ board: Board) {
            apply {
                try planRoute(
                    techId: techId, date: board.date, jobs: board.jobs, ctx: board.ctx, team: board.team, drive: drive)
            }
        }

        /// Saves a planning change through the sync layer and says what happened above the routes.
        private func apply(_ change: () throws -> (updates: [JobUpdate], message: String)) {
            guard let company = session.company else { return }
            do {
                let (updates, message) = try change()
                try saveJobUpdates(sync, companyId: company.id, updates)
                result = (message, false)
                saved += 1
            } catch {
                result = (String(describing: error), true)
            }
        }

        private func reload() {
            guard let company = session.company, let user = session.user else { return }
            board = Board(
                store: sync.store, kv: sync.kv, company: company, userId: user.id, view: view, date: date, tech: tech,
                drive: drive)
        }
    }

    /// Who and where a Move… is for: the job and the route it's on ("techId|date", nil from Needs a Time).
    struct MoveTarget: Identifiable {
        var job: ScheduleJob
        var from: String?
        var id: String { job.id }
    }

    /// Everything the schedule shows for a view and date.
    @MainActor
    struct Board {
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

        init(
            store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, view: ScheduleView, date: String?,
            tech wanted: String?, drive: DriveTimes
        ) {
            ctx = scheduleContext(store, company: company, userId: userId)
            team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
            jobs = scheduleJobs(store, companyId: company.id)
            self.date = date ?? ctx.today
            self.view = view
            days = scheduleDays(view, self.date)
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
        }

        func name(_ id: String) -> String { team.first { $0.id == id }?.name ?? "Teammate" }
        var names: [String: String] { Dictionary(team.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a }) }

        var shownTechs: [TeamMember] { techs.filter { tech == "all" || $0.id == tech } }

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
                    .background(Circle().fill(Color.tinted))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    /// Day view's week strip (spec 5.6): Monday to Sunday; a swipe moves a week.
    struct WeekStrip: View {
        var date: String
        var today: String
        var pick: (String) -> Void
        @State private var drag: CGFloat = 0

        var body: some View {
            let start = weekStart(date)
            GeometryReader { geo in
                HStack(spacing: 4) {
                    ForEach(0..<7, id: \.self) { i in
                        let d = addDays(start, i)
                        let chosen = d == date
                        Button {
                            pick(d)
                        } label: {
                            VStack(spacing: 0) {
                                Text(formatDay(d).prefix(3)).font(.role(.footnote).weight(.medium))
                                Text("\(Int(d.suffix(2)) ?? 0)")
                                    .font(.custom(BrandFonts.Weight.bold.rawValue, size: 20, relativeTo: .title3))
                                    .monospacedDigit()
                            }
                            .foregroundStyle(chosen ? Color.bg : d == today ? Color.link : Color.text)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(
                                    chosen ? Color.text : .clear)
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(formatDay(d, long: true) + (d == today ? ", today" : ""))
                        .accessibilityAddTraits(chosen ? .isSelected : [])
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
                                pick(addDays(date, 7))
                            } else if w > geo.size.width / 4 || flick > 200 {
                                pick(addDays(date, -7))
                            }
                        })
            }
            .frame(height: 56)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Week")
        }
    }

    /// Needs a Time (spec 5.6): jobs waiting for a time, in a sideways row, each with "…".
    struct NeedsATimeCard: View {
        var jobs: [ScheduleJob]
        var board: Board
        var onMove: (ScheduleJob, String?) -> Void
        var onSuggest: (ScheduleJob) -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                CardTitle("Needs a Time" + (jobs.isEmpty ? "" : " (\(jobs.count))"))
                if jobs.isEmpty {
                    Text("Every job has a time.").textRole(.secondary).foregroundStyle(Color.textMuted)
                } else {
                    GeometryReader { geo in
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(jobs) { j in
                                    TrayCard(
                                        job: j, note: note(j), onMove: { onMove(j, nil) }, onSuggest: { onSuggest(j) }
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
        }

        private func note(_ j: ScheduleJob) -> String {
            let booked = j.start.map {
                "No tech yet · booked \(formatDay(localDay($0, timeZone: board.ctx.timeZone))) at \(formatTime(j.scheduledStart, timeZone: board.ctx.timeZone))"
            }
            return [j.address, booked, stopNote(j, routeTech: nil, names: board.names)].compactMap { $0 }
                .filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }

    struct TrayCard: View {
        var job: ScheduleJob
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
                        Text(note).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
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
            }
            .well(padding: 8)
        }
    }

    /// One tech's day (spec 5.6 item 8).
    struct RouteCard: View {
        var tech: TeamMember
        var board: Board
        var route: DayRoute?
        var onPlan: () -> Void
        var onMove: (ScheduleJob, String?) -> Void
        @Environment(\.openURL) private var openURL

        var body: some View {
            let jobs = route?.jobs ?? []
            let open = board.date >= board.ctx.today
            VStack(alignment: .leading, spacing: 4) {
                CardTitle(tech.name)
                if let route, !jobs.isEmpty {
                    Text(
                        "\(jobs.count) \(jobs.count == 1 ? "stop" : "stops") · \(durationLabel(route.summary.driveMin)) driving"
                            + (route.summary.backMin.map { " · back by \(minutesLabel($0))" } ?? "")
                    )
                    .textRole(.secondary).foregroundStyle(Color.textMuted)
                    if route.summary.overtimeMin > 0 {
                        Text("Runs \(durationLabel(route.summary.overtimeMin)) past the end of the day.")
                            .textRole(.secondary).fontWeight(.semibold).foregroundStyle(Color.warning)
                    }
                    HStack(spacing: 8) {
                        if open {
                            Button("Plan Route", action: onPlan).buttonStyle(.secondary(fullWidth: true))
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
                    .padding(.bottom, 4)
                    ForEach(Array(jobs.enumerated()), id: \.element.id) { i, j in
                        LegLine(
                            minutes: route.summary.legs[routeIndex: i] ?? 0, label: "drive",
                            short: route.summary.short[routeIndex: i] ?? 0)
                        StopWell(
                            job: j, note: stopNote(j, routeTech: tech.id, names: board.names),
                            timeZone: board.ctx.timeZone
                        ) { onMove(j, routeKey(tech.id, board.date)) }
                    }
                    LegLine(minutes: route.summary.backLegMin, label: "back to the shop", short: 0)
                } else {
                    Text("Nothing scheduled.")
                        .textRole(.body).foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.well))
                        .padding(.top, 8)
                }
            }
            .card(padding: 16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(tech.name)
        }
    }

    /// A stop on a route card: "**8:00 AM** · #1343" with Move…, the customer, the address, the note
    /// and its status, lock and map labels.
    struct StopWell: View {
        var job: ScheduleJob
        var note: String?
        var timeZone: String
        var onMove: () -> Void
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .top, spacing: 8) {
                    Button {
                        openRoute(.job(job.id))
                    } label: {
                        VStack(alignment: .leading, spacing: 0) {
                            (Text(
                                job.scheduledStart == nil
                                    ? "No time" : formatTime(job.scheduledStart, timeZone: timeZone)
                            )
                            .fontWeight(.semibold).foregroundStyle(Color.text)
                                + Text(job.number.map { " · #\($0)" } ?? "").foregroundStyle(Color.textMuted))
                                .textRole(.body).monospacedDigit()
                            Text(job.customerName).textRole(.body).foregroundStyle(Color.text).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if canMoveJob(job.status) {
                        Button("Move…", action: onMove).buttonStyle(.quiet(size: .small))
                    }
                }
                AddressButton(place: job.place)
                if let note { Text(note).textRole(.secondary).foregroundStyle(Color.textMuted) }
                let lock = job.lock.flatMap { $0 == .started ? nil : $0 }
                if job.status != .scheduled || lock != nil || job.location == nil {
                    HStack(spacing: 8) {
                        if job.status != .scheduled { StatusChip(status: job.status) }
                        if let lock { LockLabel(lock.label) }
                        if job.location == nil {
                            Text("No map location").textRole(.footnote).foregroundStyle(Color.warning)
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .well(padding: 8)
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Move") { if canMoveJob(job.status) { onMove() } }
        }
    }

    struct WeekItem: Identifiable {
        var job: ScheduleJob
        var tech: String
        var id: String { job.id }
    }

    /// A week row: "**8:00 AM · #1343**" over "Customer · Tech", the status chip, a chevron.
    struct WeekRow: View {
        var item: WeekItem
        var timeZone: String

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(formatTime(item.job.scheduledStart, timeZone: timeZone)) · \(item.job.numberText)")
                        .textRole(.bodyEmphasis).foregroundStyle(Color.text).monospacedDigit()
                    (Text(item.job.customerName).foregroundStyle(Color.text)
                        + Text(" · \(item.tech)").foregroundStyle(Color.textMuted))
                        .textRole(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                StatusChip(status: item.job.status)
                Chevron()
            }
            .padding(.horizontal, 16)
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
                            ].compactMap { $0 }.joined(separator: ", "))
                    }
                }
            }
            .card(padding: 8)
        }
    }

    // MARK: - Sheets

    /// Move {Customer} (spec 6.3): tech, day, and place in the route; Move or Take Off Schedule.
    struct MoveSheet: View {
        var target: MoveTarget
        var board: Board
        var onMove: (_ tech: String?, _ date: String?, _ index: Int) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var tech: String?
        @State private var day = Date()
        @State private var place = 0
        @State private var ready = false

        private var zone: TimeZone { TimeZone(identifier: board.ctx.timeZone) ?? .current }
        private var dayString: String { localDay(day, timeZone: board.ctx.timeZone) }
        private var movers: [TeamMember] {
            board.ctx.seesAll ? board.team.filter(\.active) : board.team.filter { $0.id == board.ctx.userId }
        }
        /// The other stops on the chosen tech's day.
        private var others: [ScheduleJob] {
            guard let tech else { return [] }
            return loadRoutes(board.jobs, ctx: board.ctx, dates: [dayString], team: board.team, drive: DriveTimes())
                .routes[routeKey(tech, dayString)]?.jobs.filter { $0.id != target.job.id } ?? []
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(spacing: 24) {
                        Text(target.job.address).textRole(.secondary).foregroundStyle(Color.textMuted)
                            .multilineTextAlignment(.center)
                        Grouped {
                            ListRow("Tech") {
                                Picker("Tech", selection: $tech) {
                                    if movers.count > 1 { Text("Nobody yet (waits in Needs a Time)").tag(String?.none) }
                                    ForEach(movers) { Text($0.name).tag(Optional($0.id)) }
                                }
                                .labelsHidden()
                                .tint(Color.link)
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
                                    Picker("Place in the route", selection: $place) {
                                        Text("First stop").tag(0)
                                        ForEach(Array(others.enumerated()), id: \.element.id) { i, s in
                                            Text(
                                                "After \(s.customerName)"
                                                    + (s.scheduledStart.map {
                                                        " (\(formatTime($0, timeZone: board.ctx.timeZone)))"
                                                    } ?? "")
                                            )
                                            .tag(i + 1)
                                        }
                                    }
                                    .labelsHidden()
                                    .tint(Color.link)
                                }
                            }
                        }
                        VStack(spacing: 8) {
                            Button("Move") { onMove(tech, dayString, tech != nil ? min(place, others.count) : 9_999) }
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
                .navigationTitle("Move \(target.job.customerName)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .onAppear {
                guard !ready else { return }
                ready = true
                let parts = target.from?.split(separator: "|").map(String.init)
                let fromTech = parts?.first.flatMap { $0 == "none" ? nil : $0 }
                tech = movers.count == 1 ? movers[0].id : fromTech
                let fromDate = parts.flatMap { $0.count > 1 ? $0[1] : nil }
                let start = fromDate.flatMap { $0 >= board.ctx.today ? $0 : nil } ?? board.ctx.today
                day = zonedInstant(start, 12 * 60, timeZone: board.ctx.timeZone) ?? Date()
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
            }
        }
    }

    /// Suggested Times (spec 6.3): where the job fits best in the planned routes, each with Use.
    struct SuggestedTimesSheet: View {
        var job: ScheduleJob
        var board: Board
        var drive: DriveTimes
        var onUse: (Suggestion) -> Void
        @Environment(\.dismiss) private var dismiss

        var body: some View {
            let found = Result {
                try suggestTimes(
                    location: job.location, durationMin: job.minutes(board.ctx.settings), excluding: job.id,
                    jobs: board.jobs,
                    ctx: board.ctx, team: board.team, drive: drive)
            }
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        switch found {
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
        }
    }

    /// Suggestions as a grouped list: "Tue, Oct 20 · 9:00 AM · Tony Tech" over the driving it adds,
    /// with Use.
    struct SuggestionList: View {
        var suggestions: [Suggestion]
        var onUse: (Suggestion) -> Void

        var body: some View {
            Grouped {
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
#endif
