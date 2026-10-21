#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// Where a tab's stack can go.
    enum Route: Hashable {
        case job(String)
        /// The job page open at one section ("Invoice" and report rows open Wrap-Up).
        case jobSection(String, JobPageSection)
        /// The Sync screen (the sync bar opens it).
        case sync
        /// A Messages screen (a conversation, New Message, a customer) from any tab.
        case messages(MessagesRoute)
        /// A More screen (a customer, Chemical, ...) from any tab.
        case more(MoreRoute)
        /// A checklist item's screen: its answer, notes, tests and findings.
        case component(jobId: String, componentId: String)
        /// A signature on the job; with a quote, the customer accepting it on site.
        case signature(jobId: String, quoteId: String?)
        /// The end of the visit: the customer reviews the work and signs off the report.
        case review(jobId: String)
        /// New Job, pushed (spec decision 3); `back` is the screen it came from ("Jobs").
        case newJob(back: String)
    }

    /// The editors that open as sheets over the job (S4).
    enum EditorSheet: Identifiable, Hashable {
        /// A test: `testId` nil for a new one of `typeId`, optionally on a checklist item.
        case test(jobId: String, testId: String?, typeId: String?, componentId: String?)
        /// A finding: `findingId` nil for a new one, optionally on a checklist item.
        case finding(jobId: String, findingId: String?, componentId: String?)

        var id: Self { self }
    }

    extension EnvironmentValues {
        /// Pushes a screen on the current tab's stack.
        @Entry var openRoute: (Route) -> Void = { _ in }
        /// Replaces the top screen of the current tab's stack (New Job becomes the new job).
        @Entry var replaceRoute: (Route) -> Void = { _ in }
        /// Switches to a tab at its root ("Open the schedule").
        @Entry var openTab: (AppTab) -> Void = { _ in }
        /// Opens a test or finding editor as a sheet.
        @Entry var openEditor: (EditorSheet) -> Void = { _ in }
    }

    /// The "+" New Job in the navigation bar, when this person may make jobs (spec 3.1, 4.3).
    struct NewJobToolbar: ToolbarContent {
        var back: String
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute

        var body: some ToolbarContent {
            ToolbarItem(placement: .topBarTrailing) {
                if let company = session.company, canMakeJobs(company.role, company.settings) {
                    BarIconButton(systemImage: "plus", label: "New Job") { openRoute(.newJob(back: back)) }
                }
            }
        }
    }

    /// Jobs | Reports.
    enum JobsMode: String, Hashable, CaseIterable {
        case jobs, reports

        var title: String { self == .jobs ? "Jobs" : "Reports" }
    }

    /// Jobs (spec 5.2) and Reports (5.3) in one screen: the search field, the segmented control,
    /// the sync bar, the tip, filter pills, and the list. Port of apps/web/src/app/(office)/jobs.
    /// The search field under the title searches the whole shop on this phone (owner, 2026-10-20;
    /// docs/plans/search-and-activity.md); while it is in use its results take the list's place.
    struct JobsView: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @State private var filter: JobFilter
        @State private var mode = JobsMode.jobs
        @State private var reportFilter = ReportFilter.all
        /// The list's order (owner, 2026-10-20: "Add sorting on the jobs page just like invoices").
        @State private var sort = JobSort.scheduled
        @State private var rows: [JobListRow] = []
        @State private var reports: [ReportListRow] = []
        // Search (ShopSearchViews.swift).
        @State private var query = ""
        @State private var searchActive = false
        @FocusState private var searchFocused: Bool
        @State private var searchGroup: SearchGroupKey?
        @State private var results: SearchResults?
        @State private var recent: [RecentItem] = []
        /// What a row's swipe or menu action did, at the top (gestures spec section 12).
        @State private var banner: ResultBanner?
        /// Undo for the last Mark Complete: Reopen Visit, as the job page offers it.
        @State private var reopen: String?
        /// Move… from a row: the job page's Change Schedule sheet.
        @State private var moving: MovingJob?
        /// Mark Complete on a visit whose report goes out by itself asks first.
        @State private var askingSend: JobListRow?
        @State private var completes = 0

        /// `filter` opens on a status (the dashboard's rows); Open by default.
        init(filter: JobFilter = .open) { _filter = State(initialValue: filter) }

        var body: some View {
            let company = session.company
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    if mode == .jobs {
                        ShopSearchField(text: $query, focused: $searchFocused, active: searching) { cancelSearch() }
                            .padding(.horizontal, 16)
                    }
                    if searching {
                        ShopSearchResults(
                            query: query, results: results, recent: recent, group: $searchGroup,
                            onOpenHit: { openHit($0) }, onOpenRecent: { openRecent($0) },
                            onClearRecent: {
                                RecentSearches(kv: sync.kv).clear()
                                recent = []
                            }
                        )
                        .padding(.horizontal, 16)
                    } else {
                        jobsAndReports(company)
                    }
                }
                .padding(.bottom, 24)
            }
            .background(Color.bg)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await sync.syncNow() }
            .sensoryFeedback(.impact(weight: .light), trigger: sync.status.phase == .syncing)
            .rootTitleScroll()
            .sensoryFeedback(.success, trigger: completes)
            .resultBanner($banner, onUndo: reopen.map { id in { reopenVisit(id) } })
            .sheet(item: $moving) { target in
                JobMoveSheet(jobId: target.id) { result in
                    reopen = nil
                    banner = result
                }
            }
            .alert(
                CompleteSendPrompt.title,
                isPresented: Binding(get: { askingSend != nil }, set: { if !$0 { askingSend = nil } }),
                presenting: askingSend
            ) { row in
                Button(CompleteSendPrompt.cancel, role: .cancel) {}
                Button(CompleteSendPrompt.confirm) { complete(row, confirmed: true) }
                    .keyboardShortcut(.defaultAction)
            } message: { row in
                Text(CompleteSendPrompt.message(customer: row.customer == "Customer" ? nil : row.customer))
            }
            // Sort and the "+" on the bar's right while on Jobs.
            .rootTitle(mode.title, trailingButtons: mode == .jobs ? 2 : 0)
            .toolbar {
                if mode == .jobs {
                    // Sort, as Invoices has it: a menu in the navigation bar, applied at once,
                    // with the status filter and the search.
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Sort", selection: $sort) {
                                ForEach(JobSort.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                        } label: {
                            Image(systemName: "arrow.up.arrow.down")
                                .frame(width: minTarget, height: minTarget)
                        }
                        .accessibilityLabel("Sort, \(sort.label)")
                    }
                    NewJobToolbar(back: "Jobs")
                }
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(filter)|\(reportFilter)|\(mode)|\(sort)") {
                reload()
            }
            .task(id: "\(query)|\(searchGroup?.rawValue ?? "")|\(sync.revision)|\(company?.id ?? "")") {
                await runSearch()
            }
            .onChange(of: searchFocused) { _, focused in
                if focused { searchActive = true }
            }
            .onChange(of: query) { _, _ in searchGroup = nil }
            .onChange(of: searching, initial: true) { _, now in
                if now { recent = RecentSearches(kv: sync.kv).load() }
            }
        }

        /// The list's part of the page: Jobs | Reports, the sync bar, the tip, filters, the list.
        @ViewBuilder private func jobsAndReports(_ company: CompanyContext?) -> some View {
            Segmented(
                selection: $mode, options: JobsMode.allCases, label: \.title, title: "Jobs and Reports",
                minSegmentWidth: 112
            )
            .padding(.horizontal, 16)
            SyncBarRow().padding(.horizontal, 16)
            if mode == .jobs, let company, let tip = tip(company) {
                TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                    .padding(.horizontal, 16)
            }
            if mode == .jobs {
                FilterPills(selection: $filter, options: JobFilter.allCases, label: \.title)
                jobsList.padding(.horizontal, 16)
            } else {
                FilterPills(selection: $reportFilter, options: ReportFilter.allCases, label: \.title)
                reportsList.padding(.horizontal, 16)
            }
        }

        /// Searching: the field is in use or has text. Cancel (or opening a result with the field
        /// empty) returns to the list.
        private var searching: Bool { mode == .jobs && (searchActive || !query.isEmpty) }

        private func cancelSearch() {
            query = ""
            searchGroup = nil
            results = nil
            searchActive = false
            searchFocused = false
        }

        /// The shop's records on this phone, searched with the shared rule 200 ms after the last
        /// keystroke (and again after a sync).
        private func runSearch() async {
            guard normalizeSearch(query).ready else {
                results = nil
                return
            }
            try? await Task.sleep(for: .milliseconds(SearchText.debounceMs))
            guard !Task.isCancelled, let company = session.company, let user = session.user else { return }
            let records = searchRecords(
                sync.store, companyId: company.id, userId: user.id, seesAll: seesAllJobs(company.role, company.settings)
            )
            results = try? searchShop(
                query, records, now: Date(), timeZone: company.timeZone,
                limit: searchGroup == nil ? SearchText.groupLimit : .max, group: searchGroup)
        }

        private func openHit(_ hit: SearchHit) {
            if let item = recentFromHit(hit) { recent = RecentSearches(kv: sync.kv).remember(item) }
            if let target = hit.open { go(to: SearchDestination(target)) }
        }

        private func openRecent(_ item: RecentItem) {
            recent = RecentSearches(kv: sync.kv).remember(item)
            go(to: SearchDestination(item.open))
        }

        private func go(to destination: SearchDestination) {
            searchActive = false
            searchFocused = false
            switch destination {
            case .customer(let id): openRoute(.more(.customer(id)))
            case .job(let id): openRoute(.job(id))
            case .jobSection(let id, let section): openRoute(.jobSection(id, section))
            }
        }

        /// The website's tip ("Every job, start to finish"). The app's own Jobs tip ("Today comes
        /// first") describes the old list with today's jobs on top, which this screen no longer is.
        private func tip(_ company: CompanyContext) -> Tip? {
            tipFor(
                platform: .web, screen: "jobs", role: company.role, services: company.services,
                seen: app.walkthrough.seen)
        }

        @ViewBuilder private var jobsList: some View {
            if rows.isEmpty {
                EmptyState(text: "No jobs here. Add one with New Job, or on the phone.")
            } else {
                GroupedRows(rows) { row in
                    // Swipe left for Call and Directions, right for Mark Complete; touch and hold
                    // for the menu (gestures spec section 12). The job page has each of them too.
                    SwipeActionsRow(
                        actions: trailingActions(row), leading: leadingActions(row),
                        menuTitle: jobMenuTitle(row), menuItems: menuActions(row)
                    ) {
                        Button {
                            openRoute(.job(row.id))
                        } label: {
                            JobListRowView(row: row)
                        }
                        .buttonStyle(.row)
                        .zoomSource(row.id)
                    }
                }
            }
        }

        @ViewBuilder private var reportsList: some View {
            if reports.isEmpty {
                EmptyState(text: reportFilter.empty)
            } else {
                GroupedRows(reports) { r in
                    Button {
                        openRoute(.jobSection(r.jobId, .wrapUp))
                    } label: {
                        ReportListRowView(row: r)
                    }
                    .buttonStyle(.row)
                    // Touch and hold: Open, Copy Customer Link, Resend (no swipes on Reports).
                    .rowMenu("\(r.customer) · \(r.job)", reportActions(r))
                }
            }
        }

        // MARK: - Row actions (gestures spec section 12)

        /// "Grace Holloway · Job #1040".
        private func jobMenuTitle(_ row: JobListRow) -> String {
            row.customer + (row.number.map { " · Job #\($0)" } ?? "")
        }

        /// Swipe left: Call (the outer edge), then Directions.
        private func trailingActions(_ row: JobListRow) -> [SwipeAction] {
            var list: [SwipeAction] = []
            if let url = row.phone.flatMap(CustomersScreen.telURL) {
                list.append(SwipeAction(title: "Call", systemImage: "phone.fill", tint: Color.pass) { openURL(url) })
            }
            if let place = row.place {
                list.append(
                    SwipeAction(title: "Directions", systemImage: "location.fill", tint: Color.link) {
                        directions(place)
                    })
            }
            return list
        }

        /// Swipe right: Mark Complete, on a job whose page offers Complete Job.
        private func leadingActions(_ row: JobListRow) -> [SwipeAction] {
            guard row.completable else { return [] }
            return [
                SwipeAction(title: MarkStopText.complete, systemImage: "checkmark", tint: Color.pass) { complete(row) }
            ]
        }

        /// Open, Call, Message, Directions, Move…, Copy Job Number.
        private func menuActions(_ row: JobListRow) -> [SwipeAction] {
            var list = [
                SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link) {
                    openRoute(.job(row.id))
                }
            ]
            if let url = row.phone.flatMap(CustomersScreen.telURL) {
                list.append(SwipeAction(title: "Call", systemImage: "phone", tint: Color.pass) { openURL(url) })
            }
            if let phone = row.phone {
                list.append(
                    SwipeAction(title: "Message", systemImage: "message", tint: Color.link) {
                        message(phone: phone, customerId: row.customerId)
                    })
            }
            if let place = row.place {
                list.append(
                    SwipeAction(title: "Directions", systemImage: "location", tint: Color.link) { directions(place) })
            }
            if row.movable {
                list.append(
                    SwipeAction(
                        title: "Move…", systemImage: "arrow.up.and.down.and.arrow.left.and.right", tint: Color.link
                    ) { moving = MovingJob(id: row.id) })
            }
            if let number = row.number {
                list.append(
                    SwipeAction(title: "Copy Job Number", systemImage: "doc.on.doc", tint: Color.link) {
                        UIPasteboard.general.string = String(number)
                        reopen = nil
                        banner = ResultBanner(kind: .success, title: "Copied job number \(number).")
                    })
            }
            return list
        }

        private func directions(_ place: MapPlace) {
            if let url = directionsURL(place, app: MapsApp(sync.kv)) { openURL(url) }
        }

        /// The customer page's Text: New Message on the company number when it works, else Messages.
        private func message(phone: String, customerId: String?) {
            if let company = session.company, let customerId,
                companyLine(sync.store, companyId: company.id)?.status == "active"
            {
                openRoute(.messages(.newMessage(customerId: customerId)))
            } else if let url = URL(string: "sms:\(phone.filter { $0.isNumber || $0 == "+" })") {
                openURL(url)
            }
        }

        /// The job page's Complete Job: the shop's checks first (the checklist, a pool photo), a
        /// visit whose report goes out by itself asks first; then the banner with Undo (Reopen Visit).
        private func complete(_ row: JobListRow, confirmed: Bool = false) {
            guard let company = session.company,
                let job = (try? jobView(sync.store, companyId: company.id, jobId: row.id)) ?? nil
            else { return }
            reopen = nil
            if let block = statusChangeBlock(.done, sync.store, settings: company.settings, jobId: row.id) {
                banner = ResultBanner(kind: .warning, title: block, detail: "Open the job to finish it.")
                return
            }
            if !confirmed, CompleteSendPrompt.asks(jobType: job.type, settings: company.settings) {
                askingSend = row
                return
            }
            do {
                try sync.write("job", id: row.id, companyId: company.id, jobStatusValues(.done, job: job.job))
                app.visitReports.completed(jobType: job.type, jobId: row.id, settings: company.settings)
                completes += 1
                reopen = row.id
                banner = ResultBanner(
                    kind: .success, title: "\(row.customer) completed.", undoable: true,
                    undoHint: "Reopens the visit")
            } catch {
                banner = ResultBanner(kind: .error, title: String(describing: error))
            }
        }

        /// Undo Mark Complete: the job page's Reopen Visit.
        private func reopenVisit(_ jobId: String) {
            guard let company = session.company,
                let job = (try? jobView(sync.store, companyId: company.id, jobId: jobId)) ?? nil
            else { return }
            reopen = nil
            do {
                try sync.write("job", id: jobId, companyId: company.id, jobStatusValues(.inProgress, job: job.job))
            } catch {
                banner = ResultBanner(kind: .error, title: String(describing: error))
            }
        }

        /// A report: Open, Copy Customer Link (while it works), Resend (a sent version, by email).
        private func reportActions(_ r: ReportListRow) -> [SwipeAction] {
            var list = [
                SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link) {
                    openRoute(.jobSection(r.jobId, .wrapUp))
                }
            ]
            if let link = r.link {
                list.append(
                    SwipeAction(title: "Copy Customer Link", systemImage: "link", tint: Color.link) {
                        UIPasteboard.general.url = link
                        reopen = nil
                        banner = ResultBanner(kind: .success, title: "Customer link copied.")
                    })
            }
            if r.sent {
                list.append(
                    SwipeAction(title: "Resend", systemImage: "paperplane", tint: Color.link) {
                        Task { await resend(r) }
                    })
            }
            return list
        }

        /// The Wrap-Up's Send by Email for the finished version, to the customer's email (it waits
        /// on the phone without signal, as there).
        private func resend(_ r: ReportListRow) async {
            guard let company = session.company else { return }
            let flow = ReportFlow(
                sync: sync, companyId: company.id, jobId: r.jobId, settings: company.settings, sends: app.reportSends)
            await flow.run(.email, reportId: r.id, server: ReportServer(sync: sync, api: app.api))
            reopen = nil
            if let error = flow.error {
                banner = ResultBanner(
                    kind: .error, title: error.text, detail: "Open the report to check the customer’s email.")
            } else {
                banner = ResultBanner(kind: .success, title: flow.message ?? "Sent.")
            }
        }

        private func reload() {
            guard let company = session.company, let user = session.user else { return }
            if mode == .jobs {
                let views = (try? jobViews(sync.store, companyId: company.id)) ?? []
                let names = Dictionary(
                    teamMembers(sync.store, kv: sync.kv, companyId: company.id, userId: user.id).map {
                        ($0.id, $0.name)
                    },
                    uniquingKeysWith: { a, _ in a })
                rows = jobList(
                    views, filter: filter, search: "", now: Date(), timeZone: company.timeZone, userId: user.id,
                    seesAll: seesAllJobs(company.role, company.settings), names: names, sort: sort)
            } else {
                reports = reportList(
                    sync.store, companyId: company.id, filter: reportFilter, timeZone: company.timeZone)
            }
        }
    }

    /// The job a list's Move… opens.
    struct MovingJob: Identifiable {
        var id: String
    }

    /// An inset grouped block whose rows load lazily as they scroll (long lists): `surface`,
    /// radius 12, hairlines from 16 in.
    struct GroupedRows<Item: Identifiable, Row: View>: View {
        var items: [Item]
        /// Long lists build rows as they scroll on; short ones inside another lazy stack don't.
        var lazy = true
        @ViewBuilder var row: (Item) -> Row

        init(_ items: [Item], lazy: Bool = true, @ViewBuilder row: @escaping (Item) -> Row) {
            self.items = items
            self.lazy = lazy
            self.row = row
        }

        var body: some View {
            Group {
                if lazy {
                    LazyVStack(spacing: 0) { rows }
                } else {
                    VStack(spacing: 0) { rows }
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
        }

        private var rows: some View {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Hairline().padding(.leading, 16) }
                row(item)
            }
        }
    }

    /// A job in the list: the customer, then "#1040 · Leak detection", the address, and the
    /// time and tech; the status chip and a chevron at the right.
    struct JobListRowView: View {
        var row: JobListRow

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.customer).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(row.kind).textRole(.secondary).foregroundStyle(Color.textMuted)
                    if let address = row.address {
                        Text(address).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                    Text(row.when).textRole(.secondary).foregroundStyle(Color.text)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                StatusChip(status: row.status)
                Chevron()
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// A report in Reports: "**Customer** · Job #1040", the template, version and street, and
    /// "Sent Oct 15, 2026" or "Draft" at the right.
    struct ReportListRowView: View {
        var row: ReportListRow

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    (Text(row.customer).fontWeight(.semibold).foregroundStyle(Color.text)
                        + Text(" · \(row.job)").foregroundStyle(Color.textMuted))
                        .textRole(.body)
                    if !row.detail.isEmpty {
                        Text(row.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(row.value).textRole(.body).foregroundStyle(Color.textMuted).multilineTextAlignment(.trailing)
                Chevron()
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }
#endif
