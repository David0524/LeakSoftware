#if os(iOS)
    @preconcurrency import LinkPresentation
    import SundeckCore
    import SwiftUI
    import UIKit

    /// A customer text ready for the share sheet: its words, and its link with the preview the
    /// website gives it (owner, 2026-10-24: link previews for quotes, invoices and reports).
    struct PreparedShare: Identifiable {
        let id = UUID()
        /// The words before the link; empty when the text was only the link.
        let text: String
        let url: URL?
        /// The link's preview (title, card image, icon) as Messages will show it; nil when it
        /// couldn't be read in time, and Messages then reads it itself.
        let metadata: LPLinkMetadata?
    }

    enum LinkShare {
        /// Splits a text that ends with a customer link, and reads the link's preview from the
        /// website (its og tags and card image) the way Messages does, for at most 2.5 seconds.
        @MainActor
        static func prepare(_ message: String) async -> PreparedShare {
            let parts = splitShareMessage(message)
            guard let link = parts.url, let url = URL(string: link) else {
                return PreparedShare(text: message, url: nil, metadata: nil)
            }
            let provider = LPMetadataProvider()
            provider.timeout = 2.5
            let metadata = try? await provider.startFetchingMetadata(for: url)
            return PreparedShare(text: parts.text, url: url, metadata: metadata)
        }
    }

    /// The link itself, with its preview: the share sheet's header and Messages show the card.
    final class LinkShareItem: NSObject, UIActivityItemSource {
        let url: URL
        let metadata: LPLinkMetadata?

        init(url: URL, metadata: LPLinkMetadata?) {
            self.url = url
            self.metadata = metadata
        }

        func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { url }

        func activityViewController(
            _ controller: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?
        ) -> Any? { url }

        /// Mail's subject: the preview's title ("Bluefin Pool Co.: Quote for Dana Ruiz").
        func activityViewController(
            _ controller: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?
        ) -> String { metadata?.title ?? "" }

        func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
            metadata
        }
    }

    /// The system share sheet for a prepared customer text: the words, then the link as a link.
    struct LinkShareSheet: UIViewControllerRepresentable {
        var share: PreparedShare

        func makeUIViewController(context: Context) -> UIActivityViewController {
            var items: [Any] = []
            if !share.text.isEmpty { items.append(share.text) }
            if let url = share.url { items.append(LinkShareItem(url: url, metadata: share.metadata)) }
            return UIActivityViewController(activityItems: items, applicationActivities: nil)
        }

        func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
    }

    /// Opens the share sheet for `message` once its link's preview is read; `onDone` runs when the
    /// sheet closes.
    private struct LinkShareModifier: ViewModifier {
        var message: String?
        var onDone: () -> Void
        @State private var prepared: PreparedShare?

        func body(content: Content) -> some View {
            content
                .task(id: message) {
                    guard let message else {
                        prepared = nil
                        return
                    }
                    let ready = await LinkShare.prepare(message)
                    if !Task.isCancelled { prepared = ready }
                }
                .sheet(item: $prepared, onDismiss: onDone) { LinkShareSheet(share: $0) }
        }
    }

    extension View {
        /// The share sheet for a customer text (Send by Text, Share): Messages gets the link as a
        /// link with its preview card, and the words beside it (Expo's `shareLink`).
        func linkShareSheet(_ message: String?, onDone: @escaping () -> Void) -> some View {
            modifier(LinkShareModifier(message: message, onDone: onDone))
        }
    }
#endif
