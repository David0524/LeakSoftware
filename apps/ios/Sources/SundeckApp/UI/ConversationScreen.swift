#if os(iOS)
    import AVFoundation
    import PhotosUI
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // One conversation and New Message (spec 5.7; website app/(office)/messages/[id] and /new,
    // components/messages.tsx; Expo messages/[id].tsx and new.tsx). Texts go out through the
    // website (it talks to Twilio); photos are put in the shop's texts folder first, as the Expo
    // app's uploadTextPicture.

    /// Texts and calls in order, oldest at the top, the view starting at the newest; a reply from
    /// the company number at the bottom.
    struct ConversationScreen: View {
        var conversationId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.dismiss) private var dismiss
        @State private var conversation: Conversation?
        @State private var rows: [ThreadRow] = []
        @State private var line: PhoneLine?
        @State private var names: [String: String] = [:]
        @State private var pictureURLs: [String: URL] = [:]
        @State private var loaded = false
        @State private var calling = false
        @State private var callResult: (text: String, error: Bool)?
        @State private var draft = TextDraft()

        var body: some View {
            let timeZone = session.company?.timeZone ?? "America/Phoenix"
            Group {
                if let conversation {
                    threadView(conversation, timeZone: timeZone)
                } else if loaded {
                    ScreenScroll {
                        EmptyState(text: "This conversation isn’t on this phone.")
                    }
                } else {
                    Color.bg
                }
            }
            .navigationTitle(conversation?.name ?? "")
            .navigationBarTitleDisplayMode(.large)
            .task(id: "\(sync.revision)|\(session.company?.id ?? "")") { reload() }
            // Opening it marks it read for the whole team, and so does a new message while open.
            .task(id: conversation?.lastAt) {
                guard let conversation, let company = session.company else { return }
                try? MessagingWrites.markRead(sync, companyId: company.id, conversation)
            }
            .task(id: rows.count) { await signPictures() }
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(20))
                    await sync.syncNow()
                }
            }
        }

        private func threadView(_ c: Conversation, timeZone: String) -> some View {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    header(c)
                        .padding(.bottom, 8)
                    if let callResult {
                        Notice(kind: callResult.error ? .error : .info, text: callResult.text)
                    }
                    if rows.isEmpty {
                        EmptyState(text: "No messages yet. Send the first text below.")
                    }
                    ForEach(rows) { row in
                        if let day = row.day {
                            Text(day)
                                .textRole(.footnote)
                                .foregroundStyle(Color.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 12)
                                .padding(.bottom, 4)
                                .accessibilityAddTraits(.isHeader)
                        }
                        switch row.item {
                        case .text(let text):
                            TextBubble(
                                text: text, footer: textFooter(text, names: names, timeZone: timeZone),
                                pictures: text.media.compactMap { pictureURLs[$0.path] })
                        case .call(let call):
                            CallBlock(call: call, label: "\(callLabel(call, names: names)) · \(row.time)")
                        }
                    }
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.bottom, 16)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .background(Color.bg)
            .safeAreaInset(edge: .bottom) { composer(c) }
            .refreshable { await sync.syncNow() }
        }

        private func header(_ c: Conversation) -> some View {
            PageHeader {
                if let customerId = c.customerId {
                    Text(formatPhone(c.phone)).fixedSize()
                    Text("·")
                    NavigationLink(value: MessagesRoute.customer(customerId)) {
                        Text("Customer Details").underline().foregroundStyle(Color.link)
                            .frame(minHeight: minTarget)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Not a customer yet")
                }
            } actions: {
                Button("Mark as Unread") { markUnread(c) }.buttonStyle(.secondary)
                if line?.status == "active" {
                    RoundIconButton(systemImage: "phone", label: "Call \(c.name) from the company number") {
                        Task { await call(c) }
                    }
                    .disabled(calling)
                }
            }
        }

        @ViewBuilder private func composer(_ c: Conversation) -> some View {
            if c.optedOut {
                Notice(
                    kind: .warning,
                    text:
                        "\(c.name) replied STOP, so texts to them are off. They can text START to turn them back on."
                )
                .padding(8)
                .chromeBar(hairline: nil)
            } else if let line, line.status == "active" {
                TextComposer(draft: draft, pictures: line.pictures) {
                    await draft.send(app: app, sync: sync, companyId: session.company?.id) { server, body, pictures in
                        try await server.send(conversationId: c.id, body: body, pictures: pictures)
                    }
                }
            } else {
                Notice(kind: .info, text: "Texting is off until the company number is working.")
                    .padding(8)
                    .chromeBar(hairline: nil)
            }
        }

        private func reload() {
            guard let company = session.company else { return }
            conversation = conversations(sync.store, companyId: company.id).first { $0.id == conversationId }
            rows = threadRows(
                thread(sync.store, companyId: company.id, conversationId: conversationId), timeZone: company.timeZone)
            line = companyLine(sync.store, companyId: company.id)
            names = teamNames(sync.kv)
            loaded = true
        }

        /// Unread for the whole team, then back to the list, as in Mail.
        private func markUnread(_ c: Conversation) {
            guard let company = session.company else { return }
            try? MessagingWrites.setUnread(sync, companyId: company.id, c.id, true)
            dismiss()
        }

        private func call(_ c: Conversation) async {
            calling = true
            defer { calling = false }
            do {
                let result = try await TextingServer(sync: sync, api: app.api).call(conversationId: c.id)
                callResult = (callResultText(calling: result.calling, demo: result.demo), false)
            } catch {
                callResult = (String(describing: error), true)
            }
        }

        /// Pictures are private: signed links, fetched when there's a signal.
        private func signPictures() async {
            let paths = rows.flatMap { row -> [String] in
                if case .text(let t) = row.item { return t.media.map(\.path) }
                return []
            }
            .filter { pictureURLs[$0] == nil }
            guard !paths.isEmpty,
                let signed = try? await app.client.storage.from("texts").createSignedURLs(paths: paths, expiresIn: 3600)
            else { return }
            for result in signed {
                if case .success(let path, let url) = result { pictureURLs[path] = url }
            }
        }
    }

    /// A text: pictures above, the bubble (ours on the right in `primary`, theirs on the left in
    /// `fill`), and its line under it.
    struct TextBubble: View {
        var text: TextMessage
        var footer: String
        var pictures: [URL]

        var body: some View {
            let out = text.direction == "out"
            let alignment: Alignment = out ? .trailing : .leading
            VStack(alignment: out ? .trailing : .leading, spacing: 4) {
                ForEach(pictures, id: \.self) { url in
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.fill)
                            .frame(width: 160, height: 160)
                    }
                    .frame(maxHeight: 224)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .containerRelativeFrame(.horizontal, alignment: alignment) { length, _ in length * 0.8 }
                    .accessibilityLabel("Photo in a text")
                }
                if let body = text.body, !body.isEmpty {
                    Text(body)
                        .textRole(.body)
                        .foregroundStyle(out ? Color.onPrimary : Color.text)
                        .textSelection(.enabled)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .fill(out ? Color.brandPrimary : Color.fill)
                        )
                        .containerRelativeFrame(.horizontal, alignment: alignment) { length, _ in length * 0.8 }
                }
                Text(footer)
                    .textRole(.footnote)
                    .foregroundStyle(textFailed(text) ? Color.fail : Color.textMuted)
                    .padding(.horizontal, 8)
            }
            .frame(maxWidth: .infinity, alignment: alignment)
            .accessibilityElement(children: .combine)
        }
    }

    /// A call in the thread: a centered block with its icon and words, the voicemail and its
    /// transcript.
    struct CallBlock: View {
        var call: CallLog
        var label: String

        var body: some View {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: isVoicemail(call) ? "recording.tape" : "phone")
                        .font(.system(size: 14))
                        .accessibilityHidden(true)
                    Text(label)
                }
                .textRole(.secondary)
                .foregroundStyle(Color.textMuted)
                if isVoicemail(call) { VoicemailPlayer(callId: call.id) }
                if let transcript = call.transcript, !transcript.isEmpty {
                    Text("“\(transcript)”").textRole(.secondary).foregroundStyle(Color.text)
                }
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.emptyFill))
            .accessibilityElement(children: .contain)
        }
    }

    /// Plays a voicemail from the website (Twilio keeps it behind the account; the website
    /// passes it on to members with the phone's sign-in).
    struct VoicemailPlayer: View {
        var callId: String
        @Environment(AppEnvironment.self) private var app
        @State private var player: AVPlayer?
        @State private var playing = false

        var body: some View {
            Button {
                Task { await toggle() }
            } label: {
                Label(playing ? "Pause" : "Play Voicemail", systemImage: playing ? "pause.fill" : "play.fill")
            }
            .buttonStyle(.secondary(size: .small))
            .onDisappear { player?.pause() }
        }

        private func toggle() async {
            if let player {
                if playing { player.pause() } else { player.play() }
                playing.toggle()
                return
            }
            guard let token = try? await app.client.auth.session.accessToken else { return }
            let url = AppConfig.webURL.appendingPathComponent("api/calls/\(callId)/recording")
            let asset = AVURLAsset(
                url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": ["Authorization": "Bearer \(token)"]])
            let next = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            player = next
            next.play()
            playing = true
        }
    }

    // MARK: - Composer

    /// What's being written: the words, the chosen photos, and how sending went.
    @MainActor @Observable
    final class TextDraft {
        var body = ""
        var photos: [Data] = []
        var sending = false
        var error: String?

        var canSend: Bool {
            !sending && (!body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !photos.isEmpty)
        }

        /// Puts the photos in the shop's texts folder, then sends through the website. Clears the
        /// draft once sent.
        func send(
            app: AppEnvironment, sync: SyncService, companyId: String?,
            _ deliver: (TextingServer, String, [TextMessage.Picture]) async throws -> Void
        ) async {
            guard canSend, let companyId else { return }
            sending = true
            error = nil
            do {
                var pictures: [TextMessage.Picture] = []
                for photo in photos {
                    let path = textPicturePath(companyId: companyId, type: "image/jpeg")
                    try await app.client.storage.from("texts")
                        .upload(path, data: photo, options: FileOptions(contentType: "image/jpeg"))
                    pictures.append(TextMessage.Picture(path: path, type: "image/jpeg"))
                }
                try await deliver(TextingServer(sync: sync, api: app.api), body, pictures)
                body = ""
                photos = []
            } catch {
                self.error = String(describing: error)
            }
            sending = false
        }
    }

    /// The composer docked at the bottom on the bar material: Add Photos (when the number takes
    /// pictures), the text field (grows to 5 lines), and Send.
    struct TextComposer: View {
        @Bindable var draft: TextDraft
        var pictures: Bool
        var docked = true
        var send: () async -> Void
        @State private var choosing = false

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .bottom, spacing: 8) {
                    if pictures {
                        Button {
                            choosing = true
                        } label: {
                            Image(systemName: "camera")
                                .font(.system(size: 20))
                                .foregroundStyle(Color.link)
                                .frame(width: minTarget, height: minTarget)
                                .background(Circle().fill(Color.iconTint))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add Photos")
                    }
                    TextField(
                        "", text: $draft.body, prompt: Text("Text message").foregroundStyle(Color.placeholder),
                        axis: .vertical
                    )
                    .lineLimit(1...5)
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(minHeight: minTarget)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.surface))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Color.controlBorder, lineWidth: 1)
                    )
                    .accessibilityLabel("Message")
                    .onChange(of: draft.body) { _, new in
                        if new.count > 1600 { draft.body = String(new.prefix(1600)) }
                    }
                    Button {
                        Task { await send() }
                    } label: {
                        Text(draft.sending ? "Sending…" : "Send")
                    }
                    .buttonStyle(.primary)
                    .disabled(!draft.canSend)
                }
                if !draft.photos.isEmpty {
                    HStack {
                        Text(photosAttached(draft.photos.count)).textRole(.secondary).foregroundStyle(Color.textMuted)
                        Spacer()
                        Button("Remove Photos") { draft.photos = [] }
                            .buttonStyle(.quiet(size: .small))
                    }
                }
                if let error = draft.error { Notice(kind: .error, text: error) }
            }
            .padding(docked ? 8 : 0)
            .background {
                // Docked under a thread: Liquid Glass on iOS 26, the bar material before.
                if docked {
                    Color.clear.chromeBar(hairline: nil).ignoresSafeArea(edges: .bottom)
                }
            }
            .sheet(isPresented: $choosing) {
                TextPhotoPicker { draft.photos = $0 }.ignoresSafeArea()
            }
        }
    }

    /// The photo library, up to 10 photos for a text, each as JPEG (which every phone shows;
    /// HEIC isn't). The system picker needs no Photos permission.
    struct TextPhotoPicker: UIViewControllerRepresentable {
        var onDone: @MainActor ([Data]) -> Void

        func makeUIViewController(context: Context) -> PHPickerViewController {
            var config = PHPickerConfiguration()
            config.filter = .images
            config.selectionLimit = 10
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = context.coordinator
            return picker
        }

        func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}

        func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

        final class Coordinator: NSObject, PHPickerViewControllerDelegate {
            let onDone: @MainActor ([Data]) -> Void

            init(onDone: @escaping @MainActor ([Data]) -> Void) { self.onDone = onDone }

            func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
                picker.dismiss(animated: true)
                let providers = results.map(\.itemProvider).filter { $0.canLoadObject(ofClass: UIImage.self) }
                guard !providers.isEmpty else { return }
                let done = onDone
                Task { @MainActor in
                    var photos: [Data] = []
                    for provider in providers {
                        if let jpeg = await Self.jpeg(provider) { photos.append(jpeg) }
                    }
                    done(photos)
                }
            }

            private static func jpeg(_ provider: NSItemProvider) async -> Data? {
                await withCheckedContinuation { continuation in
                    provider.loadObject(ofClass: UIImage.self) { object, _ in
                        continuation.resume(returning: (object as? UIImage)?.jpegData(compressionQuality: 0.8))
                    }
                }
            }
        }
    }

    // MARK: - New Message

    /// The first text to someone from the company number: to a customer (from their page), or to
    /// a customer picked here or any mobile number. Once sent, the conversation takes its place.
    struct NewMessageScreen: View {
        var customerId: String?
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var to = ""
        @State private var picked: MessageRecipient?
        @State private var draft = TextDraft()
        @State private var opened: String?
        @State private var line: PhoneLine?
        @State private var recipients: [MessageRecipient] = []
        @State private var loaded = false
        @State private var browser: BrowserPage?

        var body: some View {
            if let opened {
                ConversationScreen(conversationId: opened)
            } else {
                form
            }
        }

        private var form: some View {
            let company = session.company
            return ScreenScroll {
                if let picked {
                    PageHeader(subtitle: "To \(picked.name), \(picked.phone)")
                }
                if loaded, let notice = lineNotice(line, manager: isManagerRole(company?.role)) {
                    Notice(kind: .info, text: notice.text, link: notice.link) { browser = .site("settings/phone") }
                } else if loaded {
                    if picked == nil {
                        VStack(alignment: .leading, spacing: 4) {
                            OutlinedField(label: "To", text: $to, placeholder: "Mobile number", keyboard: .phonePad)
                        }
                    }
                    TextComposer(draft: draft, pictures: line?.pictures ?? false, docked: false) { await send() }
                    if picked == nil && !recipients.isEmpty {
                        Grouped(label: "Customers") {
                            ForEach(recipients.prefix(30)) { r in
                                Button {
                                    pick(r)
                                } label: {
                                    ListRow(r.name, detail: r.phone, emphasized: true)
                                }
                                .buttonStyle(.row)
                            }
                        }
                    }
                }
            }
            .navigationTitle("New Message")
            .navigationBarTitleDisplayMode(.large)
            .browserSheet($browser)
            .task(id: "\(sync.revision)|\(to)") { reload() }
        }

        private func reload() {
            guard let company = session.company else { return }
            line = companyLine(sync.store, companyId: company.id)
            if picked == nil, let customerId,
                let row = try? sync.store.get("customer", customerId)
            {
                pick(
                    MessageRecipient(
                        id: customerId, name: row["name"]?.string ?? "Customer", phone: row["phone"]?.string ?? ""))
            }
            recipients = messageRecipients(sync.store, companyId: company.id, search: to)
            loaded = true
        }

        /// Already talking with them: open that conversation instead.
        private func pick(_ r: MessageRecipient) {
            guard let company = session.company else { return }
            if let existing = existingConversation(conversations(sync.store, companyId: company.id), phone: r.phone) {
                opened = existing.id
            } else {
                picked = r
            }
        }

        private func send() async {
            guard let company = session.company else { return }
            let customer = picked
            let phone = toE164(to)
            if customer == nil && phone == nil {
                draft.error = "Enter a US mobile number."
                return
            }
            var sentTo: String?
            await draft.send(app: app, sync: sync, companyId: company.id) { server, body, pictures in
                let sent =
                    if let customer {
                        try await server.send(customerId: customer.id, body: body, pictures: pictures)
                    } else {
                        try await server.send(companyId: company.id, phone: phone, body: body, pictures: pictures)
                    }
                sentTo = sent.conversationId
            }
            if let sentTo, !sentTo.isEmpty { opened = sentTo }
        }
    }
#endif
