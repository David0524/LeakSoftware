#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Service issues on the iPhone (docs/design/2026-11-16-service-issues.md), as the website's: a
    // job's Issues group with Report an Issue, Jobs › Issues, the issue's screen, and the customer's
    // open issues. Port of apps/mobile/src/features/issues and the issue screen.

    /// "Nov 16" in the shop's time zone.
    func issueDay(_ iso: String, timeZone: String) -> String {
        guard let date = parseInstant(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = TimeZone(identifier: timeZone)
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }

    /// One issue as a row: what's wrong (with the customer in lists), the line under it, its status.
    struct IssueRowView: View {
        var issue: ServiceIssue
        var customer: String?
        var reporter: String?
        var timeZone: String

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    if let customer {
                        (Text(customer).font(.role(.bodyEmphasis))
                            + Text(verbatim: " · \(issueTitle(issue.description, max: 60))")
                            .foregroundStyle(Color.textMuted))
                            .textRole(.body)
                            .foregroundStyle(Color.text)
                    } else {
                        Text(issueTitle(issue.description)).textRole(.body).foregroundStyle(Color.text)
                    }
                    Text(
                        issueDetailLine(
                            suggested: issue.suggestedType, reporter: reporter,
                            reportedOn: issueDay(issue.reportedAt, timeZone: timeZone))
                    )
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if issue.status != .open {
                    Text(issue.status.label).textRole(.body).foregroundStyle(Color.textMuted)
                }
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// A job's Issues group: those reported on it, and Report an Issue (offline too).
    struct JobIssuesGroup: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute
        @State private var reporting = false
        @State private var reported = false

        var body: some View {
            let _ = sync.revision
            let issues = jobIssues(sync.store, jobId: job.id)
            let names = teamNames(sync.kv)
            let timeZone = session.company?.timeZone ?? "America/Phoenix"
            Grouped(
                label: "Issues",
                footer: reported ? IssueText.reported : "Spotted a problem? Report it for the office to quote or book."
            ) {
                ForEach(issues) { issue in
                    Button {
                        openRoute(.issue(issue.id))
                    } label: {
                        IssueRowView(issue: issue, reporter: issue.reportedBy.flatMap { names[$0] }, timeZone: timeZone)
                    }
                    .buttonStyle(.row)
                }
                Button {
                    reported = false
                    reporting = true
                } label: {
                    Text(IssueText.report)
                        .textRole(.body)
                        .foregroundStyle(Color.link)
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.row)
            }
            .sheet(isPresented: $reporting) {
                ReportIssueSheet(job: job) { reported = true }
            }
        }
    }

    /// Report an Issue: what's wrong (the keyboard's dictation works), photos and videos, Suggested
    /// Work, then Report. A photo saves the issue first (it's linked to it), as a finding is saved
    /// before its first photo.
    struct ReportIssueSheet: View {
        var job: JobView
        var onReported: () -> Void
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var id = uuidv7()
        @State private var saved = false
        @State private var text = ""
        @State private var work = ""
        @State private var error: String?
        @State private var saveError: String?
        @State private var confirmDiscard = false

        private var dirty: Bool { !saved && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

        var body: some View {
            let services = session.company?.services.rawValue ?? "both"
            let options = issueWorkOptions(services)
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        OutlinedField(
                            label: IssueText.whatsWrong, text: $text, placeholder: IssueText.placeholder, error: error,
                            multiline: true)
                        MediaSection(
                            target: saved ? MediaTarget(jobId: job.id, serviceIssueId: id) : nil, jobId: job.id,
                            title: "Photos and videos", prepare: saveForPhotos)
                        VStack(alignment: .leading, spacing: 4) {
                            FieldLabel(IssueText.suggestedWork)
                            Segmented(
                                selection: $work, options: options.map { $0.value?.rawValue ?? "" },
                                label: { key in options.first { ($0.value?.rawValue ?? "") == key }?.label ?? "" },
                                title: IssueText.suggestedWork, fillsWidth: true, segmentPadding: 8)
                        }
                        if let saveError { Notice(kind: .error, text: saveError) }
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .bottomBar {
                    Button(IssueText.submit) { report() }
                        .buttonStyle(.primary(fullWidth: true, size: .field))
                }
                .mediaViewer(jobId: job.id)
                .background(Color.bg)
                .navigationTitle(IssueText.sheetTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            if dirty { confirmDiscard = true } else { close() }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(IssueText.submit) { report() }.fontWeight(.semibold)
                    }
                }
                .confirmationDialog("Discard changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                    Button("Discard Changes", role: .destructive) { dismiss() }
                }
            }
            .sheetPresentation(dirty: dirty, detents: [.large])
        }

        /// Closing after a photo saved the issue still counts as reported.
        private func close() {
            if saved { onReported() }
            dismiss()
        }

        /// Saves the issue; false when what's wrong is missing (the field says so).
        private func save() -> Bool {
            if let problem = issueDescriptionError(text) {
                error = problem
                return false
            }
            guard let company = session.company, let user = session.user,
                let customerId = job.job["bill_to_customer_id"]?.string ?? job.property?["customer_id"]?.string,
                let propertyId = job.job["property_id"]?.string
            else { return false }
            do {
                try IssueWrites.save(
                    sync, companyId: company.id, id: id, customerId: customerId, propertyId: propertyId, jobId: job.id,
                    description: text, suggested: IssueWork(rawValue: work), userId: user.id)
                error = nil
                saved = true
                return true
            } catch {
                saveError = userMessage(error)
                return false
            }
        }

        /// Add Photo before Report: saves the issue first; nil (no camera) until it says what's wrong.
        private func saveForPhotos() -> MediaTarget? {
            if issueDescriptionError(text) != nil {
                error = IssueText.addPhotosFirst
                return nil
            }
            return save() ? MediaTarget(jobId: job.id, serviceIssueId: id) : nil
        }

        private func report() {
            guard save() else { return }
            onReported()
            dismiss()
        }
    }

    /// Jobs › Issues: the filter's issues, newest first; owners and admins see all, a tech theirs.
    struct IssuesList: View {
        var filter: IssueFilter
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            let _ = sync.revision
            let company = session.company
            let issues = company.map { shopIssues(sync.store, companyId: $0.id) } ?? []
            let shown = issueList(issues, filter, userId: session.user?.id ?? "", role: company?.role)
            let names = teamNames(sync.kv)
            let customers = Dictionary(
                ((try? sync.store.list("customer", companyId: company?.id)) ?? []).map {
                    ($0.id, $0["name"]?.string ?? "Customer")
                },
                uniquingKeysWith: { a, _ in a })
            if shown.isEmpty {
                EmptyState(text: issuesEmpty(filter, manages: canManageIssues(company?.role)))
            } else {
                GroupedRows(shown) { issue in
                    Button {
                        openRoute(.issue(issue.id))
                    } label: {
                        IssueRowView(
                            issue: issue, customer: issue.customerId.flatMap { customers[$0] } ?? "Customer",
                            reporter: issue.reportedBy.flatMap { names[$0] },
                            timeZone: company?.timeZone ?? "America/Phoenix")
                    }
                    .buttonStyle(.row)
                }
            }
        }
    }

    /// The customer's open issues, on their page (nothing when there are none).
    struct CustomerIssuesGroup: View {
        var customerId: String
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            let _ = sync.revision
            let company = session.company
            let issues = (company.map { shopIssues(sync.store, companyId: $0.id) } ?? [])
                .filter { $0.customerId == customerId && $0.status == .open }
                .sorted { $0.reportedAt > $1.reportedAt }
            let names = teamNames(sync.kv)
            if !issues.isEmpty {
                Grouped(label: "Open Issues") {
                    ForEach(issues) { issue in
                        Button {
                            openRoute(.issue(issue.id))
                        } label: {
                            IssueRowView(
                                issue: issue, reporter: issue.reportedBy.flatMap { names[$0] },
                                timeZone: company?.timeZone ?? "America/Phoenix")
                        }
                        .buttonStyle(.row)
                    }
                }
            }
        }
    }

    /// One issue, as the website's page: what the tech wrote and their photos and videos, the
    /// customer and pool, who reported it and on which visit, and the office's Make Quote, Make Leak
    /// Detection Job, Resolve and Reopen. All offline, through the sync layer.
    struct IssueScreen: View {
        var issueId: String
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openMedia) private var openMedia
        @State private var resolving = false
        @State private var saveError: String?

        var body: some View {
            let _ = sync.revision
            let found = findIssue(sync.store, id: issueId)
            Group {
                if let issue = found, issue.deletedAt == nil {
                    page(issue).mediaViewer(jobId: issue.jobId ?? "")
                } else {
                    ScrollView {
                        Notice(kind: .warning, text: "This issue isn’t on this phone.").padding(16)
                    }
                }
            }
            .background(Color.bg)
            .navigationTitle(row("customer", found?.customerId)?["name"]?.string ?? "Issue")
            .navigationBarTitleDisplayMode(.large)
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func row(_ table: String, _ id: String?) -> Row? {
            id.flatMap { try? sync.store.get(table, $0) }
        }

        private func jobLabel(_ job: Row) -> String {
            let number = job["number"]?.number.map { "Job #\(Int($0))" } ?? "New job"
            let type = job["type"]?.string.flatMap(JobType.init(rawValue:)).map { jobTypeLabel($0) } ?? "Job"
            return "\(number) · \(type)"
        }

        @ViewBuilder private func page(_ issue: ServiceIssue) -> some View {
            let company = session.company
            let timeZone = company?.timeZone ?? "America/Phoenix"
            let customer = row("customer", issue.customerId)
            let pool = row("property", issue.propertyId).flatMap { try? JSONValue.object($0).decode(Property.self) }
            let visit = row("job", issue.jobId)
            let made = row("job", issue.convertedJobId)
            let media = issueMedia(sync.store, issue)
            let actions = issueActions(
                issue.status, role: company?.role, services: company?.services.rawValue ?? "both")
            let when = { (iso: String) in (try? formatSchedule(iso, Date(), timeZone)) ?? "" }
            ScrollView {
                VStack(alignment: .leading, spacing: CGFloat(Spacing.betweenBlocks)) {
                    Text(
                        [
                            issue.status.label, issue.suggestedType?.label, "Reported \(when(issue.reportedAt))",
                        ].compactMap { $0 }.joined(separator: " · ")
                    )
                    .textRole(.secondary)
                    .foregroundStyle(Color.textMuted)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(issue.description).textRole(.body).foregroundStyle(Color.text)
                        if !media.isEmpty {
                            LazyVGrid(
                                columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8
                            ) {
                                ForEach(media, id: \.id) { item in
                                    Button {
                                        openMedia(item.id)
                                    } label: {
                                        MediaThumb(media: item)
                                    }
                                    .buttonStyle(.borderless)
                                    .accessibilityLabel(CaptureRules.accessibilityLabel(item))
                                }
                            }
                        }
                        actionButtons(issue, actions: actions, made: made)
                        if issue.status == .open && !canManageIssues(company?.role) {
                            Text(IssueText.onlyManagers).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                    if issue.status == .resolved {
                        Grouped(label: "Resolved") {
                            ListRow(issue.resolvedAt.map(when) ?? "Resolved", detail: issue.resolutionNote)
                        }
                    }
                    Grouped(label: "Customer") {
                        Button {
                            if let id = issue.customerId { openRoute(.more(.customer(id))) }
                        } label: {
                            ListRow(
                                customer?["name"]?.string ?? "Customer", detail: pool.map { formatAddress($0) },
                                chevron: issue.customerId != nil)
                        }
                        .buttonStyle(.row)
                    }
                    Grouped(label: "Reported") {
                        ListRow("By", value: issue.reportedBy.flatMap { teamNames(sync.kv)[$0] } ?? "—")
                        if let visit {
                            Button {
                                openRoute(.job(visit.id))
                            } label: {
                                ListRow("On", value: jobLabel(visit), chevron: true)
                            }
                            .buttonStyle(.row)
                        }
                        if let made {
                            Button {
                                openRoute(.job(made.id))
                            } label: {
                                ListRow("Made into", value: jobLabel(made), chevron: true)
                            }
                            .buttonStyle(.row)
                        }
                    }
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .sheet(isPresented: $resolving) { ResolveIssueSheet(issue: issue) }
        }

        @ViewBuilder
        private func actionButtons(_ issue: ServiceIssue, actions: [IssueAction], made: Row?) -> some View {
            VStack(spacing: 12) {
                if actions.contains(.openJob), let made {
                    Button(IssueText.openJob) { openRoute(.job(made.id)) }
                        .buttonStyle(.primary(fullWidth: true, size: .field))
                }
                if actions.contains(.makeQuote) {
                    Button(IssueText.makeQuote) { convert(issue, .repair) }
                        .buttonStyle(.primary(fullWidth: true, size: .field))
                }
                if actions.contains(.makeDetection) {
                    Button(IssueText.makeDetection) { convert(issue, .detection) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                }
                if actions.contains(.resolve) {
                    Button(IssueText.resolve) { resolving = true }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                }
                if actions.contains(.reopen) {
                    Button(IssueText.reopen) { reopen(issue) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                }
            }
        }

        /// Make Quote opens the new job at Wrap-Up, to build the quote; leak detection at the job.
        private func convert(_ issue: ServiceIssue, _ type: IssueWork) {
            guard let company = session.company, let user = session.user else { return }
            do {
                let jobId = try IssueWrites.convert(sync, issue, type: type, companyId: company.id, userId: user.id)
                openRoute(type == .repair ? .jobSection(jobId, .wrapUp) : .job(jobId))
            } catch {
                saveError = userMessage(error)
            }
        }

        private func reopen(_ issue: ServiceIssue) {
            guard let company = session.company else { return }
            do {
                try IssueWrites.reopen(sync, issue, companyId: company.id)
            } catch {
                saveError = userMessage(error)
            }
        }
    }

    /// Resolve Issue: an optional note, then Resolve.
    struct ResolveIssueSheet: View {
        var issue: ServiceIssue
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var note = ""
        @State private var error: String?

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        OutlinedField(
                            label: IssueText.resolveNote, text: $note, placeholder: IssueText.resolveNotePlaceholder,
                            error: error, multiline: true)
                        Button(IssueText.resolve) { resolve() }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                    }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .background(Color.bg)
                .navigationTitle(IssueText.resolveTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(IssueText.resolve) { resolve() }.fontWeight(.semibold)
                    }
                }
            }
            .sheetPresentation(dirty: !note.isEmpty, detents: [.medium, .large])
        }

        private func resolve() {
            if let problem = issueNoteError(note) {
                error = problem
                return
            }
            guard let company = session.company, let user = session.user else { return }
            do {
                try IssueWrites.resolve(sync, issue, companyId: company.id, userId: user.id, note: note)
                dismiss()
            } catch {
                self.error = userMessage(error)
            }
        }
    }
#endif
