#if os(iOS)
    import Supabase
    import SundeckCore
    import SwiftUI

    // Customer Feedback (owner's competitor notes, 2026-11-16; docs/design/
    // 2026-11-16-feedback-and-text-reminders.md; website app/(office)/feedback): the thumbs
    // customers give from their report page or the review request. A thumbs down is a private
    // complaint, open until it's closed with a note. Owners and admins; read from the server like
    // the Dashboard, so it needs a connection.

    /// The feedback functions, called as the signed-in person (row security gives anyone but an
    /// owner or admin nothing).
    @MainActor enum FeedbackServer {
        private struct ListParams: Encodable {
            var company: String
            var customer: String?

            enum CodingKeys: String, CodingKey {
                case company = "target_company"
                case customer = "target_customer"
            }
        }

        private struct CountParams: Encodable {
            var company: String

            enum CodingKeys: String, CodingKey { case company = "target_company" }
        }

        private struct StatusParams: Encodable {
            var feedback: String
            var status: String
            var note: String

            enum CodingKeys: String, CodingKey {
                case feedback = "target_feedback"
                case status = "new_status"
                case note = "new_note"
            }
        }

        /// The shop's feedback (or one customer's), open complaints first.
        static func list(_ client: SupabaseClient, company: String, customer: String? = nil) async throws
            -> FeedbackList
        {
            try await client.rpc("feedback_list", params: ListParams(company: company, customer: customer))
                .execute().value
        }

        /// How many complaints are open; nil without an answer.
        static func openCount(_ client: SupabaseClient, company: String) async -> Int? {
            do {
                let n: Int = try await client.rpc("feedback_open_count", params: CountParams(company: company))
                    .execute().value
                return n
            } catch {
                return nil
            }
        }

        /// Close or reopen a complaint with the office's note.
        static func setStatus(_ client: SupabaseClient, id: String, open: Bool, note: String) async throws {
            try await client.rpc(
                "set_feedback_status",
                params: StatusParams(feedback: id, status: open ? "open" : "closed", note: note)
            ).execute()
        }
    }

    /// One answer as a row: who, what they said, when. A complaint opens its case.
    private struct FeedbackLink: View {
        var row: FeedbackRow
        var timeZone: String
        var showCustomer = true

        var body: some View {
            if row.isComplaint {
                NavigationLink(value: MoreRoute.complaint(row)) { content }
            } else {
                content
            }
        }

        private var content: some View {
            let when = (try? shortDate(row.createdAt, now: Date(), timeZone: timeZone)) ?? ""
            let sub = feedbackSubtitle(jobNumber: row.jobNumber, when: when)
            let said: String? = row.isComplaint ? nonEmpty(row.comment) ?? FeedbackText.noComment : nil
            let lines = [said, showCustomer ? sub : nil].compactMap { $0 }.filter { !$0.isEmpty }
            return ListRow(
                showCustomer ? nonEmpty(row.customerName) ?? "A customer" : sub,
                detail: lines.isEmpty ? nil : lines.joined(separator: "\n"), emphasized: showCustomer,
                chevron: row.isComplaint, icon: row.isComplaint ? "hand.thumbsdown" : "hand.thumbsup")
        }
    }

    private func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.isEmpty else { return nil }
        return s
    }

    /// More › Customer Feedback: Open, Closed and Thumbs Up, the open count under the title.
    struct FeedbackScreen: View {
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var list: FeedbackList?
        @State private var failed = false
        @State private var show = FeedbackFilter.open

        var body: some View {
            ScreenScroll {
                if let list {
                    Text(feedbackOpenLabel(list.openCount)).textRole(.body).foregroundStyle(Color.textMuted)
                }
                Segmented(
                    selection: $show, options: FeedbackFilter.allCases, label: \.label, title: "Show",
                    fillsWidth: true)
                if let list {
                    let rows = feedbackFilter(list.rows, show)
                    if rows.isEmpty {
                        EmptyState(text: FeedbackText.empty(show))
                    } else {
                        Grouped {
                            ForEach(rows) { row in
                                FeedbackLink(row: row, timeZone: session.company?.timeZone ?? "UTC")
                            }
                        }
                    }
                } else if failed {
                    EmptyState(text: FeedbackText.offline)
                    Button("Try Again") { Task { await load() } }.buttonStyle(.secondary)
                } else {
                    SkeletonRows(count: 4, dot: false, label: "Loading customer feedback")
                }
            }
            .refreshable { await load() }
            .navigationTitle(FeedbackText.title)
            .navigationBarTitleDisplayMode(.large)
            // Runs each time it appears, so closing a complaint shows when you come back.
            .task(id: session.company?.id) { await load() }
        }

        private func load() async {
            guard let company = session.company else { return }
            do {
                list = try await FeedbackServer.list(app.client, company: company.id)
                failed = false
            } catch {
                if list == nil { failed = true }
            }
        }
    }

    /// One complaint: what they said, the customer and job, and Close or Reopen with a note.
    struct ComplaintScreen: View {
        var row: FeedbackRow
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @Environment(\.openRoute) private var openRoute
        @State private var note: String
        @State private var saving = false
        @State private var error: String?

        init(row: FeedbackRow) {
            self.row = row
            _note = State(initialValue: row.officeNote ?? "")
        }

        var body: some View {
            let tz = session.company?.timeZone ?? "UTC"
            let date = { (iso: String) in (try? shortDate(iso, now: Date(), timeZone: tz)) ?? "" }
            ScreenScroll {
                Text(row.isOpen ? "Open complaint" : "Closed").textRole(.body).foregroundStyle(Color.textMuted)
                Grouped(label: "What they said") {
                    ListRow(nonEmpty(row.comment) ?? FeedbackText.noComment)
                }
                Grouped(label: "Details") {
                    ListRow("Received", value: date(row.createdAt))
                    if let id = row.customerId {
                        NavigationLink(value: MoreRoute.customer(id)) {
                            ListRow("Customer", value: nonEmpty(row.customerName) ?? "Open", chevron: true)
                        }
                    }
                    if let id = row.jobId {
                        Button {
                            openRoute(.job(id))
                        } label: {
                            ListRow("Job", value: row.jobNumber.map { "#\($0)" } ?? "Open", chevron: true)
                        }
                        .buttonStyle(.row)
                    }
                    if let closed = row.closedAt {
                        ListRow(
                            "Closed",
                            value: date(closed) + (nonEmpty(row.closedByName).map { " by \($0)" } ?? ""))
                    }
                }
                Grouped {
                    LabeledFieldRow(
                        label: FeedbackText.noteLabel, text: $note, placeholder: FeedbackText.notePlaceholder,
                        labelWidth: 72, multiline: true)
                }
                if let error { Notice(kind: .error, text: error) }
                if row.isOpen {
                    Button {
                        Task { await save() }
                    } label: {
                        saveLabel
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(saving)
                } else {
                    Button {
                        Task { await save() }
                    } label: {
                        saveLabel
                    }
                    .buttonStyle(.secondary)
                    .disabled(saving)
                }
            }
            .navigationTitle(nonEmpty(row.customerName) ?? "A customer")
            .navigationBarTitleDisplayMode(.large)
        }

        private var saveLabel: some View {
            BusyButtonLabel(
                row.isOpen ? FeedbackText.close : FeedbackText.reopen, busy: saving, busyTitle: "Saving…")
        }

        private func save() async {
            saving = true
            error = nil
            defer { saving = false }
            do {
                try await FeedbackServer.setStatus(
                    app.client, id: row.id, open: !row.isOpen,
                    note: note.trimmingCharacters(in: .whitespacesAndNewlines))
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }
    }

    /// A customer's Feedback section, for owners and admins: what this customer told the shop,
    /// complaints first. Nothing shows until they've said something.
    struct CustomerFeedbackSection: View {
        var customerId: String
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var list: FeedbackList?

        var body: some View {
            Group {
                if let list, !list.rows.isEmpty {
                    Grouped(label: FeedbackText.customerSection) {
                        ForEach(list.rows.prefix(5)) { row in
                            FeedbackLink(row: row, timeZone: session.company?.timeZone ?? "UTC", showCustomer: false)
                        }
                        NavigationLink(value: MoreRoute.feedback) {
                            ListRow(FeedbackText.seeAll, chevron: true)
                        }
                    }
                }
            }
            .task(id: customerId) {
                guard let company = session.company else { return }
                list = try? await FeedbackServer.list(app.client, company: company.id, customer: customerId)
            }
        }
    }
#endif
