#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The app's sections, as the website's phone tab bar: Today, Jobs, Schedule, Messages, More.
    enum AppTab: String, Hashable, CaseIterable {
        case today, jobs, schedule, messages, more

        var title: String {
            switch self {
            case .today: "Today"
            case .jobs: "Jobs"
            case .schedule: "Schedule"
            case .messages: "Messages"
            case .more: "More"
            }
        }

        /// The website's drawing for the tab (spec 3.2).
        var symbol: TabSymbol {
            switch self {
            case .today: .today
            case .jobs: .jobs
            case .schedule: .schedule
            case .messages: .messages
            case .more: .more
            }
        }
    }

    /// The signed-in app: a tab bar, each tab with its own navigation stack, and the sheets
    /// presented over everything. The website's phone layout (owner, 2026-10-19).
    struct MainView: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var tab: AppTab = .today
        @State private var paths: [AppTab: NavigationPath] = [:]
        @State private var showWelcome = false
        @State private var showReauth = false
        @State private var editor: EditorSheet?
        /// Unread conversations, the Messages tab's badge.
        @State private var unread = 0
        /// Job rows and stop cards zoom into the job page.
        @Namespace private var zoom
        @Environment(SyncService.self) private var sync

        var body: some View {
            TabView(selection: $tab) {
                Tab(value: AppTab.today) {
                    stack(.today) { TodayScreen() }
                } label: {
                    tabLabel(.today)
                }
                Tab(value: AppTab.jobs) {
                    stack(.jobs) { JobsView() }
                } label: {
                    tabLabel(.jobs)
                }
                Tab(value: AppTab.schedule) {
                    stack(.schedule) { ScheduleScreen() }
                } label: {
                    tabLabel(.schedule)
                }
                Tab(value: AppTab.messages) {
                    stack(.messages) { MessagesScreen() }
                } label: {
                    tabLabel(.messages)
                }
                .badge(badgeText(unread).map { Text($0) })
                Tab(value: AppTab.more) {
                    stack(.more) { MoreScreen(showWelcome: { showWelcome = true }, showReauth: { showReauth = true }) }
                } label: {
                    tabLabel(.more)
                }
            }
            .tint(Color.link)
            .modifier(MinimizingTabBar())
            .environment(\.zoomNamespace, zoom)
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") {
                guard let company = session.company else { return }
                unread = conversations(sync.store, companyId: company.id).filter(\.unread).count
            }
            .environment(\.openRoute) { paths[tab, default: NavigationPath()].append($0) }
            .environment(\.replaceRoute) { route in
                var path = paths[tab, default: NavigationPath()]
                if !path.isEmpty { path.removeLast() }
                path.append(route)
                paths[tab] = path
            }
            .environment(\.openTab) { next in
                paths[next] = NavigationPath()
                tab = next
            }
            .environment(\.openEditor) { editor = $0 }
            .sheet(item: $editor) { sheet in
                switch sheet {
                case .test(let jobId, let testId, let typeId, let componentId):
                    TestEditor(jobId: jobId, testId: testId, typeId: typeId, componentId: componentId)
                case .finding(let jobId, let findingId, let componentId):
                    FindingEditor(jobId: jobId, findingId: findingId, componentId: componentId)
                }
            }
            .sheet(isPresented: $showWelcome) { WelcomeView() }
            .sheet(isPresented: $showReauth) { ReauthView() }
            .onAppear {
                if !app.walkthrough.launchSeen { showWelcome = true }
            }
        }

        /// A tab's icon (filled when selected, as on the website) over its name.
        private func tabLabel(_ item: AppTab) -> some View {
            Label {
                Text(item.title)
            } icon: {
                Image(uiImage: item.symbol.image(filled: tab == item))
            }
            .accessibilityLabel(
                [item.title, item == .messages ? unreadAccessibilityText(unread) : nil].compactMap { $0 }
                    .joined(separator: ", "))
        }

        /// A tab's navigation stack, with every screen a tab can push: the app's routes, and the
        /// Messages and More screens' own (pushed by their links from any tab).
        private func stack<Root: View>(_ tab: AppTab, @ViewBuilder root: () -> Root) -> some View {
            NavigationStack(path: Binding(get: { paths[tab] ?? NavigationPath() }, set: { paths[tab] = $0 })) {
                root()
                    .navigationDestination(for: Route.self) { route in
                        switch route {
                        case .job(let id): JobScreen(jobId: id).zoomDestination(id)
                        case .jobSection(let id, let section):
                            JobScreen(jobId: id, section: section).zoomDestination(id)
                        case .sync:
                            SettingsView(showWelcome: { showWelcome = true }, showReauth: { showReauth = true })
                        case .messages(let route): MessagesDestination(route: route)
                        case .more(let route): MoreDestination(route: route, showReauth: { showReauth = true })
                        case .component(let jobId, let componentId):
                            ComponentScreen(jobId: jobId, componentId: componentId)
                        case .signature(let jobId, let quoteId): SignatureScreen(jobId: jobId, quoteId: quoteId)
                        case .review(let jobId): ReviewScreen(jobId: jobId)
                        case .newJob(let back): NewJobRoute(back: back)
                        }
                    }
                    .navigationDestination(for: MessagesRoute.self) { MessagesDestination(route: $0) }
                    .navigationDestination(for: MoreRoute.self) {
                        MoreDestination(route: $0, showReauth: { showReauth = true })
                    }
            }
            .environment(\.zoomScope, tab.rawValue)
        }
    }

    /// On iOS 26 the Liquid Glass tab bar shrinks to the current tab while scrolling down a long
    /// page and comes back on scrolling up.
    private struct MinimizingTabBar: ViewModifier {
        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content.tabBarMinimizeBehavior(.onScrollDown)
            } else {
                content
            }
        }
    }
#endif
