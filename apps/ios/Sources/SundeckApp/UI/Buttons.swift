#if os(iOS)
    import SundeckTokens
    import SwiftUI

    // Buttons (spec 3.7): capsules at least 44 tall, 20 side padding, body semibold, icon and text
    // 8 apart, sized to their label unless full width. Title Case labels that say what happens.
    //
    //   Button("Start Job") { … }.buttonStyle(.primary)
    //   Button("Save") { … }.buttonStyle(.secondary)
    //   Button("Delete Test", role: .destructive) { … }.buttonStyle(.danger(fullWidth: true))
    //   Button("Report") { … }.buttonStyle(.quiet)
    //   Button("Download PDF") { … }.buttonStyle(.quiet(size: .small))

    enum PillButtonSize {
        /// 44 tall, 20 side padding, body 17.
        case regular
        /// Quiet buttons in a version list: 12 side padding, secondary 15.
        case small
        /// Full-width field actions in sheets and forms: 48 tall (gloves, wet hands).
        case field
        /// A row of pills that must stay on one line (Today's stops): 44 tall, 14 side padding,
        /// body 17.
        case compact
    }

    /// Icon and text 8 apart inside a button.
    struct PillLabelStyle: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: 8) {
                configuration.icon
                configuration.title
            }
        }
    }

    private struct PillShape: ViewModifier {
        var size: PillButtonSize
        var fullWidth: Bool
        var foreground: Color
        var background: Color
        var isEnabled: Bool
        /// The glass tint on iOS 26 (the resting fill); nil for text-only buttons, which stay clear.
        var glass: Color? = nil
        var pressed = false
        /// A page being swiped turns its buttons off without dimming them (`pagingSwipe`).
        @Environment(\.pageSwiping) private var swiping

        func body(content: Content) -> some View {
            content
                .labelStyle(PillLabelStyle())
                .font(size == .small ? .role(.secondary).weight(.semibold) : .role(.bodyEmphasis))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(foreground)
                .padding(.horizontal, size == .small ? 12 : size == .compact ? 14 : 20)
                .padding(.vertical, 6)
                .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: size == .field ? fieldTarget : minTarget)
                .modifier(PillBackground(background: background, glass: glass))
                .contentShape(Capsule())
                .pressScale(pressed)
                .opacity(isEnabled || swiping ? 1 : 0.5)
        }
    }

    /// The pill's fill: interactive Liquid Glass tinted with the button's color on iOS 26 (it
    /// lights up and flexes under a finger), the flat fill before.
    private struct PillBackground: ViewModifier {
        var background: Color
        var glass: Color?
        @Environment(\.drawsGlass) private var drawsGlass

        func body(content: Content) -> some View {
            if usesGlass(drawsGlass), let glass {
                content.glassSurface(Capsule(), tint: glass, interactive: true)
            } else {
                content.background(Capsule().fill(background))
            }
        }
    }

    /// The screen's one main action: `primary` fill, `onPrimary` text, 5% darker when pressed.
    struct PrimaryButtonStyle: ButtonStyle {
        var fullWidth = false
        var size = PillButtonSize.regular
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .modifier(
                    PillShape(
                        size: size, fullWidth: fullWidth, foreground: .onPrimary,
                        background: .brandPrimary, isEnabled: isEnabled, glass: .brandPrimary,
                        pressed: configuration.isPressed)
                )
                .overlay(Capsule().fill(Color.black.opacity(configuration.isPressed ? 0.05 : 0)))
        }
    }

    /// Everything else: a tinted capsule (`link` at 12%, 24% pressed) with `link` text. With
    /// `tint: .fail` it is the danger button (`fail` at 12%, 24% pressed, `fail` text).
    struct SecondaryButtonStyle: ButtonStyle {
        var tint: Color = .link
        var fullWidth = false
        var size = PillButtonSize.regular
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .modifier(
                    PillShape(
                        size: size, fullWidth: fullWidth, foreground: tint,
                        background: tint.opacity(configuration.isPressed ? 0.24 : 0.12), isEnabled: isEnabled,
                        glass: tint.opacity(0.14), pressed: configuration.isPressed))
        }
    }

    /// Text-only actions: `link` text, `link` at 10% behind it when pressed.
    struct QuietButtonStyle: ButtonStyle {
        var size = PillButtonSize.regular
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .modifier(
                    PillShape(
                        size: size, fullWidth: false, foreground: .link,
                        background: configuration.isPressed ? .iconTint : .clear, isEnabled: isEnabled,
                        pressed: configuration.isPressed))
        }
    }

    extension ButtonStyle where Self == PrimaryButtonStyle {
        static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
        static func primary(fullWidth: Bool = false, size: PillButtonSize = .regular) -> PrimaryButtonStyle {
            PrimaryButtonStyle(fullWidth: fullWidth, size: size)
        }
    }

    extension ButtonStyle where Self == SecondaryButtonStyle {
        static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
        static func secondary(fullWidth: Bool = false, size: PillButtonSize = .regular) -> SecondaryButtonStyle {
            SecondaryButtonStyle(fullWidth: fullWidth, size: size)
        }
        static var danger: SecondaryButtonStyle { SecondaryButtonStyle(tint: .fail) }
        static func danger(fullWidth: Bool = false, size: PillButtonSize = .regular) -> SecondaryButtonStyle {
            SecondaryButtonStyle(tint: .fail, fullWidth: fullWidth, size: size)
        }
        /// The danger button (the older name).
        static var destructiveSecondary: SecondaryButtonStyle { SecondaryButtonStyle(tint: .fail) }
    }

    extension ButtonStyle where Self == QuietButtonStyle {
        static var quiet: QuietButtonStyle { QuietButtonStyle() }
        static func quiet(size: PillButtonSize = .regular) -> QuietButtonStyle { QuietButtonStyle(size: size) }
    }

    /// A button's label that changes to its "-ing" form while busy ("Saving…"), with a small
    /// spinner leading it. `Button { save() } label: { BusyButtonLabel("Save", busy: saving, busyTitle: "Saving…") }`
    struct BusyButtonLabel: View {
        var title: String
        var busy: Bool
        var busyTitle: String

        init(_ title: String, busy: Bool, busyTitle: String) {
            self.title = title
            self.busy = busy
            self.busyTitle = busyTitle
        }

        var body: some View {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small) }
                Text(busy ? busyTitle : title)
            }
        }
    }

    /// A round contact action (spec 3.10): 44 circle in `iconTint`, a 20 pt icon in `link`. Always
    /// named for screen readers ("Call Riley Rivera, (480) 555-0188"). Place them 8 apart.
    struct RoundIconButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(Color.link)
                    .frame(width: minTarget, height: minTarget)
                    .glassSurface(Circle(), tint: Color.iconTint, interactive: true, fallback: .iconTint)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    /// A bar button with no fill (spec 3.1): "+" for New Job, the compose icon for New Message. 44
    /// round, `link`, `link` at 10% behind it when pressed. Use it in a `ToolbarItem`.
    struct BarIconButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .medium))
                    .frame(width: minTarget, height: minTarget)
            }
            .buttonStyle(BarIconStyle())
            .accessibilityLabel(label)
        }
    }

    private struct BarIconStyle: ButtonStyle {
        @Environment(\.drawsGlass) private var drawsGlass

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .foregroundStyle(Color.link)
                .background {
                    // On iOS 26 the toolbar puts the button on its own glass, which reacts to touch.
                    if !usesGlass(drawsGlass) {
                        Circle().fill(configuration.isPressed ? Color.iconTint : .clear)
                    }
                }
                .contentShape(Circle())
        }
    }
#endif
