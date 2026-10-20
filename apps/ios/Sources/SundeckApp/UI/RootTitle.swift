#if os(iOS)
    import SwiftUI
    import UIKit

    // MARK: - A tab's large title in the bar's row (owner, 2026-10-20)

    // On a screen with no Back (the tab roots: Today, Jobs, Schedule, Messages, More), the large
    // title sits in the navigation bar's row, left of the bar's buttons, as in the App Store and
    // Music ("push up towards where the plus button is"), and the page rises with it. The
    // website and the Android app do the same (components/nav-bar.tsx, apps/mobile ui/Bar.tsx).
    //
    // The system large title can't share the row with the buttons, so the page draws it:
    // - `.rootTitle("Today")` on the screen, in place of `.navigationTitle`: the bar keeps its
    //   buttons (Liquid Glass on iOS 26) and the Back label for pushed screens; its small title
    //   and its material (the scroll edge effect on iOS 26, the bar background before) wait until
    //   the page's title has scrolled away, so they aren't drawn over it.
    // - `RootLargeTitle()` as the page's first row (in a `List`, with `.plainListRow()`).
    // - `.rootTitleScroll()` on the page's scroll view or list, so the page starts at the top of
    //   the screen, under the bar, with the title in the bar's row.
    //
    //     ScreenScroll {
    //         RootLargeTitle(stackSpacing: 24)
    //         PageHeader(subtitle: "Monday, October 19")
    //     }
    //     .rootTitleScroll()
    //     .rootTitle("Today")
    //
    // A title whose widest word can't fit beside the buttons (very large text) takes its own row
    // under the bar instead, where the system large title would be.

    /// What the screen, its bar and its title row share.
    @MainActor @Observable
    final class RootTitleState {
        var title = ""
        /// Round buttons on the bar's right, which the title keeps clear of.
        var trailingButtons = 1
        /// The bottom of the navigation bar, and the page's whole top inset (the bar and anything
        /// pinned under it, such as the sync bar), in screen points.
        var barBottom: CGFloat = 0
        var contentTop: CGFloat = 0
        /// The page's title row is on screen and not yet half under the status bar.
        var titleShowing = true

        /// The top of the bar's row: the status bar's height.
        var statusBar: CGFloat {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            return scene?.keyWindow?.safeAreaInsets.top ?? 0
        }

        /// The bar's row (44 on iPhone; measured, so a taller bar still lines up).
        var barRow: CGFloat {
            let row = barBottom - statusBar
            return row > 20 ? row : minTarget
        }

        /// Room kept clear on the right of the title for the bar's buttons, 8 from them.
        var trailingRoom: CGFloat {
            trailingButtons > 0 ? CGFloat(trailingButtons) * minTarget + CGFloat(trailingButtons - 1) * 4 + 8 : 0
        }

        /// The title has scrolled away (or isn't on the page): the bar shows its own.
        var collapsed: Bool { !titleShowing }
    }

    extension View {
        /// A tab root's title (see above). `trailingButtons`: how many buttons the bar has on its
        /// right (the "+", Messages' compose), so the title wraps before reaching them.
        func rootTitle(_ title: String, trailingButtons: Int = 1) -> some View {
            modifier(RootTitleModifier(title: title, trailingButtons: trailingButtons))
        }

        /// On the page's `ScrollView` or `List` under `.rootTitle`: the page starts at the top of
        /// the screen, so `RootLargeTitle` can sit in the bar's row.
        func rootTitleScroll() -> some View {
            modifier(RootTitleScroll())
        }
    }

    private struct RootTitleModifier: ViewModifier {
        var title: String
        var trailingButtons: Int
        @State private var state = RootTitleState()

        func body(content: Content) -> some View {
            content
                // The Back label of the screens pushed from here ("‹ Today").
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        Text(verbatim: title)
                            .textRole(.navTitle)
                            .foregroundStyle(Color.text)
                            .lineLimit(1)
                            .opacity(state.collapsed ? 1 : 0)
                            .accessibilityHidden(!state.collapsed)
                            .animation(Motion.snappy, value: state.collapsed)
                    }
                }
                .modifier(BarBackground(collapsed: state.collapsed))
                .background {
                    // Laid out over the whole screen, so its top inset is the bar's bottom.
                    Color.clear
                        .onGeometryChange(for: CGFloat.self) {
                            $0.safeAreaInsets.top
                        } action: {
                            state.barBottom = $0
                        }
                        .ignoresSafeArea()
                }
                .environment(state)
                .onChange(of: title, initial: true) { _, now in state.title = now }
                .onChange(of: trailingButtons, initial: true) { _, now in state.trailingButtons = now }
        }
    }

    /// Before iOS 26, the bar's background stays off while the title is in its row. (On iOS 26
    /// the scroll edge effect does this job; see `RootTitleScroll`.)
    private struct BarBackground: ViewModifier {
        var collapsed: Bool

        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content
            } else {
                content.toolbarBackground(collapsed ? .automatic : .hidden, for: .navigationBar)
            }
        }
    }

    private struct RootTitleScroll: ViewModifier {
        @Environment(RootTitleState.self) private var state: RootTitleState?

        func body(content: Content) -> some View {
            if let state {
                content
                    .contentMargins(.top, 0, for: .scrollContent)
                    .modifier(EdgeEffect(hidden: !state.collapsed))
                    // Laid out from the top of the screen, so its top inset is everything above
                    // the page: the status bar, the bar, and the pinned sync bar.
                    .onGeometryChange(for: CGFloat.self) {
                        $0.safeAreaInsets.top
                    } action: {
                        state.contentTop = $0
                    }
                    .ignoresSafeArea(.container, edges: .top)
            } else {
                content
            }
        }
    }

    /// iOS 26: no scroll edge effect over the title while it sits in the bar's row.
    private struct EdgeEffect: ViewModifier {
        var hidden: Bool

        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content.scrollEdgeEffectHidden(hidden, for: .top)
            } else {
                content
            }
        }
    }

    /// The large title as a tab root's first row (spec 3.1): in the bar's row beside its buttons,
    /// wrapping between words before it reaches them, or on its own row under the bar when its
    /// widest word can't fit there.
    struct RootLargeTitle: View {
        /// The spacing of the stack the title is in, when a subtitle follows it: the subtitle then
        /// sits 4 below the title, as under the system large title.
        var stackSpacing: CGFloat?
        @Environment(RootTitleState.self) private var state: RootTitleState?
        @Environment(\.dynamicTypeSize) private var typeSize
        @State private var width: CGFloat = 0

        var body: some View {
            if let state {
                let stacked = stacks(state)
                let statusBar = state.statusBar
                Text(verbatim: state.title)
                    .textRole(.largeTitle)
                    .foregroundStyle(Color.text)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.trailing, stacked ? 0 : state.trailingRoom)
                    .frame(maxWidth: .infinity, minHeight: stacked ? 0 : state.barRow, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) {
                        $0.size.width
                    } action: {
                        width = $0
                    }
                    .onGeometryChange(for: Bool.self) {
                        $0.frame(in: .global).midY >= statusBar
                    } action: {
                        state.titleShowing = $0
                    }
                    .onAppear { state.titleShowing = true }
                    .onDisappear { state.titleShowing = false }
                    // In the bar's row from the top of the screen, then room for what's pinned
                    // under the bar (the sync bar); stacked, under all of it.
                    .padding(.top, stacked ? state.contentTop : statusBar)
                    .padding(.bottom, (stacked ? 0 : max(0, state.contentTop - state.barBottom)) + tighten)
            }
        }

        private var tighten: CGFloat { stackSpacing.map { 4 - $0 } ?? 0 }

        /// Whether the widest word is wider than the room beside the bar's buttons.
        private func stacks(_ state: RootTitleState) -> Bool {
            guard width > 0 else { return false }
            _ = typeSize  // Re-measured when the text size changes.
            let font = TypeRole.largeTitle.scaledUIFont
            let widest =
                state.title.split(separator: " ").map {
                    (String($0) as NSString).size(withAttributes: [.font: font]).width
                }.max() ?? 0
            return widest > width - state.trailingRoom
        }
    }
#endif
