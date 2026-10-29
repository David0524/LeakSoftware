#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page (spec 5.4): large title "Job #1040", the status chip, type and time, the
    /// status buttons, with the sync bar pinned under the navigation bar; then the section switcher (Details, Checklist, Findings,
    /// Photos, Wrap-Up; no Findings on a maintenance visit), which pins under the navigation bar
    /// as the page scrolls, and the chosen section; the Next Step bar above the tab bar (owner,
    /// 2026-10-20). Port of apps/web/src/app/(office)/jobs/[id]/page.tsx and components/job-sections.tsx.
    struct JobScreen: View {
        var jobId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var job: JobView?
        @State private var section: JobPageSection?
        /// Checklist items marked needs attention: the Checklist tab's badge.
        @State private var attention = 0
        @State private var saveError: String?
        @State private var changes = 0
        /// Bumped when a job is completed, for its tap (core `HapticMoment.jobCompleted`).
        @State private var completed = 0
        /// Why Complete Job was stopped (the checklist, or the pool photo), shown under the header.
        @State private var blocked: String?
        /// Complete Job on a visit whose report goes out by itself asks first (owner, 2026-10-20).
        @State private var askingSend = false
        @State private var keyboardShown = false
        /// Where the page is scrolled, and where each section was left (gestures spec section 4:
        /// "The pages keep their scroll position").
        @State private var scroll = ScrollPosition(edge: .top)
        @State private var offsets: [JobPageSection: CGFloat] = [:]
        /// A section change is moving the page: its scroll isn't the new section's yet.
        @State private var restoring = false
        /// The Photos section's capture (Attach to, camera, library), shared with the Next Step
        /// bar's Add Photo and Add Video.
        @State private var capture: CaptureController
        /// The report the Wrap-Up section works on.
        @State private var reportFlow: ReportFlow?
        /// Wrap-Up's open step (owner, 2026-10-22: the finish list), also opened by the Next Step
        /// bar's button.
        @State private var wrapUpOpen: WrapUpOpen?
        /// A done maintenance visit's Visit Report sheet (owner, 2026-10-22: "the visit report is
        /// really buried"), and its report page.
        @State private var visitSheet = false
        @State private var visitPage: BrowsedPage?
        @Environment(\.openEditor) private var openEditor
        @Environment(\.openRoute) private var openRoute
        /// Opens the checklist in Edit (screenshots).
        private let checklistEditing: Bool

        /// `section` opens a given part (links from Reports and Invoices open Wrap-Up; screenshots);
        /// otherwise the part last shown on this job while the app runs, else Details.
        /// `photoNeeded` opens it as Complete Job leaves it when the shop's photo rule stops it
        /// (screenshots). `checklistEditing` opens the checklist in Edit (screenshots).
        init(
            jobId: String, section: JobPageSection? = nil, photoNeeded: Bool = false, checklistEditing: Bool = false
        ) {
            self.jobId = jobId
            self.checklistEditing = checklistEditing
            _section = State(initialValue: section)
            _blocked = State(initialValue: photoNeeded ? finishPhotoMessage : nil)
            _capture = State(
                initialValue: CaptureController(
                    target: CaptureTargetMemory.target(for: jobId) ?? MediaTarget(jobId: jobId)))
        }

        var body: some View {
            Group {
                if let job, job.job["sample"]?.bool == true {
                    // The sample job opens to its finished report (owner, 2026-10-22: first win).
                    SampleJobScreen(job: job)
                } else if let job, let company = session.company {
                    content(job, company)
                } else {
                    ContentUnavailableView("This job isn’t on this phone.", systemImage: "questionmark.folder")
                }
            }
            .background(Color.bg)
            // The customer's name on top, the job number smaller below (owner, 2026-10-20).
            .navigationTitle(job.map(jobPageTitle) ?? "New Job")
            // A fixed title in the bar that never collapses: every section sits on tiles, and a
            // large title shrinking into the bar on scroll looked wrong there (owner, 2026-10-21:
            // Findings and Wrap Up "the navigation bar should not shrink"). Same on every section,
            // so switching sections never moves the bar.
            .navigationBarTitleDisplayMode(.inline)
            // An invoice or quote line typed but not added: Back asks first (owner, 2026-10-20).
            .discardOnBack(dirty: app.unsavedEdits.any(under: "job:\(jobId)"), draftsUnder: "job:\(jobId)")
            .task(id: sync.revision) { reload() }
            // Back from a screen that asked for a part (the signing screen's Go to Checklist).
            .onAppear { if let asked = JobSectionMemory.takeRequest(for: jobId) { choose(asked) } }
            // First under Recent in search (docs/plans/search-and-activity.md).
            .task(id: job.map { recentItem(job: $0) }) {
                if let job { RecentSearches(kv: sync.kv).opened(recentItem(job: job)) }
            }
            .sensoryFeedback(.success, trigger: changes)
            .haptic(.jobCompleted, trigger: completed)
            .removalBanner()
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func content(_ job: JobView, _ company: CompanyContext) -> some View {
            let sections = JobPageSection.sections(for: job.type)
            let current = currentSection(job)
            return Group {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                        header(job, company)
                            .padding(.horizontal, CGFloat(Spacing.pageMargin))
                            .id("top")
                        Section {
                            // A new section fades in where the last one was.
                            sectionContent(current, job)
                                .id(current)
                                .transition(.opacity)
                                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                                .padding(.top, 16)
                                .padding(.bottom, 32)
                                // Swipe left or right for the next or previous section; the
                                // switcher above follows (and stays the visible way).
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                                .pageSwipe(
                                    previous: page(sections, current, -1).map { p in { choose(p) } },
                                    next: page(sections, current, 1).map { p in { choose(p) } })
                        } header: {
                            switcher(sections, current)
                        }
                    }
                }
                .scrollPosition($scroll)
                // A page whose content fits doesn't scroll, so the large title never collapses onto
                // a short page's tile (owner, 2026-10-20: "it doesn't make sense for the nav bar to
                // shrink on scroll since it's sitting on a tile"; Findings, short Tests or Photos).
                .scrollBounceBehavior(.basedOnSize, axes: .vertical)
                .onScrollGeometryChange(for: CGFloat.self) { geo in
                    geo.contentOffset.y + geo.contentInsets.top
                } action: { _, y in
                    if !restoring { offsets[current] = y }
                }
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await sync.syncNow() }
                .background(Color.bg)
                // The sync bar stays in view under the navigation bar (owner, 2026-10-20).
                .pinnedSyncBar()
                // The Next Step bar above the tab bar; the page scrolls its last row above it.
                .safeAreaInset(edge: .bottom, spacing: 0) { nextStepBar(job, current, company) }
                .trackingKeyboard($keyboardShown)
                .mediaViewer(jobId: jobId)
                .browser($visitPage)
                .sheet(isPresented: $visitSheet) {
                    NavigationStack {
                        ScreenScroll { VisitReportSection(job: job, heading: false) }
                            .navigationTitle(VisitReportText.title)
                            .toolbar {
                                ToolbarItem(placement: .confirmationAction) {
                                    Button("Done") { visitSheet = false }.fontWeight(.semibold)
                                }
                            }
                    }
                    .environment(session).environment(sync).environment(app)
                }
                .onChange(of: section) { _, next in
                    // Each section comes back where it was left; a new one opens at the top.
                    restoring = true
                    if let next, let y = offsets[next] { scroll.scrollTo(y: y) } else { scroll.scrollTo(edge: .top) }
                    Task {
                        try? await Task.sleep(for: .milliseconds(400))
                        restoring = false
                    }
                }
            }
            .alert(CompleteSendPrompt.title, isPresented: $askingSend) {
                Button(CompleteSendPrompt.cancel, role: .cancel) {}
                Button(CompleteSendPrompt.confirm) { changeStatus(.done, confirmed: true) }
                    .keyboardShortcut(.defaultAction)
            } message: {
                Text(CompleteSendPrompt.message(customer: job.customer?["name"]?.string))
            }
        }

        // MARK: - Next Step bar

        /// The Next Step bar (spec 1): one or two pills for the next thing to do on this part of
        /// the job, on the tab bar's material; hidden when it has nothing to offer and while the
        /// keyboard is open.
        @ViewBuilder private func nextStepBar(_ job: JobView, _ current: JobPageSection, _ company: CompanyContext)
            -> some View
        {
            let actions = nextActions(job, current, company)
            let visit = visitBar(job, company)
            // The visit report's status, with its button or above Complete Job (Automatic shops).
            let visitLine =
                actions.contains(.visitReport) || actions.contains(.completeJob) ? visit?.bar.line : nil
            let notice = blocked.flatMap { current == .checklist && job.status != .done ? $0 : nil }
            // Everything on the visit's checklist is done: Complete Job is the last thing (owner,
            // 2026-10-22), so the bar says so and the button scales in once.
            let ready = actions.first == .completeJob && notice == nil && checklistDone(job)
            if !keyboardShown, !actions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    if let notice { CompleteJobNotice(jobId: job.id, message: notice) }
                    if let visitLine, !ready {
                        // Tapping the status opens the sheet: Send Again and the versions.
                        Button {
                            visitSheet = true
                        } label: {
                            HStack(spacing: 4) {
                                Text(visitLine).textRole(.secondary).fontWeight(.semibold)
                                    .foregroundStyle(Color.text)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                                    .foregroundStyle(Color.textMuted)
                            }
                            .frame(maxWidth: .infinity, minHeight: minTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens the visit report")
                    }
                    if ready {
                        Text(completeReadyLine)
                            .textRole(.secondary)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.text)
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 12) {
                        ForEach(Array(actions.enumerated()), id: \.element) { index, action in
                            nextStepButton(action, primary: index == 0)
                                .readyPop(ready && index == 0)
                        }
                    }
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.bar)
                .overlay(alignment: .top) { Hairline() }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }

        /// A maintenance visit's checklist with every item done (core `checklistReady`).
        private func checklistDone(_ job: JobView) -> Bool {
            guard job.type == .maintenance else { return false }
            let inspection = JobInspection(sync.store, jobId: job.id)
            let tally = checklistTally(inspection.components, inspection.results)
            let total = tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending
            return checklistReady(total - tally.pending, total)
        }

        private func nextActions(_ job: JobView, _ current: JobPageSection, _ company: CompanyContext)
            -> [NextStepAction]
        {
            return nextStepActions(
                job, section: current,
                hasTestTypes: current == .findings
                    && !InspectionConfig(sync.store, companyId: company.id).testTypes.isEmpty,
                wrapUp: current == .wrapUp ? wrapUpList(job, company).next : nil,
                visitAction: visitBar(job, company)?.bar.action)
        }

        /// Wrap-Up's finish list (core `wrapUp`).
        private func wrapUpList(_ job: JobView, _ company: CompanyContext) -> WrapUp {
            wrapUp(wrapUpInput(store: sync.store, companyId: company.id, settings: company.settings, job: job))
        }

        /// A maintenance visit's report on the bar (core `visitReportBar`), and its page once sent.
        private func visitBar(_ job: JobView, _ company: CompanyContext) -> (bar: VisitReportBar, url: URL?)? {
            guard job.type == .maintenance else { return nil }
            let latest = visitReportVersions(sync.store, jobId: job.id).first(where: \.current)
            guard
                let bar = visitReportBar(
                    jobType: job.type.rawValue, status: job.status.rawValue, mode: visitReportMode(company.settings),
                    sentAt: latest?.sentAt, now: Date(), timeZone: company.timeZone,
                    needsPhoto: visitReportPhotoBlock(sync.store, settings: company.settings, jobId: job.id) != nil)
            else { return nil }
            return (bar, latest?.token.map { reportURL(AppConfig.webURL, $0) })
        }

        @ViewBuilder private func nextStepButton(_ action: NextStepAction, primary: Bool) -> some View {
            let writing = action == .writeDraft && reportFlow?.busy == .draft
            Button {
                run(action)
            } label: {
                BusyButtonLabel(title(action), busy: writing, busyTitle: "Writing…")
            }
            .modifier(BarButtonStyle(primary: primary))
            .disabled(action == .writeDraft && reportFlow?.busy != nil)
        }

        /// Exactly what the inline buttons did (same action, confirmation and errors).
        private func run(_ action: NextStepAction) {
            switch action {
            case .startJob: changeStatus(.inProgress)
            case .completeJob: changeStatus(.done)
            case .addTest: openEditor(.test(jobId: jobId, testId: nil, typeId: nil, componentId: nil))
            case .addFinding: openEditor(.finding(jobId: jobId, findingId: nil, componentId: nil))
            case .addPhoto: Task { await capture.takeOrChoose(.photo) }
            case .addVideo: Task { await capture.takeOrChoose(.video) }
            case .writeDraft:
                guard let reportFlow else { return }
                Task { await reportFlow.run(.draft, server: ReportServer(sync: sync, api: app.api)) }
            case .reviewWithCustomer: openRoute(.review(jobId: jobId))
            case .wrapUp:
                // As tapping the next row, except Review with Customer, which starts the review.
                guard let job, let company = session.company, let next = wrapUpList(job, company).next else { return }
                if next.step == .sign {
                    openRoute(.review(jobId: jobId))
                } else {
                    wrapUpOpen = WrapUpOpen(step: next.step, refId: next.id)
                }
            case .visitReport:
                guard let job, let company = session.company, let visit = visitBar(job, company) else { return }
                if visit.bar.action == .view, let url = visit.url {
                    visitPage = BrowsedPage(url: url)
                } else if visit.bar.action == .photo {
                    // Require a Photo (owner, 2026-10-25): to Photos, taking or choosing one.
                    choose(.photos)
                    Task { await capture.takeOrChoose(.photo) }
                } else {
                    visitSheet = true
                }
            }
        }

        /// The button's words: Wrap-Up's next action and the visit report's come from core.
        private func title(_ action: NextStepAction) -> String {
            guard let job, let company = session.company else { return action.title }
            switch action {
            case .wrapUp: return wrapUpList(job, company).next?.action ?? action.title
            case .visitReport: return visitBar(job, company)?.bar.label ?? action.title
            default: return action.title
            }
        }

        // MARK: - Header

        /// The status chip and type, the time on its own line, the status buttons.
        private func header(_ job: JobView, _ company: CompanyContext) -> some View {
            // Start Job is on the Next Step bar (owner, 2026-10-20).
            let actions = jobHeaderPhoneActions(job.status, type: job.type)
            return VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    FlowRow(spacing: 12) {
                        if let number = jobNumberLine(job) { Text(number) }
                        StatusChip(status: job.status).padding(.vertical, 2)
                        Text(jobTypeLabel(job))
                    }
                    Text(jobHeaderTime(job, now: Date(), timeZone: company.timeZone))
                }
                .textRole(.body)
                .foregroundStyle(Color.textMuted)
                .accessibilityElement(children: .combine)
                if !actions.isEmpty {
                    FlowRow(spacing: 12) {
                        ForEach(actions, id: \.self) { to in
                            Button(jobActionLabel(from: job.status, to: to)) { changeStatus(to) }
                                .buttonStyle(.secondary)
                        }
                    }
                }
                // Shown once: on the Next Step bar while the Checklist is open, else here.
                if let blocked, job.status != .done, currentSection(job) != .checklist {
                    CompleteJobNotice(jobId: job.id, message: blocked)
                }
            }
            .padding(.top, 4)
            .padding(.bottom, 16)
        }

        /// The switcher on the page; once scrolled, pinned under the bar on the bar material, one
        /// hairline under both.
        private func switcher(_ sections: [JobPageSection], _ current: JobPageSection) -> some View {
            SectionSwitcher(
                selection: Binding(get: { current }, set: { choose($0) }), options: sections, label: \.title,
                badge: { $0 == .checklist ? attention : 0 }
            )
            .padding(.horizontal, CGFloat(Spacing.pageMargin))
            .padding(.vertical, 8)
            .modifier(SwitcherBar())
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Job sections")
        }

        @ViewBuilder private func sectionContent(_ current: JobPageSection, _ job: JobView) -> some View {
            switch current {
            case .details: JobDetailsSection(job: job)
            case .checklist:
                ChecklistTab(job: job, editing: checklistEditing)
            case .findings:
                VStack(alignment: .leading, spacing: 32) {
                    // The pool's drawing first, as on the website (owner, 2026-10-19).
                    // A page swipe never starts on the drawing.
                    if job.property != nil { PoolDiagramSection(job: job).keepsHorizontalDrags() }
                    TestsTab(job: job)
                    FindingsTab(job: job)
                }
            case .photos: JobPhotosSection(job: job, capture: capture)
            case .wrapUp: WrapUpSection(job: job, flow: reportFlow, open: $wrapUpOpen)
            }
        }

        private func currentSection(_ job: JobView) -> JobPageSection {
            if let section, JobPageSection.sections(for: job.type).contains(section) { return section }
            return JobSectionMemory.section(for: job.id, type: job.type)
        }

        private func page(_ sections: [JobPageSection], _ current: JobPageSection, _ direction: Int)
            -> JobPageSection?
        {
            PageSwipeRule.page(sections, from: current, direction: direction)
        }

        private func choose(_ next: JobPageSection) {
            restoring = true
            withAnimation(Motion.smooth) { section = next }
            JobSectionMemory.remember(next, for: jobId)
        }

        // MARK: - Writes

        private func changeStatus(_ to: JobStatus, confirmed: Bool = false) {
            guard let company = session.company, let job else { return }
            // Complete Job waits for the checklist or a pool photo, when the shop asks.
            if let block = statusChangeBlock(to, sync.store, settings: company.settings, jobId: jobId) {
                withAnimation { blocked = block }
                return
            }
            // When completing sends the visit report, ask first (owner, 2026-10-20).
            if to == .done, !confirmed, CompleteSendPrompt.asks(jobType: job.type, settings: company.settings) {
                askingSend = true
                return
            }
            do {
                try sync.write("job", id: jobId, companyId: company.id, jobStatusValues(to, job: job.job))
                // A completed visit's report goes out by itself in shops that chose Automatic.
                if to == .done {
                    app.visitReports.completed(jobType: job.type, jobId: jobId, settings: company.settings)
                }
                blocked = nil
                if to == .done { completed += 1 } else { changes += 1 }
            } catch {
                saveError = userMessage(error)
            }
        }

        private func reload() {
            guard let company = session.company,
                let found = (try? jobView(sync.store, companyId: company.id, jobId: jobId)) ?? nil
            else {
                job = nil
                return
            }
            job = found
            let inspection = JobInspection(sync.store, jobId: jobId)
            // A pool inspection counts only the questions its gates leave open (2026-10-20).
            attention = checklistAttention(
                config: InspectionConfig(sync.store, companyId: company.id), inspection: inspection,
                jobType: found.type)
            if section == nil { section = JobSectionMemory.section(for: jobId, type: found.type) }
            if reportFlow == nil, jobHasWrapUp(found.type.rawValue) {
                reportFlow = ReportFlow(
                    sync: sync, companyId: company.id, jobId: jobId, settings: company.settings, sends: app.reportSends)
            }
        }
    }

    /// The Next Step bar's pills: full width when alone, side by side when two.
    private struct BarButtonStyle: ViewModifier {
        var primary: Bool

        func body(content: Content) -> some View {
            if primary {
                content.buttonStyle(.primary(fullWidth: true, size: .field))
            } else {
                content.buttonStyle(.secondary(fullWidth: true, size: .field))
            }
        }
    }

    /// Behind the pinned switcher: nothing on iOS 26, where the switcher itself is glass and the
    /// page scrolls under it; the bar material and a hairline before.
    private struct SwitcherBar: ViewModifier {
        @Environment(\.drawsGlass) private var drawsGlass

        func body(content: Content) -> some View {
            if usesGlass(drawsGlass) {
                content
            } else {
                content.background(.bar).overlay(alignment: .bottom) { Hairline() }
            }
        }
    }
#endif
