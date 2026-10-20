#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

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
        @State private var unbilled: [UnbilledMonth] = []
        @State private var filter = InvoiceFilter.all
        @State private var sort = InvoiceSort.newest
        @State private var search = ""

        var body: some View {
            let company = session.company
            let manager = isManagerRole(company?.role)
            let timeZone = company?.timeZone ?? "America/Phoenix"
            List {
                Section {
                    PageHeader {
                        Text(invoicesSubtitle(list))
                    } actions: {
                        if manager {
                            Button("Export Invoices") { export("invoices") }.buttonStyle(.secondary)
                            Button("Export Payments") { export("payments") }.buttonStyle(.secondary)
                        }
                    }
                    .plainListRow()
                }
                if let company, let tip = screenTip("invoices", company: company, app: app) {
                    Section {
                        TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                            .plainListRow()
                    }
                }
                if manager, company?.services != .leak, !unbilled.isEmpty {
                    Section {
                        ForEach(unbilled) { month in
                            MonthToBillRow(month: month) { await loadUnbilled() }.surfaceRow()
                        }
                    } header: {
                        SectionLabel("Maintenance to bill")
                    } footer: {
                        Text(
                            "One draft invoice per customer for the month: the plan’s monthly price and any priced cleanings. Review the drafts, then send them. Last month is drafted automatically on the 1st."
                        )
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                    }
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
                                openRoute(.jobSection(item.invoice.jobId, .wrapUp))
                            } label: {
                                InvoiceRow(item: item, timeZone: timeZone, today: today)
                            }
                            .buttonStyle(.row)
                            .surfaceRow()
                            .listRowInsets(EdgeInsets())
                        }
                    }
                }
            }
            .groupedList()
            .refreshable {
                await sync.syncNow()
                await loadUnbilled()
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
            .task(id: "\(sync.revision)|\(company?.id ?? "")") { reload() }
            .task { await loadUnbilled() }
        }

        private func reload() {
            guard let company = session.company else { return }
            list = invoiceList(sync.store, companyId: company.id)
            loaded = true
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

        /// Finished maintenance visits not on an invoice yet (managers at pool shops; needs a signal).
        private func loadUnbilled() async {
            guard let company = session.company, isManagerRole(company.role), company.services != .leak else { return }
            if let months: [UnbilledMonth] = try? await app.client
                .rpc("unbilled_maintenance", params: ["target_company": company.id]).execute().value
            {
                unbilled = months
            }
        }
    }

    /// A month of maintenance waiting to be billed (website `MonthlyBilling`).
    struct UnbilledMonth: Decodable, Identifiable, Hashable {
        var month: String
        var visits: Int
        var customers: Int
        var totalCents: Int

        var id: String { month }

        enum CodingKeys: String, CodingKey {
            case month, visits, customers
            case totalCents = "total_cents"
        }
    }

    struct MonthToBillRow: View {
        var month: UnbilledMonth
        var done: () async -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var busy = false
        @State private var result: (text: String, error: Bool)?

        var body: some View {
            let current = month.month.hasPrefix(
                String(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000).prefix(7)))
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(monthName(month.month)).font(.role(.bodyMedium)).foregroundStyle(Color.text)
                            + Text(current ? " · so far" : "").font(.role(.body)).foregroundStyle(Color.textMuted))
                        Text(
                            "\(month.visits == 1 ? "1 visit" : "\(month.visits) visits") · \(month.customers == 1 ? "1 customer" : "\(month.customers) customers") · \(formatCents(month.totalCents))"
                        )
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                    }
                    Spacer(minLength: 0)
                    Button {
                        Task { await bill() }
                    } label: {
                        Text(busy ? "Creating…" : "Create Invoices")
                    }
                    .buttonStyle(.secondary)
                    .disabled(busy)
                }
                if let result { Notice(kind: result.error ? .error : .success, text: result.text) }
            }
            .padding(.vertical, 4)
        }

        private func bill() async {
            guard let company = session.company else { return }
            busy = true
            defer { busy = false }
            do {
                let n: Int = try await app.client
                    .rpc("create_monthly_invoices", params: ["target_company": company.id, "month": month.month])
                    .execute().value
                result = (n == 1 ? "1 draft invoice ready to review." : "\(n) draft invoices ready to review.", false)
                await sync.syncNow()
                await done()
            } catch let failure as PostgrestError {
                result = (failure.message, true)
            } catch {
                result = ("No connection. Try again when you're online.", true)
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
