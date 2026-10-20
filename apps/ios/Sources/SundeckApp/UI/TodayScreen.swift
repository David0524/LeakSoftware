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

        var body: some View {
            ScreenScroll {
                if let company = session.company, let day {
                    header(day)
                    SyncBarRow()
                    // Getting Started is off on the phone for now: inside the tab view it stops Today
                    // drawing in the simulator screenshots, cause not found yet (docs/plans/swift-app.md).
                    if day.ctx.isManager && GettingStartedCard.enabled { GettingStartedCard(company: company) }
                    if let tip = tipFor(
                        platform: .web, screen: "today", role: company.role, services: company.services,
                        seen: app.walkthrough.seen)
                    {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                    }
                    if day.ctx.isManager && day.techs.count > 1 {
                        FilterPills(
                            selection: Binding(get: { day.techId }, set: { techId = $0 }),
                            options: day.techs.map(\.id), label: { id in id == day.ctx.userId ? "Me" : day.name(id) }
                        )
                        .padding(.horizontal, -16)
                        .accessibilityLabel("Whose day")
                    }
                    route(day)
                }
            }
            .refreshable { await sync.syncNow() }
            .navigationTitle(title)
            .toolbar { NewJobToolbar(back: "Today") }
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")|\(techId ?? "")|\(drive.known.count)") {
                reload()
            }
            .task(id: session.company?.id) {
                guard let company = session.company, let user = session.user else { return }
                let ctx = scheduleContext(sync.store, company: company, userId: user.id)
                async let w = app.api.weather(zip: ctx.shopZip)
                let jobs = scheduleJobs(sync.store, companyId: company.id)
                drive = await cachedDriveTimes(app, companyId: company.id, keys: routePoints(jobs, depot: ctx.depot))
                weather = await w
            }
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
            } actions: {
                if let link = day.directions {
                    Button {
                        openURL(link)
                    } label: {
                        Label(
                            day.mapsApp == .google ? "Open Route in Google Maps" : "Next Stop in Apple Maps",
                            systemImage: "mappin.and.ellipse")
                    }
                    .buttonStyle(.secondary)
                }
            }
        }

        @ViewBuilder private func route(_ day: TodayDay) -> some View {
            if let route = day.route, !route.jobs.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(day.summaryText)
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .padding(.bottom, 12)
                    ForEach(Array(route.jobs.enumerated()), id: \.element.id) { i, job in
                        LegLine(
                            minutes: route.summary.legs[routeIndex: i] ?? 0, label: i == 0 ? "from the shop" : "drive",
                            short: route.summary.short[routeIndex: i] ?? 0, inset: 16)
                        TodayStopCard(
                            number: i + 1, job: job, day: day, leg: route.summary.legs[routeIndex: i] ?? 0,
                            isNext: job.id == day.next?.id)
                    }
                    LegLine(minutes: route.summary.backLegMin, label: "back to the shop", short: 0, inset: 16)
                }
            } else {
                EmptyState(
                    text: "Nothing on \(day.techId == day.ctx.userId ? "your" : "this") route today.",
                    link: "Open the schedule."
                ) { openTab(.schedule) }
            }
        }

        private func reload() {
            guard let company = session.company, let user = session.user else { return }
            day = TodayDay(
                store: sync.store, kv: sync.kv, company: company, userId: user.id, wanted: techId, drive: drive)
        }
    }

    /// What Today shows for one person's day.
    @MainActor
    struct TodayDay {
        var ctx: ScheduleContext
        var techs: [TeamMember]
        var techId: String
        var route: DayRoute?
        var mapsApp: MapsApp
        var lineActive: Bool
        /// The cleanings due soon at each stop, by job (owner, 2026-10-19).
        var cleanings: [String: [VisitCleaning]] = [:]

        init(
            store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, wanted: String?, drive: DriveTimes
        ) {
            ctx = scheduleContext(store, company: company, userId: userId)
            let team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
            let jobs = scheduleJobs(store, companyId: company.id)
            let loaded = loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: drive)
            let today = ctx.today
            techs = team.filter { $0.active || loaded.routes[routeKey($0.id, today)] != nil }
            let pick = wanted ?? userId
            techId = ctx.isManager && techs.contains { $0.id == pick } ? pick : userId
            route = loaded.routes[routeKey(techId, ctx.today)]
            // Each stop's plan cleanings due within a week of its day (website `dueAt`); a
            // plan whose cleanings aren't on this phone yet shows the visit's checklist ones.
            let config = InspectionConfig(store, companyId: company.id)
            let stops = (route?.jobs ?? []).filter { $0.type == .maintenance }
            let plans = planCleanings(
                store, companyId: company.id, planIds: Set(stops.compactMap(\.servicePlanId)))
            for job in stops {
                let day = job.planDate ?? ctx.today
                let found =
                    plans.contains { $0.planId == job.servicePlanId }
                    ? stopCleanings(plans, planId: job.servicePlanId, visitDay: day)
                    : visitCleanings(JobInspection(store, jobId: job.id), config, day: day)
                if !found.isEmpty { cleanings[job.id] = found }
            }
            mapsApp = MapsApp(kv)
            lineActive = companyLine(store, companyId: company.id)?.status == "active"
        }

        func name(_ id: String) -> String { techs.first { $0.id == id }?.name ?? "Teammate" }

        var mine: Bool { techId == ctx.userId }
        /// The stop you're on: the first not done today (Mark Complete moves it on).
        var next: ScheduleJob? { route?.jobs.first { !$0.doneOn(ctx.today) } }

        var directions: URL? {
            guard let route, !route.jobs.isEmpty else { return nil }
            return dayDirections(
                app: mapsApp, origin: ctx.origin,
                stops: route.jobs.map { (place: $0.place, done: $0.doneOn(ctx.today)) })
        }

        /// "3 stops · 1 hr 20 min driving · back by 4:30 PM"
        var summaryText: String {
            guard let route else { return "" }
            let n = route.jobs.count
            return "\(n) \(n == 1 ? "stop" : "stops") · \(durationLabel(route.summary.driveMin)) driving"
                + (route.summary.backMin.map { " · back by \(minutesLabel($0))" } ?? "")
        }
    }

    /// A stop on Today (spec 5.1; owner, 2026-10-19: "keep these cards on Today collapsed except
    /// for the job you are on"): one row (the number, or a green check when done; the time, the
    /// customer, the state, a chevron) that opens to the address, cleanings, access notes, Mark
    /// Complete, and call and On My Way; once open, the customer's name links to the job. The
    /// stop you're on starts open and ringed.
    /// Website components/today-stop.tsx.
    struct TodayStopCard: View {
        var number: Int
        var job: ScheduleJob
        var day: TodayDay
        var leg: Int
        var isNext: Bool
        @State private var open: Bool?
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            let done = job.doneOn(day.ctx.today)
            let expanded = open ?? isNext
            VStack(alignment: .leading, spacing: 0) {
                // The row opens and closes the card; once open, the customer's name is the link to
                // the job (owner, 2026-10-20; no Open Job button).
                summary(done: done, expanded: expanded)
                    .onTapGesture { toggle(expanded) }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(stopLabel(done: done))
                    .accessibilityValue(expanded ? "Expanded" : "Collapsed")
                    .accessibilityHint(expanded ? "Folds the stop" : "Shows the address and buttons")
                    .accessibilityAction { toggle(expanded) }
                    .accessibilityAction(named: "Open Job") { openRoute(.job(job.id)) }
                if expanded {
                    VStack(alignment: .leading, spacing: 4) {
                        AddressButton(place: job.place)
                        if !done, let cleanings = day.cleanings[job.id] {
                            FlowRow(spacing: 16) { ForEach(cleanings) { CleaningDueLabel(cleaning: $0) } }
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel("Cleanings due")
                        }
                        if let notes = job.accessNotes {
                            // A plain muted line with a key, no fill (owner, 2026-10-19).
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Image(systemName: "key")
                                    .font(.system(size: 15))
                                    .accessibilityHidden(true)
                                Text(notes).lineLimit(2)
                            }
                            .textRole(.secondary)
                            .foregroundStyle(Color.textMuted)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(CleaningText.accessSpoken(notes))
                        }
                        buttons(done: done)
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                    .transition(.opacity)
                }
            }
            .card(padding: 0)
            .overlay { if isNext { shape.strokeBorder(Color.link, lineWidth: 2) } }
            .zoomSource(job.id)
            // Cards ease in as they scroll onto the screen.
            .scrollTransition(.animated(.smooth)) { card, phase in
                card.opacity(phase.isIdentity ? 1 : 0.6).scaleEffect(phase.isIdentity ? 1 : 0.96)
            }
        }

        private func toggle(_ expanded: Bool) {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { open = !expanded }
        }

        private func stopLabel(done: Bool) -> String {
            ["Stop \(number): \(job.customerName)", done ? "done" : nil].compactMap { $0 }.joined(separator: ", ")
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
                    Group {
                        if expanded {
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
                        } else {
                            Text(job.customerName)
                                .textRole(.bodyEmphasis)
                                .foregroundStyle(Color.text)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Most stops are scheduled; the chip shows other states.
                    if job.status != .scheduled { StatusChip(status: job.status) }
                    if let lock = job.lock, lock != .started {
                        Text(lock.label).font(.role(.footnote).weight(.semibold)).foregroundStyle(Color.textMuted)
                    }
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

        /// Mark Complete (primary) or Mark Not Complete, then call and On My Way.
        private func buttons(done: Bool) -> some View {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 8) {
                    FlowRow(spacing: 8) {
                        if markStopTitle(job, day: day.ctx.today) != nil { TodayMarkButton(job: job, day: day) }
                    }
                }
                Spacer(minLength: 0)
                if !done {
                    if let phone = job.customerPhone {
                        RoundIconButton(systemImage: "phone", label: "Call \(job.customerName), \(phone)") {
                            if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                                openURL(url)
                            }
                        }
                    }
                    if day.mine { OnMyWayButton(job: job, day: day, leg: leg) }
                }
            }
            .padding(.top, 8)
        }
    }

    /// Mark Complete on a Today stop (owner, 2026-10-19: every stop on the day's route): a
    /// maintenance visit is completed; a leak or repair job's stop is done for the day, and its
    /// report and invoice still follow. When the shop wants the checklist or a photo first, it
    /// says so, with Open Job. A stop marked by mistake is marked not complete again. Website
    /// components/today-complete.tsx.
    struct TodayMarkButton: View {
        var job: ScheduleJob
        var day: TodayDay
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @State private var blocked: String?
        @State private var marked = 0

        var body: some View {
            let done = job.doneOn(day.ctx.today)
            VStack(alignment: .leading, spacing: 4) {
                if done {
                    Button(MarkStopText.notComplete) { mark(complete: false) }
                        .buttonStyle(.secondary)
                        .accessibilityLabel(MarkStopText.spoken(true, job.customerName))
                } else {
                    Button(MarkStopText.complete) { mark(complete: true) }
                        .buttonStyle(.primary)
                        .accessibilityLabel(MarkStopText.spoken(false, job.customerName))
                }
                if let blocked {
                    InlineLinkText(text: blocked, link: MarkStopText.openJob) { openRoute(.job(job.id)) }
                        .textRole(.secondary)
                        .foregroundStyle(Color.fail)
                }
            }
            .sensoryFeedback(.success, trigger: marked)
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

    /// An address in `link`, opening directions in the chosen maps app.
    struct AddressButton: View {
        var place: MapPlace
        @Environment(\.openURL) private var openURL
        @Environment(SyncService.self) private var sync

        var body: some View {
            Button {
                if let url = directionsURL(place, app: MapsApp(sync.kv)) { openURL(url) }
            } label: {
                Text(place.address.isEmpty ? "Address" : place.address)
                    .textRole(.secondary)
                    .foregroundStyle(Color.link)
                    .lineLimit(1)
                    .frame(minHeight: 28, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(place.address), directions in Maps")
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
                (Text("\(durationLabel(minutes)) \(label)")
                    + (short > 0
                        ? Text(" · \(durationLabel(short)) late").fontWeight(.semibold).foregroundStyle(Color.warning)
                        : Text("")))
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
            }
            .padding(.leading, inset)
            .padding(.vertical, 2)
        }
    }

    /// On My Way (spec 5.1): texts the customer an arrival time. From the company number when the
    /// shop sends that way and it works; otherwise the Messages app, else the share sheet. Its
    /// label says what happened for 3 seconds.
    struct OnMyWayButton: View {
        var job: ScheduleJob
        var day: TodayDay
        var leg: Int
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @Environment(\.openURL) private var openURL
        @State private var done: String?
        @State private var asking = false

        var body: some View {
            Button(done ?? "On My Way", action: send)
                .buttonStyle(.secondary)
                .confirmationDialog(
                    "On My Way goes out from your company number, which isn’t working yet.", isPresented: $asking,
                    titleVisibility: .visible
                ) {
                    Button("Send From My Phone") { fromPhone() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(
                        day.ctx.isManager
                            ? "Set it up in Settings › Phone and Texting. You can send this one from your phone."
                            : "Ask an owner to set it up. You can send this one from your phone.")
                }
                .task(id: done) {
                    guard done != nil, done != "Sending…" else { return }
                    try? await Task.sleep(for: .seconds(3))
                    done = nil
                }
                .accessibilityLabel(done ?? "On My Way, text \(job.customerName)")
        }

        private var text: String {
            let me = day.techs.first { $0.id == day.ctx.userId }?.name
            return onMyWayText(
                customer: job.customerName == "Customer" ? nil : job.customerName,
                tech: me == "Teammate" || me == nil ? "your tech" : me!, shop: day.ctx.shopName,
                arriveMin: localMinutes(Date(), timeZone: day.ctx.timeZone) + max(5, leg),
                windowMin: day.ctx.settings.windowMin)
        }

        private func send() {
            let viaCompany = !day.ctx.onMyWayFromPhone
            if job.customerPhone != nil && viaCompany && !day.lineActive {
                asking = true
                return
            }
            if job.customerPhone != nil && viaCompany {
                startLiveStop()
                done = "Sending…"
                let body = text
                Task {
                    do {
                        _ = try await TextingServer(sync: sync, api: app.api).send(
                            customerId: job.customerId, body: body, jobId: job.id)
                        done = "Texted ✓"
                    } catch {
                        done = "Not Sent"
                    }
                }
                return
            }
            fromPhone()
        }

        /// The Lock Screen's Live Activity for this stop, arriving at the time the text gives.
        private func startLiveStop() {
            app.liveStop.start(
                jobId: job.id, eta: liveStopETA(now: Date(), timeZone: day.ctx.timeZone, driveMinutes: leg))
        }

        private func fromPhone() {
            startLiveStop()
            let body = text
            if let phone = job.customerPhone {
                let digits = phone.filter { $0.isNumber || $0 == "+" }
                let encoded = body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? body
                if let url = URL(string: "sms:\(digits)&body=\(encoded)") {
                    openURL(url)
                    done = "Texted ✓"
                    return
                }
            }
            if presentShareSheet(body) {
                done = "Shared ✓"
            } else {
                UIPasteboard.general.string = body
                done = "Copied ✓"
            }
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
#endif
