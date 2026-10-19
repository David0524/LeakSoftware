#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Where the app goes from the jobs list.
    enum Route: Hashable {
        case job(String)
        case settings
        /// A checklist item's screen: its answer, notes, tests and findings.
        case component(jobId: String, componentId: String)
        /// A signature on the job; with a quote, the customer accepting it on site.
        case signature(jobId: String, quoteId: String?)
        /// The end of the visit: the customer reviews the work and signs off the report.
        case review(jobId: String)
    }

    /// The editors that open as sheets over the job (S4).
    enum EditorSheet: Identifiable, Hashable {
        /// A test: `testId` nil for a new one of `typeId`, optionally on a checklist item.
        case test(jobId: String, testId: String?, typeId: String?, componentId: String?)
        /// A finding: `findingId` nil for a new one, optionally on a checklist item.
        case finding(jobId: String, findingId: String?, componentId: String?)

        var id: Self { self }
    }

    extension EnvironmentValues {
        /// Pushes a screen on the current tab's stack.
        @Entry var openRoute: (Route) -> Void = { _ in }
        /// Opens a test or finding editor as a sheet.
        @Entry var openEditor: (EditorSheet) -> Void = { _ in }
    }

    /// Today's jobs first, then upcoming, not scheduled and recent. Port of
    /// apps/mobile/src/app/(app)/index.tsx.
    struct JobsView: View {
        var newJob: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute
        @State private var sections: [JobSection] = []
        @State private var loaded = false

        var body: some View {
            let company = session.company
            List {
                Section {
                    SyncBarRow()
                    if let company, let tip = app.walkthrough.tip(screen: "jobs", company: company) {
                        TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) }
                    }
                }
                ForEach(sections) { section in
                    Section(section.title) {
                        ForEach(section.jobs) { job in
                            Button {
                                openRoute(.job(job.id))
                            } label: {
                                JobRow(job: job, timeZone: company?.timeZone ?? "America/Phoenix")
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .overlay {
                if loaded && sections.isEmpty { emptyState }
            }
            .refreshable {
                await sync.syncNow()
            }
            .sensoryFeedback(.impact(weight: .light), trigger: sync.status.phase == .syncing)
            .navigationTitle(company?.name ?? "Jobs")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        openRoute(.settings)
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
                if let company, canMakeJobs(company.role, company.settings) {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: newJob) {
                            Label("New Job", systemImage: "plus")
                        }
                    }
                }
            }
            .task(id: "\(sync.revision)|\(company?.id ?? "")") { reload() }
        }

        private var emptyState: some View {
            let canAdd = session.company.map { canMakeJobs($0.role, $0.settings) } ?? false
            return ContentUnavailableView {
                Label("No jobs yet", systemImage: "calendar")
            } description: {
                Text(
                    canAdd
                        ? "Create your first job. It works without signal and syncs when you’re back online."
                        : "Jobs the office gives you show up here.")
            } actions: {
                if canAdd { Button("New Job", action: newJob).buttonStyle(.primary).frame(maxWidth: 240) }
            }
        }

        private func reload() {
            guard let company = session.company else { return }
            let views = (try? jobViews(sync.store, companyId: company.id)) ?? []
            sections = jobSections(views, now: Date(), timeZone: company.timeZone)
            loaded = true
        }
    }

    struct JobRow: View {
        var job: JobView
        var timeZone: String

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(job.customerName).font(.body.weight(.semibold)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(jobWhen(job, now: Date(), timeZone: timeZone))
                        .font(.subheadline).foregroundStyle(Color.muted).lineLimit(1)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(job.numberText) · \(job.address)")
                        .font(.subheadline).foregroundStyle(Color.muted).lineLimit(2)
                    Spacer(minLength: 8)
                    StatusChip(status: job.status)
                }
            }
            .padding(.vertical, 4)
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
        }
    }

    /// The sync bar as the first row of a list; hidden when everything is saved. Tapping it
    /// opens Settings. Port of apps/mobile/src/ui/SyncBar.tsx.
    struct SyncBarRow: View {
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            if let message = syncBarMessage(sync.status) {
                Button {
                    openRoute(.settings)
                } label: {
                    HStack(spacing: 10) {
                        Circle().fill(color(message.tone)).frame(width: 10, height: 10)
                        Text(message.text).font(.subheadline).foregroundStyle(.primary)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .frame(minHeight: minTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(message.accessibilityLabel)
                .accessibilityHint("Opens Settings")
            }
        }

        private func color(_ tone: SyncBarMessage.Tone) -> Color {
            switch tone {
            case .good: .pass
            case .working: .info
            case .attention: .warning
            case .problem: .fail
            }
        }
    }

    /// A one-time tip with a close button. Port of apps/mobile/src/ui/Tip.tsx.
    struct TipRow: View {
        var tip: Tip
        var close: () -> Void

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lightbulb").foregroundStyle(Color.brandPrimary).font(.title3)
                VStack(alignment: .leading, spacing: 4) {
                    Text(tip.title).font(.body.weight(.semibold))
                    Text(tip.message).font(.subheadline).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                Button(action: close) {
                    Image(systemName: "xmark").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                        .frame(width: minTarget, height: minTarget)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close Tip")
            }
            .accessibilityElement(children: .contain)
        }
    }
#endif
