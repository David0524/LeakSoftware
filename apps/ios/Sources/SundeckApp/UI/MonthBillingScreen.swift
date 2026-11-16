#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Invoices › Monthly Billing's rows (owner, 2026-11-15; was Maintenance to bill; website
    /// components/monthly-billing.tsx): a row per month with drafts to send or customers not
    /// invoiced yet, "October 2026" over "38 to send · $5,912.00", opening the month's page.
    struct MonthlyBillingSection: View {
        var months: [BillingMonth]

        var body: some View {
            Section {
                ForEach(months) { m in
                    NavigationLink(value: MoreRoute.billingMonth(m.month)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(billingMonthName(m.month)).font(.role(.bodyMedium)).foregroundStyle(Color.text)
                            Text(billingMonthDetail(m)).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .padding(.vertical, 4)
                    }
                    .surfaceRow()
                }
            } header: {
                SectionLabel("Monthly Billing")
            } footer: {
                Text(
                    "Each customer’s month is drafted on their invoice day. Review the drafts, add any charges, then send them all at once."
                )
                .textRole(.footnote)
                .foregroundStyle(Color.textMuted)
            }
        }
    }

    /// A month's Monthly Billing (owner, 2026-11-15; website invoices/month/[month] and
    /// components/month-billing.tsx): "October Billing" with "38 to send · $5,912.00" under it;
    /// Create Invoices for customers not invoiced yet; To Send | Sent; each draft's customer, its
    /// lines in short and how it will go, opening the customer's sheet (Remove, Add Charge, Open
    /// Invoice); and Send 38 Invoices after an alert. Read from the server (it needs a
    /// connection); a draft's lines change through the sync layer and show at once.
    struct MonthBillingScreen: View {
        var month: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute

        enum Tab: Hashable { case send, sent }

        /// `open`: a draft to open at once (a monthly draft tapped on Invoices). `sample`: the
        /// month as given, not read from the server (the screenshot run, which has no server).
        init(month: String, open: String? = nil, sample: MonthBilling? = nil) {
            self.month = month
            _open = State(initialValue: open)
            _server = State(initialValue: sample)
            self.sample = sample != nil
        }

        private let sample: Bool

        @State private var server: MonthBilling?
        @State private var loadError: String?
        @State private var tab: Tab?
        @State private var open: String?
        @State private var creating = false
        @State private var created: (text: String, error: Bool)?
        @State private var sending = false
        @State private var confirmSend = false
        @State private var result: SendAllResult?
        @State private var sendError: String?
        @State private var sentTicks = 0

        private var monthName: String { billingMonthName(month, withYear: false) }

        var body: some View {
            let company = session.company
            let manager = isManagerRole(company?.role)
            let _ = sync.revision
            let billing = company.flatMap { c in
                server.map {
                    localMonthBilling(
                        sync.store, companyId: c.id, $0,
                        taxRateBps: c.settings["tax_rate_bps"]?.number.map { Int($0) } ?? 0)
                }
            }
            List {
                if !manager {
                    Section { Notice(kind: .info, text: "Only owners and admins can bill the month.").plainListRow() }
                } else if let billing, let company {
                    content(billing, company)
                } else if let loadError {
                    Section {
                        VStack(alignment: .leading, spacing: 12) {
                            Notice(kind: .error, text: loadError)
                            Button("Try Again") { Task { await load() } }.buttonStyle(.secondary)
                        }
                        .plainListRow()
                    }
                } else {
                    Section { ProgressView().frame(maxWidth: .infinity, minHeight: 88).plainListRow() }
                }
            }
            .groupedList()
            .refreshable {
                await sync.syncNow()
                await load()
            }
            .navigationTitle("\(monthName) Billing")
            .navigationBarTitleDisplayMode(.large)
            .sheet(
                item: Binding(
                    get: { open.flatMap { id in billing?.drafts.first { $0.id == id } } },
                    set: { open = $0?.id })
            ) { invoice in
                if let company {
                    MonthCustomerSheet(
                        invoice: invoice, month: month, items: visitChargeItems(sync.store, companyId: company.id),
                        companyId: company.id
                    ) { jobId in
                        open = nil
                        openRoute(.jobSection(jobId, .wrapUp))
                    }
                }
            }
            .alert(
                billing.map { sendAllConfirm(routes($0), monthName: monthName).title } ?? "",
                isPresented: $confirmSend
            ) {
                Button("Cancel", role: .cancel) {}
                Button("Send") { Task { await sendAll() } }
            } message: {
                Text(billing.map { sendAllConfirm(routes($0), monthName: monthName).message } ?? "")
            }
            .sensoryFeedback(.success, trigger: sentTicks)
            .task(id: company?.id) { await load() }
        }

        private var texting: Bool {
            session.company.map { companyLine(sync.store, companyId: $0.id)?.status == "active" } ?? false
        }

        private func routes(_ b: MonthBilling) -> [SendRoute] { b.drafts.map { sendRoute($0, texting: texting) } }

        @ViewBuilder private func content(_ b: MonthBilling, _ company: CompanyContext) -> some View {
            let drafts = b.drafts
            let sent = b.sent
            let draftRoutes = self.routes(b)
            let sendable = draftRoutes.filter { $0 != .noContact }.count
            let failed = Dictionary(
                (result?.failed ?? []).map { ($0.id, $0.reason) }, uniquingKeysWith: { a, _ in a })
            let shown = tab ?? (!drafts.isEmpty || sent.isEmpty ? .send : .sent)
            Section {
                PageHeader(subtitle: monthBillingSubtitle(b)).plainListRow()
            }
            if let result {
                Section {
                    Notice(
                        kind: result.failed.isEmpty ? .success : .warning,
                        text: ([result.message] + result.failed.map { "\($0.customer): \($0.reason)" })
                            .joined(separator: "\n")
                    )
                    .plainListRow()
                }
            } else if let sendError {
                Section { Notice(kind: .error, text: sendError).plainListRow() }
            }
            if let text = notInvoicedText(b, formatDate: billingDayText) {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(text).textRole(.body).foregroundStyle(Color.text)
                        Button {
                            Task { await create(company) }
                        } label: {
                            BusyButtonLabel("Create Invoices", busy: creating, busyTitle: "Creating…")
                        }
                        .buttonStyle(.secondary)
                        .disabled(creating)
                        if let created { Notice(kind: created.error ? .error : .success, text: created.text) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                    .plainListRow()
                }
            }
            ListTopSection {
                Segmented(
                    selection: Binding(get: { shown }, set: { tab = $0 }), options: [Tab.send, .sent],
                    label: { $0 == .send ? "To Send \(drafts.count)" : "Sent \(sent.count)" }, title: "Show",
                    fillsWidth: true)
            }
            if shown == .send {
                if drafts.isEmpty {
                    Section {
                        EmptyState(
                            text: sent.isEmpty
                                ? "No \(monthName) invoices yet." : "Every \(monthName) invoice has been sent."
                        )
                        .plainListRow()
                    }
                } else {
                    Section {
                        ForEach(Array(drafts.enumerated()), id: \.element.id) { i, d in
                            Button {
                                open = d.id
                            } label: {
                                DraftRow(
                                    invoice: d, route: draftRoutes[i],
                                    reason: failed[d.id] ?? d.autoSendError.map(autoSendFailed))
                            }
                            .buttonStyle(.row)
                            .surfaceRow()
                            .listRowInsets(EdgeInsets())
                        }
                    } header: {
                        SectionLabel("To Send")
                    }
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Button {
                                confirmSend = true
                            } label: {
                                BusyButtonLabel(sendAllLabel(sendable), busy: sending, busyTitle: "Sending…")
                            }
                            .buttonStyle(.primary(fullWidth: true))
                            .disabled(sending || sendable == 0)
                            Text(
                                company.settings["send_monthly_invoices"]?.bool == true
                                    ? "\(MonthlyBillingText.sendAllFooter) \(MonthlyBillingText.autoSendOnFooter)"
                                    : MonthlyBillingText.sendAllFooter
                            )
                            .textRole(.footnote)
                            .foregroundStyle(Color.textMuted)
                            .padding(.horizontal, 16)
                        }
                        .plainListRow()
                    }
                }
            } else if sent.isEmpty {
                Section { EmptyState(text: "Nothing sent for \(monthName) yet.").plainListRow() }
            } else {
                let today = localDay(Date(), timeZone: company.timeZone)
                Section {
                    ForEach(sent) { s in
                        Button {
                            openRoute(.jobSection(s.jobId, .wrapUp))
                        } label: {
                            ListRow(
                                s.customer, detail: sentMonthInvoiceDetail(s, today: today),
                                value: formatCents(s.totalCents), emphasized: true, chevron: true)
                        }
                        .buttonStyle(.row)
                        .surfaceRow()
                        .listRowInsets(EdgeInsets())
                    }
                } header: {
                    SectionLabel("Sent")
                }
            }
        }

        // MARK: Server

        private func load() async {
            guard !sample else { return }
            guard let company = session.company, isManagerRole(company.role) else { return }
            do {
                server = try await MonthlyBillingServer.month(
                    LenientRPC(client: app.client), companyId: company.id, month: month)
                loadError = nil
            } catch {
                if server == nil { loadError = MonthlyBillingServer.message(error) }
            }
        }

        private func create(_ company: CompanyContext) async {
            guard !creating else { return }
            creating = true
            defer { creating = false }
            do {
                let text = try await MonthlyBillingServer.createInvoices(
                    LenientRPC(client: app.client), companyId: company.id, month: month)
                created = (text, false)
                await sync.syncNow()
                await load()
            } catch {
                created = (MonthlyBillingServer.message(error), true)
            }
        }

        private func sendAll() async {
            guard let company = session.company, !sending else { return }
            sending = true
            defer { sending = false }
            result = nil
            sendError = nil
            // Lines added here go to the server first, so what's sent is what's shown.
            await sync.syncNow()
            do {
                let r = try await MonthlyBillingServer.sendAll(app.api, companyId: company.id, month: month)
                result = r
                if r.sent > 0 { sentTicks += 1 }
                await sync.syncNow()
                await load()
            } catch {
                sendError = MonthlyBillingServer.message(error, sending: true)
            }
        }
    }

    /// A draft To Send: the customer, its lines in short, how it will go (or why it didn't), and
    /// the total.
    private struct DraftRow: View {
        var invoice: MonthBillingInvoice
        var route: SendRoute
        /// Why Send All didn't send it.
        var reason: String?

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(invoice.customer).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(linesSummary(invoice.lines))
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                        .lineLimit(1)
                    Text(reason ?? sendRouteLabel(route))
                        .textRole(.secondary)
                        .foregroundStyle(reason != nil || route == .noContact ? Color.warning : Color.textMuted)
                        .lineLimit(reason == nil ? 1 : nil)
                }
                Spacer(minLength: 0)
                Text(formatCents(invoice.totalCents))
                    .font(.role(.bodyEmphasis))
                    .monospacedDigit()
                    .foregroundStyle(Color.text)
                Chevron()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// A customer's draft on a month's page (website `CustomerSheet`): "October · $164.00", its
    /// lines (each item with Remove), Add Charge, and Open Invoice for the rest. Edits save at
    /// once through the sync layer, so the sheet has Done only.
    struct MonthCustomerSheet: View {
        var invoice: MonthBillingInvoice
        var month: String
        var items: [ChargeItem]
        var companyId: String
        var openInvoice: (String) -> Void
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var adding = false
        @State private var removing: MonthBillingLine?
        @State private var problem: String?
        @State private var banner: ResultBanner?

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("\(billingMonthName(month, withYear: false)) · \(formatCents(invoice.totalCents))")
                            .textRole(.body)
                            .monospacedDigit()
                            .foregroundStyle(Color.textMuted)
                        if let problem { Notice(kind: .error, text: problem) }
                        Grouped(label: "Lines") {
                            ForEach(invoice.lines) { l in
                                if l.kind == "item" {
                                    SwipeDeleteRow(name: l.description, title: "Remove", delete: { removing = l }) {
                                        lineRow(l, removable: true)
                                    }
                                } else {
                                    lineRow(l, removable: false)
                                }
                            }
                            AddChargeRow { adding = true }
                        }
                        Button("Open Invoice") { openInvoice(invoice.jobId) }
                            .buttonStyle(.secondary(fullWidth: true, size: .field))
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .background(Color.bg)
                .navigationTitle(invoice.customer)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }.fontWeight(.semibold)
                    }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .sheet(isPresented: $adding) {
                AddChargeSheet(items: items) { draft in
                    try MonthBillingWrites.addLine(sync, companyId: companyId, invoiceId: invoice.id, draft)
                    banner = ResultBanner(kind: .success, title: "Charge added.")
                }
            }
            .confirmationDialog(
                removing.map { "Remove “\($0.description)”?" } ?? "",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { l in
                Button("Remove", role: .destructive) { remove(l) }
                Button("Cancel", role: .cancel) {}
            }
            .resultBanner($banner)
        }

        /// A line: its description (and "2 each × $24.00"), the amount, and Remove for an item.
        private func lineRow(_ l: MonthBillingLine, removable: Bool) -> some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(l.description).textRole(.body).foregroundStyle(Color.text)
                    if let detail = monthLineDetail(l) {
                        Text(detail).textRole(.secondary).monospacedDigit().foregroundStyle(Color.textMuted)
                    }
                }
                Spacer(minLength: 0)
                Text(formatCents(chargeCents(l))).font(.role(.body)).monospacedDigit().foregroundStyle(Color.textMuted)
                if removable {
                    Button("Remove") { removing = l }
                        .buttonStyle(.quiet(size: .small))
                        .accessibilityLabel("Remove \(l.description)")
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, removable ? 4 : 16)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
        }

        private func remove(_ l: MonthBillingLine) {
            do {
                try MonthBillingWrites.removeLine(sync, companyId: companyId, lineId: l.id)
                problem = nil
                banner = ResultBanner(kind: .success, title: "Line removed.")
            } catch {
                problem = userMessage(error)
            }
        }
    }
#endif
