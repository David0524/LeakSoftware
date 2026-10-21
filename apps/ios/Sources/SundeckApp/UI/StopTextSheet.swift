#if os(iOS)
    import MessageUI
    import SundeckCore
    import SwiftUI

    /// A text from the phone to one person (`StopTextRoute.phone`): the system's compose sheet,
    /// addressed to them, with `body` filled in when there is one. Unlike opening Messages by a
    /// link, it can't land on whatever conversation Messages showed last (owner, 2026-10-21).
    struct ComposeText: Identifiable {
        var id = UUID()
        var phone: String
        var body: String?
    }

    extension View {
        /// Presents `text` in the system's compose sheet (`StopText.open` sets it only where the
        /// phone can send texts).
        func composeTextSheet(_ text: Binding<ComposeText?>) -> some View {
            sheet(item: text) { item in
                MessageCompose(text: item) { text.wrappedValue = nil }
                    .ignoresSafeArea()
            }
        }
    }

    private struct MessageCompose: UIViewControllerRepresentable {
        var text: ComposeText
        var done: @MainActor () -> Void

        func makeUIViewController(context: Context) -> MFMessageComposeViewController {
            let compose = MFMessageComposeViewController()
            compose.recipients = [StopTextRoute.smsNumber(text.phone)]
            if let body = text.body { compose.body = body }
            compose.messageComposeDelegate = context.coordinator
            return compose
        }

        func updateUIViewController(_ controller: MFMessageComposeViewController, context: Context) {}

        func makeCoordinator() -> Coordinator { Coordinator(done: done) }

        final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
            let done: @MainActor () -> Void

            init(done: @escaping @MainActor () -> Void) { self.done = done }

            func messageComposeViewController(
                _ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult
            ) {
                let done = done
                Task { @MainActor in done() }
            }
        }
    }

    /// Message on a stop (Today's card and rows): `StopTextRoute` decides, this goes there. The
    /// conversation and New Message push on the current tab's stack, so Back returns to Today;
    /// a text from the phone opens the compose sheet addressed to the customer, or Messages on
    /// their number where the phone can't send texts itself.
    @MainActor enum StopText {
        static func open(
            _ route: StopTextRoute, body: String? = nil, openRoute: (Route) -> Void, openURL: OpenURLAction,
            compose: (ComposeText) -> Void
        ) {
            switch route {
            case .conversation(let id): openRoute(.messages(.conversation(id)))
            case .newMessage(let customerId): openRoute(.messages(.newMessage(customerId: customerId)))
            case .phone(let number):
                if MFMessageComposeViewController.canSendText() {
                    compose(ComposeText(phone: number, body: body))
                } else if let url = StopTextRoute.smsURL(number, body: body) {
                    openURL(url)
                }
            }
        }
    }
#endif
