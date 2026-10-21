#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit

    // The app's look: the phone website's design (docs/design/2026-10-19-native-apps-follow-web.md,
    // section 2). Colors come from brand/tokens.json through SundeckTokens (never a hex literal
    // here); the rules that don't need SwiftUI live in Model/DesignSystem.swift.

    // MARK: - Color

    extension TokenColor {
        var uiColor: UIColor {
            UIColor(
                red: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
                alpha: CGFloat(opacity) / 255)
        }
    }

    extension UIColor {
        /// A role's color, light or dark with the view's appearance.
        convenience init(_ role: TokenRole) {
            self.init { traits in
                traits.userInterfaceStyle == .dark ? role.dark.uiColor : role.light.uiColor
            }
        }
    }

    extension Color {
        /// A role's color, light or dark with the view's appearance.
        init(_ role: TokenRole) {
            self.init(uiColor: UIColor(role))
        }

        /// A tint (spec 2.2), light or dark with the view's appearance.
        init(tint: Tint) {
            self.init(tint.role)
        }

        // Role tokens (spec 2.2).
        static let bg = Color(Tokens.Role.bg)
        static let surface = Color(Tokens.Role.surface)
        static let text = Color(Tokens.Role.text)
        static let textMuted = Color(Tokens.Role.textMuted)
        /// `textMuted` (the older name).
        static let muted = Color(Tokens.Role.textMuted)
        static let border = Color(Tokens.Role.border)
        /// `primary` (SwiftUI's `Color.primary` is the system label color).
        static let brandPrimary = Color(Tokens.Role.primary)
        static let onPrimary = Color(Tokens.Role.onPrimary)
        static let link = Color(Tokens.Role.link)
        static let focus = Color(Tokens.Role.focus)
        static let controlBorder = Color(Tokens.Role.controlBorder)
        static let fill = Color(Tokens.Role.fill)
        static let separator = Color(Tokens.Role.separator)
        static let placeholder = Color(Tokens.Role.placeholder)
        static let thumb = Color(Tokens.Role.thumb)
        static let diagramWater = Color(Tokens.Role.diagramWater)
        static let onStatus = Color(Tokens.Role.onStatus)
        static let header = Color(Tokens.Role.header)
        static let onHeader = Color(Tokens.Role.onHeader)

        // Status colors, fixed (brand/BRAND.md).
        static let pass = Color(Tokens.Role.pass)
        static let fail = Color(Tokens.Role.fail)
        static let warning = Color(Tokens.Role.warning)
        static let excluded = Color(Tokens.Role.excluded)
        static let info = Color(Tokens.Role.info)

        // Brand colors used directly.
        static let water = Color(uiColor: Tokens.Brand.water.uiColor)
        static let navy = Color(uiColor: Tokens.Brand.navy.uiColor)
        /// Safety orange: the brand accent, and the day map's stop you're on.
        static let safety = Color(uiColor: Tokens.Brand.safety.uiColor)

        // Tints.
        static let tinted = Color(tint: .tinted)
        static let tintedPressed = Color(tint: .tintedPressed)
        static let iconTint = Color(tint: .iconTint)
        static let dangerTint = Color(tint: .dangerTint)
        static let dangerPressed = Color(tint: .dangerPressed)
        static let rowPressed = Color(tint: .rowPressed)
        static let well = Color(tint: .well)
        static let emptyFill = Color(tint: .emptyFill)
        static let accessFill = Color(tint: .accessFill)
        static let scrim = Color(tint: .scrim)
    }

    extension Tone {
        var color: Color { Color(role) }
    }

    extension Appearance {
        var colorScheme: ColorScheme {
            switch self {
            case .light: .light
            case .dark: .dark
            }
        }
    }

    // MARK: - Type

    extension TypeRole.Scale {
        var textStyle: Font.TextStyle {
            switch self {
            case .largeTitle: .largeTitle
            case .title: .title
            case .title3: .title3
            case .headline: .headline
            case .body: .body
            case .subheadline: .subheadline
            case .footnote: .footnote
            case .caption2: .caption2
            }
        }

        var uiTextStyle: UIFont.TextStyle {
            switch self {
            case .largeTitle: .largeTitle
            case .title: .title1
            case .title3: .title3
            case .headline: .headline
            case .body: .body
            case .subheadline: .subheadline
            case .footnote: .footnote
            case .caption2: .caption2
            }
        }
    }

    extension TypeRole.Weight {
        var font: Font.Weight {
            switch self {
            case .regular: .regular
            case .medium: .medium
            case .semibold: .semibold
            case .bold: .bold
            case .extraBold: .heavy
            }
        }

        var uiFont: UIFont.Weight {
            switch self {
            case .regular: .regular
            case .medium: .medium
            case .semibold: .semibold
            case .bold: .bold
            case .extraBold: .heavy
            }
        }
    }

    extension TypeRole {
        /// The role's UIKit font at its base size (before Dynamic Type), for UIKit appearances and
        /// line heights.
        var baseUIFont: UIFont {
            if let file = brandFont, let font = UIFont(name: file.rawValue, size: size) { return font }
            return .systemFont(ofSize: size, weight: weight.uiFont)
        }

        /// The role's UIKit font scaled with the person's text size.
        var scaledUIFont: UIFont {
            UIFontMetrics(forTextStyle: scale.uiTextStyle).scaledFont(for: baseUIFont)
        }

        /// Extra space between lines so wrapped text has the website's line height.
        var lineSpacing: CGFloat { max(0, CGFloat(lineHeight) - baseUIFont.lineHeight) }
    }

    extension Font {
        /// A role from the phone type scale (spec 2.1). Barlow roles scale with Dynamic Type
        /// relative to their text style; body roles are the system font.
        /// `Text("Checklist").font(.role(.sectionHeading))`
        static func role(_ role: TypeRole) -> Font {
            if let file = role.brandFont {
                return .custom(file.rawValue, size: role.size, relativeTo: role.scale.textStyle)
            }
            return .system(role.scale.textStyle, weight: role.weight.font)
        }
    }

    extension View {
        /// Sets a role's font, line height, and (section labels) uppercase.
        /// `Text("Your account").textRole(.sectionLabel)`
        func textRole(_ role: TypeRole) -> some View {
            font(.role(role))
                .lineSpacing(role.lineSpacing)
                .textCase(role.uppercased ? .uppercase : nil)
        }

        /// Numbers that line up and don't jump as they change: money, readings, counts.
        func tabular() -> some View { monospacedDigit() }
    }

    // MARK: - Targets

    /// The smallest tap target, 44 (spec 2.6; CLAUDE.md house rule).
    let minTarget = CGFloat(TapTarget.minimum)
    /// The brand's 48 for the main field actions (gloves, wet hands): full-width buttons in sheets
    /// and forms, verdict pills.
    let fieldTarget = CGFloat(TapTarget.field)

    // MARK: - Chrome

    /// The system bars, styled once at launch (spec 3.1, 3.2, 8.1).
    @MainActor
    enum Chrome {
        /// The large title's attributes: Barlow, the text color.
        static var largeTitle: [NSAttributedString.Key: Any] {
            [.font: TypeRole.largeTitle.scaledUIFont, .foregroundColor: UIColor(Tokens.Role.text)]
        }

        /// The small (scrolled or inline) title's attributes.
        static var smallTitle: [NSAttributedString.Key: Any] {
            [.font: TypeRole.navTitle.scaledUIFont, .foregroundColor: UIColor(Tokens.Role.text)]
        }

        /// At the top, the page shows through; once content scrolls under it, the bar material.
        static func appearance(edge: Bool) -> UINavigationBarAppearance {
            let look = UINavigationBarAppearance()
            if edge { look.configureWithTransparentBackground() } else { look.configureWithDefaultBackground() }
            look.largeTitleTextAttributes = largeTitle
            look.titleTextAttributes = smallTitle
            return look
        }

        static func install() {
            // The title face first: the bar's fonts are made from it (and screenshots don't run
            // the app's init). Registering twice does nothing.
            BrandFonts.register()
            let link = UIColor(Tokens.Role.link)
            let edge = appearance(edge: true)
            let standard = appearance(edge: false)
            let bar = UINavigationBar.appearance()
            bar.standardAppearance = standard
            bar.compactAppearance = standard
            bar.scrollEdgeAppearance = edge
            bar.compactScrollEdgeAppearance = edge
            bar.tintColor = link

            UITabBar.appearance().tintColor = link
            UITabBar.appearance().unselectedItemTintColor = UIColor(Tokens.Role.textMuted)
            let item = UITabBarItem.appearance()
            item.badgeColor = UIColor(Tokens.Role.primary)
            let badge: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold),
                .foregroundColor: UIColor(Tokens.Role.onPrimary),
            ]
            item.setBadgeTextAttributes(badge, for: .normal)
            item.setBadgeTextAttributes(badge, for: .selected)
        }
    }
#endif
