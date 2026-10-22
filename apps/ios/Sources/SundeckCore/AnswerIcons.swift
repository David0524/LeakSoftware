import Foundation

// Port of packages/core/src/answer-icons.ts (owner, 2026-10-22): checklist answers as one-tap
// icon buttons on phones, the icon from what the answer means, never the job type's name.

/// The glyphs; `systemName` is the SF Symbol each one draws.
public enum AnswerSymbol: String, Codable, Sendable {
    case check, xmark, drop, exclamation, minus, skip

    public var systemName: String {
        switch self {
        case .check: "checkmark"
        case .xmark: "xmark"
        case .drop: "drop.fill"
        case .exclamation: "exclamationmark"
        case .minus: "minus"
        case .skip: "forward.end.fill"
        }
    }
}

/// The chosen icon's fill: a status color, or the link blue for an answer with no flag.
public enum AnswerTone: String, Codable, Sendable {
    case pass, fail, warning, excluded, plain
}

public struct AnswerIcon: Codable, Equatable, Hashable, Sendable {
    public var symbol: AnswerSymbol
    public var tone: AnswerTone

    public init(symbol: AnswerSymbol, tone: AnswerTone) {
        self.symbol = symbol
        self.tone = tone
    }
}

/// At most this many icons fit one phone line beside the name.
public let maxAnswerIcons = 4
/// The pill's word when nothing is chosen yet (the fallback menu).
public let chooseLabel = "Choose"
/// What an answer button or pill does, for VoiceOver's hint.
public let chooseHint = "Choose an answer"

private func tone(_ verdict: Verdict) -> AnswerTone {
    switch verdict {
    case .ok: .pass
    case .leaking: .fail
    case .attention: .warning
    case .na: .excluded
    }
}

/// A checklist item's answer as an icon: leaks ✓ drop ! –; maintenance Done ✓, Needs Attention !,
/// Skipped ⏭; yes/no items their words (Yes ✓, No ✗, N/A –), colored by meaning.
public func verdictIcon(_ answer: ComponentAnswer?, _ verdict: Verdict) -> AnswerIcon {
    let t = tone(verdict)
    if answer == .yesNo {
        return AnswerIcon(symbol: verdict == .ok ? .xmark : verdict == .na ? .minus : .check, tone: t)
    }
    switch verdict {
    case .na: return AnswerIcon(symbol: answer == .done ? .skip : .minus, tone: t)
    case .leaking: return AnswerIcon(symbol: .drop, tone: t)
    case .attention: return AnswerIcon(symbol: .exclamation, tone: t)
    case .ok: return AnswerIcon(symbol: .check, tone: t)
    }
}

private func wordSymbol(_ label: String) -> AnswerSymbol? {
    switch label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "yes": .check
    case "no": .xmark
    case "n/a", "not applicable": .minus
    default: nil
    }
}

private func flagSymbol(_ flag: ChoiceFlag) -> AnswerSymbol {
    switch flag {
    case .ok: .check
    case .leaking: .drop
    case .attention: .exclamation
    case .na: .minus
    }
}

private func flagTone(_ flag: ChoiceFlag) -> AnswerTone {
    switch flag {
    case .ok: .pass
    case .leaking: .fail
    case .attention: .warning
    case .na: .excluded
    }
}

/// A pool inspection question's options as icons, or nil when they don't map cleanly (the
/// question then keeps one pill that opens a menu).
public func choiceIcons(_ options: [ChoiceOption]) -> [AnswerIcon]? {
    guard options.count >= 2, options.count <= maxAnswerIcons else { return nil }
    var icons: [AnswerIcon] = []
    for option in options {
        guard let symbol = wordSymbol(option.label) ?? option.flag.map(flagSymbol) else { return nil }
        icons.append(AnswerIcon(symbol: symbol, tone: option.flag.map(flagTone) ?? .plain))
    }
    return Set(icons.map(\.symbol)).count == icons.count ? icons : nil
}
