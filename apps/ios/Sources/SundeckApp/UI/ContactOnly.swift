#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// Messages is for people with Text and Call Customers (owner, 2026-11-23; SundeckCore
    /// Contact.swift), as the website's messages/layout.tsx. The tab is gone without it; a link or
    /// an old notification shows this instead.
    struct ContactOnly<Content: View>: View {
        @Environment(Session.self) private var session
        @ViewBuilder var content: () -> Content

        var body: some View {
            if session.company?.canContact ?? true {
                content()
            } else {
                List {
                    Section {
                        Notice(kind: .warning, text: noContactMessage).plainListRow()
                    }
                }
                .navigationTitle("Messages")
            }
        }
    }
#endif
