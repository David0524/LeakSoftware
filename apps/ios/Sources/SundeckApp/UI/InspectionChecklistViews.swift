#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Pool Inspection's checklist (owner, 2026-10-20; docs/plans/pool-inspection.md), as the
    // website's inspection-checklist.tsx: each section a grouped block that folds away with its
    // progress ("12 of 49 answered"); group headers; banners above their question; a gate's answer
    // folding its group as "Not present"; one row per question with its answers as pills on the
    // row, and Describe and photo buttons that show a count once used.

    /// One answer pill (44 tall): `fill` until chosen, then `selected` with `onSelected` text.
    struct ChoicePill: View {
        var title: String
        var isOn: Bool
        var selected: Color = .brandPrimary
        var onSelected: Color = .onPrimary
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Text(title)
                    .font(.role(.secondary).weight(.semibold))
                    .foregroundStyle(isOn ? onSelected : Color.text)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(minHeight: minTarget)
                    .background(Capsule().fill(isOn ? selected : Color.fill))
                    .contentShape(Capsule())
                    .animation(Motion.bouncy, value: isOn)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? [.isSelected] : [])
        }
    }

    /// One inspection section as a grouped block that folds away: a 56 tall header with a chevron,
    /// the section's name and its progress; open, its questions.
    struct InspectionSectionGroup: View {
        var section: InspectionSectionRows
        var photos: [String: Int]
        var editing: Bool
        var answer: (InspectionQuestionRow, InspectionValue?) -> Void
        var saveText: (InspectionQuestionRow, String) -> Void
        var saveNotes: (InspectionQuestionRow, String) -> Void
        var addPhotos: (InspectionQuestionRow) -> Void
        var remove: (InspectionQuestionRow) -> Void
        /// nil follows the section: the first one with questions left starts open.
        @State private var folded: Bool?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            let open = section.isOpen(folded: folded, editing: editing)
            VStack(alignment: .leading, spacing: 0) {
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
                        Text(section.progressText)
                            .font(.role(.secondary).weight(.medium))
                            .monospacedDigit()
                            .foregroundStyle(progressColor)
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
                .accessibilityHint(open ? "Folds the section" : "Shows the questions")
                if open {
                    Hairline()
                    ForEach(Array(section.questions.enumerated()), id: \.element.id) { index, question in
                        if let header = question.header {
                            SectionLabel(header)
                                .padding(.horizontal, 16)
                                .padding(.top, 16)
                                .padding(.bottom, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else if index > 0 {
                            Hairline().padding(.leading, 16)
                        }
                        if let notice = question.notice {
                            Notice(kind: .warning, text: notice)
                                .padding(.horizontal, 16)
                                .padding(.top, 12)
                        }
                        InspectionQuestionView(
                            question: question, photos: photos[question.id] ?? 0, editing: editing,
                            answer: { answer(question, $0) }, saveText: { saveText(question, $0) },
                            saveNotes: { saveNotes(question, $0) }, addPhotos: { addPhotos(question) },
                            remove: { remove(question) })
                        if let text = question.foldedText {
                            Text(text)
                                .textRole(.secondary)
                                .foregroundStyle(Color.textMuted)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
        }

        private var progressColor: Color {
            switch section.progressTone {
            case .muted: .textMuted
            case .pass: .pass
            case .warning: .warning
            case .fail: .fail
            }
        }
    }

    /// One question: its name with Describe and photo buttons, its answers as pills (or a text
    /// box), then the Describe box once used. In Edit: the name and Remove.
    private struct InspectionQuestionView: View {
        var question: InspectionQuestionRow
        var photos: Int
        var editing: Bool
        var answer: (InspectionValue?) -> Void
        var saveText: (String) -> Void
        var saveNotes: (String) -> Void
        var addPhotos: () -> Void
        var remove: () -> Void
        @State private var describing = false
        @State private var textDraft: String?
        @State private var notesDraft: String?
        @State private var confirmRemove = false
        @FocusState private var textFocused: Bool
        @FocusState private var notesFocused: Bool

        var body: some View {
            let ask = removeItemConfirm(question.label, fromPlan: false)
            Group {
                if editing { editRow } else { answerRow }
            }
            .confirmationDialog(ask.title, isPresented: $confirmRemove, titleVisibility: .visible) {
                Button(ask.confirm, role: .destructive, action: remove)
            } message: {
                if let message = ask.message { Text(message) }
            }
        }

        private var editRow: some View {
            HStack(spacing: 12) {
                Text(question.label)
                    .font(.role(.bodyMedium))
                    .foregroundStyle(Color.text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                Button("Remove", role: .destructive) { confirmRemove = true }
                    .buttonStyle(.danger)
                    .accessibilityLabel("Remove \(question.label)")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }

        private var answerRow: some View {
            VStack(alignment: .leading, spacing: 8) {
                if question.kind == .choice {
                    // One line (owner, 2026-10-22): the question, its answers as icons (or one
                    // pill and its menu when they have no clear icons), Describe and photos.
                    HStack(spacing: 4) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(question.label)
                                .font(.role(.bodyMedium))
                                .foregroundStyle(Color.text)
                                .multilineTextAlignment(.leading)
                            if let line = question.subline(photos: photos) {
                                Text(line).textRole(.footnote).foregroundStyle(Color.textMuted).lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)
                        answerControl
                        if question.result != nil { describeButton }
                        photoButton
                    }
                } else {
                    HStack(alignment: .top, spacing: 4) {
                        Text(question.label)
                            .font(.role(.bodyMedium))
                            .foregroundStyle(Color.text)
                            .multilineTextAlignment(.leading)
                            .padding(.top, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityAddTraits(.isHeader)
                        if question.result != nil { describeButton }
                        photoButton
                    }
                    switch question.kind {
                    case .text: textBox
                    default: pills
                    }
                }
                if question.result != nil && (describing || !question.notes.isEmpty) { notesBox }
            }
            .padding(.leading, 16)
            .padding(.trailing, question.kind == .choice ? 4 : 16)
            .padding(.vertical, question.kind == .choice ? 4 : 8)
        }

        /// A choice question's answers: icons when its options map to them, else the menu pill.
        @ViewBuilder private var answerControl: some View {
            if let icons = question.icons {
                AnswerIconButtons(
                    itemLabel: question.label,
                    choices: zip(question.options, icons).map { option, icon in
                        AnswerIconChoice(label: option.label, icon: icon, chosen: question.isChosen(option)) {
                            answer(question.valueAfterTapping(option))
                        }
                    },
                    selection: question.chosenLabel ?? "")
            } else {
                AnswerMenuPill(itemLabel: question.label, options: question.options, chosen: question.chosenLabel) {
                    label in
                    answer(label.map { InspectionValue.text($0) })
                }
            }
        }

        /// Opens the Describe box; tinted once it holds notes.
        private var describeButton: some View {
            let has = !question.notes.isEmpty
            return Button {
                describing.toggle()
                if describing { notesFocused = true }
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(has ? Color.link : Color.textMuted)
                    .frame(width: minTarget, height: minTarget)
                    .background(Circle().fill(has ? Color.iconTint : Color.clear))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Describe: \(question.label)")
            .accessibilityValue(has ? "Has notes" : "")
        }

        /// Adds photos to this question, with how many it has.
        private var photoButton: some View {
            Button(action: addPhotos) {
                Image(systemName: "camera")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(photos > 0 ? Color.link : Color.textMuted)
                    .frame(width: minTarget, height: minTarget)
                    .background(Circle().fill(photos > 0 ? Color.iconTint : Color.clear))
                    .overlay(alignment: .topTrailing) {
                        if photos > 0 { CountBadge(text: "\(photos)").offset(x: 2, y: -2) }
                    }
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add photos: \(question.label)")
            .accessibilityValue(photos > 0 ? (photos == 1 ? "1 photo so far" : "\(photos) photos so far") : "")
        }

        /// The options as pills that wrap: a choice colored by what it means once chosen (tap it
        /// again to clear), several turned on and off.
        private var pills: some View {
            FlowRow(spacing: 8) {
                ForEach(question.options, id: \.label) { option in
                    let on = question.isChosen(option)
                    ChoicePill(
                        title: option.label, isOn: on, selected: selectedFill(option),
                        onSelected: question.kind == .multi || option.flag == nil ? .onPrimary : .onStatus
                    ) {
                        answer(question.valueAfterTapping(option))
                    }
                    .accessibilityHint(
                        question.kind == .multi
                            ? (on ? "Turns it off" : "Turns it on") : on ? "Clears the answer" : "")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(question.label)
            .sensoryFeedback(.selection, trigger: question.value)
        }

        private func selectedFill(_ option: ChoiceOption) -> Color {
            guard question.kind == .choice else { return .brandPrimary }
            switch option.flag {
            case .ok: return .pass
            case .attention: return .warning
            case .leaking: return .fail
            case .na: return .excluded
            case nil: return .brandPrimary
            }
        }

        /// A text answer, saved when the box loses focus.
        private var textBox: some View {
            TextField(
                "", text: Binding(get: { textDraft ?? question.value?.text ?? "" }, set: { textDraft = $0 }),
                prompt: Text("Answer").foregroundStyle(Color.placeholder), axis: .vertical
            )
            .lineLimit(2...8)
            .textRole(.body)
            .foregroundStyle(Color.text)
            .focused($textFocused)
            .fieldBox(focused: textFocused)
            .accessibilityLabel(question.label)
            .onChange(of: textFocused) { _, focused in
                if !focused, let draft = textDraft {
                    saveText(draft)
                    textDraft = nil
                }
            }
        }

        /// The Describe box: notes on the question, saved when it loses focus.
        private var notesBox: some View {
            TextField(
                "", text: Binding(get: { notesDraft ?? question.notes }, set: { notesDraft = $0 }),
                prompt: Text("Describe").foregroundStyle(Color.placeholder), axis: .vertical
            )
            .lineLimit(2...8)
            .textRole(.body)
            .foregroundStyle(Color.text)
            .focused($notesFocused)
            .fieldBox(focused: notesFocused)
            .accessibilityLabel("Describe: \(question.label)")
            .onChange(of: notesFocused) { _, focused in
                if !focused {
                    if let draft = notesDraft { saveNotes(draft) }
                    notesDraft = nil
                    describing = false
                }
            }
        }
    }
#endif
