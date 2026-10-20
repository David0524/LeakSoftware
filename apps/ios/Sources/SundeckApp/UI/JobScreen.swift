#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page (spec 5.4): large title "Job #1040", the status chip, type and time, the
    /// status buttons and the sync bar; then the section switcher (Details, Checklist, Findings,
    /// Photos, Wrap-Up; no Findings on a maintenance visit), which pins under the navigation bar
    /// as the page scrolls, and the chosen section. Port of apps/web/src/app/(office)/jobs/[id]/page.tsx
    /// and components/job-sections.tsx.
    struct JobScreen: View {
        var jobId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var job: JobView?
        @State private var section: JobPageSection?
        @State private var toDo = 0
        @State private var saveError: String?
        @State private var changes = 0
        /// Why Complete Job was stopped (the checklist, or the pool photo), shown under the header.
        @State private var blocked: String?
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
                .mediaViewer(jobId: jobId)
                .onChange(of: section) { _, _ in
                    proxy.scrollTo("top", anchor: .top)
                }
            }
        }

        // MARK: - Header

        /// The status chip and type, the time on its own line, the status buttons, the sync bar.
        private func header(_ job: JobView, _ company: CompanyContext) -> some View {
            let actions = jobHeaderActions(job.status, type: job.type)
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
                            if to == .inProgress {
                                Button(jobActionLabel(from: job.status, to: to)) { changeStatus(to) }.buttonStyle(
                                    .primary)
                            } else {
                                Button(jobActionLabel(from: job.status, to: to)) { changeStatus(to) }.buttonStyle(
                                    .secondary)
                            }
                        }
                    }
                }
                // Shown once: at the end of a visit's Checklist when that's open, else here.
                if let blocked, job.status != .done,
                    !(currentSection(job) == .checklist && checklistShowsCompleteJob(job))
                {
                    CompleteJobNotice(jobId: job.id, message: blocked)
                }
                SyncBarRow()
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
                ChecklistTab(job: job, editing: checklistEditing, complete: { changeStatus(.done) }, blocked: blocked)
            case .findings:
                VStack(alignment: .leading, spacing: 32) {
                    // The pool's drawing first, as on the website (owner, 2026-10-19).
                    if job.property != nil { PoolDiagramSection(job: job) }
                    TestsTab(job: job)
                    FindingsTab(job: job)
                }
            case .photos: JobPhotosSection(job: job)
            case .wrapUp: WrapUpSection(job: job)
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

        private func changeStatus(_ to: JobStatus) {
            guard let company = session.company, let job else { return }
            // Complete Job waits for the checklist or a pool photo, when the shop asks.
            if let block = statusChangeBlock(to, sync.store, settings: company.settings, jobId: jobId) {
                withAnimation { blocked = block }
                return
            }
            do {
                try sync.write("job", id: jobId, companyId: company.id, jobStatusValues(to, job: job.job))
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
            toDo = checklistTally(inspection.components, inspection.results).pending
            if section == nil { section = JobSectionMemory.section(for: jobId, type: found.type) }
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
