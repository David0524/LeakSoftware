#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page: who, where, the status actions, and the work tabs. S3 builds the shell; the
    /// tabs fill in from S4 (inspection) to S7 (quotes and invoices). Port of
    /// apps/mobile/src/app/(app)/jobs/[id]/index.tsx.
    struct JobScreen: View {
        var jobId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openURL) private var openURL
        @State private var view: JobViewData?
        @State private var tab: JobTab = .checklist
        @State private var fee = ""
        @State private var notes = ""
        @State private var confirmCancel = false
        @State private var saveError: String?
        @FocusState private var focus: Field?

        enum Field { case fee, notes }

        var body: some View {
            Group {
                if let view, let company = session.company {
                    content(view, company)
                } else {
                    ContentUnavailableView("This job isn’t on this phone.", systemImage: "questionmark.folder")
                }
            }
            .navigationTitle(view?.job.number.map { "Job #\($0)" } ?? "New Job")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: sync.revision) { reload() }
            .onDisappear { saveNotes() }
            .alert("Couldn’t Save", isPresented: .constant(saveError != nil)) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        private func content(_ data: JobViewData, _ company: CompanyContext) -> some View {
            let job = data.job
            return List {
                if let tip = app.walkthrough.tip(screen: "job", company: company, pkg: data.tipPackage) {
                    Section { TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) } }
                }
                Section {
                    HStack {
                        StatusChip(status: job.status)
                        Spacer()
                        Text(
                            job.status == .inProgress
                                ? "Started" : jobWhen(job, now: Date(), timeZone: company.timeZone)
                        )
                        .font(.subheadline).foregroundStyle(Color.muted)
                    }
                    .frame(minHeight: minTarget)
                    customerRow(job)
                    if job.property != nil {
                        Button {
                            if let url = URL(string: data.mapsURL) { openURL(url) }
                        } label: {
                            HStack {
                                Text(job.address).foregroundStyle(.primary).multilineTextAlignment(.leading)
                                Spacer()
                                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                    .foregroundStyle(Color.brandPrimary)
                            }
                            .frame(minHeight: minTarget)
                        }
                        .accessibilityHint("Directions in Maps")
                        LabeledContent("Pool", value: data.poolText)
                    } else {
                        Text("Address not on this phone yet.").foregroundStyle(Color.muted)
                    }
                    LabeledContent("Tech", value: data.techs)
                }
                if let access = job.property?["access_notes"]?.string, !access.isEmpty {
                    Section { Notice(kind: .warning, text: access) }.listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if job.type != .maintenance {
                    Section {
                        LabeledContent("Detection fee ($)") {
                            TextField("0.00", text: $fee)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .focused($focus, equals: .fee)
                                .onSubmit { saveFee() }
                        }
                        .frame(minHeight: minTarget)
                        Toggle(
                            "Leak location marked",
                            isOn: Binding(
                                get: { job.job["location_marked"]?.bool ?? false },
                                set: { save(["location_marked": .bool($0)]) }))
                    }
                }
                statusActions(job)
                Section {
                    Picker("Work", selection: $tab) {
                        ForEach(JobTab.tabs(for: job)) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                    Text(tab.comingIn)
                        .font(.subheadline).foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity, minHeight: 88)
                }
                Section("Job notes") {
                    TextField("Anything the office should know", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                        .focused($focus, equals: .notes)
                }
            }
            .listStyle(.insetGrouped)
            .onChange(of: focus) { old, _ in
                if old == .fee { saveFee() }
                if old == .notes { saveNotes() }
            }
            .confirmationDialog("Cancel this job?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Cancel Job", role: .destructive) { changeStatus(.canceled) }
                Button("Keep Job", role: .cancel) {}
            } message: {
                Text("You can reopen it later.")
            }
        }

        @ViewBuilder private func customerRow(_ job: JobView) -> some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(job.customerName).font(.headline)
                    if let email = job.customer?["email"]?.string, !email.isEmpty {
                        Text(email).font(.subheadline).foregroundStyle(Color.muted)
                    }
                }
                Spacer()
                if let phone = job.customer?["phone"]?.string, let e164 = toE164(phone),
                    let url = URL(string: "tel:\(e164)")
                {
                    RoundIconButton(systemImage: "phone.fill", label: "Call \(formatPhone(e164))") { openURL(url) }
                }
            }
            .padding(.vertical, 4)
        }

        @ViewBuilder private func statusActions(_ job: JobView) -> some View {
            let transitions = userTransitions(from: job.status, type: job.type.rawValue)
            if !transitions.isEmpty {
                Section {
                    if transitions.contains(.inProgress) {
                        Button("Start Job") { changeStatus(.inProgress) }.buttonStyle(.primary)
                    }
                    let others = transitions.filter { $0 != .inProgress }
                    if !others.isEmpty {
                        HStack(spacing: 12) {
                            ForEach(others, id: \.self) { to in
                                Button(actionTitle(to)) {
                                    if to == .canceled { confirmCancel = true } else { changeStatus(to) }
                                }
                                .buttonStyle(SecondaryButtonStyle(tint: to == .canceled ? .fail : .brandPrimary))
                            }
                        }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }

        private func actionTitle(_ to: JobStatus) -> String {
            switch to {
            case .inProgress: "Start Job"
            case .scheduled: "Back to Scheduled"
            case .unscheduled: "Reopen Job"
            case .canceled: "Cancel Job"
            case .done: "Mark Done"
            default: to.label
            }
        }

        private func changeStatus(_ to: JobStatus) {
            var values: Row = ["status": .string(to.rawValue)]
            if to == .inProgress, view?.job.job["started_at"]?.string == nil {
                values["started_at"] = .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000))
            }
            save(values)
        }

        private func saveFee() {
            guard let current = view?.job else { return }
            let text = fee.trimmingCharacters(in: .whitespaces)
            let cents: JSONValue = text.isEmpty ? .null : parseDollars(text).map { .number(Double($0)) } ?? .null
            if cents != (current.job["fee_cents"] ?? .null) { save(["fee_cents": cents]) }
        }

        private func saveNotes() {
            guard let current = view?.job else { return }
            if (current.job["summary_notes"]?.string ?? "") != notes {
                save(["summary_notes": notes.isEmpty ? .null : .string(notes)])
            }
        }

        private func save(_ values: Row) {
            guard let company = session.company else { return }
            do {
                try sync.write("job", id: jobId, companyId: company.id, values)
            } catch {
                saveError = String(describing: error)
            }
        }

        private func reload() {
            guard let company = session.company,
                let job = (try? jobViews(sync.store, companyId: company.id))?.first(where: { $0.id == jobId })
            else {
                view = nil
                return
            }
            let data = JobViewData(job: job, team: sync.kv.team)
            if focus != .fee { fee = job.job["fee_cents"]?.number.map { formatDollars(Int($0)) } ?? "" }
            if focus != .notes, view == nil { notes = job.job["summary_notes"]?.string ?? "" }
            view = data
        }

        private func formatDollars(_ cents: Int) -> String {
            String(format: "%d.%02d", cents / 100, abs(cents % 100))
        }
    }

    /// What the job page shows, worked out once per reload.
    struct JobViewData {
        var job: JobView
        var techs: String
        var poolText: String
        var mapsURL: String
        var tipPackage: TipPackage?

        init(job: JobView, team: [TeamProfile]) {
            self.job = job
            let assignedId = job.job["assigned_user_id"]?.string
            let assignee = team.first { $0.id == assignedId }
            let second = team.first { $0.id == job.job["second_tech_id"]?.string }
            techs =
                (assignee?.displayName ?? (assignedId != nil ? "Teammate" : "Nobody yet"))
                + (second.map { " and \($0.displayName)" } ?? "")
            let poolType = job.property?["pool_type"]?.string.flatMap(PoolType.init(rawValue:))
            poolText = [poolType?.label, (job.property?["has_spa"]?.bool ?? false) ? "Pool and spa" : "Pool"]
                .compactMap { $0 }.joined(separator: " · ")
            mapsURL = nativeMapsUrl(
                MapPlace(address: job.address, location: propertyLocation(job.decodedProperty)), "ios")
            tipPackage = job.type == .maintenance ? .pool : job.type == .repair ? nil : .leak
        }
    }

    /// The work on a job. Their screens arrive in later milestones.
    enum JobTab: String, Identifiable, Hashable {
        case checklist, tests, findings, report, quote

        var id: String { rawValue }

        var title: String {
            switch self {
            case .checklist: "Checklist"
            case .tests: "Tests"
            case .findings: "Findings"
            case .report: "Report"
            case .quote: "Quote"
            }
        }

        var comingIn: String {
            switch self {
            case .checklist: "The checklist arrives in the next test build."
            case .tests, .findings: "\(title) arrive in the next test build."
            case .report: "Reports arrive in a later test build."
            case .quote: "Quotes arrive in a later test build."
            }
        }

        /// Tests and Findings aren't on maintenance visits; repairs have no quote.
        static func tabs(for job: JobView) -> [JobTab] {
            var tabs: [JobTab] = [.checklist]
            if job.type != .maintenance { tabs += [.tests, .findings] }
            tabs.append(.report)
            if job.type != .repair { tabs.append(.quote) }
            return tabs
        }
    }
#endif
