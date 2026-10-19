#if os(iOS)
    import AVFoundation
    import AVKit
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI
    import UIKit

    /// One capture: view it, mark it up (photos), play it (video, voice), see its record. A pushed
    /// screen; open it with a plain NavigationLink, since the media section also sits inside editor
    /// sheets. Port of apps/mobile/src/app/(app)/jobs/[id]/media/[mediaId].tsx.
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
        @State private var editing = false
        @State private var confirmDelete = false
        @State private var saveError: String?
        @State private var deletes = 0
        @FocusState private var captionFocused: Bool

        init(jobId: String, mediaId: String) {
            self.jobId = jobId
            self.mediaId = mediaId
        }

        var body: some View {
            Group {
                if let media {
                    content(media)
                } else if loaded {
                    List {
                        Notice(kind: .warning, text: "This capture isn’t on this phone.")
                            .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }
                    .listStyle(.insetGrouped)
                } else {
                    // Must be a real view: SwiftUI doesn't run .task on an empty one.
                    Color.clear
                }
            }
            .navigationTitle(media?.kind.label ?? "Capture")
            .navigationBarTitleDisplayMode(.inline)
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
                Button("Delete", role: .destructive) { delete() }
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

        private func content(_ media: Media) -> some View {
            List {
                Section {
                    viewer(media)
                    if media.kind == .photo {
                        Button(MediaDetail.markupButton(media)) { editing = true }
                            .buttonStyle(.secondary)
                            .disabled(source.url == nil)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)

                if media.kind == .audio {
                    Section("Transcript") {
                        Text(MediaDetail.transcript(media))
                            .font(MediaDetail.transcriptIsText(media) ? .body : .subheadline)
                            .foregroundStyle(MediaDetail.transcriptIsText(media) ? Color.primary : Color.muted)
                            .textSelection(.enabled)
                    }
                }

                Section("Caption") {
                    TextField("Caption", text: $caption, prompt: Text("What this shows"), axis: .vertical)
                        .lineLimit(2...6)
                        .focused($captionFocused)
                        .accessibilityLabel("Caption")
                        .onChange(of: caption) { if captionFocused { captionEdited = true } }
                        .onChange(of: captionFocused) { _, focused in if !focused { flushCaption() } }
                }

                Section {
                    ForEach(
                        MediaDetail.rows(
                            media, inspection ?? JobInspection(sync.store, jobId: media.jobId),
                            timeZone: session.company?.timeZone ?? TimeZone.current.identifier),
                        id: \.label
                    ) { row in
                        LabeledContent(row.label) {
                            Text(row.value).multilineTextAlignment(.trailing)
                        }
                        .frame(minHeight: minTarget)
                        .accessibilityElement(children: .combine)
                    }
                }

                Section {
                    Button("Delete") { confirmDelete = true }
                        .buttonStyle(.destructiveSecondary)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.interactively)
        }

        @ViewBuilder
        private func viewer(_ media: Media) -> some View {
            switch source {
            case .loading:
                VStack(spacing: 8) {
                    ProgressView()
                    Text(MediaDetail.loadingText(media.kind)).font(.subheadline).foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(
                        Color(.secondarySystemGroupedBackground)))
            case .unavailable:
                VStack(alignment: .leading, spacing: 12) {
                    Text(MediaDetail.unavailableText(media.kind)).font(.body)
                    Button("Try Again") { attempt += 1 }.buttonStyle(.secondary)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(
                        Color(.secondarySystemGroupedBackground)))
            case .ready(let url):
                switch media.kind {
                case .photo: PhotoView(media: media, url: url)
                case .video: VideoBox(media: media, url: url)
                case .audio: AudioBox(url: url, durationMs: media.durationMs)
                }
            }
        }

        // MARK: - Data

        private func reload() {
            media = MediaDetail.load(sync, mediaId)
            if let media {
                inspection = JobInspection(sync.store, jobId: media.jobId)
                if !captionEdited { caption = media.caption ?? "" }
            }
            loaded = true
            if case .ready = source {} else { Task { await resolveSource() } }
        }

        /// The local file, else (once uploaded) a signed link to the stored copy. Port of useMediaSource.
        private func resolveSource() async {
            guard let media = media ?? MediaDetail.load(sync, mediaId) else { return }
            switch MediaLocation(media, files: sync.media) {
            case .local(let url):
                source = .ready(url)
            case .remote(let path):
                source = .loading
                if let signer, let url = try? await signer.url(path) {
                    source = .ready(url)
                } else {
                    source = .unavailable
                }
            case .unavailable:
                source = .unavailable
            }
        }

        // MARK: - Writes

        /// Caption saves when leaving the field and when leaving the screen.
        private func flushCaption() {
            guard captionEdited, let media else { return }
            do {
                if try MediaWrites.saveCaptionIfChanged(sync, media, caption) { captionEdited = false }
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
                            ProgressView()
                        }
                    }
                }
            }
            .accessibilityLabel(label)
        }
    }

    // MARK: - Photo

    /// The photo with its markup. Pinch to zoom; double-tap to go back to fit.
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
            Color(Tokens.Role.header)
                .aspectRatio(1 / ratio, contentMode: .fit)
                .overlay {
                    ZStack {
                        MediaImage(url: url, label: shapes.isEmpty ? "Photo" : "Photo with markup")
                        MarkupLayer(shapes: shapes)
                    }
                    .scaleEffect(zoom)
                    .offset(offset)
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
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
    private struct AudioBox: View {
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
                        .foregroundStyle(Color(Tokens.Role.onHeader))
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Color(Tokens.Role.header)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playing ? "Pause" : "Play")
                Text("\(formatDuration(current * 1000)) / \(formatDuration(durationMs ?? length * 1000))")
                    .font(.headline)
                    .monospacedDigit()
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(.secondarySystemGroupedBackground))
            )
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
