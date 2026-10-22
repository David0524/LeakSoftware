#if os(iOS)
    import AVFoundation
    import AVKit
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI
    import UIKit

    /// The full-screen photo viewer (spec 6.5): black behind the photo (navy letterboxing video),
    /// pinch to zoom with its markup over it, a bar with Done, "{Photo} · {attached to}" and Share,
    /// and a panel with the caption, when it was taken, the transcript for a voice note, and Mark Up
    /// and Delete. Swiping down closes it. Presented over the tab bar by `.mediaViewer(jobId:)`.
    /// Port of apps/mobile/src/app/(app)/jobs/[id]/media/[mediaId].tsx.
    struct MediaScreen: View {
        var jobId: String
        var mediaId: String

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @Environment(\.mediaURLSigner) private var signer
        @State private var media: Media?
        @State private var loaded = false
        @State private var inspection: JobInspection?
        @State private var source: MediaSourceState = .loading
        @State private var attempt = 0
        @State private var caption = ""
        @State private var captionEdited = false
        @State private var captionSaved = false
        @State private var editing = false
        @State private var confirmDelete = false
        @State private var saveError: String?
        @State private var deletes = 0
        @State private var pull: CGFloat = 0
        @FocusState private var captionFocused: Bool

        init(jobId: String, mediaId: String) {
            self.jobId = jobId
            self.mediaId = mediaId
        }

        var body: some View {
            VStack(spacing: 0) {
                bar
                ZStack {
                    (media?.kind == .video ? Color.navy : Color.black)
                    if let media {
                        viewer(media)
                    } else if loaded {
                        Text("This capture isn’t on this phone.").textRole(.body).foregroundStyle(Color.white)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .offset(y: pull)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 24)
                        .onChanged { value in
                            if value.translation.height > 0, abs(value.translation.width) < value.translation.height {
                                pull = value.translation.height
                            }
                        }
                        .onEnded { value in
                            if value.translation.height > 120 { close() } else { withAnimation { pull = 0 } }
                        })
                if let media { panel(media) }
            }
            .background(Color.black.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .task(id: sync.revision) { reload() }
            .task(id: attempt) { await resolveSource() }
            .onDisappear { flushCaption() }
            .sensoryFeedback(.warning, trigger: deletes)
            .fullScreenCover(isPresented: $editing) {
                if let media, case .ready(let url) = source {
                    MarkupEditor(media: media, url: url)
                }
            }
            .confirmationDialog(
                MediaDetail.deleteTitle(media?.kind ?? .photo), isPresented: $confirmDelete, titleVisibility: .visible
            ) {
                Button(MediaDetail.deleteButton(media?.kind ?? .photo), role: .destructive) { delete() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(MediaDetail.deleteMessage)
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        /// Done, the title and Share, on the bar material over the photo.
        /// Share on the left, Done in the confirmation spot on the right (owner, 2026-10-20).
        private var bar: some View {
            HStack(spacing: 8) {
                Group {
                    if let url = source.url {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up").font(.system(size: 20, weight: .medium))
                                .frame(width: minTarget, height: minTarget)
                        }
                        .accessibilityLabel("Share")
                    } else {
                        Color.clear.frame(width: minTarget, height: minTarget)
                    }
                }
                .foregroundStyle(Color.link)
                Spacer(minLength: 0)
                Text(title)
                    .textRole(.navTitle)
                    .foregroundStyle(Color.text)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button("Done") { close() }
                    .font(.role(.bodyEmphasis))
                    .foregroundStyle(Color.link)
                    .frame(minWidth: minTarget, minHeight: minTarget)
            }
            .padding(.horizontal, 8)
            .chromeBar(hairline: nil)
        }

        private var title: String {
            guard let media else { return "Capture" }
            return
                "\(media.kind.label) · \(JobPhotos.attached(media, inspection ?? JobInspection(sync.store, jobId: media.jobId)))"
        }

        /// The panel under the photo: caption, when, transcript, Mark Up and Delete.
        private func panel(_ media: Media) -> some View {
            let text = JobPhotos.card(
                media, inspection ?? JobInspection(sync.store, jobId: media.jobId),
                timeZone: session.company?.timeZone ?? TimeZone.current.identifier)
            return ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Caption")
                        TextField(
                            "", text: $caption, prompt: Text("What this shows").foregroundStyle(Color.placeholder),
                            axis: .vertical
                        )
                        .lineLimit(1...4)
                        .focused($captionFocused)
                        .accessibilityLabel("Caption")
                        .fieldBox(focused: captionFocused)
                        .onChange(of: caption) {
                            if captionFocused {
                                captionEdited = true
                                captionSaved = false
                            }
                        }
                        .onChange(of: captionFocused) { _, focused in if !focused { flushCaption() } }
                        // Saved by itself 1 second after typing stops (owner, 2026-10-20).
                        .task(id: caption) {
                            guard captionEdited else { return }
                            try? await Task.sleep(for: Autosave.delay)
                            guard !Task.isCancelled else { return }
                            flushCaption()
                        }
                        if captionSaved { SavedLabel() }
                    }
                    Text([text.meta, MediaDetail.upload(media)].filter { !$0.isEmpty }.joined(separator: " · "))
                        .textRole(.secondary).foregroundStyle(Color.textMuted)
                    if media.kind == .audio {
                        Text(MediaDetail.transcript(media))
                            .textRole(MediaDetail.transcriptIsText(media) ? .body : .secondary)
                            .foregroundStyle(MediaDetail.transcriptIsText(media) ? Color.text : Color.textMuted)
                            .textSelection(.enabled)
                    }
                    HStack(spacing: 12) {
                        if media.kind == .photo {
                            Button(MediaDetail.markupButton(media)) { editing = true }
                                .buttonStyle(.secondary)
                                .disabled(source.url == nil)
                        }
                        Button("Delete") { confirmDelete = true }
                            .buttonStyle(.danger)
                            .accessibilityLabel(MediaDetail.deleteButton(media.kind))
                    }
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .frame(maxHeight: 280)
            .fixedSize(horizontal: false, vertical: true)
            .background(Color.bg)
        }

        @ViewBuilder
        private func viewer(_ media: Media) -> some View {
            switch source {
            case .loading:
                // The picture's place, still on its way (no spinner).
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.12))
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .shimmer()
                    .padding(.horizontal, 16)
                    .accessibilityLabel(MediaDetail.loadingText(media.kind))
            case .unavailable:
                VStack(spacing: 12) {
                    Text(MediaDetail.unavailableText(media.kind))
                        .textRole(.body).foregroundStyle(Color.white).multilineTextAlignment(.center)
                    Button("Try Again") { attempt += 1 }.buttonStyle(.secondary)
                }
                .padding(24)
            case .ready(let url):
                switch media.kind {
                case .photo: PhotoView(media: media, url: url)
                case .video: VideoBox(media: media, url: url)
                case .audio: AudioBox(url: url, durationMs: media.durationMs).padding(16)
                }
            }
        }

        // MARK: - Data

        private func reload() {
            media = MediaDetail.load(sync, mediaId)
            if let media {
                inspection = JobInspection(sync.store, jobId: media.jobId)
                if !captionEdited { caption = MediaDetail.captionShown(typed: caption, media) }
            }
            loaded = true
            if case .ready = source {} else { Task { await resolveSource() } }
        }

        private func resolveSource() async {
            guard let media = media ?? MediaDetail.load(sync, mediaId) else { return }
            if case .remote = MediaLocation(media, files: sync.media) { source = .loading }
            source = await resolveMediaSource(media, files: sync.media, signer: signer)
        }

        // MARK: - Writes

        private func close() {
            flushCaption()
            dismiss()
        }

        /// Caption saves 1 second after typing stops, when leaving the field and when leaving the
        /// screen, with "Saved" after.
        private func flushCaption() {
            guard captionEdited, let media else { return }
            do {
                if try MediaWrites.saveCaptionIfChanged(sync, media, caption) {
                    captionEdited = false
                    withAnimation { captionSaved = true }
                }
            } catch {
                saveError = String(describing: error)
            }
        }

        private func delete() {
            guard let media else { return }
            do {
                try MediaWrites.delete(sync, media)
                deletes += 1
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }

    /// Where a capture's file is: loading, ready at a URL (local file or signed link), or not
    /// reachable now.
    enum MediaSourceState: Equatable {
        case loading
        case ready(URL)
        case unavailable

        var url: URL? {
            if case .ready(let url) = self { return url }
            return nil
        }
    }

    /// A photo from a local file or a link, filling its frame.
    struct MediaImage: View {
        var url: URL
        var label: String

        var body: some View {
            Group {
                if url.isFileURL {
                    if let image = UIImage(contentsOfFile: url.path) {
                        Image(uiImage: image).resizable().scaledToFit()
                    } else {
                        Color.clear
                    }
                } else {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFit()
                        } else if phase.error != nil {
                            Image(systemName: "photo").foregroundStyle(Color.muted)
                        } else {
                            Rectangle().fill(Color.fill).shimmer()
                        }
                    }
                }
            }
            .accessibilityLabel(label)
        }
    }

    // MARK: - Photo

    /// The photo fitted to the screen with its markup. Pinch to zoom; double-tap to go back to fit.
    private struct PhotoView: View {
        var media: Media
        var url: URL
        @State private var zoom: CGFloat = 1
        @State private var lastZoom: CGFloat = 1
        @State private var offset: CGSize = .zero
        @State private var lastOffset: CGSize = .zero

        var body: some View {
            let shapes = parseMarkup(media.markup).shapes
            let ratio = MediaDetail.photoRatio(media)
            Color.black
                .aspectRatio(1 / ratio, contentMode: .fit)
                .overlay {
                    ZStack {
                        MediaImage(url: url, label: shapes.isEmpty ? "Photo" : "Photo with markup")
                        MarkupLayer(shapes: shapes)
                    }
                    .scaleEffect(zoom)
                    .offset(offset)
                }
                .contentShape(Rectangle())
                .gesture(
                    MagnifyGesture()
                        .onChanged { zoom = min(max(lastZoom * $0.magnification, 1), 4) }
                        .onEnded { _ in
                            lastZoom = zoom
                            if zoom == 1 { resetPan() }
                        }
                        .simultaneously(
                            with: DragGesture(minimumDistance: zoom > 1 ? 0 : .infinity)
                                .onChanged {
                                    offset = CGSize(
                                        width: lastOffset.width + $0.translation.width,
                                        height: lastOffset.height + $0.translation.height)
                                }
                                .onEnded { _ in lastOffset = offset })
                )
                .onTapGesture(count: 2) {
                    withAnimation {
                        zoom = 1
                        lastZoom = 1
                        resetPan()
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(shapes.isEmpty ? "Photo" : "Photo with markup")
                .accessibilityAddTraits(.isImage)
        }

        private func resetPan() {
            offset = .zero
            lastOffset = .zero
        }
    }

    // MARK: - Video and voice playback

    /// Video with the system's playback controls (AVPlayerViewController, as Expo's nativeControls).
    private struct VideoBox: View {
        var media: Media
        var url: URL

        var body: some View {
            PlayerController(url: url)
                .aspectRatio(ratio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityLabel("Video")
        }

        private var ratio: CGFloat {
            guard let w = media.width, let h = media.height, w != 0, h != 0 else { return 16 / 9 }
            return w / h
        }
    }

    private struct PlayerController: UIViewControllerRepresentable {
        var url: URL

        func makeUIViewController(context: Context) -> AVPlayerViewController {
            let controller = AVPlayerViewController()
            controller.player = AVPlayer(url: url)
            controller.videoGravity = .resizeAspect
            return controller
        }

        func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
            if (controller.player?.currentItem?.asset as? AVURLAsset)?.url != url {
                controller.player = AVPlayer(url: url)
            }
        }

        static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: ()) {
            controller.player?.pause()
        }
    }

    /// Plays a voice note (local file or signed link), even with the ringer switch on silent.
    struct AudioBox: View {
        var url: URL
        var durationMs: Double?
        @State private var player: AVPlayer?
        @State private var playing = false
        @State private var current: Double = 0
        @State private var length: Double = 0

        var body: some View {
            HStack(spacing: 12) {
                Button {
                    toggle()
                } label: {
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .foregroundStyle(Color.link)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Color.iconTint))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playing ? "Pause" : "Play")
                Text("\(formatDuration(current * 1000)) / \(formatDuration(durationMs ?? length * 1000))")
                    .font(.role(.bodyEmphasis))
                    .monospacedDigit()
                    .foregroundStyle(Color.text)
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.well))
            .task(id: playing) {
                while playing, !Task.isCancelled, let player {
                    current = seconds(player.currentTime())
                    length = player.currentItem.map { seconds($0.duration) } ?? 0
                    if length > 0, current >= length - 0.05 { playing = false }
                    try? await Task.sleep(for: .milliseconds(200))
                }
            }
            .onDisappear {
                player?.pause()
                playing = false
            }
        }

        private func toggle() {
            if playing {
                player?.pause()
                playing = false
                return
            }
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try? AVAudioSession.sharedInstance().setActive(true)
            if player == nil { player = AVPlayer(url: url) }
            guard let player else { return }
            if length > 0, seconds(player.currentTime()) >= length - 0.05 { player.seek(to: .zero) }
            player.play()
            playing = true
        }

        private func seconds(_ time: CMTime) -> Double {
            let s = time.seconds
            return s.isFinite ? s : 0
        }
    }
#endif
