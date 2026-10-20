#if os(iOS)
    import SwiftUI

    // Swiping between pages (owner, 2026-10-19: "Add gestures throughout. I want to navigate the
    // different job pages with gestures."): a horizontal swipe on the job page moves between its
    // sections, and on Schedule between days, weeks or months. The segmented control and the
    // arrows stay the visible way to do the same. The swipe works alongside vertical scrolling
    // (a mostly sideways drag only), never starts at the screen's left edge (the system's swipe
    // back), and never in a control that drags sideways itself (segmented controls, rows that
    // swipe to delete, sliders, text fields): those mark themselves with `.keepsHorizontalDrags()`.
    // A swipe counts by the website's rule (`PageSwipeRule`: 70 pt, 1.8 times as far sideways as
    // up or down), with a light tap of haptics when the page changes (owner, 2026-10-20).

    /// Frames (in global space) where a sideways drag belongs to the control under it.
    @MainActor final class PageSwipeZones {
        private var frames: [UUID: CGRect] = [:]

        func set(_ id: UUID, _ frame: CGRect?) { frames[id] = frame }

        func contains(_ point: CGPoint) -> Bool {
            frames.values.contains { $0.insetBy(dx: -4, dy: -4).contains(point) }
        }
    }

    extension EnvironmentValues {
        @Entry var pageSwipeZones: PageSwipeZones? = nil
    }

    private struct PageSwipe: ViewModifier {
        var enabled: Bool
        var previous: (() -> Void)?
        var next: (() -> Void)?
        @State private var zones = PageSwipeZones()
        @State private var turns = 0

        func body(content: Content) -> some View {
            content
                .environment(\.pageSwipeZones, zones)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 24, coordinateSpace: .global)
                        .onEnded { value in
                            guard enabled, !zones.contains(value.startLocation) else { return }
                            switch PageSwipeRule.direction(start: value.startLocation, translation: value.translation) {
                            case 1:
                                guard let next else { return }
                                next()
                                turns += 1
                            case -1:
                                guard let previous else { return }
                                previous()
                                turns += 1
                            default: break
                            }
                        },
                    including: enabled ? .all : .subviews
                )
                .sensoryFeedback(.impact(weight: .light), trigger: turns)
        }
    }

    private struct KeepsHorizontalDrags: ViewModifier {
        @Environment(\.pageSwipeZones) private var zones
        @State private var id = UUID()

        func body(content: Content) -> some View {
            if let zones {
                content
                    .onGeometryChange(for: CGRect.self) {
                        $0.frame(in: .global)
                    } action: {
                        zones.set(id, $0)
                    }
                    .onDisappear { zones.set(id, nil) }
            } else {
                content
            }
        }
    }

    extension View {
        /// Swipe left for `next`, right for `previous` (nil: nothing that way).
        func pageSwipe(enabled: Bool = true, previous: (() -> Void)?, next: (() -> Void)?) -> some View {
            modifier(PageSwipe(enabled: enabled, previous: previous, next: next))
        }

        /// A control that drags sideways itself: a page swipe never starts on it.
        func keepsHorizontalDrags() -> some View { modifier(KeepsHorizontalDrags()) }
    }
#endif
