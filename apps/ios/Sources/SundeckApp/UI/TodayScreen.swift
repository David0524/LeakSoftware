#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI
    import UIKit

    /// Today (spec 5.1): the signed-in tech's stops for today in route order, with the driving
    /// between them, directions, a call button and On My Way. Computed on the phone from synced
    /// jobs; drive times are the shop's cached live times when online, else estimates. Port of
    /// apps/web/src/app/(office)/today/page.tsx.
    struct TodayScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openTab) private var openTab
        @Environment(\.openURL) private var openURL
        @State private var techId: String?
        @State private var day: TodayDay?
        @State private var weather: Weather?
        @State private var drive = DriveTimes()
        /// The stop the tech swiped or tapped to on the card (nil: the one the day is on). Back to
        /// now when the app opens again, the day changes, or a stop is started or completed.
        @State private var viewing: String?
        /// The stop just completed: drawn done with its check for a moment, then the card slides
        /// on (owner, 2026-10-20: no minute's hold; gestures spec section 9).
        @State private var flash: String?
        /// "Derek Jeter done", with Undo (the stop's Reopen Visit or Mark Not Complete).
        @State private var banner: ResultBanner?
        @State private var undoJob: String?
        /// Whether the "N done" row is open.
        @State private var showDone = false
        /// Reorder: the list in edit mode, as iOS Reminders (owner, 2026-10-20).
        @State private var reordering = false
        /// Do Later just done: "Moved." and Undo where the button was, for 5 seconds.
        @State private var moved: StopMoveUndo?
        /// The last move's message, or why it wasn't made.
        @State private var moveNote: (text: String, error: Bool)?
        @Environment(\.scenePhase) private var scenePhase
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            Group {
                if reordering, let day, let route = day.route, !route.jobs.isEmpty {
                    reorderList(day, route)
                } else {
                    page
                }
            }
            // The sync bar stays in view under the navigation bar (owner, 2026-10-20).
            .pinnedSyncBar()
            .refreshable { await sync.syncNow() }
            .undoWindow($moved)
            .onChange(of: techId) { _, _ in
                reordering = false
                moved = nil
                moveNote = nil
            }
            .onChange(of: reordering) { _, _ in moveNote = nil }
            .onChange(of: app.stopRequest, initial: true) { _, request in
                // A Live Activity button: show my day, where the stop's card does it (a done stop's
                // card is in the "N done" row, which opens).
                if request != nil {
                    techId = nil
                    reordering = false
                }
                if let request, let day,
                    day.route?.jobs.first(where: { $0.id == request.jobId })?.doneOn(day.ctx.today) == true
                {
                    showDone = true
                }
            }
            .rootTitle(title)
            .toolbar { NewJobToolbar(back: "Today") }
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")|\(techId ?? "")|\(drive.known.count)") {
                await reload()
            }
            .task(id: flash) {
                guard flash != nil else { return }
                try? await Task.sleep(for: .seconds(0.6))
                flash = nil
            }
            .resultBanner($banner, onUndo: { undoCompleted() })
            .onChange(of: scenePhase) { _, phase in
                // Back to the stop the day is on when the app opens again.
                if phase == .active { viewing = nil }
            }
            .task(id: session.company?.id) {
                guard let company = session.company, let user = session.user else { return }
                // Read off the main thread: every job's row, for the drive times' points.
                let store = sync.store
                let (zip, keys) = await Task.detached(priority: .utility) {
                    let ctx = scheduleContext(store, company: company, userId: user.id)
                    return (
                        ctx.shopZip, routePoints(scheduleJobs(store, companyId: company.id), starts: ctx.startPoints)
                    )
                }.value
                async let w = app.api.weather(zip: zip)
                drive = await cachedDriveTimes(app, companyId: company.id, keys: keys)
                weather = await w
            }
        }

        /// Today as it usually is: the header, whose day, the card and the stops, and the tip.
        private var page: some View {
            ScreenScroll {
                RootLargeTitle(stackSpacing: 24)
                // Only this flag, not the whole sync status: Today doesn't redraw on every sync.
                let firstSync = sync.firstSyncRunning
                if session.company != nil && (day == nil || (firstSync && day?.route == nil)) {
                    // The first read, or the first sync still bringing the day down: the shapes
                    // of the day, not "Nothing on your route today" (loading.md).
                    TodaySkeleton()
                } else if let company = session.company, let day {
                    header(day)
                    // Getting Started is off on the phone for now: inside the tab view it stops Today
                    // drawing in the simulator screenshots, cause not found yet (docs/plans/swift-app.md).
                    if day.ctx.isManager && GettingStartedCard.enabled { GettingStartedCard(company: company) }
                    if day.ctx.isManager && day.techs.count > 1 {
                        FilterPills(
                            selection: Binding(get: { day.techId }, set: { pickTech($0) }),
                            options: day.techs.map(\.id), label: { id in id == day.ctx.userId ? "Me" : day.name(id) },
                            dot: { id in day.techs.first { $0.id == id }?.color }
                        )
                        .padding(.horizontal, -16)
                        .keepsHorizontalDrags()
                        .accessibilityLabel("Whose day")
                    }
                    route(day)
                        // Owners and admins: swipe sideways for the teammate before or after, in
                        // the Whose Day order, stopping at either end (gestures spec section 4).
                        .contentShape(Rectangle())
                        .pageSwipe(
                            enabled: day.ctx.isManager && day.techs.count > 1,
                            previous: neighbor(day, -1).map { id in { pickTech(id) } },
                            next: neighbor(day, 1).map { id in { pickTech(id) } })
                    // The tip comes after the stops, so the first stop's buttons are on screen at
                    // launch (owner, 2026-10-20).
                    if let tip = tipFor(
                        platform: .web, screen: "today", role: company.role, services: company.services,
                        seen: app.walkthrough.seen)
                    {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                    }
                }
            }
            .rootTitleScroll()
        }

        /// Whose day: a teammate's, a cross-fade of the list, and the card back to their now.
        private func pickTech(_ id: String) {
            viewing = nil
            techId = id
        }

        /// The teammate before (-1) or after (1) in the Whose Day order; nil at either end.
        private func neighbor(_ day: TodayDay, _ step: Int) -> String? {
            guard let at = day.techs.firstIndex(where: { $0.id == day.techId }) else { return nil }
            let i = at + step
            return day.techs.indices.contains(i) ? day.techs[i].id : nil
        }

        /// Undo on the "done" banner: the stop's Reopen Visit or Mark Not Complete.
        private func undoCompleted() {
            guard let id = undoJob, let company = session.company, let day else { return }
            undoJob = nil
            _ = try? StopWrites.mark(
                sync, companyId: company.id, settings: company.settings, jobId: id, complete: false,
                day: day.ctx.today, visitReports: app.visitReports)
        }

        private var title: String {
            guard let day, day.techId != day.ctx.userId else { return "Today" }
            return "Today · \(day.name(day.techId))"
        }

        private func header(_ day: TodayDay) -> some View {
            PageHeader {
                FlowRow(spacing: 12) {
                    Text(formatDay(day.ctx.today, long: true)).foregroundStyle(Color.textMuted)
                    if let weather { WeatherBadge(weather: weather) }
                }
            }
            // No "Next Stop in Maps" here: the card's Directions does it (owner, 2026-10-20).
        }

        /// The summary, the card for the stop you're on (owner, 2026-10-20), then the stops: the
        /// done ones folded into one "N done" row, the card's stop one row marked Now.
        @ViewBuilder private func route(_ day: TodayDay) -> some View {
            if let route = day.route, !route.jobs.isEmpty {
                let stops = Array(route.jobs.enumerated())
                let done = stops.filter { $0.element.doneOn(day.ctx.today) }
                let left = stops.filter { !$0.element.doneOn(day.ctx.today) }
                let now = day.next?.id
                // Rows are built as they scroll on (gestures spec section 6: long lists virtualized).
                LazyVStack(alignment: .leading, spacing: 4) {
                    summaryLine(day).padding(.bottom, 12)
                    TodayHeroPager(day: day, viewing: $viewing, flash: flash, moves: stopMoves).padding(.bottom, 20)
                    if !done.isEmpty {
                        TodayDoneRow(count: done.count, open: $showDone)
                        if showDone {
                            ForEach(done, id: \.element.id) { i, job in
                                TodayStopCard(
                                    number: i + 1, job: job, day: day, leg: route.summary.legs[routeIndex: i] ?? 0,
                                    isNext: false, moves: stopMoves, undoShown: moved?.jobId == job.id ? moved : nil
                                )
                                .equatable()
                            }
                        }
                    }
                    ForEach(left, id: \.element.id) { i, job in
                        LegLine(
                            minutes: route.summary.legs[routeIndex: i] ?? 0,
                            label: i == 0 ? startLegLabel(day.startLabel) : "drive",
                            short: route.summary.short[routeIndex: i] ?? 0, inset: 16)
                        TodayStopCard(
                            number: i + 1, job: job, day: day, leg: route.summary.legs[routeIndex: i] ?? 0,
                            isNext: job.id == now, moves: stopMoves, undoShown: moved?.jobId == job.id ? moved : nil
                        )
                        .equatable()
                    }
                    LegLine(minutes: route.summary.backLegMin, label: backLegLabel(day.startLabel), short: 0, inset: 16)
                }
            } else {
                EmptyState(
                    text: "Nothing on \(day.techId == day.ctx.userId ? "your" : "this") route today.",
                    link: "Open the schedule."
                ) { openTab(.schedule) }
            }
        }

        /// "6 stops · 1 hr 15 min driving · Reorder" (Done while reordering), and
        /// the last move's message under it.
        private func summaryLine(_ day: TodayDay) -> some View {
            let button = reordering || day.reorderable
            return VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(day.summaryText + (button ? " ·" : ""))
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .fixedSize(horizontal: false, vertical: true)
                    if button {
                        Button(reordering ? TodayReorderText.done : TodayReorderText.reorder) {
                            withAnimation(Motion.smooth) { reordering.toggle() }
                        }
                        .textRole(.bodyEmphasis)
                        .foregroundStyle(Color.link)
                        .buttonStyle(.plain)
                        .frame(minHeight: minTarget)
                        .contentShape(Rectangle())
                        .accessibilityHint(
                            reordering ? "Ends reordering" : "Shows Move Up and Move Down on each stop")
                    }
                    Spacer(minLength: 0)
                }
                if let moveNote {
                    Text(moveNote.text)
                        .textRole(.secondary)
                        .foregroundStyle(moveNote.error ? Color.fail : Color.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }

        /// Reorder (owner, 2026-10-20): the day's stops still to do in a list in edit mode, as iOS
        /// Reminders. Each stop that can move has a drag handle and Move Up and Move Down (the
        /// visible alternative to dragging); one that can't shows a lock and why. Each move saves at
        /// once, and the times and drives update as you go. Done ends it.
        private func reorderList(_ day: TodayDay, _ route: DayRoute) -> some View {
            let stops = Array(route.jobs.enumerated()).filter { !$0.element.doneOn(day.ctx.today) }
            return List {
                Section {
                    summaryLine(day).plainListRow()
                }
                Section {
                    ForEach(stops, id: \.element.id) { i, job in
                        let lock = day.lock(job)
                        TodayReorderRow(
                            number: i + 1, job: job, timeZone: day.ctx.timeZone,
                            leg: route.summary.legs[routeIndex: i] ?? 0, first: i == 0, start: day.startLabel,
                            lock: lock,
                            canUp: day.canPlace(job, .up), canDown: day.canPlace(job, .down)
                        ) { place in
                            moveStop(job, place, from: .reorder)
                        }
                        .moveDisabled(lock != nil)
                    }
                    .onMove { from, to in
                        guard let first = from.first, to != first, to != first + 1 else { return }
                        // `to` counts the stop itself; places count the others.
                        moveStop(stops[first].element, .place(to > first ? to - 1 : to), from: .reorder)
                    }
                } footer: {
                    Text(verbatim: "\(durationLabel(route.summary.backLegMin)) \(backLegLabel(day.startLabel))")
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .environment(\.editMode, .constant(.active))
        }

        /// Do Later and Undo for the card and the stops.
        private var stopMoves: StopMoves {
            StopMoves(
                pending: moved, doLater: { job, source in moveStop(job, .later, from: source) },
                undoMove: { undoMove($0) })
        }

        /// Moves a stop with the Schedule's move, saved through the sync layer (offline too).
        private func moveStop(_ job: ScheduleJob, _ place: StopPlace, from source: StopMoveUndo.Source) {
            guard let company = session.company, let day else { return }
            do {
                guard
                    let undo = try moveTodayStop(
                        sync, companyId: company.id, ctx: day.ctx, team: day.team, techId: day.techId, jobId: job.id,
                        to: place, source: source, drive: drive)
                else { return }
                if source == .reorder {
                    moveNote = (undo.text, false)
                    AccessibilityNotification.Announcement(undo.text).post()
                } else {
                    moveNote = nil
                    withAnimation(Motion.smooth) { moved = undo }
                }
            } catch {
                moveNote = (String(describing: error), true)
                AccessibilityNotification.Announcement(String(describing: error)).post()
            }
        }

        /// Undo: the rows the move changed back to their saved values.
        private func undoMove(_ undo: StopMoveUndo) {
            guard let company = session.company else { return }
            do {
                try undo.undo(sync, companyId: company.id)
                withAnimation(Motion.smooth) { moved = nil }
            } catch {
                moveNote = (String(describing: error), true)
            }
        }

        /// Today's day, read from the phone's database off the main thread; the last one stays on
        /// screen until it's ready. A stop marked done slides away; a new person's day cross-fades.
        private func reload() async {
            guard let company = session.company, let user = session.user else { return }
            let before = day
            let (store, kv, wanted, drive) = (sync.store, sync.kv, techId, drive)
            let next = await Task.detached(priority: .userInitiated) {
                TodayDay(store: store, kv: kv, company: company, userId: user.id, wanted: wanted, drive: drive)
            }.value
            guard !Task.isCancelled else { return }
            // The stop the day was on, now done (here, on the job page, on the Lock Screen, or on
            // another phone): the card moves straight on, with its check for a moment, and the
            // banner offers Undo (owner, 2026-10-20: gestures spec section 9).
            let completed = before.flatMap { b -> ScheduleJob? in
                guard b.techId == next.techId, b.ctx.today == next.ctx.today, let id = b.hero()?.currentId,
                    b.route?.jobs.first(where: { $0.id == id })?.doneOn(b.ctx.today) == false
                else { return nil }
                return next.route?.jobs.first { $0.id == id && $0.doneOn(next.ctx.today) }
            }
            // Back to now when the day changes, or a stop is started or completed.
            let reset =
                before.map { b in
                    b.techId != next.techId || b.ctx.today != next.ctx.today
                        || b.heroStops.map { "\($0.id)|\($0.status)|\($0.stopDoneOn ?? "")" }
                            != next.heroStops.map { "\($0.id)|\($0.status)|\($0.stopDoneOn ?? "")" }
                } ?? false
            withAnimation(before == nil ? nil : Motion.snappy) {
                day = next
                if reset { viewing = nil }
                if let completed, !reduceMotion { flash = completed.id }
            }
            if let completed {
                undoJob = next.mine && todayUndo(completed, day: next.ctx.today) != nil ? completed.id : nil
                banner = ResultBanner(
                    kind: .success, title: "\(completed.customerName) done", undoable: undoJob != nil)
            }
            // Pools on today's stops never looked up on the map: ask for them in the background.
            MissingPins.find(
                next.route?.jobs ?? [], companyId: company.id, queue: app.locate, api: app.api, sync: sync)
            // A Live Activity button for a stop not on my route today: its job page instead.
            if let request = app.stopRequest, let day, day.mine,
                !(day.route?.jobs.contains { $0.id == request.jobId } ?? false)
            {
                app.stopRequest = nil
                openRoute(.job(request.jobId))
            }
        }
    }

    /// What Today shows for one person's day, worked out once when the data changes (off the
    /// main thread), never in a view's body.
    struct TodayDay: Sendable, Equatable {
        /// Each read of the day is a new value; views compare this, not every field, so a row
        /// redraws only when the day was read again (gestures spec section 6).
        let token = UUID()
        var ctx: ScheduleContext
        var techs: [TeamMember]
        /// The whole shop, for moves.
        var team: [TeamMember]
        var techId: String
        var route: DayRoute?
        var mapsApp: MapsApp
        var lineActive: Bool
        /// The cleanings due soon at each stop, by job (owner, 2026-10-19).
        var cleanings: [String: [VisitCleaning]] = [:]
        /// The server looks addresses up, so "Not on map" can show (`MapLookups`).
        var routing = false
        /// The stops as Today's card reads them (core `todayHero`, owner 2026-10-20).
        var heroStops: [HeroStop] = []
        /// The card for the stop the day is on, worked out once (`hero(viewing:)`).
        private var restingHero: TodayHero?

        init(
            store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, wanted: String?, drive: DriveTimes
        ) {
            ctx = scheduleContext(store, company: company, userId: userId)
            let team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
            self.team = team
            let jobs = scheduleJobs(store, companyId: company.id)
            let loaded = loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: drive)
            let today = ctx.today
            // Whose day, in the Schedule's order (core scheduleOrder: the shop's saved order, else
            // Me first, then A to Z).
            techs = scheduleTeam(
                team.filter { $0.active || loaded.routes[routeKey($0.id, today)] != nil }, me: userId)
            let pick = wanted ?? userId
            techId = ctx.isManager && techs.contains { $0.id == pick } ? pick : userId
            route = loaded.routes[routeKey(techId, ctx.today)]
            cleanings = dayCleanings(store, companyId: company.id, stops: route?.jobs ?? [], today: ctx.today)
            mapsApp = MapsApp(kv)
            lineActive = companyLine(store, companyId: company.id)?.status == "active"
            routing = MapLookups.on(kv, company: try? store.get("company", company.id))
            heroStops = dayHeroStops(store, companyId: company.id, stops: route?.jobs ?? [], cleanings: cleanings)
            restingHero = try? todayHero(stops: heroStops, today: ctx.today, timeZone: ctx.timeZone)
        }

        static func == (a: TodayDay, b: TodayDay) -> Bool { a.token == b.token }

        func name(_ id: String) -> String { techs.first { $0.id == id }?.name ?? "Teammate" }

        var mine: Bool { techId == ctx.userId }

        /// The card at the top (owner, 2026-10-20; docs/plans/today-hero.md): the Live Activity's
        /// rule, so the Lock Screen and the card pick the same stop. `viewing` is a stop the tech
        /// swiped or tapped to (only the card changes; the Now row and the Live Activity follow
        /// the stop the day is on).
        func hero(viewing: String? = nil) -> TodayHero? {
            guard let viewing, viewing != restingHero?.stopId else { return restingHero }
            return try? todayHero(stops: heroStops, today: ctx.today, timeZone: ctx.timeZone, viewing: viewing)
        }

        /// The stop you're on: the card's (Mark Complete moves it on).
        var next: ScheduleJob? {
            guard let id = hero()?.stopId else { return nil }
            return route?.jobs.first { $0.id == id }
        }

        /// Where this day starts and ends: home for someone who starts there, else the shop.
        var startLabel: RouteStartLabel { ctx.start(for: techId).label }

        /// The drive to a stop, from the day's start or the stop before it.
        func leg(_ job: ScheduleJob) -> Int {
            guard let route, let i = route.jobs.firstIndex(where: { $0.id == job.id }) else { return 0 }
            return route.summary.legs[routeIndex: i] ?? 0
        }

        var directions: URL? {
            guard let route, !route.jobs.isEmpty else { return nil }
            return dayDirections(
                app: mapsApp, origin: ctx.origin(for: techId),
                stops: route.jobs.map { (place: $0.place, done: $0.doneOn(ctx.today)) })
        }

        /// Why a stop keeps its place (started, locked, done), or nil when it can move.
        func lock(_ job: ScheduleJob) -> StopLock? {
            todayStopLock(job, routeTech: techId, today: ctx.today, timeZone: ctx.timeZone)
        }

        /// Whether the stop can go there: techs on their own day, owners and admins on any.
        func canPlace(_ job: ScheduleJob, _ place: StopPlace) -> Bool {
            guard canReorderDay(ctx, techId: techId), let route else { return false }
            return reorderIndex(
                route.jobs, jobId: job.id, to: place, routeTech: techId, today: ctx.today, timeZone: ctx.timeZone)
                != nil
        }

        /// Whether any stop can change places (Reorder shows).
        var reorderable: Bool {
            (route?.jobs ?? []).contains { canPlace($0, .later) || canPlace($0, .up) }
        }

        /// "3 stops · 1 hr 20 min driving" (no clock times, owner 2026-10-21)
        var summaryText: String {
            guard let route else { return "" }
            let n = route.jobs.count
            // Someone who starts from home: their day's driving is counted from there.
            return [
                "\(n) \(n == 1 ? "stop" : "stops")", "\(durationLabel(route.summary.driveMin)) driving",
                startLabel == .home ? startLegLabel(.home) : nil,
            ].compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// A stop on Today (spec 5.1; owner, 2026-10-19: "keep these cards on Today collapsed except
    /// for the job you are on"): one row (the number, or a green check when done; the time, the
    /// customer, the state, a chevron) that opens to the address, cleanings, access notes, Mark
    /// Complete, and call and On My Way; the customer's name links to the job. The stop you're on
    /// is ringed and marked Now, and starts closed, since the card above shows it (2026-10-20). A
    /// Live Activity button opens its stop here and does it.
    /// Website components/today-stop.tsx.
    struct TodayStopCard: View, Equatable {
        var number: Int
        var job: ScheduleJob
        var day: TodayDay
        var leg: Int
        var isNext: Bool
        /// Do Later and its Undo (docs/plans/today-reorder.md).
        var moves: StopMoves
        /// Do Later just done on this stop: "Moved." and Undo, for 5 seconds (compared, so the row
        /// redraws when it shows and goes).
        var undoShown: StopMoveUndo?

        /// A row redraws only when its own stop, its place, the day it was read from, or its
        /// Undo changes.
        nonisolated static func == (a: TodayStopCard, b: TodayStopCard) -> Bool {
            a.number == b.number && a.job == b.job && a.leg == b.leg && a.isNext == b.isNext && a.day == b.day
                && a.undoShown == b.undoShown
        }
        @State private var open: Bool?
        /// Message's text from the phone, addressed to the customer (`StopText`).
        @State private var phoneText: ComposeText?
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @Environment(SyncService.self) private var sync
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            let done = job.doneOn(day.ctx.today)
            let expanded = open ?? false
            SwipeActionsRow(actions: trailingActions(done: done), leading: leadingActions(done: done), menu: false) {
                rowContent(done: done, expanded: expanded)
            }
            .clipShape(shape)
            .card(padding: 0)
            .overlay { if isNext { shape.strokeBorder(Color.link, lineWidth: 2) } }
            .background {
                // The Live Activity's On My Way for this stop (nothing on screen; owner, 2026-10-20).
                if day.mine && !done { OnMyWayTrigger(job: job, day: day, leg: leg) }
            }
            // Touch and hold: Call, Message, Directions, Open (gestures spec section 5).
            .contextMenu { menu(done: done) }
            .composeTextSheet($phoneText)
            .onChange(of: app.stopRequest, initial: true) { _, request in
                guard let request, request.jobId == job.id else { return }
                open = true
                // Its button does it; when it isn't there (done, or not my day), it's done with.
                let done = job.doneOn(day.ctx.today)
                let handled =
                    request.action == .onMyWay
                    ? !done && day.mine : !done && markStopTitle(job, day: day.ctx.today) != nil
                if !handled { app.stopRequest = nil }
            }
            .zoomSource(job.id)
            // Cards ease in as they scroll onto the screen.
            .scrollTransition(.animated(.smooth)) { card, phase in
                card.opacity(phase.isIdentity ? 1 : 0.6).scaleEffect(phase.isIdentity ? 1 : 0.96)
            }
        }

        /// Swipe right: Complete, on my own day's stops not done (it opens the row and presses its
        /// Mark Complete, with the same checks). The row's Mark Complete stays the visible way.
        private func leadingActions(done: Bool) -> [SwipeAction] {
            guard day.mine, !done, markStopTitle(job, day: day.ctx.today) != nil else { return [] }
            return [
                SwipeAction(title: "Complete", systemImage: "checkmark", tint: Color.pass) {
                    app.stopRequest = StopRequest(jobId: job.id, action: .markComplete)
                }
            ]
        }

        /// Whether Do Later can move this stop (it isn't done, and isn't last already).
        private func canDoLater(done: Bool) -> Bool { !done && day.canPlace(job, .later) }

        /// Swipe left: Call and Directions, then Do Later when the stop can move (the row's call
        /// button, address and Do Later button stay visible).
        private func trailingActions(done: Bool) -> [SwipeAction] {
            var list: [SwipeAction] = []
            if let phone = job.customerPhone {
                list.append(SwipeAction(title: "Call", systemImage: "phone.fill", tint: Color.pass) { call(phone) })
            }
            if !job.address.isEmpty {
                list.append(
                    SwipeAction(title: "Directions", systemImage: "location.fill", tint: Color.link) { directions() })
            }
            if canDoLater(done: done) {
                list.append(
                    SwipeAction(
                        title: TodayReorderText.doLater, systemImage: "clock.arrow.circlepath", tint: Color.water
                    ) {
                        moves.doLater(job, .row)
                    })
            }
            return list
        }

        @ViewBuilder private func menu(done: Bool) -> some View {
            if let phone = job.customerPhone {
                Button("Call", systemImage: "phone") { call(phone) }
                Button("Message", systemImage: "message") { message(phone) }
            }
            if !job.address.isEmpty {
                Button("Directions", systemImage: "location") { directions() }
            }
            if canDoLater(done: done) {
                Button(TodayReorderText.doLater, systemImage: "clock.arrow.circlepath") { moves.doLater(job, .row) }
            }
            Button("Open Job", systemImage: "arrow.up.right") { openRoute(.job(job.id)) }
        }

        /// A blank text to this stop's customer, as the card's Message (`StopTextRoute`): their
        /// conversation or New Message to them from the company number, else from the phone.
        private func message(_ phone: String) {
            guard let company = session.company else { return }
            guard
                let route = StopTextRoute.decide(
                    lineActive: day.lineActive, customerId: job.customerId, phone: phone,
                    conversations: day.lineActive ? conversations(sync.store, companyId: company.id) : [])
            else { return }
            StopText.open(route, openRoute: openRoute, openURL: openURL) { phoneText = $0 }
        }

        private func call(_ phone: String) {
            if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") { openURL(url) }
        }

        private func directions() {
            if let url = directionsURL(job.place, app: MapsApp(sync.kv)) { openURL(url) }
        }

        private func rowContent(done: Bool, expanded: Bool) -> some View {
            VStack(alignment: .leading, spacing: 0) {
                // The row (number, time, chevron) opens and closes the card; the customer's name is
                // the link to the job, open or closed (owner, 2026-10-20; no Open Job button).
                summary(done: done, expanded: expanded)
                    .onTapGesture { toggle(expanded) }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(stopLabel(done: done))
                    .accessibilityValue(expanded ? "Expanded" : "Collapsed")
                    .accessibilityHint(expanded ? "Folds the stop" : "Shows the address and buttons")
                    .accessibilityAction { toggle(expanded) }
                    .accessibilityAction(named: "Open Job") { openRoute(.job(job.id)) }
                // The pool's access notes (gate code, which gate, dogs) under the header, open or
                // closed (owner, 2026-10-20): one line closed, all of it open; gone once done.
                if !done, let notes = job.accessNotes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "key.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(Color.warning)
                            .accessibilityHidden(true)
                        Text(notes)
                            .lineLimit(expanded ? nil : 1)
                            .fontWeight(.medium)
                            .foregroundStyle(Color.text)
                    }
                    .textRole(.secondary)
                    .padding(.leading, 52)
                    .padding(.trailing, 12)
                    .padding(.bottom, expanded ? 4 : 10)
                    .padding(.top, -4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(CleaningText.accessSpoken(notes))
                }
                if expanded {
                    VStack(alignment: .leading, spacing: 4) {
                        AddressButton(place: job.place, notOnMap: day.routing && job.mapMissing)
                        if !done, let cleanings = day.cleanings[job.id] {
                            FlowRow(spacing: 16) { ForEach(cleanings) { CleaningDueLabel(cleaning: $0) } }
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel("Cleanings due")
                        }
                        buttons(done: done)
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                    .transition(.opacity)
                }
                // Do Later just done here: "Moved." and Undo, open or closed.
                if let undo = undoShown {
                    UndoRow(text: undo.text) { moves.undoMove(undo) }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                        .transition(.opacity)
                }
            }
        }

        private func toggle(_ expanded: Bool) {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { open = !expanded }
        }

        private func stopLabel(done: Bool) -> String {
            ["Stop \(number): \(job.customerName)", done ? "done" : nil, isNext ? "now" : nil].compactMap { $0 }
                .joined(separator: ", ")
        }

        private func summary(done: Bool, expanded: Bool) -> some View {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(done ? Color.pass : isNext ? Color.link : Color.bg)
                    if done {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Color.onStatus)
                    } else {
                        Text("\(number)")
                            .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                            .foregroundStyle(isNext ? Color.bg : Color.text)
                    }
                }
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)
                HStack(spacing: 8) {
                    Text(formatTime(job.scheduledStart, timeZone: day.ctx.timeZone))
                        .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                        .monospacedDigit()
                        .foregroundStyle(Color.text)
                    Button {
                        openRoute(.job(job.id))
                    } label: {
                        Text(job.customerName + " ›")
                            .textRole(.bodyEmphasis)
                            .foregroundStyle(Color.link)
                            .lineLimit(1)
                            .frame(minHeight: minTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if isNext { NowPill() }
                    // Most stops are scheduled; the chip shows other states. The Now row shows only
                    // "Now": the card above says the rest (docs/design/2026-10-20-today-card.md).
                    if !isNext && job.status != .scheduled { StatusChip(status: job.status) }
                    if !isNext, let tag = lockTag(job) { LockTagLabel(tag: tag) }
                }
                .opacity(done ? 0.7 : 1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.textMuted)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }

        /// Mark Complete (primary), or Reopen Visit or Mark Not Complete, then call and On My Way.
        private func buttons(done: Bool) -> some View {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 8) {
                    FlowRow(spacing: 8) {
                        if markStopTitle(job, day: day.ctx.today) != nil { TodayMarkButton(job: job, day: day) }
                        if canDoLater(done: done) && undoShown == nil {
                            Button(TodayReorderText.doLater) { moves.doLater(job, .row) }
                                .buttonStyle(.secondary)
                                .accessibilityLabel("\(TodayReorderText.doLater), \(job.customerName)")
                                .accessibilityHint("Moves the stop after the last one")
                        }
                    }
                }
                Spacer(minLength: 0)
                if !done {
                    // On My Way as a round car, first (owner, 2026-10-20: "just be an icon").

                    if let phone = job.customerPhone {
                        RoundIconButton(systemImage: "phone", label: "Call \(job.customerName), \(phone)") {
                            if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                                openURL(url)
                            }
                        }
                    }
                }
            }
            .padding(.top, 8)
        }
    }

    /// Mark Complete on a Today stop (owner, 2026-10-19: every stop on the day's route): a
    /// maintenance visit is completed; a leak or repair job's stop is done for the day, and its
    /// report and invoice still follow. When the shop wants the checklist or a photo first, it
    /// says so, with Open Job. A stop marked by mistake is marked not complete again, and a
    /// completed visit is reopened (owner, 2026-10-20: core `todayUndo`). When
    /// completing sends the visit report (Automatic shops), it asks first (owner, 2026-10-20).
    /// Website components/today-complete.tsx.
    struct TodayMarkButton: View {
        var job: ScheduleJob
        var day: TodayDay
        /// On Today's card: white on the water blue, and the list's row does the Live Activity's
        /// Mark Complete (so it's done once).
        var onCard = false
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @State private var blocked: String?
        @State private var marked = 0
        @State private var askingSend = false

        var body: some View {
            let done = job.doneOn(day.ctx.today)
            VStack(alignment: .leading, spacing: 4) {
                if done {
                    // Reopen Visit on a completed visit, Mark Not Complete on a leak or repair stop.
                    if let undo = todayUndo(job, day: day.ctx.today) {
                        styled(Button(undo.label) { mark(complete: false) }, primary: false)
                            .accessibilityLabel(MarkStopText.spoken(undo.label, job.customerName))
                    }
                } else {
                    styled(Button(MarkStopText.complete) { complete() }, primary: true)
                        .accessibilityLabel(MarkStopText.spoken(MarkStopText.complete, job.customerName))
                }
                if let blocked {
                    InlineLinkText(text: blocked, link: MarkStopText.openJob) { openRoute(.job(job.id)) }
                        .textRole(.secondary)
                        .foregroundStyle(onCard ? Color.white : Color.fail)
                }
            }
            .sensoryFeedback(.success, trigger: marked)
            .alert(CompleteSendPrompt.title, isPresented: $askingSend) {
                Button(CompleteSendPrompt.cancel, role: .cancel) {}
                Button(CompleteSendPrompt.confirm) { mark(complete: true) }
                    .keyboardShortcut(.defaultAction)
            } message: {
                Text(CompleteSendPrompt.message(customer: job.customerName == "Customer" ? nil : job.customerName))
            }
            .onChange(of: app.stopRequest, initial: true) { _, request in
                // The Live Activity's Mark Complete, done here.
                guard !onCard, let request, request.jobId == job.id, request.action == .markComplete else { return }
                app.stopRequest = nil
                if !job.doneOn(day.ctx.today) { complete() }
            }
        }

        /// The list's primary and secondary pills, or the card's translucent white one.
        @ViewBuilder private func styled(_ button: Button<Text>, primary: Bool) -> some View {
            if onCard {
                button.buttonStyle(HeroButtonStyle(filled: false))
            } else if primary {
                button.buttonStyle(.primary)
            } else {
                button.buttonStyle(.secondary)
            }
        }

        /// Mark Complete: a visit whose report goes out by itself asks first; otherwise one tap.
        private func complete() {
            guard let company = session.company else { return }
            if CompleteSendPrompt.asks(jobType: job.type, settings: company.settings),
                statusChangeBlock(.done, sync.store, settings: company.settings, jobId: job.id) == nil
            {
                askingSend = true
            } else {
                mark(complete: true)
            }
        }

        private func mark(complete: Bool) {
            guard let company = session.company else { return }
            do {
                blocked = try StopWrites.mark(
                    sync, companyId: company.id, settings: company.settings, jobId: job.id, complete: complete,
                    day: day.ctx.today, visitReports: app.visitReports)
                if let blocked { AccessibilityNotification.Announcement(blocked).post() } else { marked += 1 }
            } catch {
                blocked = String(describing: error)
            }
        }
    }

    /// An address in `link` (or muted, on the Schedule's stops), opening directions in the chosen
    /// maps app, with the warning symbol right after it when it wasn't found on the map.
    struct AddressButton: View {
        var place: MapPlace
        var muted = false
        var notOnMap = false
        @Environment(\.openURL) private var openURL
        @Environment(SyncService.self) private var sync

        var body: some View {
            Button {
                if let url = directionsURL(place, app: MapsApp(sync.kv)) { openURL(url) }
            } label: {
                HStack(spacing: 4) {
                    Text(place.address.isEmpty ? "Address" : place.address)
                        .foregroundStyle(muted ? Color.textMuted : Color.link)
                        .lineLimit(1)
                    // Left out of drive times until its address is found (owner, 2026-10-20).
                    if notOnMap { NotOnMapTag() }
                }
                .textRole(.secondary)
                .frame(minHeight: 28, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "\(place.address)\(notOnMap ? ", \(NotOnMap.title.lowercased())" : ""), directions in Maps")
        }
    }

    /// The dotted line between stops: "12 min drive", " · 15 min late" in warning.
    struct LegLine: View {
        var minutes: Int
        var label: String
        var short: Int
        var inset: CGFloat = 12

        var body: some View {
            HStack(spacing: 8) {
                Rectangle()
                    .stroke(style: StrokeStyle(lineWidth: 2, dash: [2, 2]))
                    .foregroundStyle(Color.textMuted)
                    .frame(width: 2, height: 16)
                    .accessibilityHidden(true)
                Text("\(durationLabel(minutes)) \(label)")
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
            }
            .padding(.leading, inset)
            .padding(.vertical, 2)
        }
    }

    /// Shows the system share sheet over the top screen. False when there's no screen to show it on.
    @MainActor
    func presentShareSheet(_ text: String) -> Bool {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard var top = scene?.keyWindow?.rootViewController else { return false }
        while let presented = top.presentedViewController { top = presented }
        let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
        return true
    }

    /// The shop's cached live drive times between these points (a day old at most), read as the
    /// signed-in person. Empty (estimates) offline or on any error.
    @MainActor
    func cachedDriveTimes(_ app: AppEnvironment, companyId: String, keys: [String]) async -> DriveTimes {
        struct Args: Encodable {
            let targetCompany: String
            let fromKeys: [String]
            let toKeys: [String]

            enum CodingKeys: String, CodingKey {
                case targetCompany = "target_company"
                case fromKeys = "from_keys"
                case toKeys = "to_keys"
            }
        }
        struct Cached: Decodable {
            let fromKey: String
            let toKey: String
            let minutes: Int

            enum CodingKeys: String, CodingKey {
                case minutes
                case fromKey = "from_key"
                case toKey = "to_key"
            }
        }
        guard keys.count > 1, app.session.sync.status.phase != .offline else { return DriveTimes() }
        do {
            let rows: [Cached] = try await app.client.rpc(
                "cached_drive_times", params: Args(targetCompany: companyId, fromKeys: keys, toKeys: keys)
            ).execute().value
            return DriveTimes(
                known: Dictionary(
                    rows.map { ("\($0.fromKey)>\($0.toKey)", $0.minutes) }, uniquingKeysWith: { a, _ in a }))
        } catch {
            return DriveTimes()
        }
    }

    // MARK: - Weather

    /// The weather at the shop (spec 5.1): an icon, "**76°** Mostly Clear · High 85°".
    struct WeatherBadge: View {
        var weather: Weather

        var body: some View {
            HStack(spacing: 6) {
                WeatherIcon(kind: weather.kind, day: weather.isDaytime)
                    .stroke(Color.text, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                    .frame(width: 24, height: 24)
                (Text("\(weather.tempF)°").fontWeight(.semibold) + Text(" \(weather.conditions)")
                    + (weather.highF.map { Text(" · High \($0)°").foregroundStyle(Color.textMuted) } ?? Text("")))
                    .foregroundStyle(Color.text)
                    .monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(weather.accessibilityLabel)
        }
    }

    /// The website's weather drawings (components/weather-badge.tsx) on a 24 artboard.
    struct WeatherIcon: Shape {
        var kind: String
        var day: Bool

        private static func circle(_ cx: Double, _ cy: Double, _ r: Double) -> String {
            "M\(cx - r) \(cy)a\(r) \(r) 0 1 0 \(2 * r) 0a\(r) \(r) 0 1 0 \(-2 * r) 0"
        }

        private static let sun =
            circle(12, 12, 4)
            + "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        private static let moon = "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"
        private static let cloud = "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"
        private static let smallCloud = "M9 20h8a3.2 3.2 0 0 0 .5-6.4A4.8 4.8 0 0 0 8.3 13 3.5 3.5 0 0 0 9 20z"
        private static let lowCloud = "M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z"

        var d: String {
            switch kind {
            case "clear": return day ? Self.sun : Self.moon
            case "partly":
                return day
                    ? Self.circle(9, 9, 3.2) + "M9 2.5v1.5M3.5 9H2M4.4 4.4l1 1M13.6 4.4l-1 1" + Self.smallCloud
                    : "M14 8.5A5.5 5.5 0 1 1 7 2.5a4.5 4.5 0 0 0 7 6z" + Self.smallCloud
            case "rain": return Self.lowCloud + "M8 18l-1 3M12 18l-1 3M16 18l-1 3"
            case "storm": return Self.lowCloud + "M13 15l-2.5 4h3L11 23"
            case "snow": return Self.lowCloud + "M8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01"
            case "fog": return "M4 9h16M3 13h18M5 17h14"
            case "wind": return "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"
            case "dust": return "M4 8h12M2 12h18M6 16h12M18 8h.01M22 16h.01"
            default: return Self.cloud
            }
        }

        func path(in rect: CGRect) -> Path {
            Path(cgPath(svg: d)).applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24))
        }
    }

    extension Array {
        subscript(routeIndex index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
    }

    /// Today while its day is read or first synced: the summary line, the card's shape in water
    /// blue and two stops, redacted (loading.md: show something as soon as possible).
    struct TodaySkeleton: View {
        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Text("Tuesday, October 20").textRole(.body)
                Text("3 stops · 1 hr 20 min driving").textRole(.body)
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.water.opacity(0.35))
                    .frame(height: 220)
                    .padding(.bottom, 8)
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 12) {
                        Circle().fill(Color.fill).frame(width: 32, height: 32)
                        Text("9:00 AM  Customer name").textRole(.bodyEmphasis)
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .card(padding: 0)
                }
            }
            .foregroundStyle(Color.textMuted)
            .redacted(reason: .placeholder)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading today")
        }
    }
#endif
