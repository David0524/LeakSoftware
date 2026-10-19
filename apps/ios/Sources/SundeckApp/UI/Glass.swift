#if os(iOS)
    import SwiftUI
    import UIKit

    // Liquid Glass and motion (owner, 2026-10-19: "Liquid Glass, smooth animations, all of that
    // uniquely Swift stuff"). On iOS 26 the controls layer is glass: buttons, segmented controls,
    // the floating bars and sheets. Content (cards, lists) stays solid, as Apple's guidelines ask.
    // Before iOS 26 each falls back to the website's look: a tinted fill or the bar material.

    /// The app's animations. Each is nil with Reduce Motion on, so `withAnimation(Motion.snappy)`
    /// changes at once instead.
    enum Motion {
        /// Selections and small state changes: quick, no overshoot.
        static var snappy: Animation? { reduced ? nil : .snappy(duration: 0.3) }
        /// Things that appear or settle (checks, verdicts, badges): a light bounce.
        static var bouncy: Animation? { reduced ? nil : .bouncy(duration: 0.4, extraBounce: 0.05) }
        /// Cards and panels opening, closing and moving.
        static var smooth: Animation? { reduced ? nil : .smooth(duration: 0.35) }

        static var reduced: Bool { UIAccessibility.isReduceMotionEnabled }
    }

    extension View {
        /// Liquid Glass in `shape` on iOS 26, tinted (`interactive` for controls: it reacts to
        /// touch). Before iOS 26: `fallback` as a fill, else the regular material.
        @ViewBuilder
        func glassSurface<S: Shape>(
            _ shape: S, tint: Color? = nil, interactive: Bool = false, fallback: Color? = nil
        ) -> some View {
            if #available(iOS 26, *) {
                glassEffect(Glass.regular.tint(tint).interactive(interactive), in: shape)
            } else if let fallback {
                background(shape.fill(fallback))
            } else {
                background(shape.fill(.regularMaterial))
            }
        }

        /// A bar pinned over scrolling content (the job's section switcher, the message composer,
        /// a photo's toolbar): glass on iOS 26, the bar material with a hairline before.
        @ViewBuilder
        func chromeBar(hairline: VerticalEdge? = .bottom) -> some View {
            if #available(iOS 26, *) {
                glassEffect(.regular, in: .rect)
            } else {
                background(.bar)
                    .overlay(alignment: hairline == .top ? .top : .bottom) {
                        if hairline != nil { Hairline() }
                    }
            }
        }

        /// Presses shrink a little and spring back (iOS 26 glass does this itself).
        func pressScale(_ pressed: Bool) -> some View {
            modifier(PressScale(pressed: pressed))
        }

        /// Numbers that change roll to their new value ("12 to do" → "11 to do").
        func rollingNumber(_ value: some Equatable) -> some View {
            contentTransition(.numericText()).animation(Motion.snappy, value: value)
        }
    }

    private struct PressScale: ViewModifier {
        var pressed: Bool

        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content
            } else {
                content
                    .scaleEffect(pressed ? 0.97 : 1)
                    .animation(Motion.snappy, value: pressed)
            }
        }
    }

    // MARK: - Zoom into a job

    extension EnvironmentValues {
        /// The tab's namespace for zoom transitions: a job row zooms into its job page.
        @Entry var zoomNamespace: Namespace.ID? = nil
        /// The tab a view is in, so the same job in two tabs is two different sources.
        @Entry var zoomScope = ""
    }

    extension View {
        /// Marks this view as where `id`'s page zooms out of (a job row, a stop card).
        func zoomSource(_ id: String) -> some View { modifier(ZoomSource(id: id)) }

        /// The pushed page for `id` zooms from its source, and back into it on Back or a swipe.
        func zoomDestination(_ id: String) -> some View { modifier(ZoomDestination(id: id)) }
    }

    private struct ZoomSource: ViewModifier {
        var id: String
        @Environment(\.zoomNamespace) private var namespace
        @Environment(\.zoomScope) private var scope

        func body(content: Content) -> some View {
            if let namespace {
                content.matchedTransitionSource(id: "\(scope)|\(id)", in: namespace)
            } else {
                content
            }
        }
    }

    private struct ZoomDestination: ViewModifier {
        var id: String
        @Environment(\.zoomNamespace) private var namespace
        @Environment(\.zoomScope) private var scope

        func body(content: Content) -> some View {
            if let namespace {
                content.navigationTransition(.zoom(sourceID: "\(scope)|\(id)", in: namespace))
            } else {
                content
            }
        }
    }
#endif
