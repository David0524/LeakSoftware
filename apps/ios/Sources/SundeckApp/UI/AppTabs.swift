#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The app's sections, as the website's phone tab bar: Today, Jobs, Schedule, Messages, More.
    enum AppTab: String, Hashable, CaseIterable {
        case today, jobs, schedule, messages, more
    }

    /// The signed-in app: a tab bar, each tab with its own navigation stack, and the sheets
    /// presented over everything. The website's phone layout (owner, 2026-10-19).
    struct MainView: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var tab: AppTab = .today
        @State private var paths: [AppTab: [Route]] = [:]
        @State private var showNewJob = false
        @State private var showWelcome = false
        @State private var showReauth = false
        @State private var editor: EditorSheet?

        var body: some View {
            TabView(selection: $tab) {
                Tab("Today", systemImage: "mappin.and.ellipse", value: AppTab.today) {
                    stack(.today) { TodayView(newJob: { showNewJob = true }) }
                }
                Tab("Jobs", systemImage: "doc.text", value: AppTab.jobs) {
                    stack(.jobs) { JobsView(newJob: { showNewJob = true }) }
                }
                Tab("Schedule", systemImage: "calendar", value: AppTab.schedule) {
                    stack(.schedule) { ScheduleTab() }
                }
                Tab("Messages", systemImage: "message", value: AppTab.messages) {
                    stack(.messages) { MessagesTab() }
                }
                Tab("More", systemImage: "ellipsis.circle", value: AppTab.more) {
                    stack(.more) { MoreView(showWelcome: { showWelcome = true }, showReauth: { showReauth = true }) }
                }
            }
            .environment(\.openRoute) { paths[tab, default: []].append($0) }
            .environment(\.openEditor) { editor = $0 }
            .sheet(item: $editor) { sheet in
                switch sheet {
                case .test(let jobId, let testId, let typeId, let componentId):
                    TestEditor(jobId: jobId, testId: testId, typeId: typeId, componentId: componentId)
                case .finding(let jobId, let findingId, let componentId):
                    FindingEditor(jobId: jobId, findingId: findingId, componentId: componentId)
                }
            }
            .sheet(isPresented: $showNewJob) {
                if let company = session.company, let user = session.user {
                    NewJobView(form: NewJobForm(sync: session.sync, company: company, userId: user.id)) { id in
                        showNewJob = false
                        paths[tab, default: []].append(.job(id))
                    }
                }
            }
            .sheet(isPresented: $showWelcome) { WelcomeView() }
            .sheet(isPresented: $showReauth) { ReauthView() }
            .onAppear {
                if !app.walkthrough.launchSeen { showWelcome = true }
            }
        }

        /// A tab's navigation stack, with every screen a tab can push.
        private func stack<Root: View>(_ tab: AppTab, @ViewBuilder root: () -> Root) -> some View {
            NavigationStack(path: Binding(get: { paths[tab] ?? [] }, set: { paths[tab] = $0 })) {
                root().navigationDestination(for: Route.self) { route in
                    switch route {
                    case .job(let id): JobScreen(jobId: id)
                    case .settings:
                        SettingsView(showWelcome: { showWelcome = true }, showReauth: { showReauth = true })
                    case .component(let jobId, let componentId):
                        ComponentScreen(jobId: jobId, componentId: componentId)
                    case .signature(let jobId, let quoteId): SignatureScreen(jobId: jobId, quoteId: quoteId)
                    case .review(let jobId): ReviewScreen(jobId: jobId)
                    }
                }
            }
        }
    }

    /// Today's stops, in order. The jobs list's Today section until S8 builds the route.
    struct TodayView: View {
        var newJob: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var today: [JobView] = []

        var body: some View {
            let company = session.company
            List {
                Section {
                    SyncBarRow()
                    if let company, let tip = app.walkthrough.tip(screen: "jobs", company: company) {
                        TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) }
                    }
                }
                if today.isEmpty {
                    Section {
                        Text("Nothing on your route today.")
                            .font(.subheadline).foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity, minHeight: 88)
                    }
                } else {
                    Section {
                        ForEach(today) { job in
                            Button {
                                openRoute(.job(job.id))
                            } label: {
                                JobRow(job: job, timeZone: company?.timeZone ?? "America/Phoenix")
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await sync.syncNow() }
            .navigationTitle("Today")
            .toolbar {
                if let company, canMakeJobs(company.role, company.settings) {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: newJob) { Label("New Job", systemImage: "plus") }
                    }
                }
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")") {
                guard let company else { return }
                let views = (try? jobViews(sync.store, companyId: company.id)) ?? []
                today =
                    jobSections(views, now: Date(), timeZone: company.timeZone).first { $0.title == "Today" }?.jobs
                    ?? []
            }
        }
    }

    /// Placeholder until S8 builds the schedule.
    struct ScheduleTab: View {
        var body: some View {
            ContentUnavailableView(
                "Schedule", systemImage: "calendar",
                description: Text("The schedule comes to the app in the next test build.")
            )
            .navigationTitle("Schedule")
        }
    }

    /// Placeholder until S8 builds Messages.
    struct MessagesTab: View {
        var body: some View {
            ContentUnavailableView(
                "Messages", systemImage: "message",
                description: Text("Texts and calls come to the app in the next test build.")
            )
            .navigationTitle("Messages")
        }
    }

    /// Everything else: the person's account, this phone, and help. Settings until S8.
    struct MoreView: View {
        var showWelcome: () -> Void
        var showReauth: () -> Void

        var body: some View {
            SettingsView(showWelcome: showWelcome, showReauth: showReauth)
                .navigationTitle("More")
        }
    }
#endif
