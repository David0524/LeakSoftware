#if os(iOS)
    import ImageIO
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI
    import UIKit
    import UniformTypeIdentifiers

    extension EnvironmentValues {
        /// Signed links to uploaded captures. The app passes Supabase storage's createSignedURL.
        @Entry var mediaURLSigner: MediaURLSigner? = nil
        /// Opens a capture's screen; set by `.mediaViewer(jobId:)` on the screen that shows a section.
        @Entry var openMedia: (String) -> Void = { _ in }
    }

    /// Photos, videos and voice notes for a job or one part of it, with capture buttons.
    /// Everything is saved on the phone first and uploads in the background. List content (a
    /// `Section`), so it sits inside the host's List. Port of
    /// apps/mobile/src/features/media/MediaSection.tsx.
    struct MediaSection: View {
        var target: MediaTarget
        var title: String? = nil

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openURL) private var openURL
        @Environment(\.openMedia) private var openMedia
        @State private var media: [Media] = []
        @State private var busy: MediaKind?
        @State private var recording = false
        @State private var choosing: MediaKind?
        @State private var camera: MediaKind?
        @State private var cameraStartedAt = ""
        @State private var position: Task<Coordinate?, Never>?
        @State private var library: MediaKind?
        @State private var problem: Problem?
        @State private var deleting: Media?

        init(target: MediaTarget, title: String? = nil) {
            self.target = target
            self.title = title
        }

        /// An alert: a failed capture or save, with Open Settings when a permission is off.
        struct Problem: Identifiable {
            let id = UUID()
            var title: String
            var message: String
            var needsSettings = false
        }

        var body: some View {
            Section(title ?? "Photos and Notes") {
                if recording {
                    VoiceRecorder(
                        onSaved: { file in
                            await save(file, at: Task { await LocationLookup.shared.prepare() })
                        },
                        onClose: { recording = false })
                } else {
                    buttons
                }
                if !media.isEmpty {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach(media, id: \.id) { item in
                            // Buttons, not NavigationLinks: several links in one List row become one
                            // row-wide link. The host's `.mediaViewer()` pushes the screen.
                            Button {
                                openMedia(item.id)
                            } label: {
                                MediaThumb(media: item)
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(CaptureRules.accessibilityLabel(item))
                            // The capture's screen has a Delete button; screen readers can also delete from here.
                            .accessibilityAction(named: "Delete") { deleting = item }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .task(id: TaskKey(revision: sync.revision, target: target)) { reload() }
            .confirmationDialog(
                "Add \(choosing?.label ?? "")",
                isPresented: Binding(get: { choosing != nil }, set: { if !$0 { choosing = nil } }),
                titleVisibility: .visible, presenting: choosing
            ) { kind in
                Button("Take \(kind.label)") { Task { await openCamera(kind) } }
                Button("Choose from Library") { openLibrary(kind) }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog(
                deleting.map { MediaDetail.deleteTitle($0.kind) } ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { item in
                Button("Delete", role: .destructive) { delete(item) }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text(MediaDetail.deleteMessage)
            }
            .alert(
                problem?.title ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } }),
                presenting: problem
            ) { shown in
                if shown.needsSettings {
                    Button("Cancel", role: .cancel) {}
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                } else {
                    Button("OK", role: .cancel) {}
                }
            } message: { shown in
                Text(shown.message)
            }
            .fullScreenCover(
                isPresented: Binding(get: { camera != nil }, set: { if !$0 { cameraClosed(nil) } })
            ) {
                CameraPicker(kind: camera ?? .photo) { cameraClosed($0) }
                    .ignoresSafeArea()
            }
            .sheet(isPresented: Binding(get: { library != nil }, set: { if !$0 { library = nil } })) {
                LibraryPicker(kind: library ?? .photo) { result in
                    let kind = library ?? .photo
                    library = nil
                    if let result { Task { await picked(result, kind) } }
                }
                .ignoresSafeArea()
            }
        }

        /// Photo, Video and Voice Note side by side; stacked when large text doesn't fit.
        private var buttons: some View {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { buttonRow }
                VStack(spacing: 8) { buttonRow }
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }

        @ViewBuilder private var buttonRow: some View {
            captureButton("Photo", kind: .photo) { choosing = .photo }
            captureButton("Video", kind: .video) { choosing = .video }
            captureButton("Voice Note", kind: nil) { recording = true }
        }

        private func captureButton(_ label: String, kind: MediaKind?, action: @escaping () -> Void) -> some View {
            Button(action: action) {
                if let kind, busy == kind {
                    ProgressView().accessibilityLabel("\(label), working")
                } else {
                    Text(label).lineLimit(1).fixedSize()
                }
            }
            .buttonStyle(.secondary)
            .disabled(busy != nil)
        }

        // MARK: - Capturing

        private func openCamera(_ kind: MediaKind) async {
            busy = kind
            // Ask for location first, so two permission prompts never overlap, then look it up
            // while the camera is open.
            await LocationLookup.shared.askOnce()
            let lookup = Task { await LocationLookup.shared.currentPosition() }
            do {
                try await CameraAccess.request()
                guard CameraPicker.isAvailable else { throw MediaError("This phone’s camera isn’t available.") }
            } catch {
                lookup.cancel()
                busy = nil
                fail(CaptureRules.failureTitle(kind), error)
                return
            }
            position = lookup
            cameraStartedAt = CaptureRules.now()
            camera = kind
        }

        private func cameraClosed(_ result: CameraPicker.Result?) {
            guard let kind = camera else { return }
            camera = nil
            let lookup = position
            position = nil
            let capturedAt = cameraStartedAt
            guard let result else {
                lookup?.cancel()
                busy = nil
                return
            }
            Task {
                defer { busy = nil }
                do {
                    let file: CapturedFile
                    switch result {
                    case .photo(let data):
                        file = try await Task.detached { try PhotoCompressor.compress(data, capturedAt: capturedAt) }
                            .value
                    case .video(let url):
                        let info = await VideoInfo.read(url)
                        file = CaptureRules.video(
                            url: url, mime: nil, width: info.width, height: info.height, durationMs: info.durationMs,
                            capturedAt: capturedAt)
                    }
                    await save(file, at: lookup)
                } catch {
                    fail(CaptureRules.failureTitle(kind), error)
                }
            }
        }

        private func openLibrary(_ kind: MediaKind) {
            library = kind
        }

        /// A photo or video already on the phone. Taken earlier, maybe elsewhere: where the phone
        /// is now isn't where it was taken, so it gets no location.
        private func picked(_ result: CameraPicker.Result, _ kind: MediaKind) async {
            busy = kind
            defer { busy = nil }
            do {
                let file: CapturedFile
                switch result {
                case .video(let movie):
                    let original = await VideoInfo.read(movie)
                    do {
                        try CaptureRules.checkVideoLength(durationMs: original.durationMs)
                    } catch {
                        try? FileManager.default.removeItem(at: movie)
                        throw error
                    }
                    let encoded = await VideoInfo.mediumQuality(movie)
                    let info = await VideoInfo.read(encoded.url)
                    file = CaptureRules.video(
                        url: encoded.url, mime: encoded.mime, width: info.width, height: info.height,
                        durationMs: info.durationMs ?? original.durationMs, capturedAt: CaptureRules.now())
                case .photo(let data):
                    file = try await Task.detached {
                        try PhotoCompressor.compress(
                            data, capturedAt: PhotoCompressor.exifTime(data) ?? CaptureRules.now())
                    }
                    .value
                }
                await save(file, at: nil)
            } catch {
                fail(CaptureRules.failureTitle(kind), error)
            }
        }

        private func save(_ file: CapturedFile, at lookup: Task<Coordinate?, Never>?) async {
            guard let company = session.company else { return }
            let place = await lookup?.value
            do {
                try MediaWrites.saveCapture(sync, companyId: company.id, target: target, file, at: place)
            } catch {
                try? FileManager.default.removeItem(at: file.url)
                problem = Problem(title: "Couldn’t save", message: message(error))
            }
        }

        private func fail(_ title: String, _ error: Error) {
            problem = Problem(
                title: title, message: message(error), needsSettings: (error as? MediaError)?.needsSettings ?? false)
        }

        private func message(_ error: Error) -> String {
            (error as? MediaError)?.description ?? error.localizedDescription
        }

        private func delete(_ item: Media) {
            do {
                try MediaWrites.delete(sync, item)
            } catch {
                problem = Problem(title: "Couldn’t save", message: message(error))
            }
        }

        private func reload() {
            media = jobMedia(sync.store, target)
        }

        private struct TaskKey: Hashable {
            var revision: Int
            var target: MediaTarget
        }
    }

    /// One capture in the grid: the photo (with its markup), or an icon and length; a badge while
    /// it waits to upload.
    struct MediaThumb: View {
        var media: Media

        @Environment(SyncService.self) private var sync
        @Environment(\.mediaURLSigner) private var signer
        @Environment(\.displayScale) private var displayScale
        @State private var image: UIImage?

        var body: some View {
            Color(Tokens.Role.header)
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    if media.kind == .photo, let image {
                        GeometryReader { geo in
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: geo.size.width, height: geo.size.height)
                                .clipped()
                                .overlay { coverMarkup(geo.size.width) }
                        }
                    } else {
                        placeholder
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if media.uploadState == .pending {
                        Image(systemName: "arrow.up")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color(Tokens.Role.header))
                            .padding(5)
                            .background(Circle().fill(Color(Tokens.Role.surface)))
                            .padding(4)
                            .accessibilityHidden(true)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.md, style: .continuous))
                .contentShape(Rectangle())
                .task(id: "\(media.id)-\(media.uploadState.rawValue)") { await load() }
        }

        private var placeholder: some View {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.title2)
                if let ms = media.durationMs, ms > 0 {
                    Text(formatDuration(ms)).font(.footnote.weight(.semibold).monospacedDigit())
                }
            }
            .foregroundStyle(Color(Tokens.Role.onHeader))
            .accessibilityHidden(true)
        }

        private var icon: String {
            switch media.kind {
            case .audio: "mic.fill"
            case .video: "video.fill"
            case .photo: "photo"
            }
        }

        /// Markup placed the way scaledToFill crops the photo into the square.
        @ViewBuilder private func coverMarkup(_ size: CGFloat) -> some View {
            let shapes = parseMarkup(media.markup).shapes
            if !shapes.isEmpty, let w = media.width, let h = media.height, w > 0, h > 0 {
                let scale = max(size / w, size / h)
                let dw = w * scale
                let dh = h * scale
                MarkupLayer(shapes: shapes, scale: dw / 400)
                    .frame(width: dw, height: dh)
                    .position(x: size / 2, y: size / 2)
            }
        }

        private func load() async {
            guard media.kind == .photo, image == nil else { return }
            let pixels = Int(displayScale * 120)
            switch MediaLocation(media, files: sync.media) {
            case .local(let url):
                image = await Task.detached {
                    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                        let cg = PhotoCompressor.thumbnail(source, maxPixels: pixels)
                    else { return nil as UIImage? }
                    return UIImage(cgImage: cg)
                }
                .value
            case .remote(let path):
                guard let signer, let url = try? await signer.url(path),
                    let (data, _) = try? await URLSession.shared.data(from: url)
                else { return }
                image = await Task.detached {
                    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                        let cg = PhotoCompressor.thumbnail(source, maxPixels: pixels)
                    else { return nil as UIImage? }
                    return UIImage(cgImage: cg)
                }
                .value
            case .unavailable:
                break
            }
        }
    }

    extension View {
        /// Lets the `MediaSection`s on this screen open a capture's screen. Put it on the List, not
        /// inside it: SwiftUI ignores navigation destinations declared inside a List.
        func mediaViewer(jobId: String) -> some View { modifier(MediaViewer(jobId: jobId)) }
    }

    private struct MediaViewer: ViewModifier {
        var jobId: String
        @State private var opened: String?

        func body(content: Content) -> some View {
            content
                .environment(\.openMedia) { opened = $0 }
                .navigationDestination(item: $opened) { MediaScreen(jobId: jobId, mediaId: $0) }
        }
    }
#endif
