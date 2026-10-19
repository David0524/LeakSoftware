#if os(iOS)
    import SwiftUI

    /// The More tab (stub until the screen helper builds it).
    struct MoreScreen: View {
        var showWelcome: () -> Void
        var showReauth: () -> Void

        var body: some View { MoreView(showWelcome: showWelcome, showReauth: showReauth) }
    }
#endif
