import Foundation
import Observation
import SundeckCore
import SundeckTokens

// The design system's rules that don't need SwiftUI, so they test on Linux: the type scale, the
// tints, which color each status gets, badge text, and the stored Light | Dark choice. Values from
// docs/design/2026-10-19-native-apps-follow-web.md (section 2 and 3); colors from brand/tokens.json.

// MARK: - Appearance

/// Light or Dark. The app starts Light whatever the phone's setting (brand/BRAND.md: dark screens
/// wash out in direct sun); More › On This Device › Appearance switches it.
public enum Appearance: String, CaseIterable, Sendable {
    case light, dark

    public var label: String {
        switch self {
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    /// The stored choice; anything else (nothing stored, an old value) is Light.
    public init(stored: String?) {
        self = stored.flatMap(Appearance.init(rawValue:)) ?? .light
    }
}

extension KVKey {
    /// This phone's Light | Dark choice. Kept when someone signs out: it belongs to the phone.
    public static let appearance = "appearance"
}

/// The phone's appearance choice, kept in `app_kv`.
@MainActor @Observable
public final class AppearanceSetting {
    public var choice: Appearance {
        didSet { if choice != oldValue { kv.set(KVKey.appearance, choice.rawValue) } }
    }
    @ObservationIgnored private let kv: KeyValue

    public init(_ kv: KeyValue) {
        self.kv = kv
        choice = Appearance(stored: kv.get(KVKey.appearance))
    }
}

// MARK: - Type

/// A text role from the phone type scale (spec 2.1).
public enum TypeRole: String, CaseIterable, Sendable {
    case largeTitle, sectionHeading, cardTitle, subHeading, sectionLabel, navTitle
    case body, bodyEmphasis, bodyMedium, secondary, footnote, tabLabel, segment

    public enum Face: Sendable { case display, body }
    public enum Weight: Sendable { case regular, medium, semibold, bold, extraBold }
    /// The system text style the role scales with (Dynamic Type).
    public enum Scale: Sendable { case largeTitle, title, title3, headline, body, subheadline, footnote, caption2 }

    /// The navigation bar's inline title is Barlow too, like the large title it folds into, so a
    /// screen's title keeps one face as it scrolls (owner, 2026-10-20: "'Schedule' has different
    /// fonts depending on if the map is hidden or not").
    public var face: Face {
        switch self {
        case .largeTitle, .sectionHeading, .cardTitle, .subHeading, .sectionLabel, .navTitle: .display
        default: .body
        }
    }

    public var weight: Weight {
        switch self {
        case .largeTitle: .extraBold
        case .sectionHeading, .cardTitle, .subHeading: .bold
        case .sectionLabel, .navTitle, .bodyEmphasis: .semibold
        case .bodyMedium, .tabLabel, .segment: .medium
        case .body, .secondary, .footnote: .regular
        }
    }

    public var size: Double {
        switch self {
        case .largeTitle: 34
        case .sectionHeading: 24
        case .cardTitle: 20
        case .subHeading: 18
        case .sectionLabel, .footnote: 13
        case .navTitle, .body, .bodyEmphasis, .bodyMedium: 17
        case .secondary, .segment: 15
        case .tabLabel: 11
        }
    }

    /// Line height in points (the website's line-height at a 16 px root).
    public var lineHeight: Double {
        switch self {
        case .largeTitle: 42
        case .sectionHeading: 32
        case .cardTitle, .subHeading: 28
        case .sectionLabel, .footnote: 18
        case .navTitle: 22
        case .body, .bodyEmphasis, .bodyMedium: 25.5
        case .secondary: 22.5
        case .tabLabel: 13
        case .segment: 20
        }
    }

    public var scale: Scale {
        switch self {
        case .largeTitle: .largeTitle
        case .sectionHeading: .title
        case .cardTitle: .title3
        case .subHeading, .navTitle: .headline
        case .body, .bodyEmphasis, .bodyMedium: .body
        case .secondary, .segment: .subheadline
        case .sectionLabel, .footnote: .footnote
        case .tabLabel: .caption2
        }
    }

    /// Section labels are uppercase by style; the copy stays sentence case ("Your account").
    public var uppercased: Bool { self == .sectionLabel }

    /// The Barlow file for a display role (there is no 400 weight of Barlow).
    public var brandFont: BrandFonts.Weight? {
        guard face == .display else { return nil }
        switch weight {
        case .extraBold: return .extraBold
        case .bold: return .bold
        default: return .semiBold
        }
    }
}

// MARK: - Shape and spacing

/// Corner radii (spec 2.3). Corners are continuous.
public enum Radius {
    public static let field: Double = 10
    public static let grouped: Double = 12
    public static let actionSheet: Double = 14
    /// Notices, empty states, wells, capture tiles, schedule stops.
    public static let block: Double = 16
    public static let card: Double = Tokens.Radius.xl
    public static let composer: Double = 22
    public static let segmentTrack: Double = 24
}

/// Spacing (spec 2.4), from `tokens.space`.
public enum Spacing {
    public static let pageMargin: Double = Tokens.Space.s4
    public static let betweenBlocks: Double = Tokens.Space.s5
    public static let labelToGroup: Double = Tokens.Space.s2
    public static let cardPadding: Double = 20
    public static let rowHorizontal: Double = Tokens.Space.s4
    public static let rowVertical: Double = 10
    public static let rowItems: Double = Tokens.Space.s3
    /// Below the last row of a tab screen so it clears the tab bar (the system handles it in Swift).
    public static let tabBarClearance: Double = 128
}

/// Tap targets (spec 2.6): 44 everywhere; the brand's 48 for the main field actions.
public enum TapTarget {
    public static let minimum: Double = 44
    public static let field: Double = Tokens.minTarget
}

// MARK: - Color

extension TokenColor {
    /// The color at `fraction` of its opacity (a token "at 12%").
    public func at(_ fraction: Double) -> TokenColor {
        TokenColor(red, green, blue, UInt8((Double(opacity) * fraction).rounded()))
    }

    /// This color at `fraction` opacity painted over `base`, as one color (source-over).
    public func at(_ fraction: Double, over base: TokenColor) -> TokenColor {
        let a = Double(opacity) / 255 * fraction
        let b = Double(base.opacity) / 255
        let out = a + b * (1 - a)
        guard out > 0 else { return TokenColor(0, 0, 0, 0) }
        func mix(_ top: UInt8, _ bottom: UInt8) -> UInt8 {
            UInt8(((Double(top) * a + Double(bottom) * b * (1 - a)) / out).rounded())
        }
        return TokenColor(
            mix(red, base.red), mix(green, base.green), mix(blue, base.blue), UInt8((out * 255).rounded()))
    }
}

/// The tones a status, notice or sync message takes (spec 2.2 status colors, plus `text` for
/// Scheduled).
public enum Tone: String, CaseIterable, Sendable {
    case pass, fail, warning, excluded, info, text

    public var role: TokenRole {
        switch self {
        case .pass: Tokens.Role.pass
        case .fail: Tokens.Role.fail
        case .warning: Tokens.Role.warning
        case .excluded: Tokens.Role.excluded
        case .info: Tokens.Role.info
        case .text: Tokens.Role.text
        }
    }
}

/// The tints (spec 2.2): a token at an opacity, over whatever is behind it, or flattened over a
/// known background.
public enum Tint: Sendable, Equatable {
    /// Secondary button background (`link` 12%) and pressed (24%).
    case tinted, tintedPressed
    /// Round icon buttons and capture tiles (`link` 10%); the quiet button's pressed fill.
    case iconTint
    /// Danger button background (`fail` 12%) and pressed (24%).
    case dangerTint, dangerPressed
    /// A tapped row (`text` 6%).
    case rowPressed
    /// A group inside a card (`text` 4% over `surface`).
    case well
    /// Empty-state blocks (`text` 4% over `bg`).
    case emptyFill
    /// A notice's background (its tone at 10%).
    case noticeFill(Tone)
    /// The sync bar's fill (its tone at 10%).
    case syncFill(Tone)
    /// A pool's access notes on Today (`warning` 10%).
    case accessFill
    /// Behind sheets (black 40%).
    case scrim

    /// The color for both appearances.
    public var role: TokenRole {
        switch self {
        case .tinted: Tint.over(Tokens.Role.link, 0.12)
        case .tintedPressed: Tint.over(Tokens.Role.link, 0.24)
        case .iconTint: Tint.over(Tokens.Role.link, 0.10)
        case .dangerTint: Tint.over(Tokens.Role.fail, 0.12)
        case .dangerPressed: Tint.over(Tokens.Role.fail, 0.24)
        case .rowPressed: Tint.over(Tokens.Role.text, 0.06)
        case .well: Tint.flat(Tokens.Role.text, 0.04, over: Tokens.Role.surface)
        case .emptyFill: Tint.flat(Tokens.Role.text, 0.04, over: Tokens.Role.bg)
        case .noticeFill(let tone), .syncFill(let tone): Tint.over(tone.role, 0.10)
        case .accessFill: Tint.over(Tokens.Role.warning, 0.10)
        case .scrim:
            TokenRole(light: TokenColor(0, 0, 0, 0xFF).at(0.4), dark: TokenColor(0, 0, 0, 0xFF).at(0.4))
        }
    }

    private static func over(_ role: TokenRole, _ fraction: Double) -> TokenRole {
        TokenRole(light: role.light.at(fraction), dark: role.dark.at(fraction))
    }

    private static func flat(_ role: TokenRole, _ fraction: Double, over base: TokenRole) -> TokenRole {
        TokenRole(
            light: role.light.at(fraction, over: base.light), dark: role.dark.at(fraction, over: base.dark))
    }
}

// MARK: - Status

extension JobStatus {
    /// The chip's fill (spec 3.6). The label is always shown with it; color is never alone.
    public var tone: Tone {
        switch self {
        case .unscheduled, .canceled: .excluded
        case .scheduled: .text
        case .inProgress, .reportSent, .quoteSent: .info
        case .quoteAccepted, .invoiced: .warning
        case .paid, .done: .pass
        }
    }
}

extension Outcome {
    /// Pass green, Fail red, Unclear amber.
    public var tone: Tone {
        switch self {
        case .pass: .pass
        case .fail: .fail
        case .inconclusive: .warning
        }
    }
}

extension VerdictTone {
    /// A report pill's fill: pass green, leaking red, attention amber, the rest gray.
    public var tone: Tone {
        switch self {
        case .pass: .pass
        case .leaking: .fail
        case .attention: .warning
        case .notApplicable, .pending: .excluded
        }
    }
}

extension SyncBarMessage.Tone {
    /// The sync bar's dot and fill (spec 3.17).
    public var tone: Tone {
        switch self {
        case .good: .pass
        case .working: .info
        case .attention: .warning
        case .problem: .fail
        }
    }
}

// MARK: - Badges

/// A tab or segment badge's text: nothing at zero, "99+" over 99.
public func badgeText(_ count: Int) -> String? {
    guard count > 0 else { return nil }
    return count > 99 ? "99+" : String(count)
}

/// How a screen reader reads a Messages badge.
public func unreadAccessibilityText(_ count: Int) -> String? {
    guard count > 0 else { return nil }
    return "\(count) unread"
}

/// How a screen reader reads a section switcher's badge, what needs attention (", 3 need attention").
public func attentionAccessibilityText(_ count: Int) -> String? {
    guard count > 0 else { return nil }
    return needAttentionText(count)
}
