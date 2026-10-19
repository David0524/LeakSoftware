#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit

    // The app's look, from brand/tokens.json (never hardcode brand colors) and the house rules in
    // CLAUDE.md: 17 pt body, 15 pt secondary, pills for buttons and status, soft cards, filled blue
    // primary buttons, field-sized tap targets.

    extension TokenColor {
        var uiColor: UIColor {
            UIColor(
                red: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
                alpha: CGFloat(opacity) / 255)
        }
    }

    extension Color {
        /// A role's color, light or dark with the system appearance.
        init(_ role: TokenRole) {
            self.init(
                uiColor: UIColor { traits in
                    traits.userInterfaceStyle == .dark ? role.dark.uiColor : role.light.uiColor
                })
        }

        static let brandPrimary = Color(Tokens.Role.primary)
        static let onPrimary = Color(Tokens.Role.onPrimary)
        static let pass = Color(Tokens.Role.pass)
        static let fail = Color(Tokens.Role.fail)
        static let warning = Color(Tokens.Role.warning)
        static let info = Color(Tokens.Role.info)
        static let muted = Color(Tokens.Role.textMuted)
        static let controlBorder = Color(Tokens.Role.controlBorder)
        static let excluded = Color(Tokens.Role.excluded)
    }

    /// Field-sized tap target (gloves, wet hands).
    let minTarget = CGFloat(Tokens.minTarget)

    /// The main action on a screen: a filled blue pill, full width, white text.
    struct PrimaryButtonStyle: ButtonStyle {
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: minTarget)
                .padding(.horizontal, 16)
                .foregroundStyle(Color.onPrimary)
                .background(Capsule().fill(Color.brandPrimary.opacity(isEnabled ? 1 : 0.4)))
                .opacity(configuration.isPressed ? 0.8 : 1)
                .contentShape(Capsule())
        }
    }

    /// A second action: a tinted pill.
    struct SecondaryButtonStyle: ButtonStyle {
        var tint: Color = .brandPrimary
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: minTarget)
                .padding(.horizontal, 16)
                .foregroundStyle(tint.opacity(isEnabled ? 1 : 0.4))
                .background(Capsule().fill(tint.opacity(0.12)))
                .opacity(configuration.isPressed ? 0.7 : 1)
                .contentShape(Capsule())
        }
    }

    extension ButtonStyle where Self == PrimaryButtonStyle {
        static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
    }

    extension ButtonStyle where Self == SecondaryButtonStyle {
        static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
        static var destructiveSecondary: SecondaryButtonStyle { SecondaryButtonStyle(tint: .fail) }
    }

    /// A message in a soft tinted box: information, a warning, or an error.
    struct Notice: View {
        enum Kind { case info, warning, error }

        var kind: Kind
        var text: String

        var body: some View {
            Label {
                Text(text).font(.subheadline).foregroundStyle(.primary)
            } icon: {
                Image(systemName: icon).foregroundStyle(color)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(color.opacity(0.12)))
            .accessibilityElement(children: .combine)
        }

        private var color: Color {
            switch kind {
            case .info: .info
            case .warning: .warning
            case .error: .fail
            }
        }

        private var icon: String {
            switch kind {
            case .info: "info.circle.fill"
            case .warning: "exclamationmark.triangle.fill"
            case .error: "exclamationmark.octagon.fill"
            }
        }
    }

    /// A job's status as a small pill.
    struct StatusChip: View {
        var status: JobStatus

        var body: some View {
            Text(status.label)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .foregroundStyle(color)
                .background(Capsule().fill(color.opacity(0.14)))
                .accessibilityLabel("Status: \(status.label)")
        }

        private var color: Color {
            switch status {
            case .inProgress: .info
            case .paid, .done: .pass
            case .canceled: .excluded
            case .unscheduled: .warning
            default: .brandPrimary
            }
        }
    }

    /// A round icon button for contact actions (call, message, directions).
    struct RoundIconButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.brandPrimary)
                    .frame(width: minTarget, height: minTarget)
                    .background(Circle().fill(Color.brandPrimary.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }
#endif
