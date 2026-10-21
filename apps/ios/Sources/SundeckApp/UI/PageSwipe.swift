#if os(iOS)
    import SwiftUI
    import UIKit

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
        /// A page is being dragged sideways: its buttons are off (so the lift isn't a tap) without
        /// looking dimmed.
        @Entry var pageSwiping = false
    }

    private struct PageSwipe: ViewModifier {
        var enabled: Bool
        var previous: (() -> Void)?
        var next: (() -> Void)?
        @State private var zones = PageSwipeZones()
        @State private var turns = 0
        /// A sideways drag is on: the page's buttons and links don't take the lift as a tap.
        @State private var swiping = false

        func body(content: Content) -> some View {
            content
                .environment(\.pageSwipeZones, zones)
                .swipeQuiet(swiping)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 24, coordinateSpace: .global)
                        .onChanged { value in
                            guard enabled, !swiping, value.startLocation.x > PageSwipeRule.edge,
                                PagerRule.lock(value.translation) == .horizontal,
                                !zones.contains(value.startLocation)
                            else { return }
                            swiping = true
                        }
                        .onEnded { value in
                            releaseSwipe($swiping)
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

    /// The page follows the finger (owner, 2026-10-21; `PagerRule`): 1:1 while held, so it can
    /// be held halfway and taken back; let go past a third of the width or with a flick and the
    /// page carries on out the way it was going with a spring, and the next one comes in from the
    /// other side once it's there (`page` changes); otherwise it springs back. Rubber band where
    /// there's no page that way. The direction is decided after 10 points, so up and down still
    /// scroll. With Reduce Motion the page doesn't move with the finger, and the next one
    /// cross-fades in. A light tap of haptics on each turn.
    private struct PagingSwipe<Page: Equatable>: ViewModifier {
        var page: Page
        var enabled: Bool
        var previous: (() -> Void)?
        var next: (() -> Void)?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var zones = PageSwipeZones()
        @State private var offset: CGFloat = 0
        @State private var opacity: Double = 1
        @State private var width: CGFloat = 390
        /// This drag's direction, once decided; nil before, and for a drag that isn't ours.
        @State private var axis: PagerRule.Axis?
        @State private var swiping = false
        /// A turn under way: which way, whether the old page is out, whether the new one is in.
        @State private var turn: Turn?
        @State private var turns = 0

        private struct Turn: Equatable {
            var direction: Int
            var out = false
            var arrived = false
            var id = UUID()
        }

        func body(content: Content) -> some View {
            content
                .environment(\.pageSwipeZones, zones)
                .swipeQuiet(swiping)
                .offset(x: offset)
                .opacity(opacity)
                .onGeometryChange(for: CGFloat.self) {
                    $0.size.width
                } action: {
                    width = max($0, 1)
                }
                .contentShape(Rectangle())
                // A UIKit pan that begins only on a clearly sideways drag (`SidewaysPan`), so a
                // vertical drag that starts anywhere on the page, a stop's card included, always
                // scrolls it (owner, 2026-10-21: "I can't scroll on a Scheduling tile").
                .gesture(
                    SidewaysPan(
                        claims: { start in
                            // Not from the screen's left edge (the system's swipe back), and not
                            // on a control that drags sideways itself.
                            enabled && turn == nil && start.x > PageSwipeRule.edge && !zones.contains(start)
                        },
                        changed: dragChanged,
                        ended: dragEnded)
                )
                .sensoryFeedback(.impact(weight: .light), trigger: turns)
                .onChange(of: page) { _, _ in arrived() }
        }

        private func dragChanged(_ translation: CGSize) {
            guard turn == nil else { return }
            if axis == nil {
                axis = .horizontal
                swiping = true
            }
            guard !reduceMotion else { return }
            offset = PagerRule.follow(
                translation.width, width: width, canPrevious: previous != nil, canNext: next != nil)
        }

        /// The lift, or the system taking the touch (a stop lifted for drag and drop: zero, so the
        /// page goes back home).
        private func dragEnded(_ translation: CGSize, velocity: CGSize) {
            let wasOurs = axis == .horizontal
            axis = nil
            guard wasOurs, turn == nil else { return }
            release()
            let way = PagerRule.outcome(
                translation.width, velocity: velocity.width, width: width, canPrevious: previous != nil,
                canNext: next != nil)
            guard way != 0, let go = way == 1 ? next : previous else {
                settleHome()
                return
            }
            turnPage(way, velocity: velocity.width, go: go)
        }

        private func release() { releaseSwipe($swiping) }

        private func settleHome() {
            withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) {
                offset = 0
                opacity = 1
            }
        }

        private func turnPage(_ way: Int, velocity: CGFloat, go: () -> Void) {
            let current = Turn(direction: way)
            turn = current
            turns += 1
            if reduceMotion {
                withAnimation(.easeIn(duration: 0.12)) {
                    opacity = 0
                } completion: {
                    markOut(current.id)
                }
            } else {
                // The old page carries on out the way the finger was going.
                let target = -CGFloat(way) * (width + 16)
                let speed = PagerRule.springVelocity(velocity, from: offset, to: target)
                withAnimation(.interpolatingSpring(duration: 0.22, bounce: 0, initialVelocity: speed)) {
                    offset = target
                } completion: {
                    markOut(current.id)
                }
            }
            go()
            // The page didn't change (or is slow to): this one comes back.
            Task {
                try? await Task.sleep(for: .seconds(1.2))
                guard turn?.id == current.id else { return }
                turn = nil
                settleHome()
            }
        }

        private func markOut(_ id: UUID) {
            guard turn?.id == id else { return }
            turn?.out = true
            bringIn()
        }

        private func arrived() {
            guard turn != nil else { return }
            turn?.arrived = true
            bringIn()
        }

        /// Both the old page out and the new one here: it comes in from the side the finger came
        /// from (a cross-fade with Reduce Motion).
        private func bringIn() {
            guard let t = turn, t.out, t.arrived else { return }
            turn = nil
            if reduceMotion {
                withAnimation(.easeOut(duration: 0.2)) { opacity = 1 }
                return
            }
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { offset = CGFloat(t.direction) * (width + 16) }
            withAnimation(.spring(duration: PagerRule.settle, bounce: 0)) { offset = 0 }
        }
    }

    /// A sideways drag as a UIKit pan (owner, 2026-10-21: "I can't scroll on a Scheduling tile"):
    /// it begins only when `PagerRule.heroClaims` says the drag is clearly sideways (10 points
    /// across and 1.5 times its vertical movement) and `claims` agrees with where it started (in
    /// window points, as `.global`); otherwise it fails at once and the scroll view has the drag.
    /// A SwiftUI DragGesture on a scroll view's content can hold the scroll back. Today's card
    /// uses the same rule (`HeroPan`). `ended` gets zero when the drag is canceled.
    struct SidewaysPan: UIGestureRecognizerRepresentable {
        var claims: (CGPoint) -> Bool = { _ in true }
        var changed: (CGSize) -> Void
        var ended: (CGSize, CGSize) -> Void

        func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
            let pan = UIPanGestureRecognizer()
            pan.delegate = context.coordinator
            pan.maximumNumberOfTouches = 1
            return pan
        }

        func updateUIGestureRecognizer(_ recognizer: UIPanGestureRecognizer, context: Context) {
            context.coordinator.claims = claims
        }

        func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator(claims: claims) }

        func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
            let t = recognizer.translation(in: recognizer.view)
            let translation = CGSize(width: t.x, height: t.y)
            switch recognizer.state {
            case .began, .changed: changed(translation)
            case .ended:
                let v = recognizer.velocity(in: recognizer.view)
                ended(translation, CGSize(width: v.x, height: v.y))
            case .cancelled, .failed: ended(.zero, .zero)
            default: break
            }
        }

        @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
            var claims: (CGPoint) -> Bool

            init(claims: @escaping (CGPoint) -> Bool) { self.claims = claims }

            func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
                guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
                let t = pan.translation(in: pan.view)
                let v = pan.velocity(in: pan.view)
                guard PagerRule.heroClaims(CGSize(width: t.x, height: t.y), velocity: CGSize(width: v.x, height: v.y))
                else { return false }
                // Where the finger came down, in the window's points.
                let now = pan.location(in: nil)
                let start = CGPoint(x: now.x - t.x, y: now.y - t.y)
                return claims(start)
            }

            /// The page's scroll keeps its own pan; a sideways drag barely moves it up or down.
            func gestureRecognizer(
                _ recognizer: UIGestureRecognizer,
                shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
            ) -> Bool {
                true
            }
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

        /// Swipe left for `next`, right for `previous` (nil: nothing that way, where it gives like a
        /// rubber band), the page following the finger (`PagingSwipe`). `page` names the page
        /// shown: when it changes after a swipe, the new page slides in.
        func pagingSwipe<Page: Equatable>(
            page: Page, enabled: Bool = true, previous: (() -> Void)?, next: (() -> Void)?
        ) -> some View {
            modifier(PagingSwipe(page: page, enabled: enabled, previous: previous, next: next))
        }

        /// A control that drags sideways itself: a page swipe never starts on it.
        func keepsHorizontalDrags() -> some View { modifier(KeepsHorizontalDrags()) }
    }
#endif
