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
        @State private var toDo = 0
        @State private var saveError: String?
        @State private var changes = 0
        /// Why Complete Job was stopped (the checklist, or the pool photo), shown under the header.
        @State private var blocked: String?
        /// Complete Job on a visit whose report goes out by itself asks first (owner, 2026-10-20).
        @State private var askingSend = false
        @State private var keyboardShown = false
        /// The Photos section's capture (Attach to, camera, library), shared with the Next Step
        /// bar's Add Photo and Add Video.
        @State private var capture: CaptureController
        /// The report the Wrap-Up section works on, shared with the Next Step bar's Write Draft.
        @State private var reportFlow: ReportFlow?
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
                if let job, let company = session.company {
                    content(job, company)
                } else {
                    ContentUnavailableView("This job isn’t on this phone.", systemImage: "questionmark.folder")
                }
            }
            .background(Color.bg)
            // The customer's name on top, the job number smaller below (owner, 2026-10-20).
            .navigationTitle(job.map(jobPageTitle) ?? "New Job")
            .navigationBarTitleDisplayMode(.large)
            // An invoice or quote line typed but not added: Back asks first (owner, 2026-10-20).
            .discardOnBack(dirty: app.unsavedEdits.any(under: "job:\(jobId)"))
            .task(id: sync.revision) { reload() }
            .sensoryFeedback(.success, trigger: changes)
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
            return ScrollViewReader { proxy in
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
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await sync.syncNow() }
                .background(Color.bg)
                // The sync bar stays in view under the navigation bar (owner, 2026-10-20).
                .pinnedSyncBar()
                // The Next Step bar above the tab bar; the page scrolls its last row above it.
                .safeAreaInset(edge: .bottom, spacing: 0) { nextStepBar(job, current, company) }
                .trackingKeyboard($keyboardShown)
                .mediaViewer(jobId: jobId)
                .onChange(of: section) { _, _ in
                    proxy.scrollTo("top", anchor: .top)
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
            let notice = blocked.flatMap { current == .checklist && job.status != .done ? $0 : nil }
            if !keyboardShown, !actions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    if let notice { CompleteJobNotice(jobId: job.id, message: notice) }
                    HStack(spacing: 12) {
                        ForEach(Array(actions.enumerated()), id: \.element) { index, action in
                            nextStepButton(action, primary: index == 0)
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

        private func nextActions(_ job: JobView, _ current: JobPageSection, _ company: CompanyContext)
            -> [NextStepAction]
        {
            let report =
                current == .wrapUp
                ? ReportTabModel(store: sync.store, companyId: company.id, settings: company.settings, job: job) : nil
            return nextStepActions(
                job, section: current,
                hasTestTypes: current == .findings
                    && !InspectionConfig(sync.store, companyId: company.id).testTypes.isEmpty,
                reportOn: !(report?.templates.isEmpty ?? true), hasDraft: report?.hasDraftText ?? false,
                online: sync.status.phase != .offline)
        }

        @ViewBuilder private func nextStepButton(_ action: NextStepAction, primary: Bool) -> some View {
            let writing = action == .writeDraft && reportFlow?.busy == .draft
            Button {
                run(action)
            } label: {
                BusyButtonLabel(action.title, busy: writing, busyTitle: "Writing…")
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
                badge: { $0 == .checklist ? toDo : 0 }
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
                    if job.property != nil { PoolDiagramSection(job: job) }
                    TestsTab(job: job)
                    FindingsTab(job: job)
                }
            case .photos: JobPhotosSection(job: job, capture: capture)
            case .wrapUp: WrapUpSection(job: job, flow: reportFlow)
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
                changes += 1
            } catch {
                saveError = String(describing: error)
            }
        }

        private func reload() {
            guard let company = session.company,
                let found = (try? jobViews(sync.store, companyId: company.id))?.first(where: { $0.id == jobId })
            else {
                job = nil
                return
            }
            job = found
            let inspection = JobInspection(sync.store, jobId: jobId)
            // A pool inspection counts only the questions its gates leave open (2026-10-20).
            toDo = checklistToDo(
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
