#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit

    // A tech's color (owner, 2026-10-20; docs/design/2026-10-20-team-week.md section 3): a 10 pt
    // dot before their name everywhere a tech is named, and a 4 pt stripe on the leading edge of
    // their Schedule and Week cards. Never the only cue: the name is always beside it, and
    // VoiceOver reads the name, not the color.

    extension TechColor {
        /// The palette's role (brand/tokens.json › color.tech), light or dark.
        var role: TokenRole {
            switch self {
            case .blue: Tokens.Tech.blue
            case .green: Tokens.Tech.green
            case .orange: Tokens.Tech.orange
            case .purple: Tokens.Tech.purple
            case .pink: Tokens.Tech.pink
            case .teal: Tokens.Tech.teal
            case .red: Tokens.Tech.red
            case .olive: Tokens.Tech.olive
            case .brown: Tokens.Tech.brown
            case .slate: Tokens.Tech.slate
            }
        }

        var color: Color { Color(role) }

        /// The dot as an image drawn in its own color, for menus and pickers (which tint
        /// template images): 10 pt in a 12 pt square.
        var menuImage: Image {
            let ui = UIColor(role)
            let image = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 12)).image { _ in
                ui.setFill()
                UIBezierPath(ovalIn: CGRect(x: 1, y: 1, width: 10, height: 10)).fill()
            }
            return Image(uiImage: image.withRenderingMode(.alwaysOriginal))
        }
    }

    /// The 10 pt dot before a tech's name. Hidden from VoiceOver: the name says who.
    struct TechDot: View {
        var color: TechColor
        @ScaledMetric(relativeTo: .body) private var size: CGFloat = 10

        var body: some View {
            Circle()
                .fill(color.color)
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        }
    }

    /// A tech's name with their dot before it.
    struct TechName: View {
        var name: String
        var color: TechColor
        var spacing: CGFloat = 8

        var body: some View {
            HStack(alignment: .center, spacing: spacing) {
                TechDot(color: color)
                Text(name)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// The 4 pt stripe on the leading edge of a Schedule or Week card, in the tech's color.
    struct TechStripe: ViewModifier {
        var color: TechColor?

        func body(content: Content) -> some View {
            content.overlay(alignment: .leading) {
                if let color {
                    Rectangle().fill(color.color).frame(width: 4).accessibilityHidden(true)
                }
            }
        }
    }

    extension View {
        /// The tech's 4 pt stripe on the card's leading edge (clipped by the card's shape).
        func techStripe(_ color: TechColor?) -> some View { modifier(TechStripe(color: color)) }
    }
#endif
