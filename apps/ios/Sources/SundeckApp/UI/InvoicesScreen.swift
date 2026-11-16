#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// More › Invoices (spec 5.10; website app/(office)/invoices): the shop's invoices on this
    /// phone, newest first. A row opens its job (Wrap-Up has the invoice). Managers export the
    /// invoices or payments as CSV through the share sheet.
    struct InvoicesScreen: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var list: [InvoiceListItem] = []
        @State private var loaded = false
        @State private var shared: SharedFile?
        @State private var months: [BillingMonth] = []
        @State private var filter: InvoiceFilter
        @State private var sort = InvoiceSort.newest
        @State private var search = ""
        /// Each row's link, Record Payment and Void, read with the list (gestures spec section 12).
        @State private var rowActions: [String: InvoiceRowActions] = [:]
        @State private var banner: ResultBanner?
        /// Bumped when a payment is recorded here, for its tap.
        @State private var paid = 0
        /// Record Payment from a row, in a sheet (amount, Paid by, a check's number).
        @State private var paying: InvoiceListItem?
        @State private var voiding: InvoiceListItem?
        /// Send Receipt: after Record Payment (that payment), or from a row's menu (the latest).
        @State private var receipt: ReceiptStart?

        /// `filter` opens on one (the dashboard's Owed to you opens Unpaid); All by default.
        init(filter: InvoiceFilter = .all) { _filter = State(initialValue: filter) }

        var body: some View {
            let company = session.company
            let manager = isManagerRole(company?.role)
            let timeZone = company?.timeZone ?? "America/Phoenix"
            List {
                // The subtitle and the export buttons are separate rows: in a List, a row holding
                // both cut off the subtitle's first character (owner, 2026-11-16: "3 open" read
                // "ɜ open"; the screenshot probe showed it only with buttons in the row).
                Section {
                    PageHeader(subtitle: invoicesSubtitle(list)).plainListRow()
                    if manager {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 12) { exportButtons }
                            VStack(alignment: .leading, spacing: 12) { exportButtons }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 12)
                        .plainListRow()
                    }
                }
                // Monthly Billing (owner, 2026-11-15; was Maintenance to bill): pool shops' months
                // with drafts to send or customers not invoiced yet.
                if manager, company.map({ offersPool($0.settings) }) == true, !months.isEmpty {
                    MonthlyBillingSection(months: months)
                }
                let today = localDay(Date(), timeZone: timeZone)
                let shown = shownInvoices(list, filter: filter, sort: sort, q: search, today: today)
                if loaded && list.isEmpty {
                    Section {
                        EmptyState(text: "No invoices yet. Create one from a job once the work is done.").plainListRow()
                    }
                } else {
                    // Filters with counts, in a sideways row (owner, 2026-10-20).
                    Section {
                        FilterPills(
                            selection: $filter, options: InvoiceFilter.allCases,
                            label: { "\($0.label) \(invoiceFilterCount(list, $0, today: today))" }
                        )
                        .padding(.horizontal, -16)
                        .accessibilityLabel("Show")
                        .plainListRow()
                    }
                    if loaded && shown.isEmpty {
                        Section {
                            VStack(alignment: .leading, spacing: 8) {
                                EmptyState(text: invoicesEmptyText(search))
                                Button("Show All") {
                                    filter = .all
                                    search = ""
                                }
                                .buttonStyle(.quiet)
                                .padding(.leading, -20)
                            }
                            .plainListRow()
                        }
                    }
                    Section {
                        ForEach(shown) { item in
                            Button {
                                open(item)
                            } label: {
                                InvoiceRow(item: item, timeZone: timeZone, today: today)
                            }
                            .buttonStyle(.row)
                            .surfaceRow()
                            .listRowInsets(EdgeInsets())
                            // Swipe right for Record Payment on an unpaid invoice; touch and hold
                            // for the menu. The invoice's card has each (gestures spec 12).
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                if rowActions[item.id]?.rules.canRecordPayment == true {
                                    Button("Record Payment", systemImage: "dollarsign.circle") { startPayment(item) }
                                        .tint(Color.pass)
                                }
                            }
                            .rowMenu(menuTitle(item), menu(item))
                        }
                    }
                }
            }
            .groupedList()
            .refreshable {
                await sync.syncNow()
                await loadMonths()
            }
            .navigationTitle("Invoices")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $search, prompt: "Customer, invoice, or job number")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sort) {
                            ForEach(InvoiceSort.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                            .frame(width: minTarget, height: minTarget)
                    }
                    .accessibilityLabel("Sort, \(sort.label)")
                }
            }
            .sheet(item: $shared) { FileShareSheet(url: $0.url) }
            .resultBanner($banner)
            .haptic(.paymentRecorded, trigger: paid)
            .sheet(item: $paying) { item in
                if let company = session.company {
                    RecordPaymentSheet(
                        title: menuTitle(item), invoice: item.invoice,
                        flow: InvoiceFlow(sync: sync, companyId: company.id, jobId: item.invoice.jobId)
                    ) { flow in
                        paying = nil
                        guard let flow else { return }
                        paid += 1
                        if let message = flow.message { banner = ResultBanner(kind: .success, title: message) }
                        // Send Receipt once Record Payment's sheet has gone.
                        Task {
                            try? await Task.sleep(for: .milliseconds(450))
                            receipt = flow.receipt
                        }
                    }
                }
            }
            .sendReceiptSheet(
                $receipt, email: receiptContact?["email"]?.string, phone: receiptContact?["phone"]?.string,
                texting: session.company.map { companyLine(sync.store, companyId: $0.id)?.status == "active" } ?? false
            ) { sent in banner = ResultBanner(kind: .success, title: sent) }
            .confirmationDialog(
                InvoiceCardModel.voidTitle,
                isPresented: Binding(get: { voiding != nil }, set: { if !$0 { voiding = nil } }),
                titleVisibility: .visible, presenting: voiding
            ) { item in
                Button("Void Invoice", role: .destructive) { Task { await void(item) } }
                Button("Cancel", role: .cancel) {}
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")") { reload() }
            .task { await loadMonths() }
        }

        @ViewBuilder private var exportButtons: some View {
            Button("Export Invoices") { export("invoices") }.buttonStyle(.secondary)
            Button("Export Payments") { export("payments") }.buttonStyle(.secondary)
        }

        private func reload() {
            guard let company = session.company else { return }
            list = invoiceList(sync.store, companyId: company.id)
            rowActions = invoiceRowActions(
                sync.store, companyId: company.id, list: list, role: company.role)
            loaded = true
        }

        // MARK: Row actions (gestures spec section 12)

        /// "Grace Holloway · Invoice #1026".
        private func menuTitle(_ item: InvoiceListItem) -> String {
            (item.customer ?? "Customer") + (item.invoice.number.map { " · Invoice #\($0)" } ?? " · Draft invoice")
        }

        /// Open, Copy Payment Link, Record Payment, Void… (Send Reminder isn't on the phone).
        private func menu(_ item: InvoiceListItem) -> [SwipeAction] {
            let actions = rowActions[item.id]
            var list = [
                SwipeAction(title: "Open", systemImage: "arrow.up.right", tint: Color.link) { open(item) }
            ]
            if let link = actions?.link {
                list.append(
                    SwipeAction(title: "Copy Payment Link", systemImage: "link", tint: Color.link) {
                        UIPasteboard.general.url = link
                        banner = ResultBanner(kind: .success, title: "Payment link copied.")
                    })
            }
            if actions?.rules.canRecordPayment == true {
                list.append(
                    SwipeAction(title: "Record Payment", systemImage: "dollarsign.circle", tint: Color.pass) {
                        startPayment(item)
                    })
            }
            if let summary = actions?.receiptSummary {
                list.append(
                    SwipeAction(title: ReceiptText.send, systemImage: "doc.text", tint: Color.link) {
                        receipt = ReceiptStart(invoiceId: item.invoice.id, summary: summary)
                    })
            }
            if actions?.rules.canVoid == true {
                list.append(
                    SwipeAction(title: "Void…", systemImage: "xmark.circle", tint: Color.fail, role: .destructive) {
                        voiding = item
                    })
            }
            return list
        }

        /// A monthly draft opens on its month's page, with the rest to send (owner, 2026-11-15);
        /// anything else on its job's Wrap-Up.
        private func open(_ item: InvoiceListItem) {
            if let month = item.invoice.periodMonth, item.invoice.status == .draft,
                offersPool(session.company?.settings), isManagerRole(session.company?.role)
            {
                openRoute(.more(.billingMonth(String(month.prefix(10)), open: item.invoice.id)))
            } else {
                openRoute(.jobSection(item.invoice.jobId, .wrapUp))
            }
        }

        private func startPayment(_ item: InvoiceListItem) {
            paying = item
        }

        /// The customer of the invoice Send Receipt is for (its email and phone to start).
        private var receiptContact: Row? {
            guard let receipt, let company = session.company,
                let item = list.first(where: { $0.invoice.id == receipt.invoiceId }),
                let view = try? jobView(sync.store, companyId: company.id, jobId: item.invoice.jobId)
            else { return nil }
            return view.customer
        }

        /// The card's Void Invoice, after the same question.
        private func void(_ item: InvoiceListItem) async {
            guard let company = session.company else { return }
            let flow = InvoiceFlow(sync: sync, companyId: company.id, jobId: item.invoice.jobId)
            await flow.void(item.invoice.id, draft: false, rpc: LenientRPC(client: app.client))
            show(flow)
        }

        private func show(_ flow: InvoiceFlow) {
            if let error = flow.error {
                banner = ResultBanner(kind: .error, title: error)
            } else if let message = flow.message {
                banner = ResultBanner(kind: .success, title: message)
            }
        }

        /// Writes the CSV from the phone's rows and opens the share sheet.
        private func export(_ kind: String) {
            guard let company = session.company else { return }
            let text =
                kind == "payments"
                ? paymentsCSV(sync.store, companyId: company.id) : invoicesCSV(sync.store, companyId: company.id)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(exportFileName(kind))
            guard (try? Data(text.utf8).write(to: url)) != nil else { return }
            shared = SharedFile(url: url)
        }

        /// Monthly Billing's months (managers at pool shops; needs a signal, else they stay as
        /// they were).
        private func loadMonths() async {
            guard let company = session.company, isManagerRole(company.role), offersPool(company.settings) else {
                return
            }
            if let rows = try? await MonthlyBillingServer.months(LenientRPC(client: app.client), companyId: company.id)
            {
                months = rows
            }
        }
    }

    /// An invoice: the customer, "#1026 · Job #1072", "Sent · sent Oct 17, 2026 · $375.00 due",
    /// and the total.
    struct InvoiceRow: View {
        var item: InvoiceListItem
        var timeZone: String
        var today: String? = nil

        var body: some View {
            let lines = invoiceRowLines(item, timeZone: timeZone, today: today)
            let overdue = today.map { invoiceOverdue(item.filterItem, $0) } == true
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.customer ?? "Customer").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(lines.0).textRole(.secondary).foregroundStyle(Color.textMuted)
                    // An overdue invoice says so in red (owner, 2026-10-20).
                    if overdue {
                        (Text("Overdue").fontWeight(.semibold).foregroundStyle(Color.fail)
                            + Text(lines.1.dropFirst("Overdue".count)).foregroundStyle(Color.textMuted))
                            .textRole(.secondary)
                    } else {
                        Text(lines.1).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                Spacer(minLength: 0)
                Text(formatCents(item.invoice.totalCents))
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
#endif
