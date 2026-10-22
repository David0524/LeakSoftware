#if os(iOS)
    import SundeckCore
    import SwiftUI

    // A checklist item's answers on its one line (owner, 2026-10-22: "I actually like your icons";
    // docs/design/2026-10-22-phone-checklist.md): one icon button per answer, one tap each, the
    // chosen one filled in its status color; or, where the answers have no clear icons, one pill
    // that opens a menu. Same as the phone website's and Android's.

    /// One answer as an icon button: its full word for VoiceOver, never the glyph's name.
    struct AnswerIconChoice: Identifiable {
        var id: String { label }
        var label: String
        var icon: AnswerIcon
        var chosen: Bool
        var action: () -> Void
    }

    extension AnswerTone {
        /// The chosen icon's fill.
        var fill: Color {
            switch self {
            case .pass: .pass
            case .fail: .fail
            case .warning: .warning
            case .excluded: .excluded
            case .plain: .brandPrimary
            }
        }

        var onFill: Color { self == .plain ? .onPrimary : .onStatus }
    }

    /// The answers as icon pills, 40 by 36 inside 44 by 44 targets that touch but don't overlap.
    struct AnswerIconButtons: View {
        var itemLabel: String
        var choices: [AnswerIconChoice]
        /// The value that changes when an answer is chosen, for the selection haptic.
        var selection: String

        var body: some View {
            HStack(spacing: 0) {
                ForEach(choices) { choice in
                    Button(action: choice.action) {
                        Image(systemName: choice.icon.symbol.systemName)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(choice.chosen ? choice.icon.tone.onFill : Color.textMuted)
                            .frame(width: 40, height: 36)
                            .background(Capsule().fill(choice.chosen ? choice.icon.tone.fill : Color.fill))
                            .frame(width: minTarget, height: minTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(choice.label)
                    .accessibilityAddTraits(choice.chosen ? [.isSelected] : [])
                    .accessibilityHint(choice.chosen ? "Tap again to clear" : "")
                    .help(choice.label)
                }
            }
            .animation(Motion.bouncy, value: selection)
            .sensoryFeedback(.selection, trigger: selection)
            .keepsHorizontalDrags()
            .accessibilityElement(children: .contain)
            .accessibilityLabel(itemLabel)
        }
    }

    /// The fallback: the answer as a tinted pill with a chevron ("Choose" in the link blue while
    /// unanswered) that opens a menu of the options, with Not Done once answered.
    struct AnswerMenuPill: View {
        var itemLabel: String
        var options: [ChoiceOption]
        var chosen: String?
        var choose: (String?) -> Void

        var body: some View {
            let tone = chosenTone
            let ink = tone.map { $0 == .plain ? Color.link : $0.fill } ?? Color.link
            Menu {
                ForEach(options, id: \.label) { option in
                    Button {
                        choose(option.label)
                    } label: {
                        if option.label == chosen {
                            Label(option.label, systemImage: "checkmark")
                        } else {
                            Text(option.label)
                        }
                    }
                }
                if chosen != nil {
                    Divider()
                    Button("Not Done") { choose(nil) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(chosen ?? chooseLabel)
                        .lineLimit(2)
                        .multilineTextAlignment(.trailing)
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
                }
                .font(.role(.secondary).weight(.semibold))
                .foregroundStyle(ink)
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .frame(maxWidth: 170)
                .background(Capsule().fill(tone == nil ? Color.fill : ink.opacity(0.14)))
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(itemLabel)
            .accessibilityValue(chosen ?? "To Do")
            .accessibilityHint(chooseHint)
            .sensoryFeedback(.selection, trigger: chosen)
        }

        private var chosenTone: AnswerTone? {
            guard let chosen, let option = options.first(where: { $0.label == chosen }) else { return nil }
            switch option.flag {
            case .ok: return .pass
            case .leaking: return .fail
            case .attention: return .warning
            case .na: return .excluded
            case nil: return .plain
            }
        }
    }

    /// The small "›" at a row's end that opens the item's own screen (44 by 44).
    struct ItemDetailsButton: View {
        var itemLabel: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.textMuted.opacity(0.7))
                    .frame(width: minTarget, height: minTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(itemLabel) Details")
            .accessibilityHint("Opens the item: method, notes, and photos")
        }
    }
#endif
