#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// The job page's Checklist section (spec 5.4): the tally, the job's tip, one folding block per
    /// checklist section with each item's answers in one tap, and "Add an item". Complete Job is on
    /// the job page's Next Step bar (owner, 2026-10-20). Works offline; every
    /// write goes through the sync layer. Port of ChecklistEditor in apps/web/src/components/job-work.tsx.
    struct ChecklistTab: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var adding = ""
        @State private var saveError: String?
        /// Edit, as in an iOS list: every item gets Remove (owner, 2026-10-19).
        @State private var editing: Bool
        /// A pool inspection question's camera button: photos attached to that question.
        @State private var capture: CaptureController

        init(job: JobView, editing: Bool = false) {
            self.job = job
            _editing = State(initialValue: editing)
            _capture = State(initialValue: CaptureController(target: MediaTarget(jobId: job.id)))
        }

        /// The visit's day, else today (website: `plan_date ?? today`).
        private func today(_ company: CompanyContext) -> String {
            job.job["plan_date"]?.string ?? (try? localDate(Date(), company.timeZone)) ?? ""
        }

        // Worked out on every render: reading `sync.revision` re-renders after any write or pull.
        var body: some View {
            let _ = sync.revision
            if let company = session.company {
                let config = InspectionConfig(sync.store, companyId: company.id)
                let inspection = JobInspection(sync.store, jobId: job.id)
                let model = ChecklistModel(
                    config: config, inspection: inspection, jobType: job.type, property: job.decodedProperty)
                VStack(alignment: .leading, spacing: 0) {
                    // Chemical first, above the checklist, opened in place (owner, 2026-10-19): for
                    // this visit's pool, so its gallons fill in and Submit saves to its log.
                    if job.type == .maintenance {
                        if let pool = job.property {
                            ChemicalCard(target: ChemicalTarget(propertyId: pool.id, jobId: job.id))
                                .padding(.bottom, 24)
                        }
                        // The plan's regular cleanings (owner, 2026-10-19).
                        let cleanings = visitRegularCleanings(
                            sync.store, companyId: company.id, job: job.job, inspection, config, day: today(company))
                        if !cleanings.isEmpty {
                            VisitCleaningsBox(cleanings: cleanings).padding(.bottom, 24)
                        }
                    }
                    HStack(alignment: .firstTextBaseline) {
                        SectionHeading("Checklist").frame(maxWidth: .infinity, alignment: .leading)
                        if model.canEdit {
                            // Edit / Done, as an iOS list's: the visible way to remove items
                            // (rows also swipe to Remove).
                            Button(editing ? "Done" : "Edit") { editing.toggle() }
                                .font(.role(editing ? .bodyEmphasis : .body))
                                .foregroundStyle(Color.link)
                                .frame(minWidth: minTarget, minHeight: minTarget)
                                .contentShape(Rectangle())
                                .buttonStyle(.plain)
                                .accessibilityHint(editing ? "Stops removing items" : "Shows Remove on every item")
                        }
                    }
                    Text(model.isEmpty ? "No checklist yet." : model.tallyText)
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .rollingNumber(model.tallyText)
                        .padding(.bottom, 12)
                    if let tip = app.walkthrough.tip(screen: "job", company: company, pkg: tipPackage) {
                        TipRow(tip: tip) { app.walkthrough.dismiss(tip.id) }.padding(.bottom, 20)
                    }
                    if model.isEmpty {
                        Button("Set Up Checklist") { setUp(config.componentTypes) }.buttonStyle(.secondary)
                    } else {
                        let photos = photoCounts()
                        VStack(spacing: 12) {
                            // A pool inspection's sections, with their own rows (2026-10-20).
                            ForEach(model.inspection.sections) { section in
                                InspectionSectionGroup(
                                    section: section, photos: photos, editing: editing, answer: answer,
                                    saveText: saveText, saveNotes: saveNotes, addPhotos: addPhotos,
                                    remove: { remove($0.component, $0.result) })
                            }
                            ForEach(model.sections) { section in
                                ChecklistGroup(
                                    jobId: job.id, section: section, photos: photos, editing: editing,
                                    choose: choose, saveWhere: saveWhere, remove: remove,
                                    markRest: { markRest(section.items) }, undoMarked: undoMarked)
                            }
                        }
                        if !model.addOptions.isEmpty { addItem(model, inspection).padding(.top, 16) }
                    }
                }
                .captureFlow(capture)
                .alert(
                    "Couldn’t Save",
                    isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
                ) {
                    Button("OK") { saveError = nil }
                } message: {
                    Text(saveError ?? "")
                }
            }
        }

        private var tipPackage: TipPackage? {
            job.type == .maintenance ? .pool : job.type == .repair ? nil : .leak
        }

        /// Photos on each item, for "2 photos" on its line.
        private func photoCounts() -> [String: Int] {
            jobMedia(sync.store, MediaTarget(jobId: job.id))
                .filter { $0.kind == .photo && $0.jobComponentId != nil }
                .reduce(into: [:]) { counts, media in counts[media.jobComponentId ?? "", default: 0] += 1 }
        }

        /// A select of what can be added beside a secondary Add, disabled until something is chosen.
        private func addItem(_ model: ChecklistModel, _ inspection: JobInspection) -> some View {
            let options = model.addOptions
            return VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Add an item")
                HStack(spacing: 12) {
                    SelectField(
                        label: nil, selection: $adding, options: [""] + options.map(\.id),
                        optionLabel: { id in options.first { $0.id == id }?.label ?? "Choose…" }
                    )
                    .accessibilityLabel("Add an item")
                    Button("Add") {
                        guard let option = options.first(where: { $0.id == adding }) else { return }
                        addAnother(option.type, inspection)
                        adding = ""
                    }
                    .buttonStyle(.secondary)
                    .disabled(adding.isEmpty)
                }
            }
        }

        // MARK: - Writes

        private func run(_ body: () throws -> Void) {
            do { try body() } catch { saveError = String(describing: error) }
        }

        private func setUp(_ types: [ComponentType]) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.createChecklist(
                    sync, companyId: company.id, jobId: job.id, types: types,
                    property: ChecklistModel.planningProperty(job.decodedProperty), jobType: job.type)
            }
        }

        private func choose(_ item: ChecklistItemRow, _ verdict: Verdict?) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.setVerdict(
                    sync, companyId: company.id, jobId: job.id, componentId: item.component.id, existing: item.result,
                    verdict: verdict, userId: session.user?.id)
            }
        }

        /// Mark N Remaining, saved straight away; returns what Undo puts back.
        private func markRest(_ items: [ChecklistItemRow]) -> MarkedUndo? {
            guard let company = session.company else { return nil }
            do {
                let ids = try InspectionWrites.markRemaining(
                    sync, companyId: company.id, jobId: job.id, items: items, userId: session.user?.id)
                return ids.isEmpty ? nil : MarkedUndo(resultIds: ids)
            } catch {
                saveError = String(describing: error)
                return nil
            }
        }

        private func undoMarked(_ marked: MarkedUndo) {
            guard let company = session.company else { return }
            run { try marked.undo(sync, companyId: company.id) }
        }

        private func addAnother(_ type: ComponentType, _ inspection: JobInspection) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.addComponent(
                    sync, companyId: company.id, jobId: job.id, type: type, existing: inspection.components)
            }
        }

        private func saveWhere(_ item: ChecklistItemRow, _ draft: String) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.saveWhere(
                    sync, companyId: company.id, jobId: job.id, componentId: item.component.id, result: item.result,
                    draft: draft)
            }
        }

        private func remove(_ item: ChecklistItemRow) { remove(item.component, item.result) }

        private func remove(_ component: JobComponent, _ result: ChecklistItemResult?) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.removeComponent(sync, companyId: company.id, component: component, result: result)
            }
        }

        // MARK: Pool inspection

        private func answer(_ question: InspectionQuestionRow, _ value: InspectionValue?) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.setAnswer(
                    sync, companyId: company.id, jobId: job.id, question: question, value: value,
                    userId: session.user?.id)
            }
        }

        private func saveText(_ question: InspectionQuestionRow, _ draft: String) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.saveTextAnswer(
                    sync, companyId: company.id, jobId: job.id, question: question, draft: draft,
                    userId: session.user?.id)
            }
        }

        private func saveNotes(_ question: InspectionQuestionRow, _ draft: String) {
            guard let company = session.company else { return }
            run {
                try InspectionWrites.saveNotes(
                    sync, companyId: company.id, jobId: job.id, question: question, draft: draft)
            }
        }

        /// Take a photo or choose from the library, attached to the question.
        private func addPhotos(_ question: InspectionQuestionRow) {
            capture.target = MediaTarget(jobId: job.id, componentId: question.id)
            capture.choosing = .photo
        }
    }

    /// One checklist section as a grouped block that folds away: a 56 tall header with a chevron,
    /// the name and its summary; open, a row per item and "Mark N Remaining …", which shows
    /// "Marked N" and Undo in its place for 5 seconds after (owner, 2026-10-20).
    private struct ChecklistGroup: View {
        var jobId: String
        var section: ChecklistSectionRows
        var photos: [String: Int]
        var editing: Bool
        var choose: (ChecklistItemRow, Verdict?) -> Void
        var saveWhere: (ChecklistItemRow, String) -> Void
        var remove: (ChecklistItemRow) -> Void
        var markRest: () -> MarkedUndo?
        var undoMarked: (MarkedUndo) -> Void
        /// nil follows the items: open while any are to do.
        @State private var folded: Bool?
        @State private var marked: MarkedUndo?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            // Editing opens every section, so each item shows its Remove button.
            // Open while Undo shows, though nothing is left to do.
            let open = section.isOpen(folded: folded, editing: editing) || marked != nil
            VStack(spacing: 0) {
                Button {
                    let shown = !(folded ?? !section.startsOpen)
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { folded = shown }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.textMuted)
                            .rotationEffect(.degrees(open ? 90 : 0))
                            .frame(width: 20)
                            .accessibilityHidden(true)
                        Text(section.title)
                            .textRole(.bodyEmphasis)
                            .foregroundStyle(Color.text)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(section.summary)
                            .font(summaryFont)
                            .monospacedDigit()
                            .foregroundStyle(summaryColor)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
                .accessibilityHint(open ? "Folds the section" : "Shows the items")
                if open {
                    Hairline()
                    ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { Hairline().padding(.leading, 16) }
                        ChecklistItemView(
                            jobId: jobId, item: item, photos: photos[item.component.id] ?? 0, editing: editing,
                            choose: { choose(item, $0) }, saveWhere: { saveWhere(item, $0) },
                            remove: { remove(item) })
                    }
                    if let marked {
                        Hairline()
                        UndoRow(text: marked.text) {
                            undoMarked(marked)
                            withAnimation(Motion.smooth) { self.marked = nil }
                        }
                        .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else if let title = section.markRemainingTitle {
                        Hairline()
                        ActionRow(title) { withAnimation(Motion.smooth) { marked = markRest() } }
                    }
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
            .undoWindow($marked)
        }

        /// Barlow SemiBold 15.
        private var summaryFont: Font {
            TypeRole.sectionLabel.brandFont.map { Font.custom($0.rawValue, size: 15, relativeTo: .subheadline) }
                ?? .subheadline.weight(.semibold)
        }

        private var summaryColor: Color {
            switch section.summaryTone {
            case .muted: .textMuted
            case .pass: .pass
            case .warning: .warning
            case .fail: .fail
            }
        }
    }

    /// One item: its name (opening the item's screen), then its answers as an inline segmented
    /// control, full width and 44 tall (owner, 2026-10-20: one tap; tapping the chosen one again
    /// clears it). "Where" under a Leaking or Attention item saves by itself 1 second after typing
    /// stops and when it loses focus. Remove stays behind Edit and swipe to remove.
    private struct ChecklistItemView: View {
        var jobId: String
        var item: ChecklistItemRow
        var photos: Int
        var editing: Bool
        var choose: (Verdict?) -> Void
        var saveWhere: (String) -> Void
        var remove: () -> Void
        @Environment(\.openRoute) private var openRoute
        @State private var draft: String?
        @State private var confirmRemove = false
        @State private var savedWhere = false
        @FocusState private var focused: Bool

        var body: some View {
            let ask = item.removeConfirm
            Group {
                if editing {
                    editRow
                } else {
                    // Swipe left to Remove; Edit over the checklist is the visible way.
                    SwipeDeleteRow(name: item.component.label, title: "Remove", delete: { confirmRemove = true }) {
                        verdictRow
                    }
                }
            }
            .confirmationDialog(ask.title, isPresented: $confirmRemove, titleVisibility: .visible) {
                Button(ask.confirm, role: .destructive, action: remove)
            } message: {
                if let message = ask.message { Text(message) }
            }
        }

        /// In Edit: the name and a red Remove (website: the same row with a danger button).
        private var editRow: some View {
            HStack(spacing: 12) {
                Text(item.component.label)
                    .font(.role(.bodyMedium))
                    .foregroundStyle(Color.text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                Button("Remove", role: .destructive) { confirmRemove = true }
                    .buttonStyle(.danger)
                    .accessibilityLabel("Remove \(item.component.label)")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }

        /// The name and its sub-line; tapping opens the item's screen (apps only).
        private var name: some View {
            Button {
                openRoute(.component(jobId: jobId, componentId: item.component.id))
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.component.label)
                        .font(.role(.bodyMedium))
                        .foregroundStyle(item.isCheck && item.isDone ? Color.textMuted : Color.text)
                        .multilineTextAlignment(.leading)
                    if let line = item.subline(photos: photos) {
                        Text(line).textRole(.footnote).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the item: method, notes, and photos")
        }

        private var verdictRow: some View {
            VStack(alignment: .leading, spacing: 4) {
                name
                VerdictSegments(item: item, choose: choose)
                if item.needsWhere && item.result != nil {
                    whereField
                    if savedWhere { SavedLabel() }
                }
                if let reason = item.exclusionText {
                    Text(reason).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }

        private var whereField: some View {
            TextField(
                "Where",
                text: Binding(get: { draft ?? item.result?.locationText ?? "" }, set: { draft = $0 }),
                prompt: Text("Where? Under the deck, at the throat…").foregroundStyle(Color.placeholder)
            )
            .textRole(.body)
            .foregroundStyle(Color.text)
            .focused($focused)
            .submitLabel(.done)
            .onSubmit { focused = false }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: minTarget)
            .background(RoundedRectangle(cornerRadius: CGFloat(Radius.field), style: .continuous).fill(Color.bg))
            .overlay(
                RoundedRectangle(cornerRadius: CGFloat(Radius.field), style: .continuous)
                    .strokeBorder(focused ? Color.focus : Color.controlBorder, lineWidth: focused ? 2 : 1)
            )
            .padding(.bottom, 4)
            .accessibilityLabel("Where: \(item.component.label)")
            .keepsHorizontalDrags()
            .onChange(of: focused) { _, isFocused in
                if !isFocused, let draft {
                    save(draft)
                    self.draft = nil
                }
            }
            .task(id: draft) {
                guard let draft else { return }
                try? await Task.sleep(for: Autosave.delay)
                guard !Task.isCancelled else { return }
                save(draft)
            }
            .onDisappear { if let draft { saveWhere(draft) } }
        }

        private func save(_ text: String) {
            guard text != (item.result?.locationText ?? "") else { return }
            saveWhere(text)
            withAnimation { savedWhere = true }
        }
    }

    /// An item's answers in one tap (owner, 2026-10-20): the core `verdictOptions` labels as a
    /// segmented control, 44 tall and full row width; the chosen one in its status color, and
    /// tapping it again clears it back to To do.
    private struct VerdictSegments: View {
        var item: ChecklistItemRow
        var choose: (Verdict?) -> Void

        var body: some View {
            HStack(spacing: 2) {
                ForEach(item.options, id: \.value) { option in
                    let chosen = option.value == item.verdict
                    Button {
                        choose(item.verdictAfterTap(option.value))
                    } label: {
                        Text(option.label)
                            .font(.role(.segment).weight(chosen ? .semibold : .medium))
                            .foregroundStyle(chosen ? Color.onStatus : Color.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .padding(.horizontal, 4)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background {
                                if chosen { Capsule().fill(color(option.value)) }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(option.label)
                    .accessibilityAddTraits(chosen ? [.isSelected] : [])
                    .accessibilityHint(chosen ? "Tap again to clear" : "")
                }
            }
            .padding(2)
            .background(
                RoundedRectangle(cornerRadius: CGFloat(Radius.segmentTrack), style: .continuous).fill(Color.fill)
            )
            .animation(Motion.bouncy, value: item.verdict)
            .sensoryFeedback(.selection, trigger: item.verdict)
            .keepsHorizontalDrags()
            .accessibilityElement(children: .contain)
            .accessibilityLabel(item.component.label)
            .accessibilityValue(item.verdictLabel)
        }

        private func color(_ verdict: Verdict) -> Color {
            switch verdict {
            case .ok: .pass
            case .leaking: .fail
            case .attention: .warning
            case .na: .excluded
            }
        }
    }
#endif
