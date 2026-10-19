#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Where a tab's stack can go.
    enum Route: Hashable {
        case job(String)
        /// The job page open at one section ("Invoice" and report rows open Wrap-Up).
        case jobSection(String, JobPageSection)
        /// The Sync screen (the sync bar opens it).
        case sync
        /// A Messages screen (a conversation, New Message, a customer) from any tab.
        case messages(MessagesRoute)
        /// A More screen (a customer, the Chemical Calculator, ...) from any tab.
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

    /// Jobs (spec 5.2) and Reports (5.3) in one screen: the segmented control, the sync bar, the
    /// tip, filter pills, the search field, and the list. Port of apps/web/src/app/(office)/jobs.
    struct JobsView: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var mode = JobsMode.jobs
        @State private var filter = JobFilter.open
        @State private var reportFilter = ReportFilter.all
        @State private var search = ""
        @State private var rows: [JobListRow] = []
        @State private var reports: [ReportListRow] = []

        var body: some View {
            let company = session.company
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
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
                        SearchField(text: $search, placeholder: "Customer name or job number")
                            .padding(.horizontal, 16)
                        jobsList.padding(.horizontal, 16)
                    } else {
                        FilterPills(selection: $reportFilter, options: ReportFilter.allCases, label: \.title)
                        reportsList.padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
            .background(Color.bg)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await sync.syncNow() }
            .sensoryFeedback(.impact(weight: .light), trigger: sync.status.phase == .syncing)
            .navigationTitle(mode.title)
            .toolbar {
                if mode == .jobs { NewJobToolbar(back: "Jobs") }
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")|\(filter)|\(reportFilter)|\(search)|\(mode)") {
                reload()
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
            let q = search.trimmingCharacters(in: .whitespaces)
            if rows.isEmpty {
                EmptyState(
                    text: q.isEmpty ? "No jobs here. Add one with New Job, or on the phone." : "No jobs match “\(q)”.")
            } else {
                GroupedRows(rows) { row in
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
                }
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
                    views, filter: filter, search: search, now: Date(), timeZone: company.timeZone, userId: user.id,
                    seesAll: seesAllJobs(company.role, company.settings), names: names)
            } else {
                reports = reportList(
                    sync.store, companyId: company.id, filter: reportFilter, timeZone: company.timeZone)
            }
        }
    }

    /// An inset grouped block whose rows load lazily as they scroll (long lists): `surface`,
    /// radius 12, hairlines from 16 in.
    struct GroupedRows<Item: Identifiable, Row: View>: View {
        var items: [Item]
        @ViewBuilder var row: (Item) -> Row

        init(_ items: [Item], @ViewBuilder row: @escaping (Item) -> Row) {
            self.items = items
            self.row = row
        }

        var body: some View {
            LazyVStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Hairline().padding(.leading, 16) }
                    row(item)
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
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
