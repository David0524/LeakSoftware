#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Where the Messages tab goes: a conversation, a new message, a customer's page.
    enum MessagesRoute: Hashable {
        case conversation(String)
        /// New Message, to a customer when started from one.
        case newMessage(customerId: String?)
        case customer(String)
    }

    /// The shop's shared inbox (spec 5.7; website app/(office)/messages, components/inbox.tsx):
    /// every text and call with customers on the company number, the same list the office sees.
    /// Unread is shared by the whole team.
    struct MessagesScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var list: [Conversation] = []
        @State private var line: PhoneLine?
        @State private var loaded = false
        @Environment(\.openRoute) private var openRoute
        @State private var browser: BrowserPage?
        /// What a row's Call or menu did, at the top.
        @State private var banner: ResultBanner?

        var body: some View {
            let company = session.company
            let working = line?.status == "active"
            List {
                Section {
                    if let line, working {
                        PageHeader(subtitle: "Your company number: \(formatPhone(line.number))").plainListRow()
                    }
                }
                if let company, let tip = screenTip("messages", company: company, app: app) {
                    Section {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                            .plainListRow()
                    }
                }
                if loaded, let notice = lineNotice(line, manager: isManagerRole(company?.role)) {
                    Section {
                        Notice(kind: .info, text: notice.text, link: notice.link) {
                            openRoute(.more(.settingsPage(.phone)))
                        }
                        .plainListRow()
                    }
                }
                if loaded && list.isEmpty {
                    Section {
                        EmptyState(text: "No messages yet. Texts and calls to the company number show up here.")
                            .plainListRow()
                    }
                } else {
                    Section {
                        ForEach(list) { conversation in
                            ConversationRow(
                                conversation: conversation, timeZone: company?.timeZone ?? "America/Phoenix"
                            )
                            .surfaceRow()
                            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                            .alignmentGuide(.listRowSeparatorLeading) { _ in 18 }
                            // Swipe left for Read or Unread (for the team), right to call from
                            // the company number; touch and hold for the menu (gestures spec 12).
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(conversation.unread ? "Read" : "Unread") { toggle(conversation) }
                                    .tint(Color.link)
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                if working {
                                    Button("Call", systemImage: "phone.fill") { Task { await call(conversation) } }
                                        .tint(Color.pass)
                                }
                            }
                            .rowMenu(conversation.name, menu(conversation, working: working))
                        }
                    }
                }
            }
            .groupedList()
            .refreshable { await sync.syncNow() }
            .rootTitleScroll()
            .rootTitle("Messages", trailingButtons: working ? 1 : 0)
            .toolbar {
                if working {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: MessagesRoute.newMessage(customerId: nil)) {
                            Image(systemName: "square.and.pencil")
                                .font(.system(size: 20, weight: .medium))
                                .frame(width: minTarget, height: minTarget)
                        }
                        .accessibilityLabel("New Message")
                    }
                }
            }
            .browserSheet($browser)
            .resultBanner($banner)
            .task(id: "\(sync.revision)|\(company?.id ?? "")") { reload() }
            // Refreshes on open and every 20 seconds while showing (until push notifications exist).
            .task {
                while !Task.isCancelled {
                    await sync.syncNow()
                    try? await Task.sleep(for: .seconds(20))
                }
            }
            .sensoryFeedback(.selection, trigger: list.map(\.unread))
        }

        private func reload() {
            guard let company = session.company else { return }
            list = conversations(sync.store, companyId: company.id)
            line = companyLine(sync.store, companyId: company.id)
            loaded = true
        }

        /// Open, Call, Mark Read or Mark Unread, Open Customer.
        private func menu(_ c: Conversation, working: Bool) -> [SwipeAction] {
            var list = [
                SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link) {
                    openRoute(.messages(.conversation(c.id)))
                }
            ]
            if working {
                list.append(
                    SwipeAction(title: "Call", systemImage: "phone", tint: Color.pass) { Task { await call(c) } })
            }
            list.append(
                SwipeAction(
                    title: c.unread ? "Mark Read" : "Mark Unread",
                    systemImage: c.unread ? "envelope.open" : "envelope.badge", tint: Color.link
                ) { toggle(c) })
            if let customerId = c.customerId {
                list.append(
                    SwipeAction(title: "Open Customer", systemImage: "person.crop.circle", tint: Color.link) {
                        openRoute(.messages(.customer(customerId)))
                    })
            }
            return list
        }

        /// The conversation's Call: the company number rings this person, then connects them.
        private func call(_ c: Conversation) async {
            do {
                let result = try await TextingServer(sync: sync, api: app.api).call(conversationId: c.id)
                banner = ResultBanner(kind: .success, title: callResultText(calling: result.calling, demo: result.demo))
            } catch {
                banner = ResultBanner(kind: .error, title: String(describing: error))
            }
        }

        private func toggle(_ conversation: Conversation) {
            guard let company = session.company else { return }
            try? MessagingWrites.setUnread(sync, companyId: company.id, conversation.id, !conversation.unread)
        }
    }

    /// The screens the Messages tab pushes.
    struct MessagesDestination: View {
        var route: MessagesRoute

        var body: some View {
            switch route {
            case .conversation(let id): ConversationScreen(conversationId: id)
            case .newMessage(let customerId): NewMessageScreen(customerId: customerId)
            case .customer(let id): CustomerScreen(customerId: id)
            }
        }
    }

    /// One conversation in the inbox: the unread dot, the name (semibold when unread) with the
    /// time, and the last message under it. No chevron, as in Messages.
    struct ConversationRow: View {
        var conversation: Conversation
        var timeZone: String

        var body: some View {
            let c = conversation
            ZStack {
                NavigationLink(value: MessagesRoute.conversation(c.id)) { EmptyView() }.opacity(0)
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(c.unread ? Color.link : .clear)
                        .frame(width: 10, height: 10)
                        .padding(.top, 8)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(c.name)
                                .textRole(c.unread ? .bodyEmphasis : .body)
                                .foregroundStyle(Color.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Text(inboxTime(c.lastAt, timeZone: timeZone))
                                .textRole(.secondary)
                                .foregroundStyle(Color.textMuted)
                                .lineLimit(1)
                                .fixedSize()
                        }
                        Text(c.lastPreview ?? "")
                            .textRole(.secondary)
                            .foregroundStyle(Color.textMuted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: minTarget - 20, alignment: .leading)
                .contentShape(Rectangle())
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                [c.name, c.unread ? "unread" : nil, c.lastPreview].compactMap { $0 }.joined(separator: ", ")
            )
            .accessibilityHint("Opens the conversation")
            .accessibilityAddTraits(.isButton)
        }
    }

    /// A screen's tip: the app's own, else the website's for the same screen (spec 3.11).
    @MainActor
    func screenTip(_ screen: String, company: CompanyContext, app: AppEnvironment) -> Tip? {
        app.walkthrough.tip(screen: screen, company: company)
            ?? tipFor(
                platform: .web, screen: screen, role: company.role, services: company.services,
                seen: app.walkthrough.seen)
    }
#endif
