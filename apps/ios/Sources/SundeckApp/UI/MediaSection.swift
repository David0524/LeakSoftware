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
        /// Opens a capture in the full-screen viewer; set by `.mediaViewer(jobId:)`.
        @Entry var openMedia: (String) -> Void = { _ in }
    }

    // MARK: - Capturing

    /// Taking photos and videos, choosing them from the library, and recording voice notes, for
    /// any screen with capture buttons (the job's Photos section, a checklist item, a test or
    /// finding editor). Everything is saved on the phone first; uploads run in the background.
    /// Port of apps/mobile/src/features/media/MediaSection.tsx. Attach `.captureFlow(_:)` to the
    /// view that owns the buttons.
    @MainActor @Observable
    final class CaptureController {
        /// An alert: a failed capture or save, with Open Settings when a permission is off.
        struct Problem: Identifiable {
            let id = UUID()
            var title: String
            var message: String
            var needsSettings = false
        }

        /// The live line under the capture tiles ("Voice note added.").
        struct Status: Equatable {
            var text: String
            var tone: Tone?
        }

        var target: MediaTarget
        var busy: MediaKind?
        var recording = false
        /// Take or Choose for a kind (the older menu, and the tiles' long press).
        var choosing: MediaKind?
        var camera: MediaKind?
        var library: MediaKind?
        var problem: Problem?
        var status: Status?
        @ObservationIgnored var cameraStartedAt = ""
        @ObservationIgnored var position: Task<Coordinate?, Never>?

        init(target: MediaTarget) { self.target = target }

        func openCamera(_ kind: MediaKind) async {
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

        func cameraClosed(
            _ result: CameraPicker.Result?, save: @escaping (CapturedFile, Task<Coordinate?, Never>?) async -> Void
        ) {
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
                    await save(file, lookup)
                } catch {
                    fail(CaptureRules.failureTitle(kind), error)
                }
            }
        }

        /// A photo or video already on the phone. Taken earlier, maybe elsewhere: where the phone
        /// is now isn't where it was taken, so it gets no location.
        func picked(_ result: CameraPicker.Result, _ kind: MediaKind) async -> CapturedFile? {
            busy = kind
            defer { busy = nil }
            do {
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
                    return CaptureRules.video(
                        url: encoded.url, mime: encoded.mime, width: info.width, height: info.height,
                        durationMs: info.durationMs ?? original.durationMs, capturedAt: CaptureRules.now())
                case .photo(let data):
                    return try await Task.detached {
                        try PhotoCompressor.compress(
                            data, capturedAt: PhotoCompressor.exifTime(data) ?? CaptureRules.now())
                    }
                    .value
                }
            } catch {
                fail(CaptureRules.failureTitle(kind), error)
                return nil
            }
        }

        /// Saves a capture to `target` (row, file and upload ticket together).
        func save(_ file: CapturedFile, at lookup: Task<Coordinate?, Never>?, sync: SyncService, companyId: String)
            async
        {
            status = Status(text: JobPhotos.saving(file.kind), tone: nil)
            let place = await lookup?.value
            do {
                try MediaWrites.saveCapture(sync, companyId: companyId, target: target, file, at: place)
                status = Status(text: JobPhotos.added(file.kind), tone: .pass)
            } catch {
                try? FileManager.default.removeItem(at: file.url)
                status = Status(text: message(error), tone: .fail)
                problem = Problem(title: "Couldn’t Save", message: message(error))
            }
        }

        func fail(_ title: String, _ error: Error) {
            status = Status(text: message(error), tone: .fail)
            problem = Problem(
                title: title, message: message(error), needsSettings: (error as? MediaError)?.needsSettings ?? false)
        }

        func message(_ error: Error) -> String {
            (error as? MediaError)?.description ?? error.localizedDescription
        }
    }

    extension View {
        /// The camera, library, Take-or-Choose menu and alerts for a `CaptureController`.
        func captureFlow(_ capture: CaptureController) -> some View { modifier(CaptureFlow(capture: capture)) }
    }

    private struct CaptureFlow: ViewModifier {
        @Bindable var capture: CaptureController
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openURL) private var openURL

        func body(content: Content) -> some View {
            content
                .confirmationDialog(
                    "Add \(capture.choosing?.label ?? "")",
                    isPresented: Binding(get: { capture.choosing != nil }, set: { if !$0 { capture.choosing = nil } }),
                    titleVisibility: .visible, presenting: capture.choosing
                ) { kind in
                    Button("Take \(kind.label)") { Task { await capture.openCamera(kind) } }
                    Button("Choose from Library") { capture.library = kind }
                    Button("Cancel", role: .cancel) {}
                }
                .alert(
                    capture.problem?.title ?? "",
                    isPresented: Binding(get: { capture.problem != nil }, set: { if !$0 { capture.problem = nil } }),
                    presenting: capture.problem
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
                    isPresented: Binding(
                        get: { capture.camera != nil }, set: { if !$0 { capture.cameraClosed(nil, save: save) } })
                ) {
                    CameraPicker(kind: capture.camera ?? .photo) { capture.cameraClosed($0, save: save) }
                        .ignoresSafeArea()
                }
                .sheet(
                    isPresented: Binding(get: { capture.library != nil }, set: { if !$0 { capture.library = nil } })
                ) {
                    LibraryPicker(kind: capture.library ?? .photo) { result in
                        let kind = capture.library ?? .photo
                        capture.library = nil
                        if let result {
                            Task {
                                if let file = await capture.picked(result, kind) { await save(file, nil) }
                            }
                        }
                    }
                    .ignoresSafeArea()
                }
        }

        private func save(_ file: CapturedFile, _ lookup: Task<Coordinate?, Never>?) async {
            guard let company = session.company else { return }
            await capture.save(file, at: lookup, sync: sync, companyId: company.id)
        }
    }

    // MARK: - The section in a list (checklist item, test and finding editors)

    /// Photos, videos and voice notes for one part of a job, with capture buttons, as a `Section`
    /// in the host's List: buttons, then a grid of thumbnails that open the viewer.
    struct MediaSection: View {
        var target: MediaTarget
        var title: String? = nil

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openMedia) private var openMedia
        @State private var media: [Media] = []
        @State private var capture: CaptureController
        @State private var deleting: Media?

        init(target: MediaTarget, title: String? = nil) {
            self.target = target
            self.title = title
            _capture = State(initialValue: CaptureController(target: target))
        }

        var body: some View {
            Section {
                if capture.recording {
                    VoiceRecorder(
                        onSaved: { file in
                            guard let company = session.company else { return }
                            await capture.save(
                                file, at: Task { await LocationLookup.shared.prepare() }, sync: sync,
                                companyId: company.id)
                        },
                        onClose: { capture.recording = false })
                } else {
                    buttons
                }
                if !media.isEmpty {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach(media, id: \.id) { item in
                            // Buttons, not NavigationLinks: several links in one List row become one
                            // row-wide link.
                            Button {
                                openMedia(item.id)
                            } label: {
                                MediaThumb(media: item)
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(CaptureRules.accessibilityLabel(item))
                            .accessibilityAction(named: "Delete") { deleting = item }
                        }
                    }
                    .padding(.vertical, 4)
                }
            } header: {
                SectionLabel(title ?? "Photos and notes").textCase(nil)
            }
            .task(id: TaskKey(revision: sync.revision, target: target)) {
                capture.target = target
                media = jobMedia(sync.store, target)
            }
            .captureFlow(capture)
            .confirmationDialog(
                deleting.map { MediaDetail.deleteTitle($0.kind) } ?? "",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible, presenting: deleting
            ) { item in
                Button(MediaDetail.deleteButton(item.kind), role: .destructive) { try? MediaWrites.delete(sync, item) }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text(MediaDetail.deleteMessage)
            }
        }

        /// Add Photo, Add Video and Voice Note, as the Photos section's tiles.
        private var buttons: some View {
            CaptureTiles(capture: capture)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }

        private struct TaskKey: Hashable {
            var revision: Int
            var target: MediaTarget
        }
    }

    // MARK: - Capture tiles

    /// Add Photo, Add Video and Voice Note (spec 5.4 Photos): three equal tiles, 8 apart, each 56
    /// tall with the icon over the label, `iconTint` behind them, all `link`. A tap opens the
    /// camera (the library when this phone has none); a long press offers Choose from Library.
    /// Stacked when large text doesn't fit.
    struct CaptureTiles: View {
        @Bindable var capture: CaptureController

        var body: some View {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { tiles }
                VStack(spacing: 8) { tiles }
            }
        }

        @ViewBuilder private var tiles: some View {
            tile("Add Photo", icon: "camera", kind: .photo)
            tile("Add Video", icon: "video", kind: .video)
            tile("Voice Note", icon: "mic", kind: nil)
        }

        private func tile(_ title: String, icon: String, kind: MediaKind?) -> some View {
            Button {
                if let kind {
                    if CameraPicker.isAvailable {
                        Task { await capture.openCamera(kind) }
                    } else {
                        capture.library = kind
                    }
                } else {
                    capture.recording = true
                }
            } label: {
                VStack(spacing: 2) {
                    if let kind, capture.busy == kind {
                        ProgressView().frame(height: 24)
                    } else {
                        Image(systemName: icon).font(.system(size: 22)).frame(height: 24)
                    }
                    Text(title).font(.role(.secondary).weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                }
                .foregroundStyle(Color.link)
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(
                    RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.iconTint)
                )
                .contentShape(RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(capture.busy != nil || capture.recording)
            .contextMenu {
                if let kind {
                    Button("Take \(kind.label)", systemImage: icon) { Task { await capture.openCamera(kind) } }
                    Button("Choose from Library", systemImage: "photo.on.rectangle") { capture.library = kind }
                }
            }
            .accessibilityAction(named: "Choose from Library") { if let kind { capture.library = kind } }
        }
    }

    // MARK: - Thumbnails (the list version)

    /// One capture in the grid: the photo (with its markup), or an icon and length; a badge while
    /// it waits to upload.
    struct MediaThumb: View {
        var media: Media

        @Environment(SyncService.self) private var sync
        @Environment(\.mediaURLSigner) private var signer
        @Environment(\.displayScale) private var displayScale
        @State private var image: UIImage?

        var body: some View {
            Color.navy
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
                            .foregroundStyle(Color.navy)
                            .padding(5)
                            .background(Circle().fill(Color.surface))
                            .padding(4)
                            .accessibilityHidden(true)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.field), style: .continuous))
                .contentShape(Rectangle())
                .task(id: "\(media.id)-\(media.uploadState.rawValue)") {
                    guard media.kind == .photo, image == nil else { return }
                    image = await loadThumbnail(
                        media, files: sync.media, signer: signer, pixels: Int(displayScale * 120))
                }
        }

        private var placeholder: some View {
            VStack(spacing: 4) {
                Image(systemName: mediaIcon(media.kind)).font(.title2)
                if let ms = media.durationMs, ms > 0 {
                    Text(formatDuration(ms)).font(.footnote.weight(.semibold).monospacedDigit())
                }
            }
            .foregroundStyle(Color.white)
            .accessibilityHidden(true)
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
    }

    func mediaIcon(_ kind: MediaKind) -> String {
        switch kind {
        case .audio: "mic.fill"
        case .video: "video.fill"
        case .photo: "photo"
        }
    }

    /// A downsized photo from the local file or, once uploaded, a signed link.
    func loadThumbnail(_ media: Media, files: MediaFiles?, signer: MediaURLSigner?, pixels: Int) async -> UIImage? {
        func decode(_ source: CGImageSource?) -> UIImage? {
            guard let source, let cg = PhotoCompressor.thumbnail(source, maxPixels: pixels) else { return nil }
            return UIImage(cgImage: cg)
        }
        switch MediaLocation(media, files: files) {
        case .local(let url):
            return await Task.detached { decode(CGImageSourceCreateWithURL(url as CFURL, nil)) }.value
        case .remote(let path):
            guard let signer, let url = try? await signer.url(path),
                let (data, _) = try? await URLSession.shared.data(from: url)
            else { return nil }
            return await Task.detached { decode(CGImageSourceCreateWithData(data as CFData, nil)) }.value
        case .unavailable:
            return nil
        }
    }

    /// The local file, else (once uploaded) a signed link to the stored copy. Port of useMediaSource.
    func resolveMediaSource(_ media: Media, files: MediaFiles?, signer: MediaURLSigner?) async -> MediaSourceState {
        switch MediaLocation(media, files: files) {
        case .local(let url):
            return .ready(url)
        case .remote(let path):
            if let signer, let url = try? await signer.url(path) { return .ready(url) }
            return .unavailable
        case .unavailable:
            return .unavailable
        }
    }

    // MARK: - The viewer

    extension View {
        /// Lets captures on this screen open the full-screen viewer (spec 6.5), over the tab bar.
        func mediaViewer(jobId: String) -> some View { modifier(MediaViewer(jobId: jobId)) }
    }

    private struct MediaViewer: ViewModifier {
        var jobId: String
        @State private var opened: OpenedMedia?

        struct OpenedMedia: Identifiable {
            var id: String
        }

        func body(content: Content) -> some View {
            content
                .environment(\.openMedia) { opened = OpenedMedia(id: $0) }
                .fullScreenCover(item: $opened) { MediaScreen(jobId: jobId, mediaId: $0.id) }
        }
    }
#endif
