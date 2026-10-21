#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// An SVG path from the core's pool diagram (a 160×100 box), scaled to fill the rect.
    struct DiagramOutline: Shape {
        var commands: [PathCommand]
        var box = CGSize(width: 160, height: 100)

        init(_ d: String, box: CGSize = CGSize(width: 160, height: 100)) {
            commands = parseSVGPath(d)
            self.box = box
        }

        func path(in rect: CGRect) -> Path {
            let sx = rect.width / box.width
            let sy = rect.height / box.height
            func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
            var path = Path()
            for command in commands {
                switch command {
                case .move(let x, let y): path.move(to: p(x, y))
                case .line(let x, let y): path.addLine(to: p(x, y))
                case .quad(let cx, let cy, let x, let y): path.addQuadCurve(to: p(x, y), control: p(cx, cy))
                case .cubic(let c1x, let c1y, let c2x, let c2y, let x, let y):
                    path.addCurve(to: p(x, y), control1: p(c1x, c1y), control2: p(c2x, c2y))
                case .close: path.closeSubpath()
                }
            }
            return path
        }
    }

    extension PinTint {
        var color: Color {
            switch self {
            case .other: .excluded
            case .severity(let hex): severityColor(hex)
            }
        }
    }

    /// A severity's own color from its row, else the fail color.
    func severityColor(_ hex: String?) -> Color {
        guard let hex, let rgb = hexRGB(hex) else { return .fail }
        return Color(red: rgb.red, green: rgb.green, blue: rgb.blue)
    }

    /// Top-down pool with numbered finding pins (spec 3.18): the pool filled `diagramWater` with a
    /// 2 pt `water` outline, the spa as a circle labeled "SPA", pins in the severity's color on a
    /// `surface` ring. With `onPlace`, tapping drops a pin; positions are fractions (0…1) of the
    /// diagram, the same on every screen size and on reports. Port of
    /// apps/web/src/components/pool-diagram.tsx.
    struct PoolDiagram: View {
        var shape: DiagramShape?
        var hasSpa: Bool
        /// property.diagram_layout: the mirror and the spa's place, size, and shape.
        var layout = DiagramLayout()
        var pins: [DiagramPin]
        /// What's drawn on the job's diagram (`job.diagram_markup`), in the 800 x 500 markup space.
        var markup: [MarkupShape] = []
        /// The finding sheet's pin picker draws a 1 pt `controlBorder` outline; the Findings
        /// section's diagram is a plain white block.
        var outlined = false
        var onPlace: ((Double, Double) -> Void)?

        private var diagram: SundeckCore.PoolDiagram { poolDiagram(shape, hasSpa, layout) }

        var body: some View {
            let d = diagram
            let corner = RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous)
            Color.clear
                .aspectRatio(d.width / d.height, contentMode: .fit)
                .overlay {
                    GeometryReader { geo in
                        drawing(d, size: geo.size)
                            .contentShape(Rectangle())
                            .onTapGesture(coordinateSpace: .local) { point in
                                guard let onPlace, geo.size.width > 0, geo.size.height > 0 else { return }
                                onPlace(
                                    diagramFraction(point.x / geo.size.width),
                                    diagramFraction(point.y / geo.size.height))
                            }
                            .allowsHitTesting(onPlace != nil)
                    }
                }
                .background(Color.surface)
                .clipShape(corner)
                .overlay {
                    if outlined { corner.strokeBorder(Color.controlBorder, lineWidth: 1) }
                }
                .accessibilityElement(children: .ignore)
                .modifier(
                    DiagramAccessibility(
                        pins: pins, marked: !markup.isEmpty, onPlace: onPlace))
        }

        /// Barlow Bold at a size in the diagram's units, for "SPA" and the pin numbers.
        private func display(_ size: CGFloat) -> Font {
            TypeRole.sectionHeading.brandFont.map { Font.custom($0.rawValue, fixedSize: size) }
                ?? .system(size: size, weight: .bold)
        }

        private func drawing(_ d: SundeckCore.PoolDiagram, size: CGSize) -> some View {
            let scale = size.width / d.width
            return ZStack(alignment: .topLeading) {
                DiagramShapesLayer(d: d, scale: scale)
                if let spa = d.spa {
                    let rect = CGRect(
                        x: (spa.cx - spa.r) * scale, y: (spa.cy - spa.r) * scale, width: 2 * spa.r * scale,
                        height: 2 * spa.r * scale)
                    // A circle, or with `square`, a square with 4-unit corners (the website's rx 4).
                    let spaShape =
                        spa.square
                        ? AnyShape(RoundedRectangle(cornerRadius: 4 * scale, style: .circular)) : AnyShape(Circle())
                    spaShape.fill(Color.diagramWater).frame(width: rect.width, height: rect.height)
                        .overlay(spaShape.stroke(Color.water, lineWidth: 2 * scale))
                        .overlay(Text("SPA").font(display(7 * scale)).foregroundStyle(Color.water))
                        .position(x: rect.midX, y: rect.midY)
                }
                ForEach(pins) { pin in
                    ZStack {
                        Circle().fill(Color.surface).frame(width: 15 * scale, height: 15 * scale)
                        Circle().fill(pin.tint.color).frame(width: 12 * scale, height: 12 * scale)
                        if !pin.label.isEmpty {
                            Text(pin.label).font(display(7 * scale)).foregroundStyle(Color.onHeader)
                        }
                    }
                    .position(x: pin.point.x * size.width, y: pin.point.y * size.height)
                }
                if !markup.isEmpty {
                    MarkupLayer(shapes: markup, space: diagramMarkupSpace)
                        .frame(width: size.width, height: size.height)
                }
            }
            .frame(width: size.width, height: size.height)
        }
    }

    /// The pool's outline (none for a drawn pool), what was drawn with Draw, and the landmarks
    /// (filled pictures, `LandmarkArt`, in their own size, flipped or not): website `DiagramShapes`.
    struct DiagramShapesLayer: View {
        var d: SundeckCore.PoolDiagram
        var scale: CGFloat

        var body: some View {
            ZStack(alignment: .topLeading) {
                if !d.pool.isEmpty {
                    let outline = DiagramOutline(d.pool)
                    outline.fill(Color.diagramWater)
                    outline.stroke(Color.water, lineWidth: 2 * scale)
                }
                ForEach(Array(d.drawing.enumerated()), id: \.offset) { _, path in
                    DiagramOutline(path).stroke(
                        Color.water, style: StrokeStyle(lineWidth: 2 * scale, lineCap: .round, lineJoin: .round))
                }
                ForEach(Array(d.landmarks.enumerated()), id: \.offset) { _, l in
                    let side = l.size * scale
                    LandmarkArt(parts: l.parts, side: side, flip: l.flip, mirror: l.mirror)
                        .rotationEffect(.degrees(Double(90 * l.turn)))
                        .offset(x: (l.cx - l.size / 2) * scale, y: (l.cy - l.size / 2) * scale)
                }
            }
            .frame(width: d.width * scale, height: d.height * scale, alignment: .topLeading)
        }
    }

    extension LandmarkTone {
        /// From brand/tokens.json (color.landmark), the same in light and dark.
        var color: Color { Color(uiColor: token.uiColor) }

        private var token: TokenColor {
            switch self {
            case .leaf: Tokens.Landmark.leaf
            case .leafDark: Tokens.Landmark.leafDark
            case .trunk: Tokens.Landmark.trunk
            case .stone: Tokens.Landmark.stone
            case .stoneDark: Tokens.Landmark.stoneDark
            case .water: Tokens.Landmark.water
            case .foam: Tokens.Landmark.foam
            case .concrete: Tokens.Landmark.concrete
            case .metal: Tokens.Landmark.metal
            case .wall: Tokens.Landmark.wall
            case .roof: Tokens.Landmark.roof
            case .door: Tokens.Landmark.door
            }
        }

        static var outline: Color { Color(uiColor: Tokens.Landmark.outline.uiColor) }
    }

    /// A landmark's drawing (owner, 2026-10-19: "hard to interpret"): its parts filled in their
    /// colors with a thin dark outline (1 in the 24 box), water streaks as white lines (1.4), in a
    /// `side` square, mirrored when flipped. Website pool-diagram.tsx `LandmarkArt`.
    struct LandmarkArt: View {
        var parts: [LandmarkPart]
        var side: CGFloat
        var flip = false
        /// "x": a flip mirrors it left to right; "y": top to bottom (the steps).
        var mirror = "x"

        var body: some View {
            let k = side / 24
            let box = CGSize(width: 24, height: 24)
            ZStack {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    let shape = DiagramOutline(part.d, box: box)
                    if part.tone == .foam {
                        shape.stroke(
                            part.tone.color, style: StrokeStyle(lineWidth: 1.4 * k, lineCap: .round, lineJoin: .round))
                    } else {
                        shape.fill(part.tone.color)
                        shape.stroke(
                            LandmarkTone.outline,
                            style: StrokeStyle(lineWidth: 1 * k, lineCap: .round, lineJoin: .round))
                    }
                }
            }
            .frame(width: side, height: side)
            .scaleEffect(x: flip && mirror != "y" ? -1 : 1, y: flip && mirror == "y" ? -1 : 1)
            .accessibilityHidden(true)
        }
    }

    /// VoiceOver can't aim a tap on the drawing: the diagram reads as one element that names its
    /// pins, and when it takes a pin, activating it drops the pin in the middle (the finding's
    /// location field then says where it is).
    private struct DiagramAccessibility: ViewModifier {
        var pins: [DiagramPin]
        var marked = false
        var onPlace: ((Double, Double) -> Void)?

        func body(content: Content) -> some View {
            if let onPlace {
                content
                    .accessibilityLabel("Pool diagram. Tap where the leak is.")
                    .accessibilityValue(pinSummary(pins))
                    .accessibilityHint(
                        "Double-tap to place the pin in the middle, then describe where it is in the location field."
                    )
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { onPlace(0.5, 0.5) }
            } else {
                content
                    .accessibilityLabel(marked ? "Pool diagram with markup" : "Pool diagram")
                    .accessibilityValue(pinSummary(pins))
            }
        }
    }

    /// The pool's shape as seven small drawings to tap (spec 3.18): centered 64 wide tiles on `fill`,
    /// the name under each, a 2 pt `link` ring on the chosen one. The shape can stay blank; tapping
    /// the picked shape again clears it. Port of apps/web/src/components/shape-picker.tsx.
    struct ShapePicker: View {
        var value: DiagramShape?
        var label = "Pool shape"
        /// A line under the label, e.g. that it isn't picked yet.
        var hint: String?
        var onChange: (DiagramShape?) -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(label)
                if let hint { FieldHint(text: hint) }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 6) { tiles }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 64, maximum: 96), spacing: 6)], spacing: 6) {
                        tiles
                    }
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
            }
        }

        @ViewBuilder private var tiles: some View {
            ForEach(DiagramShape.tiles, id: \.self) { shape in
                let on = value == shape
                let tile = RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous)
                Button {
                    onChange(shapeAfterTap(current: value, tapped: shape))
                } label: {
                    VStack(spacing: 4) {
                        let outline = DiagramOutline(poolDiagram(shape, false, DiagramLayout(centered: true)).pool)
                        ZStack {
                            outline.fill(Color.diagramWater)
                            outline.stroke(Color.water, lineWidth: 1.5)
                        }
                        .aspectRatio(1.6, contentMode: .fit)
                        Text(shape.label)
                            .font(.role(.footnote).weight(on ? .semibold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .foregroundStyle(on ? Color.link : Color.text)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 6)
                    .padding(.bottom, 4)
                    .frame(width: 64)
                    .frame(minHeight: 64)
                    .background(tile.fill(on ? Color.tinted : Color.fill))
                    .overlay { if on { tile.strokeBorder(Color.link, lineWidth: 2) } }
                    .contentShape(tile)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(shape.label)
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityHint(on ? "Tap again to clear" : "")
            }
        }
    }
#endif
