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
        @FocusState private var labelFocused: Bool

        init(media: Media, url: URL) {
            self.media = media
            self.url = url
            _draft = State(
                initialValue: MarkupDraft(
                    saved: parseMarkup(media.markup).shapes, width: media.width, height: media.height))
        }

        var body: some View {
            NavigationStack {
                canvas
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(Tokens.Role.header).ignoresSafeArea())
                    .safeAreaInset(edge: .bottom, spacing: 0) { tools }
                    .navigationTitle("Mark Up")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.visible, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { cancel() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") { save() }.fontWeight(.semibold)
                        }
                    }
            }
            .interactiveDismissDisabled()
            .confirmationDialog("Discard markup changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
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

        private var tools: some View {
            VStack(alignment: .leading, spacing: 8) {
                Picker("Tool", selection: $draft.tool) {
                    ForEach(MarkupTool.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(minHeight: minTarget)

                if let hint = draft.tool.hint {
                    Text(hint).font(.subheadline).foregroundStyle(Color.muted)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Label", text: $draft.label, prompt: Text(MarkupDraft.labelPlaceholder))
                            .focused($labelFocused)
                            .textFieldStyle(.roundedBorder)
                            .frame(minHeight: minTarget)
                            .accessibilityLabel("Label")
                            .onChange(of: draft.label) { _, value in
                                if value.count > Markup.textMax { draft.label = String(value.prefix(Markup.textMax)) }
                            }
                        if let error = draft.labelError {
                            Text(error).font(.subheadline).foregroundStyle(Color.fail)
                        } else {
                            Text(MarkupDraft.labelHint).font(.subheadline).foregroundStyle(Color.muted)
                        }
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
                                .overlay(
                                    Circle().strokeBorder(
                                        on ? Color(Tokens.Role.header) : Color.controlBorder, lineWidth: on ? 3 : 1)
                                )
                                .frame(width: on ? 38 : 32, height: on ? 38 : 32)
                                .frame(width: minTarget, height: minTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ink.label)
                        .accessibilityAddTraits(draft.color == ink ? .isSelected : [])
                    }
                    Spacer(minLength: 0)
                    Button("Undo") { draft.undo() }
                        .disabled(!draft.canUndo)
                        .frame(minHeight: minTarget)
                    Button("Clear All") { draft.clearAll() }
                        .disabled(!draft.canClear)
                        .frame(minHeight: minTarget)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(.bar)
        }

        private func point(_ location: CGPoint, _ width: CGFloat, _ height: CGFloat) -> MarkupPoint {
            MarkupPoint(x: width > 0 ? location.x / width : 0, y: height > 0 ? location.y / height : 0)
        }

        private func cancel() {
            if draft.isDirty { confirmDiscard = true } else { dismiss() }
        }

        private func save() {
            do {
                try MediaWrites.setMarkup(sync, media, draft.markup)
                dismiss()
            } catch {
                saveError = String(describing: error)
            }
        }
    }
#endif
