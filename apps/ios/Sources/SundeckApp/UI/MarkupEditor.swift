#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// Full-screen markup editor, presented as a cover. Cancel and Save sit in the bar, the tools in
    /// a bar at the bottom, and the photo is fitted between them so everything is reachable at any
    /// shape. The original photo never changes: Save writes the row's `markup` only. Port of
    /// MarkupEditor in apps/mobile/src/app/(app)/jobs/[id]/media/[mediaId].tsx.
    struct MarkupEditor: View {
        var media: Media
        var url: URL

        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var draft: MarkupDraft
        @State private var live: MarkupShape?
        @State private var confirmDiscard = false
        @State private var saveError: String?
        @State private var saving = false
        @State private var caption: String
        @FocusState private var labelFocused: Bool

        init(media: Media, url: URL) {
            self.media = media
            self.url = url
            _draft = State(
                initialValue: MarkupDraft(
                    saved: parseMarkup(media.markup).shapes, width: media.width, height: media.height))
            _caption = State(initialValue: media.caption ?? "")
        }

        private var dirty: Bool { draft.isDirty || MediaDetail.captionChanged(media, caption) }

        var body: some View {
            NavigationStack {
                canvas
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.navy.ignoresSafeArea())
                    .safeAreaInset(edge: .bottom, spacing: 0) { tools }
                    .navigationTitle("Mark Up")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.visible, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button(saving ? "Saving…" : "Save") { save() }.fontWeight(.semibold).disabled(saving)
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

        /// The photo fitted into the space, with its markup and the shape being drawn.
        private var canvas: some View {
            GeometryReader { area in
                let ratio = MediaDetail.photoRatio(media)
                let width = min(area.size.width, area.size.height / ratio)
                let height = width * ratio
                ZStack {
                    MediaImage(url: url, label: "Photo")
                    MarkupLayer(shapes: live.map { draft.shapes + [$0] } ?? draft.shapes)
                }
                .frame(width: width, height: height)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            live = draft.live(
                                from: point(value.startLocation, width, height),
                                to: point(value.location, width, height))
                        }
                        .onEnded { value in
                            live = nil
                            draft.release(
                                from: point(value.startLocation, width, height),
                                to: point(value.location, width, height))
                        }
                )
                .accessibilityElement()
                .accessibilityLabel("Photo. Tap to place, or drag to draw.")
                .accessibilityAddTraits(.allowsDirectInteraction)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }

        /// Tool (Arrow | Circle | Text), the label for text, the three colors, Undo, and the caption.
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

                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Caption (optional)")
                    TextField("", text: $caption, prompt: Text("What this shows").foregroundStyle(Color.placeholder))
                        .accessibilityLabel("Caption (optional)")
                        .fieldBox()
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

        private func save() {
            saving = true
            defer { saving = false }
            do {
                try MediaWrites.setMarkup(sync, media, draft.markup)
                try MediaWrites.saveCaptionIfChanged(sync, media, caption)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }
#endif
