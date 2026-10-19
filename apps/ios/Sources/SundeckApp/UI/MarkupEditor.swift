#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// Full-screen markup editor for a photo, presented as a cover. The original photo never
    /// changes: Save writes the row's `markup` (and caption) only. Port of MarkupEditor in
    /// apps/mobile/src/app/(app)/jobs/[id]/media/[mediaId].tsx.
    struct MarkupEditor: View {
        var media: Media
        var url: URL
        @Environment(SyncService.self) private var sync

        var body: some View {
            MarkupCanvasEditor(
                title: "Mark Up", canvasLabel: "Photo", ratio: MediaDetail.photoRatio(media),
                saved: parseMarkup(media.markup).shapes, width: media.width, height: media.height,
                caption: media.caption ?? "", savedCaption: media.caption
            ) {
                MediaImage(url: url, label: "Photo")
            } save: { markup, caption in
                try MediaWrites.setMarkup(sync, media, markup)
                if let caption { try MediaWrites.saveCaptionIfChanged(sync, media, caption) }
            }
        }
    }

    /// The markup tools over any picture (a photo, or a pool diagram): Cancel and Save sit in the
    /// bar, the tools in a bar at the bottom, and the picture is fitted between them so everything
    /// is reachable at any shape. Shapes are fractions (0..1) of the picture. Port of MarkupEditor
    /// in apps/web/src/components/media-work.tsx.
    struct MarkupCanvasEditor<Background: View>: View {
        var title: String
        /// VoiceOver's name for the picture ("Photo", "Pool diagram").
        var canvasLabel: String
        /// Height / width of the picture.
        var ratio: Double
        /// The markup space the layer draws in (a diagram's 800 x 500), nil for the picture's size.
        var space: CGSize? = nil
        /// nil: no caption field (a diagram has none).
        var savedCaption: String?
        var showsCaption: Bool
        @ViewBuilder var background: Background
        /// Save: the markup (nil when nothing's drawn) and the caption (nil without the field).
        var save: (Markup?, String?) throws -> Void

        @Environment(\.dismiss) private var dismiss
        @State private var draft: MarkupDraft
        @State private var live: MarkupShape?
        /// The points of the drag in progress (the pen's stroke).
        @State private var stroke: [MarkupPoint] = []
        @State private var confirmDiscard = false
        @State private var saveError: String?
        @State private var saving = false
        @State private var caption: String
        @FocusState private var labelFocused: Bool

        init(
            title: String, canvasLabel: String, ratio: Double, space: CGSize? = nil, saved: [MarkupShape],
            width: Double?, height: Double?, caption: String? = nil, savedCaption: String? = nil,
            @ViewBuilder background: () -> Background, save: @escaping (Markup?, String?) throws -> Void
        ) {
            self.title = title
            self.canvasLabel = canvasLabel
            self.ratio = ratio
            self.space = space
            self.savedCaption = savedCaption
            showsCaption = caption != nil
            self.background = background()
            self.save = save
            _draft = State(initialValue: MarkupDraft(saved: saved, width: width, height: height))
            _caption = State(initialValue: caption ?? "")
        }

        private var dirty: Bool {
            draft.isDirty
                || (showsCaption && caption.trimmingCharacters(in: .whitespacesAndNewlines) != (savedCaption ?? ""))
        }

        var body: some View {
            NavigationStack {
                canvas
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.navy.ignoresSafeArea())
                    .safeAreaInset(edge: .bottom, spacing: 0) { tools }
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.visible, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button(saving ? "Saving…" : "Save") { commit() }.fontWeight(.semibold).disabled(saving)
                        }
                    }
            }
            .interactiveDismissDisabled()
            .tint(Color.link)
            .confirmationDialog("Discard changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard Changes", role: .destructive) { dismiss() }
                Button("Keep Editing", role: .cancel) {}
            }
            .alert(
                "Couldn’t Save", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
            ) {
                Button("OK") { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }

        /// The picture fitted into the space, with its markup and the shape being drawn.
        private var canvas: some View {
            GeometryReader { area in
                let width = min(area.size.width, area.size.height / ratio)
                let height = width * ratio
                ZStack {
                    background
                    MarkupLayer(shapes: live.map { draft.shapes + [$0] } ?? draft.shapes, space: space)
                }
                .frame(width: width, height: height)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            // The live stroke is drawn as the finger moves.
                            if stroke.isEmpty { stroke = [point(value.startLocation, width, height)] }
                            stroke.append(point(value.location, width, height))
                            live = draft.live(stroke: stroke)
                        }
                        .onEnded { value in
                            if stroke.isEmpty { stroke = [point(value.startLocation, width, height)] }
                            stroke.append(point(value.location, width, height))
                            live = nil
                            draft.release(stroke: stroke)
                            stroke = []
                        }
                )
                .accessibilityElement()
                .accessibilityLabel(
                    draft.tool == .pen ? "Photo. Drag to draw." : "Photo. Tap to place, or drag to draw."
                )
                .accessibilityAddTraits(.allowsDirectInteraction)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }

        /// Tool (Pen | Arrow | Circle | Text), the label for text, the three colors, Undo, and the caption.
        private var tools: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Text("Tool").textRole(.bodyMedium).foregroundStyle(Color.text)
                    Segmented(
                        selection: $draft.tool, options: MarkupTool.allCases, label: \.label, title: "Tool",
                        fillsWidth: true)
                }

                if let hint = draft.tool.hint {
                    Text(hint).textRole(.secondary).foregroundStyle(Color.textMuted)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Label")
                        TextField(
                            "", text: $draft.label,
                            prompt: Text(MarkupDraft.labelPlaceholder).foregroundStyle(Color.placeholder)
                        )
                        .focused($labelFocused)
                        .accessibilityLabel("Label")
                        .fieldBox(error: draft.labelError != nil, focused: labelFocused)
                        .onChange(of: draft.label) { _, value in
                            if value.count > Markup.textMax { draft.label = String(value.prefix(Markup.textMax)) }
                        }
                        FieldHint(text: draft.labelError ?? MarkupDraft.labelHint, error: draft.labelError != nil)
                    }
                }

                HStack(spacing: 8) {
                    ForEach(MarkupColor.allCases, id: \.self) { ink in
                        Button {
                            draft.color = ink
                        } label: {
                            let on = draft.color == ink
                            Circle()
                                .fill(ink.color)
                                .overlay(Circle().strokeBorder(Color.controlBorder, lineWidth: 1))
                                .frame(width: 32, height: 32)
                                .overlay(Circle().strokeBorder(on ? Color.link : .clear, lineWidth: 3).padding(-6))
                                .frame(width: minTarget, height: minTarget)
                                .contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ink.label)
                        .accessibilityAddTraits(draft.color == ink ? .isSelected : [])
                    }
                    Spacer(minLength: 0)
                    Button("Undo") { draft.undo() }
                        .buttonStyle(.quiet)
                        .disabled(!draft.canUndo)
                    Button("Clear All") { draft.clearAll() }
                        .buttonStyle(.quiet)
                        .disabled(!draft.canClear)
                }

                if showsCaption {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Caption (optional)")
                        TextField(
                            "", text: $caption, prompt: Text("What this shows").foregroundStyle(Color.placeholder)
                        )
                        .accessibilityLabel("Caption (optional)")
                        .fieldBox()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(Color.bg)
        }

        private func point(_ location: CGPoint, _ width: CGFloat, _ height: CGFloat) -> MarkupPoint {
            MarkupPoint(x: width > 0 ? location.x / width : 0, y: height > 0 ? location.y / height : 0)
        }

        private func cancel() {
            if dirty { confirmDiscard = true } else { dismiss() }
        }

        private func commit() {
            saving = true
            defer { saving = false }
            do {
                try save(draft.markup, showsCaption ? caption : nil)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }
#endif
