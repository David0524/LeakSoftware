#if os(iOS)
    import SwiftUI
    import UIKit

    // MARK: - A tab's title and logo in the system navigation bar (owner, 2026-10-21)

    // The five tab pages (Today, Jobs, Schedule, Messages, More) use the system bar with a large
    // title (spec 3.1), so nothing is drawn by hand near the status bar:
    // - At rest, the bar's row sits under the status bar: the Sundeck Pro lockup on the leading
    //   edge (`ToolbarItem(placement: .topBarLeading)`), the bar's buttons on the trailing edge,
    //   in the same row; the large title under the bar, full width, then the page.
    // - Scrolled, the large title goes under the bar as iOS does, the bar takes its material and
    //   small centered title, and the logo collapses to its pin mark: the "Sundeck Pro" wordmark
    //   fades out over the first 30 points of scroll and comes back at the top (owner,
    //   2026-10-21: "just the logo (not the text) should slide down with the page").
    //
    //     ScreenScroll { PageHeader(subtitle: "Monday, October 19") }
    //         .rootTitleScroll()
    //         .rootTitle("Today")
    //
    // `.rootTitleScroll()` on the page's scroll view or list reports how far it has scrolled. The
    // logo shows only on a tab's own page (`brandInBar`, set by AppTabs); a screen pushed onto
    // the stack has the system Back button there instead.

    /// How far the tab page has scrolled from its top, shared by its bar's logo.
    @MainActor @Observable
    final class RootTitleState {
        var offset: CGFloat = 0
    }

    extension View {
        /// A tab root's large title, with the logo on the bar's leading edge on a tab's own page.
        /// `trailingButtons` is kept for the call sites; the system bar lays its buttons out itself.
        func rootTitle(_ title: String, trailingButtons: Int = 1) -> some View {
            modifier(RootTitleModifier(title: title))
        }

        /// On the page's `ScrollView` or `List` under `.rootTitle`: reports the scroll offset, so
        /// the bar's logo collapses to its mark once the page scrolls.
        func rootTitleScroll() -> some View {
            modifier(RootTitleScroll())
        }
    }

    private struct RootTitleModifier: ViewModifier {
        var title: String
        @State private var state = RootTitleState()
        @Environment(\.brandInBar) private var brandInBar

        func body(content: Content) -> some View {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    if brandInBar {
                        ToolbarItem(placement: .topBarLeading) {
                            BarLogo(state: state)
                        }
                        .sharedBackgroundHidden()
                    }
                }
                .environment(state)
        }
    }

    private struct RootTitleScroll: ViewModifier {
        @Environment(RootTitleState.self) private var state: RootTitleState?

        func body(content: Content) -> some View {
            if let state {
                content.onScrollGeometryChange(for: CGFloat.self) {
                    $0.contentOffset.y + $0.contentInsets.top
                } action: { _, now in
                    state.offset = now
                }
            } else {
                content
            }
        }
    }

    /// The bar's logo: the lockup at rest, the pin mark once the page has scrolled.
    private struct BarLogo: View {
        var state: RootTitleState

        var body: some View {
            let progress = min(1, max(0, state.offset / SundeckLogo.collapseDistance))
            SundeckLogo(height: SundeckLogo.barHeight, wordmark: 1 - progress)
        }
    }

    extension ToolbarContent {
        /// iOS 26: no Liquid Glass capsule behind the logo; it sits on the bar like a title.
        @ToolbarContentBuilder
        fileprivate func sharedBackgroundHidden() -> some ToolbarContent {
            if #available(iOS 26, *) {
                self.sharedBackgroundVisibility(.hidden)
            } else {
                self
            }
        }
    }
#endif
