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
                .background { if keepsTitleFont { TitleFontKeeper().frame(width: 0, height: 0) } }
        }

        @Environment(\.keepsTitleFont) private var keepsTitleFont
    }

    extension EnvironmentValues {
        /// Off only in the screenshot test that shows the title without `TitleFontKeeper`.
        @Entry var keepsTitleFont = true
    }

    /// Keeps the large title in Barlow (owner, 2026-10-21: "Look at the schedule font. That was
    /// supposed to be fixed. The map opening should not change it"). The bar's fonts are set app-
    /// wide at launch (`Chrome.install`), but with the Day map open the bar drew "Schedule" in
    /// the system font. This puts the same fonts on the page's own navigation item, which wins
    /// over the bar's, each time the page lays out.
    private struct TitleFontKeeper: UIViewControllerRepresentable {
        func makeUIViewController(context: Context) -> Controller { Controller() }

        func updateUIViewController(_ controller: Controller, context: Context) { controller.keep() }

        final class Controller: UIViewController {
            override func viewWillAppear(_ animated: Bool) {
                super.viewWillAppear(animated)
                keep()
            }

            override func viewWillLayoutSubviews() {
                super.viewWillLayoutSubviews()
                keep()
            }

            /// The page's item: the controller the navigation controller holds.
            func keep() {
                var page: UIViewController? = self
                while let current = page, !(current.parent is UINavigationController) { page = current.parent }
                guard let item = page?.navigationItem else { return }
                // Written only when they differ, so a layout doesn't lay the bar out again.
                if let look = fonted(item.standardAppearance, edge: false) { item.standardAppearance = look }
                if let look = fonted(item.compactAppearance, edge: false) { item.compactAppearance = look }
                if let look = fonted(item.scrollEdgeAppearance, edge: true) { item.scrollEdgeAppearance = look }
                if let look = fonted(item.compactScrollEdgeAppearance, edge: true) {
                    item.compactScrollEdgeAppearance = look
                }
            }

            /// The item's appearance with our title fonts (the app's, when it has none), or nil
            /// when it already has them.
            private func fonted(_ look: UINavigationBarAppearance?, edge: Bool) -> UINavigationBarAppearance? {
                guard let look else { return Chrome.appearance(edge: edge) }
                let large = Chrome.largeTitle[.font] as? UIFont
                let small = Chrome.smallTitle[.font] as? UIFont
                if (look.largeTitleTextAttributes[.font] as? UIFont) == large,
                    (look.titleTextAttributes[.font] as? UIFont) == small
                {
                    return nil
                }
                let copy = look.copy()
                copy.largeTitleTextAttributes = Chrome.largeTitle
                copy.titleTextAttributes = Chrome.smallTitle
                return copy
            }
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
