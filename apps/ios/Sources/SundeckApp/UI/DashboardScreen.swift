#if os(iOS)
    import Charts
    import Supabase
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    extension Color {
        /// color.role.chart: the brand blue for charts.
        static let chart = Color(Tokens.Role.chart)
    }

    /// More › Dashboard (owners and admins; owner, 2026-10-20: "Dashboard should be in the apps";
    /// website app/(office)/dashboard): four stat cards, collected by month as a chart, jobs by
    /// status (each opens Jobs on it), and each month in a grouped list. From the
    /// `owner_dashboard` RPC, so it needs a connection.
    struct DashboardScreen: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var data: DashboardData?
        @State private var loading = false
        @State private var step = 0
        @State private var failed: String?
        private let preview: Bool

        /// `data` shows those numbers without asking the server (screenshots).
        init(data: DashboardData? = nil) {
            _data = State(initialValue: data)
            preview = data != nil
        }

        var body: some View {
            ScreenScroll(spacing: 20) {
                if let data {
                    content(data)
                } else if let failed {
                    Notice(kind: .warning, text: failed)
                    Button("Try Again") { Task { await load() } }.buttonStyle(.secondary)
                } else {
                    ProgressSteps(steps: DashboardText.steps, current: step).card()
                }
            }
            .refreshable { await load() }
            .navigationTitle(DashboardText.title)
            .navigationBarTitleDisplayMode(.large)
            .task(id: session.company?.id) { await load() }
        }

        private struct Params: Encodable {
            var targetCompany: String
            var months: Int

            enum CodingKeys: String, CodingKey {
                case targetCompany = "target_company"
                case months
            }
        }

        private func load() async {
            guard let company = session.company, !loading, !preview else { return }
            loading = true
            defer { loading = false }
            step = 0
            failed = nil
            do {
                let reply: DashboardData = try await app.client.rpc(
                    "owner_dashboard", params: Params(targetCompany: company.id, months: DashboardText.months)
                ).execute().value
                step = 1
                withAnimation(Motion.smooth) { data = reply }
            } catch {
                if data == nil {
                    failed =
                        isNetworkFailure(String(describing: error))
                        ? DashboardText.offline : "The dashboard couldn’t load. \(String(describing: error))"
                }
            }
        }

        @ViewBuilder private func content(_ d: DashboardData) -> some View {
            let totals = dashboardTotals(d.months)
            Text(DashboardText.subtitle(d)).textRole(.body).foregroundStyle(Color.textMuted)
            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                GridRow {
                    StatCard(
                        label: DashboardText.collected, value: formatCents(totals.collectedCents),
                        note: "\(DashboardText.months) months")
                    NavigationLink(value: MoreRoute.invoicesFiltered(.open)) {
                        StatCard(
                            label: DashboardText.owed, value: formatCents(d.outstandingCents),
                            note: DashboardText.openInvoices, link: true)
                    }
                    .buttonStyle(.plain)
                }
                GridRow {
                    StatCard(
                        label: DashboardText.accepted, value: acceptanceRate(totals.quotesSent, totals.quotesAccepted),
                        note: "\(totals.quotesAccepted) of \(totals.quotesSent) sent")
                    StatCard(
                        label: DashboardText.invoiced, value: formatCents(totals.invoicedCents),
                        note: "\(DashboardText.months) months")
                }
            }
            collectedChart(d)
            jobsByStatus(d)
            Grouped(label: DashboardText.byMonth) {
                ForEach(d.months.reversed(), id: \.month) { m in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(monthLabel(m.month, long: true)).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            Text(DashboardText.monthQuotes(m)).textRole(.secondary).foregroundStyle(Color.textMuted)
                            Text(DashboardText.monthMoney(m)).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(formatCents(m.collectedCents)).textRole(.bodyEmphasis).monospacedDigit()
                                .foregroundStyle(Color.text)
                            Text("collected").textRole(.footnote).foregroundStyle(Color.textMuted)
                        }
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .accessibilityElement(children: .combine)
                }
            }
        }

        private func collectedChart(_ d: DashboardData) -> some View {
            VStack(alignment: .leading, spacing: 4) {
                CardTitle(DashboardText.collectedByMonth)
                Text(DashboardText.collectedNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                Chart(d.months, id: \.month) { m in
                    BarMark(
                        x: .value("Month", String(monthLabel(m.month).prefix(3))),
                        y: .value("Collected", Double(m.collectedCents) / 100)
                    )
                    .foregroundStyle(Color.chart)
                    .cornerRadius(4)
                    .accessibilityLabel(monthLabel(m.month, long: true))
                    .accessibilityValue(formatCents(m.collectedCents))
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) { Text("$\(Int(v))") }
                        }
                    }
                }
                .frame(height: 200)
                .padding(.top, 12)
            }
            .card()
        }

        private func jobsByStatus(_ d: DashboardData) -> some View {
            let rows = dashboardStatusRows(d)
            let most = max(1, rows.map(\.count).max() ?? 1)
            return VStack(alignment: .leading, spacing: 4) {
                CardTitle(DashboardText.jobsByStatus)
                Text(DashboardText.jobsNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                if rows.isEmpty {
                    EmptyState(text: DashboardText.noJobs)
                } else {
                    VStack(spacing: 0) {
                        ForEach(rows) { row in
                            NavigationLink(value: MoreRoute.jobs(row.filter)) {
                                HStack(spacing: 12) {
                                    Text(row.status.label).textRole(.secondary).foregroundStyle(Color.text)
                                        .frame(width: 140, alignment: .leading)
                                    GeometryReader { geo in
                                        Capsule().fill(Color.chart)
                                            .frame(width: max(4, geo.size.width * CGFloat(row.count) / CGFloat(most)))
                                            .frame(maxHeight: .infinity, alignment: .center)
                                    }
                                    .frame(height: 10)
                                    Text("\(row.count)").textRole(.bodyEmphasis).monospacedDigit()
                                        .foregroundStyle(Color.text)
                                        .frame(minWidth: 28, alignment: .trailing)
                                    Chevron()
                                }
                                .frame(minHeight: minTarget)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(row.status.label), \(row.count)")
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                    .padding(.top, 8)
                }
            }
            .card()
        }
    }

    private struct StatCard: View {
        var label: String
        var value: String
        var note: String
        var link = false

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).textRole(.secondary).foregroundStyle(Color.textMuted)
                Text(value)
                    .font(.custom(BrandFonts.Weight.bold.rawValue, size: 26, relativeTo: .title2))
                    .monospacedDigit()
                    .foregroundStyle(Color.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                HStack(spacing: 2) {
                    Text(note).textRole(.footnote).foregroundStyle(link ? Color.link : Color.textMuted)
                    if link {
                        Image(systemName: "chevron.right").font(.caption2.weight(.semibold)).foregroundStyle(Color.link)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .card(padding: 14)
            .accessibilityElement(children: .combine)
        }
    }
#endif
