#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Which tile's options show under the tiles.
    enum PoolShapePanel: Hashable {
        case draw, landmarks
    }

    /// Edit Pool Shape (owner, 2026-10-19): ten tiles in two rows of five (Rectangle, Oval, Kidney,
    /// L-shape, Roman; Grecian, Draw, Clear, Landmarks, Figure 8), Draw's tools or the Landmarks
    /// row, Mirror and Has a spa, then the drawing: the spa is moved by dragging, made round or
    /// square by a tap and resized by a pinch or its corner handle; Draw drags lines, circles and
    /// strokes; a landmark is picked then tapped onto the drawing, dragged to move, tapped to
    /// select and remove. VoiceOver gets actions for the spa. Save Pool Shape writes through the
    /// sync layer. Port of apps/web/src/components/pool-shape-editor.tsx.
    struct PoolShapeSheet: View {
        var propertyId: String
        var companyId: String
        @State var form: PoolShapeForm
        @State private var panel: PoolShapePanel?
        @State private var tool: DrawTool = .line
        @State private var placing: LandmarkKind?
        @State private var selected: Int?
        @State private var confirmClear = false
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var original: PoolShapeForm?
        @State private var error: String?

        /// `panel` opens Draw or Landmarks, `selected` a landmark selected (screenshots).
        init(
            propertyId: String, companyId: String, form: PoolShapeForm, panel: PoolShapePanel? = nil,
            selected: Int? = nil
        ) {
            self.propertyId = propertyId
            self.companyId = companyId
            _form = State(initialValue: form)
            _panel = State(initialValue: panel)
            _selected = State(initialValue: selected)
        }

        var body: some View {
            FormSheet(title: PoolShapeForm.title, dirty: original != nil && original != form) {
                tiles
                if panel == .landmarks { landmarksRow }
                if panel == .draw { drawRow }
                Grouped {
                    SwitchRow(PoolShapeForm.mirrorLabel, isOn: $form.mirror)
                    SwitchRow(PoolShapeForm.spaLabel, isOn: $form.hasSpa)
                }
                VStack(alignment: .leading, spacing: 8) {
                    PoolShapeCanvas(form: $form, panel: panel, tool: tool, placing: $placing, selected: $selected)
                    if form.hasSpa { FieldHint(text: PoolShapeForm.spaHint) }
                }
                if let error { Notice(kind: .error, text: error) }
                Button(PoolShapeForm.save) { save() }.buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear { if original == nil { original = form } }
            .confirmationDialog(PoolShapeForm.clearTitle, isPresented: $confirmClear, titleVisibility: .visible) {
                Button(PoolShapeForm.clearButton, role: .destructive) {
                    form.clear()
                    selected = nil
                    placing = nil
                    panel = .draw
                }
            } message: {
                Text(PoolShapeForm.clearMessage)
            }
        }

        // MARK: - Tiles

        private var tiles: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(PoolShapeForm.tilesLabel)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
                    ForEach(PoolShapeTile.all, id: \.self) { tile in
                        tileButton(tile)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(PoolShapeForm.tilesLabel)
            }
        }

        private func isOn(_ tile: PoolShapeTile) -> Bool {
            switch tile {
            case .shape(let s): form.shape == s
            case .draw: panel == .draw
            case .landmarks: panel == .landmarks
            case .clear: false
            }
        }

        private func tileButton(_ tile: PoolShapeTile) -> some View {
            let on = isOn(tile)
            let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
            return Button {
                switch tile {
                case .shape(let s): form.tapShape(s)
                case .draw: panel = panel == .draw ? nil : .draw
                case .landmarks:
                    panel = panel == .landmarks ? nil : .landmarks
                    placing = nil
                case .clear: confirmClear = true
                }
            } label: {
                VStack(spacing: 4) {
                    TileArt(tile: tile).frame(height: 28)
                    Text(tile.label)
                        .font(.system(size: 12, weight: on ? .semibold : .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .foregroundStyle(on ? Color.link : Color.text)
                .padding(.horizontal, 2)
                .padding(.top, 6)
                .padding(.bottom, 4)
                .frame(maxWidth: .infinity, minHeight: minTarget)
                .background(shape.fill(on ? Color.link.opacity(0.12) : Color.fill))
                .overlay { if on { shape.strokeBorder(Color.link, lineWidth: 2) } }
                .contentShape(shape)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tile.label)
            .accessibilityAddTraits(on ? .isSelected : [])
        }

        // MARK: - Panels

        private var landmarksRow: some View {
            VStack(alignment: .leading, spacing: 8) {
                FlowRow(spacing: 6) {
                    ForEach(LandmarkKind.allCases, id: \.self) { kind in
                        let on = placing == kind
                        Button {
                            placing = on ? nil : kind
                        } label: {
                            HStack(spacing: 6) {
                                LandmarkArt(parts: kind.parts, side: 24)
                                Text(kind.label).font(.role(.secondary).weight(.medium))
                            }
                            .foregroundStyle(on ? Color.link : Color.text)
                            .padding(.horizontal, 12)
                            .frame(minHeight: minTarget)
                            .background(Capsule().fill(on ? Color.link.opacity(0.12) : Color.fill))
                            .overlay { if on { Capsule().strokeBorder(Color.link, lineWidth: 2) } }
                            .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                // Only while placing one; nothing under the picker otherwise (owner, 2026-10-26).
                if let placing {
                    Text(PoolShapeForm.placingHint(placing))
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                }
            }
        }

        private var drawRow: some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    Segmented(selection: $tool, options: DrawTool.allCases, label: \.label, title: "Draw")
                    Button(PoolShapeForm.undo) { form.undo() }
                        .buttonStyle(.secondary)
                        .disabled(form.drawing.isEmpty)
                }
                Text(PoolShapeForm.drawHint).textRole(.secondary).foregroundStyle(Color.textMuted)
            }
        }

        private func save() {
            do {
                try InspectionWrites.savePoolShape(sync, propertyId: propertyId, companyId: companyId, form)
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// A tile's drawing, the same size for every tile (website `TileArt`, a 160 x 100 box).
    private struct TileArt: View {
        var tile: PoolShapeTile

        var body: some View {
            GeometryReader { geo in
                let box = CGSize(width: 160, height: 100)
                let scale = min(geo.size.width / box.width, geo.size.height / box.height)
                ZStack {
                    switch tile {
                    case .shape(let s):
                        let outline = DiagramOutline(poolDiagram(s, false, DiagramLayout(centered: true)).pool)
                        outline.fill(Color.diagramWater)
                        outline.stroke(Color.water, lineWidth: 5 * scale)
                    case .draw:
                        // The website's "S" curve, written out as its two cubic curves.
                        DiagramOutline("M30 80 C50 20 80 90 100 40 C120 -10 130 20 135 30")
                            .stroke(style: StrokeStyle(lineWidth: 6 * scale, lineCap: .round))
                    case .clear:
                        DiagramOutline("M58 22 L102 78 M102 22 L58 78")
                            .stroke(style: StrokeStyle(lineWidth: 6 * scale, lineCap: .round))
                    case .landmarks:
                        // The tree, at translate(56 2) scale(2) in the tile's box.
                        LandmarkArt(parts: LandmarkKind.tree.parts, side: 48 * scale)
                            .position(x: (56 + 24) * scale, y: (2 + 24) * scale)
                    }
                }
                .frame(width: box.width * scale, height: box.height * scale)
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .accessibilityHidden(true)
        }
    }

    /// The drawing on the Pool Shape sheet, where everything is placed by hand (website: the
    /// editor's `svg` with its pointer, pinch and key handlers).
    struct PoolShapeCanvas: View {
        @Binding var form: PoolShapeForm
        var panel: PoolShapePanel?
        var tool: DrawTool
        @Binding var placing: LandmarkKind?
        @Binding var selected: Int?
        @State private var press: Press?
        @State private var stroke: [(x: Double, y: Double)]?
        @State private var pinchFrom: Double?

        /// What the current press is doing.
        struct Press {
            enum What {
                case spa, resize
                case landmark(Int)
                case landmarkResize(Int)
                case draw, nothing
            }
            var what: What
            var start: (x: Double, y: Double)
            var moved = false
        }

        var body: some View {
            let d = form.diagram
            let corner = RoundedRectangle(cornerRadius: 12, style: .continuous)
            Color.clear
                .aspectRatio(d.width / d.height, contentMode: .fit)
                .overlay {
                    GeometryReader { geo in
                        let scale = geo.size.width / d.width
                        ZStack(alignment: .topLeading) {
                            PoolDiagram(shape: form.shape, hasSpa: form.hasSpa, layout: form.layout, pins: [])
                                .allowsHitTesting(false)
                            overlays(d, scale: scale)
                        }
                        .contentShape(Rectangle())
                        .gesture(drag(size: geo.size))
                        .simultaneousGesture(pinch)
                    }
                }
                .clipShape(corner)
                .overlay(corner.strokeBorder(Color.controlBorder, lineWidth: 1))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(form.drawingLabel)
                .accessibilityHint(form.hasSpa ? "Use the actions to move, resize, or reshape the spa." : "")
                .modifier(SpaActions(form: $form, placing: $placing, selected: $selected))
        }

        @ViewBuilder private func overlays(_ d: SundeckCore.PoolDiagram, scale: CGFloat) -> some View {
            if let stroke, let preview = drawnShapeFrom(tool, stroke) {
                DiagramOutline(drawnPath(preview))
                    .stroke(
                        Color.water,
                        style: StrokeStyle(lineWidth: 2 * scale, lineCap: .round, dash: [4 * scale, 3 * scale]))
            }
            if let selected, d.landmarks.indices.contains(selected) {
                // Selected: a dashed ring, an X at the top right (delete) and the resize handle
                // at the bottom right, as the spa's (owner, 2026-10-19).
                let l = d.landmarks[selected]
                let side = (l.size + 3) * scale
                RoundedRectangle(cornerRadius: 3 * scale)
                    .stroke(Color.link, style: StrokeStyle(lineWidth: 1.2 * scale, dash: [3 * scale, 2 * scale]))
                    .frame(width: side, height: side)
                    .position(x: l.cx * scale, y: l.cy * scale)
                ZStack {
                    Circle().fill(Color.fail)
                    Image(systemName: "xmark")
                        .font(.system(size: 4.2 * scale, weight: .bold))
                        .foregroundStyle(Color.onHeader)
                }
                .frame(width: 9 * scale, height: 9 * scale)
                .position(x: (l.cx + l.size / 2) * scale, y: (l.cy - l.size / 2) * scale)
                Circle()
                    .fill(Color.surface)
                    .overlay(Circle().stroke(Color.link, lineWidth: 1.5 * scale))
                    .frame(width: 6.4 * scale, height: 6.4 * scale)
                    .position(x: (l.cx + l.size / 2) * scale, y: (l.cy + l.size / 2) * scale)
            }
            if let spa = d.spa, panel != .draw {
                // The spa's resize handle, at its lower right.
                Circle()
                    .fill(Color.surface)
                    .overlay(Circle().stroke(Color.link, lineWidth: 1.5 * scale))
                    .frame(width: 6.4 * scale, height: 6.4 * scale)
                    .position(x: (spa.cx + spa.r * 0.71) * scale, y: (spa.cy + spa.r * 0.71) * scale)
            }
        }

        private func unit(_ v: CGFloat, _ length: CGFloat) -> Double {
            length > 0 ? min(1, max(0, Double(v / length))) : 0
        }

        /// One finger: down decides what the press does, moves drag it, up finishes it.
        private func drag(size: CGSize) -> some Gesture {
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in
                    guard pinchFrom == nil else { return }
                    let p = (x: unit(value.location.x, size.width), y: unit(value.location.y, size.height))
                    if press == nil { begin(p) }
                    guard var now = press else { return }
                    if !now.moved, hypot((p.x - now.start.x) * 160, (p.y - now.start.y) * 100) > 2 {
                        now.moved = true
                    }
                    press = now
                    switch now.what {
                    case .draw: stroke?.append(p)
                    case .spa: if now.moved { form.moveSpa(x: p.x, y: p.y) }
                    case .resize: form.resizeSpa(toX: p.x, y: p.y)
                    case .landmark(let i): if now.moved { form.moveLandmark(i, x: p.x, y: p.y) }
                    case .landmarkResize(let i): form.resizeLandmark(i, toX: p.x, y: p.y)
                    case .nothing: break
                    }
                }
                .onEnded { value in
                    defer {
                        press = nil
                        stroke = nil
                    }
                    guard let now = press, pinchFrom == nil else { return }
                    let p = (x: unit(value.location.x, size.width), y: unit(value.location.y, size.height))
                    switch now.what {
                    case .draw: form.draw(tool, (stroke ?? []) + [p])
                    // Tapping the spa switches it round and square.
                    case .spa: if !now.moved { form.toggleSpaShape() }
                    case .landmark(let i):
                        // A tap selects a landmark; a tap on the selected one mirrors it.
                        if !now.moved {
                            if selected == i { form.flipLandmark(i) } else { selected = i }
                        }
                    default: break
                    }
                }
        }

        private func begin(_ p: (x: Double, y: Double)) {
            if panel == .draw {
                press = Press(what: .draw, start: p)
                stroke = [p]
            } else if let kind = placing {
                form.placeLandmark(kind, x: p.x, y: p.y)
                placing = nil
                press = Press(what: .nothing, start: p)
            } else if let i = selected, form.onLandmarkDelete(i, x: p.x, y: p.y) {
                form.removeLandmark(i)
                selected = nil
                press = Press(what: .nothing, start: p)
            } else if let i = selected, form.onLandmarkHandle(i, x: p.x, y: p.y) {
                press = Press(what: .landmarkResize(i), start: p)
            } else if form.onHandle(x: p.x, y: p.y) {
                press = Press(what: .resize, start: p)
            } else if form.onSpa(x: p.x, y: p.y) {
                press = Press(what: .spa, start: p)
            } else if let i = form.landmarkAt(x: p.x, y: p.y) {
                press = Press(what: .landmark(i), start: p)
            } else {
                press = Press(what: .nothing, start: p)
                selected = nil
            }
        }

        /// Two fingers on the drawing resize the selected landmark, else the spa (not while drawing).
        private var pinch: some Gesture {
            MagnifyGesture()
                .onChanged { value in
                    guard panel != .draw else { return }
                    let landmark = selected.flatMap { form.landmarkSizeAt($0) }
                    guard let start = landmark ?? form.spaNow?.r else { return }
                    let from = pinchFrom ?? start
                    if pinchFrom == nil {
                        pinchFrom = from
                        press = nil
                        stroke = nil
                    }
                    if let i = selected, landmark != nil {
                        form.setLandmarkSize(i, from * value.magnification)
                    } else {
                        form.setSpaR(from * value.magnification)
                    }
                }
                .onEnded { _ in pinchFrom = nil }
        }
    }

    /// VoiceOver can't drag or pinch: actions move the spa, resize it and switch its shape (the
    /// website's arrow, plus, minus and Enter keys), place a picked landmark in the middle, and
    /// for the selected landmark flip, resize (±2, as the website's keys) and delete it.
    private struct SpaActions: ViewModifier {
        @Binding var form: PoolShapeForm
        @Binding var placing: LandmarkKind?
        @Binding var selected: Int?

        func body(content: Content) -> some View {
            let step = PoolShapeForm.step
            content
                .accessibilityAction(named: "Move Spa Left") { form.nudge(dx: -step, dy: 0) }
                .accessibilityAction(named: "Move Spa Right") { form.nudge(dx: step, dy: 0) }
                .accessibilityAction(named: "Move Spa Up") { form.nudge(dx: 0, dy: -step) }
                .accessibilityAction(named: "Move Spa Down") { form.nudge(dx: 0, dy: step) }
                .accessibilityAction(named: "Make the Spa Larger") { form.setSpaR((form.spaNow?.r ?? 0) + 1) }
                .accessibilityAction(named: "Make the Spa Smaller") { form.setSpaR((form.spaNow?.r ?? 0) - 1) }
                .accessibilityAction(
                    named: form.spaNow?.shape == .square ? "Make the Spa Round" : "Make the Spa Square"
                ) {
                    form.toggleSpaShape()
                }
                .accessibilityAction(named: "Put the Landmark in the Middle") {
                    if let kind = placing {
                        form.placeLandmark(kind, x: 0.5, y: 0.5)
                        placing = nil
                        selected = form.landmarks.count - 1
                    }
                }
                .accessibilityAction(named: "Select the Next Landmark") {
                    guard !form.landmarks.isEmpty else { return }
                    selected = ((selected ?? -1) + 1) % form.landmarks.count
                }
                .modifier(LandmarkActions(form: $form, selected: $selected))
        }
    }

    /// The selected landmark's VoiceOver actions.
    private struct LandmarkActions: ViewModifier {
        @Binding var form: PoolShapeForm
        @Binding var selected: Int?

        func body(content: Content) -> some View {
            if let i = selected, form.landmarks.indices.contains(i) {
                let kind = form.landmarks[i].kind
                content
                    .accessibilityAction(
                        named: landmarkTaps(kind) == "turn" ? "Turn \(kind.label)" : "Flip \(kind.label)"
                    ) { form.flipLandmark(i) }
                    .accessibilityAction(named: "Make the \(kind.label) Larger") {
                        form.setLandmarkSize(i, (form.landmarkSizeAt(i) ?? landmarkSize) + 2)
                    }
                    .accessibilityAction(named: "Make the \(kind.label) Smaller") {
                        form.setLandmarkSize(i, (form.landmarkSizeAt(i) ?? landmarkSize) - 2)
                    }
                    .accessibilityAction(named: PoolShapeForm.deleteTitle(kind)) {
                        form.removeLandmark(i)
                        selected = nil
                    }
            } else {
                content
            }
        }
    }
#endif
