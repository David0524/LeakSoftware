#if os(iOS)
    import Supabase
    import SundeckCore
    import SwiftUI
    import UIKit

    // Activity (owner, 2026-10-20: "Throw an activity feed in More. Consider tech's visibility
    // rules. Maybe have a shortcut to it on the owner's dashboard page."; docs/plans/
    // search-and-activity.md, section 2; website app/(office)/activity, components/activity-*).

    /// The Activity RPCs, called as the signed-in person like the Dashboard's `owner_dashboard`.
    @MainActor enum ActivityServer {
        static func page(_ client: SupabaseClient, company: String, after: ActivityEvent? = nil, size: Int)
            async throws -> ActivityPage
        {
            try await client.rpc(
                "activity_feed", params: ActivityFeedParams(company: company, after: after, pageSize: size)
            ).execute().value
        }

        /// Whether there are events since this person last opened Activity; nil without an answer.
        static func unread(_ client: SupabaseClient, company: String) async -> Bool? {
            do {
                let unread: Bool = try await client.rpc(
                    "activity_unread", params: ActivityUnreadParams(company: company)
                ).execute().value
                return unread
            } catch {
                return nil
            }
        }

        /// This person opened Activity: the dot goes away.
        static func markSeen(_ client: SupabaseClient) async -> Bool {
            do {
                try await client.rpc("mark_activity_seen").execute()
                return true
            } catch {
                return false
            }
        }
    }

    /// More › Activity: what happened in the shop, newest first, under day headers; 50 at a time,
    /// the next 50 loading as the end scrolls into view (or with Show More). Opening it clears the
    /// dot on More and on the Activity row. Read from the server, so it needs a connection.
    struct ActivityScreen: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(ActivityBadge.self) private var badge: ActivityBadge?
        @State private var log: ActivityLog?
        @State private var failed = false
        @State private var loadingMore = false
        @State private var moreFailed = false

        var body: some View {
            ScreenScroll {
                if let log {
                    if log.events.isEmpty {
                        EmptyState(text: ActivityText.empty)
                    } else {
                        let days =
                            (try? groupActivity(log.events, now: Date(), timeZone: session.company?.timeZone ?? "UTC"))
                            ?? []
                        ForEach(days) { day in
                            Grouped(label: day.title) {
                                ForEach(day.rows) { row in ActivityRowButton(row: row) }
                            }
                        }
                        footer(log)
                    }
                } else if failed {
                    EmptyState(text: ActivityText.offline)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
                }
            }
            .refreshable { await load() }
            .navigationTitle(ActivityText.title)
            .navigationBarTitleDisplayMode(.large)
            .task(id: session.company?.id) {
                await load()
                if log != nil, await ActivityServer.markSeen(app.client) { badge?.unread = false }
            }
        }

        /// More loads as this scrolls into view; Show More is the visible way to ask.
        @ViewBuilder private func footer(_ log: ActivityLog) -> some View {
            VStack(spacing: 8) {
                if moreFailed {
                    Text(ActivityText.offline).textRole(.body).foregroundStyle(Color.textMuted)
                        .multilineTextAlignment(.center)
                }
                if log.more {
                    Button(loadingMore ? "Loading…" : "Show More") { Task { await loadMore() } }
                        .buttonStyle(.secondary)
                        .disabled(loadingMore)
                        .onAppear {
                            if !moreFailed { Task { await loadMore() } }
                        }
                }
            }
            .frame(maxWidth: .infinity)
        }

        private func load() async {
            guard let company = session.company else { return }
            do {
                let page = try await ActivityServer.page(app.client, company: company.id, size: ActivityText.pageSize)
                log = ActivityLog(page)
                failed = false
                moreFailed = false
            } catch {
                if log == nil { failed = true }
            }
        }

        private func loadMore() async {
            guard let company = session.company, let after = log?.next, !loadingMore else { return }
            loadingMore = true
            defer { loadingMore = false }
            do {
                let page = try await ActivityServer.page(
                    app.client, company: company.id, after: after, size: ActivityText.pageSize)
                log?.append(page)
                moreFailed = false
            } catch {
                moreFailed = true
            }
        }
    }

    /// One event in an inset grouped list: the kind's round symbol, the title, the detail, and
    /// the time in secondary text; tapping opens the job or the conversation.
    struct ActivityRowButton: View {
        var row: ActivityRow
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            if let open = row.open {
                Button {
                    switch open.screen {
                    case .job: openRoute(.job(open.id))
                    case .conversation: openRoute(.messages(.conversation(open.id)))
                    }
                } label: {
                    content
                }
                .buttonStyle(.row)
            } else {
                content
            }
        }

        private var content: some View {
            HStack(alignment: .center, spacing: 12) {
                ActivityIcon(symbol: row.symbol)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    if let detail = row.detail {
                        Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(row.time).textRole(.secondary).foregroundStyle(Color.textMuted)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 2)
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// The round symbol for an event's kind: `link` on `link` at 10%, 36 across.
    struct ActivityIcon: View {
        var symbol: ActivitySymbol

        var body: some View {
            Image(systemName: Self.name(symbol))
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.link)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.link.opacity(0.1)))
                .accessibilityHidden(true)
        }

        static func name(_ symbol: ActivitySymbol) -> String {
            switch symbol {
            case .quote: "doc.text"
            case .payment: "dollarsign"
            case .signature: "signature"
            case .report: "paperplane"
            case .done: "checkmark"
            case .person: "person"
            case .calendar: "calendar"
            case .text: "message"
            }
        }
    }

    /// Something new (Activity), as iOS marks it: a small dot in the tint color, read as "New
    /// activity".
    struct ActivityDot: View {
        var body: some View {
            Circle().fill(Color.brandPrimary).frame(width: 10, height: 10)
                .accessibilityLabel(activityDotLabel)
        }
    }

    /// The Dashboard's Activity button, at the trailing side of the navigation bar (owner,
    /// 2026-10-21: "make activity a dropdown on the right side at the same level as the title
    /// text"): a tinted pill with a chevron, and the blue dot when something is new, as the
    /// website's.
    struct ActivityBarButton: View {
        var action: () -> Void
        @Environment(ActivityBadge.self) private var badge: ActivityBadge?

        var body: some View {
            let unread = badge?.unread == true
            Button(action: action) {
                HStack(spacing: 6) {
                    if unread { Circle().fill(Color.brandPrimary).frame(width: 10, height: 10) }
                    Text(ActivityText.title).textRole(.bodyEmphasis)
                    Image(systemName: "chevron.down").font(.footnote.weight(.semibold))
                }
                .padding(.horizontal, 14)
                .frame(minHeight: minTarget)
            }
            .buttonStyle(ActivityPillStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ActivityText.buttonLabel(unread: unread))
            .accessibilityAddTraits(.isButton)
        }
    }

    private struct ActivityPillStyle: ButtonStyle {
        @Environment(\.drawsGlass) private var drawsGlass

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .foregroundStyle(Color.link)
                .background {
                    // On iOS 26 the toolbar puts the button on its own glass.
                    if !usesGlass(drawsGlass) {
                        Capsule().fill(configuration.isPressed ? Color.tintedPressed : Color.tinted)
                    }
                }
                .contentShape(Capsule())
        }
    }

    /// The Dashboard's Activity sheet (owners and admins): the latest 3 events, then See All
    /// (owner, 2026-10-20: "a shortcut to it on the owner's dashboard page").
    struct LatestActivitySheet: View {
        var page: ActivityPage?
        var failed: Bool
        @Environment(\.openRoute) private var openRoute
        @Environment(\.dismiss) private var dismiss

        var body: some View {
            NavigationStack {
                ScrollView {
                    LatestActivityRows(page: page, failed: failed) { route in
                        dismiss()
                        openRoute(route)
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle(ActivityText.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
        }
    }

    /// The sheet's rows and See All; `open` closes the sheet and opens a route behind it.
    struct LatestActivityRows: View {
        var page: ActivityPage?
        var failed: Bool
        var open: (Route) -> Void
        @Environment(Session.self) private var session

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                if let page {
                    if page.events.isEmpty {
                        EmptyState(text: ActivityText.empty)
                    } else {
                        let zone = session.company?.timeZone ?? "UTC"
                        let now = Date()
                        Grouped {
                            ForEach(page.events.prefix(ActivityText.dashboardCount)) { e in
                                if let row = try? activityRow(e, now: now, timeZone: zone) {
                                    ActivityRowButton(row: row)
                                }
                            }
                        }
                        .environment(\.openRoute, open)
                    }
                } else if failed {
                    EmptyState(text: ActivityText.offline)
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: minTarget)
                }
                Button(SearchText.seeAll) { open(.more(.activity)) }
                    .buttonStyle(.quiet)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("\(SearchText.seeAll) \(ActivityText.title)")
            }
        }
    }

    /// The More tab's icon with the Activity dot at its top right (the website's phone tab bar).
    /// The tab bar tints it with the icon.
    @MainActor enum DottedTabIcon {
        private static var cache: [Bool: UIImage] = [:]

        static func image(_ base: UIImage, filled: Bool) -> UIImage {
            if let cached = cache[filled] { return cached }
            let format = UIGraphicsImageRendererFormat()
            format.opaque = false
            format.scale = base.scale
            let size = base.size
            let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
                base.draw(at: .zero)
                let d = size.width * 0.3
                let dot = CGRect(x: size.width - d, y: 0, width: d, height: d)
                let cg = context.cgContext
                // A gap around the dot, so it reads apart from the icon.
                cg.setBlendMode(.clear)
                cg.fillEllipse(in: dot.insetBy(dx: -2, dy: -2))
                cg.setBlendMode(.normal)
                cg.setFillColor(UIColor.black.cgColor)
                cg.fillEllipse(in: dot)
            }
            let template = image.withRenderingMode(.alwaysTemplate)
            cache[filled] = template
            return template
        }
    }
#endif
