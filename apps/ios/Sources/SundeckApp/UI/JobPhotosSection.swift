#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// The job page's Photos section (spec 5.4 Photos, 6.5): "Photos and Recordings", the capture
    /// card ("Attach to" and the Add Photo, Add Video and Voice Note tiles, with a live status
    /// line), then one card per capture, newest first, as the website shows them. Tapping a photo
    /// or video opens the full-screen viewer. Content for the job page's scroll view.
    struct JobPhotosSection: View {
        var job: JobView

        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var capture: CaptureController
        @State private var targetIndex = 0

        init(job: JobView) {
            self.job = job
            _capture = State(initialValue: CaptureController(target: MediaTarget(jobId: job.id)))
        }

        var body: some View {
            let _ = sync.revision
            let inspection = JobInspection(sync.store, jobId: job.id)
            let config = InspectionConfig(sync.store, companyId: session.company?.id ?? "")
            let targets = JobPhotos.targets(inspection, config, jobId: job.id)
            let media = jobMedia(sync.store, MediaTarget(jobId: job.id))
            let timeZone = session.company?.timeZone ?? TimeZone.current.identifier
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Photos and Recordings")
                VStack(alignment: .leading, spacing: 16) {
                    captureCard(targets)
                    if media.isEmpty {
                        EmptyState(text: JobPhotos.empty)
                    } else {
                        ForEach(media, id: \.id) { item in
                            MediaCard(
                                media: item, text: JobPhotos.card(item, inspection, timeZone: timeZone))
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .captureFlow(capture)
            .mediaViewer(jobId: job.id)
            .onChange(of: targetIndex) { _, index in
                if targets.indices.contains(index) { capture.target = targets[index].target }
            }
        }

        private func captureCard(_ targets: [CaptureTargetOption]) -> some View {
            VStack(alignment: .leading, spacing: 12) {
                if JobPhotos.showsTargets(targets) {
                    SelectField(
                        label: "Attach to",
                        selection: Binding(
                            get: { min(targetIndex, targets.count - 1) },
                            set: { index in
                                targetIndex = index
                                if targets.indices.contains(index) { capture.target = targets[index].target }
                            }),
                        options: Array(targets.indices), optionLabel: { targets[$0].label })
                }
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
                    CaptureTiles(capture: capture)
                }
                if let status = capture.status {
                    Text(status.text)
                        .textRole(.secondary)
                        .foregroundStyle(status.tone.map(\.color) ?? Color.textMuted)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .card(padding: 16)
        }
    }

    /// One capture's card (spec 5.4 Photos): the photo (4:3, its markup over it), the video (16:9
    /// on navy) or a voice note player; then "{Photo} · {attached to}", the caption, the transcript
    /// and when; then Mark Up and Delete.
    struct MediaCard: View {
        var media: Media
        var text: MediaCardText

        @Environment(SyncService.self) private var sync
        @Environment(\.mediaURLSigner) private var signer
        @Environment(\.displayScale) private var displayScale
        @Environment(\.openMedia) private var openMedia
        @State private var image: UIImage?
        @State private var source: MediaSourceState = .loading
        @State private var marking = false
        @State private var confirmDelete = false
        @State private var deletes = 0

        var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                preview
                VStack(alignment: .leading, spacing: 2) {
                    Text(text.heading).font(.role(.secondary).weight(.medium)).foregroundStyle(Color.text)
                    if let caption = text.caption {
                        Text(caption).textRole(.secondary).foregroundStyle(Color.text)
                    }
                    if let transcript = text.transcript {
                        Text(transcript).textRole(.secondary).italic().foregroundStyle(Color.text).padding(.top, 2)
                    }
                    if !text.meta.isEmpty {
                        Text(text.meta).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                    HStack(spacing: 12) {
                        if let markup = text.markupButton {
                            Button(markup) { marking = true }
                                .buttonStyle(.secondary)
                                .disabled(source.url == nil)
                        }
                        Button("Delete") { confirmDelete = true }
                            .buttonStyle(.danger)
                            .accessibilityLabel("\(MediaDetail.deleteButton(media.kind))")
                    }
                    .padding(.top, 10)
                }
                .padding(12)
            }
            .card(padding: 0)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous))
            .task(id: "\(media.id)-\(media.uploadState.rawValue)") {
                source = await resolveMediaSource(media, files: sync.media, signer: signer)
                if media.kind == .photo, image == nil {
                    image = await loadThumbnail(
                        media, files: sync.media, signer: signer, pixels: Int(displayScale * 400))
                }
            }
            .sensoryFeedback(.warning, trigger: deletes)
            .fullScreenCover(isPresented: $marking) {
                if case .ready(let url) = source { MarkupEditor(media: media, url: url) }
            }
            .confirmationDialog(
                MediaDetail.deleteTitle(media.kind), isPresented: $confirmDelete, titleVisibility: .visible
            ) {
                Button(MediaDetail.deleteButton(media.kind), role: .destructive) {
                    if (try? MediaWrites.delete(sync, media)) != nil { deletes += 1 }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(MediaDetail.deleteMessage)
            }
        }

        @ViewBuilder private var preview: some View {
            switch media.kind {
            case .photo:
                Button {
                    openMedia(media.id)
                } label: {
                    Color.bg
                        .aspectRatio(4 / 3, contentMode: .fit)
                        .overlay {
                            if let image {
                                GeometryReader { geo in
                                    let fitted = fit(image.size, in: geo.size)
                                    ZStack {
                                        Image(uiImage: image).resizable().scaledToFit()
                                        MarkupLayer(shapes: parseMarkup(media.markup).shapes)
                                    }
                                    .frame(width: fitted.width, height: fitted.height)
                                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                                }
                                .background(Color.navy)
                            } else if source == .unavailable {
                                stillUploading
                            } else {
                                ProgressView()
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(media.caption ?? CaptureRules.accessibilityLabel(media))
                .accessibilityHint("Opens the photo")
            case .video:
                Button {
                    openMedia(media.id)
                } label: {
                    Color.navy
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .overlay {
                            if source == .unavailable {
                                Text(text.stillUploading).textRole(.secondary).foregroundStyle(Color.white)
                                    .multilineTextAlignment(.center).padding(16)
                            } else {
                                Image(systemName: "play.circle.fill").font(.system(size: 48)).foregroundStyle(
                                    Color.white)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Play video")
            case .audio:
                if case .ready(let url) = source {
                    AudioBox(url: url, durationMs: media.durationMs).padding([.horizontal, .top], 12)
                } else if source == .unavailable {
                    stillUploading.frame(minHeight: 88)
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 88)
                }
            }
        }

        private var stillUploading: some View {
            Text(text.stillUploading)
                .textRole(.body)
                .foregroundStyle(Color.textMuted)
                .multilineTextAlignment(.center)
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bg)
        }

        private func fit(_ size: CGSize, in box: CGSize) -> CGSize {
            guard size.width > 0, size.height > 0 else { return box }
            let scale = min(box.width / size.width, box.height / size.height)
            return CGSize(width: size.width * scale, height: size.height * scale)
        }
    }
#endif
