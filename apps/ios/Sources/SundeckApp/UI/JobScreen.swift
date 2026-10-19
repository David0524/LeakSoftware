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

        /// `section` opens a given part (links from Reports and Invoices open Wrap-Up; screenshots);
        /// otherwise the part last shown on this job while the app runs, else Details.
        init(jobId: String, section: JobPageSection? = nil) {
            self.jobId = jobId
            _section = State(initialValue: section)
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
            // A plain String: a localized title would print 1042 as "1,042".
            .navigationTitle(job?.number.map { "Job #" + String($0) } ?? "New Job")
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
                        } header: {
                            switcher(sections, current)
                        }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
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
                                Button(jobActionTitle(to)) { changeStatus(to) }.buttonStyle(.primary)
                            } else {
                                Button(jobActionTitle(to)) { changeStatus(to) }.buttonStyle(.secondary)
                            }
                        }
                    }
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
            case .checklist: ChecklistTab(job: job)
            case .findings:
                VStack(alignment: .leading, spacing: 32) {
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

        private func choose(_ next: JobPageSection) {
            withAnimation(Motion.smooth) { section = next }
            JobSectionMemory.remember(next, for: jobId)
        }

        // MARK: - Writes

        private func changeStatus(_ to: JobStatus) {
            guard let company = session.company, let job else { return }
            do {
                try sync.write("job", id: jobId, companyId: company.id, jobStatusValues(to, job: job.job))
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
