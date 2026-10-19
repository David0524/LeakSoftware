#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// The diagram's water outline color (the brand's water blue, as the Expo app draws it).
    private let waterStroke = Color(uiColor: Tokens.Brand.water.uiColor)

    /// An SVG path from the core's pool diagram (a 160×100 box), scaled to fill the rect.
    struct DiagramOutline: Shape {
        var commands: [PathCommand]
        var box = CGSize(width: 160, height: 100)

        init(_ d: String) { commands = parseSVGPath(d) }

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

    /// Top-down pool with numbered finding pins. With `onPlace`, tapping drops a pin; positions
    /// are fractions (0…1) of the diagram, the same on every screen size and on reports. Port of
    /// apps/mobile/src/ui/PoolDiagram.tsx.
    struct PoolDiagram: View {
        var shape: DiagramShape?
        var hasSpa: Bool
        var pins: [DiagramPin]
        var onPlace: ((Double, Double) -> Void)?

        private var diagram: SundeckCore.PoolDiagram { poolDiagram(shape, hasSpa) }

        var body: some View {
            let d = diagram
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
                .background(Color(Tokens.Role.surface))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(
                        Color(Tokens.Role.border), lineWidth: 1)
                )
                .accessibilityElement(children: .ignore)
                .modifier(DiagramAccessibility(pins: pins, onPlace: onPlace))
        }

        private func drawing(_ d: SundeckCore.PoolDiagram, size: CGSize) -> some View {
            let scale = size.width / d.width
            return ZStack(alignment: .topLeading) {
                let outline = DiagramOutline(d.pool)
                outline.fill(Color(Tokens.Role.diagramWater))
                outline.stroke(waterStroke, lineWidth: 2 * scale)
                if let spa = d.spa {
                    let rect = CGRect(
                        x: (spa.cx - spa.r) * scale, y: (spa.cy - spa.r) * scale, width: 2 * spa.r * scale,
                        height: 2 * spa.r * scale)
                    Circle().fill(Color(Tokens.Role.diagramWater)).frame(width: rect.width, height: rect.height)
                        .overlay(Circle().stroke(waterStroke, lineWidth: 2 * scale))
                        .overlay(
                            Text("SPA").font(.system(size: 7 * scale, weight: .bold)).foregroundStyle(waterStroke)
                        )
                        .position(x: rect.midX, y: rect.midY)
                }
                ForEach(pins) { pin in
                    let r = (pin.active ? 7.0 : 6.0) * scale
                    ZStack {
                        Circle().fill(Color(Tokens.Role.surface)).frame(
                            width: 2 * r + 3 * scale, height: 2 * r + 3 * scale)
                        Circle().fill(pin.tint.color).frame(width: 2 * r, height: 2 * r)
                        Text(pin.label).font(.system(size: 7 * scale, weight: .bold))
                            .foregroundStyle(Color(Tokens.Role.onHeader))
                    }
                    .position(x: pin.point.x * size.width, y: pin.point.y * size.height)
                }
            }
            .frame(width: size.width, height: size.height)
        }
    }

    /// VoiceOver can't aim a tap on the drawing: the diagram reads as one element that names its
    /// pins, and when it takes a pin, activating it drops the pin in the middle (the finding's
    /// location field then says where it is).
    private struct DiagramAccessibility: ViewModifier {
        var pins: [DiagramPin]
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
                    .accessibilityLabel("Pool diagram")
                    .accessibilityValue(pinSummary(pins))
            }
        }
    }

    /// The pool's shape as five small drawings to tap. The shape can stay blank; tapping the
    /// picked shape again clears it. Port of apps/mobile/src/ui/ShapePicker.tsx.
    struct ShapePicker: View {
        var value: DiagramShape?
        var label = "Pool shape"
        /// A line under the label, e.g. that it isn't picked yet.
        var hint: String?
        var onChange: (DiagramShape?) -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.subheadline.weight(.semibold))
                if let hint { Text(hint).font(.subheadline).foregroundStyle(Color.muted) }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { tiles }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        tiles
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
            }
        }

        @ViewBuilder private var tiles: some View {
            ForEach(DiagramShape.allCases, id: \.self) { shape in
                let on = value == shape
                Button {
                    onChange(shapeAfterTap(current: value, tapped: shape))
                } label: {
                    VStack(spacing: 2) {
                        let outline = DiagramOutline(poolDiagram(shape, false).pool)
                        ZStack {
                            outline.fill(Color(Tokens.Role.diagramWater))
                            outline.stroke(waterStroke, lineWidth: 1.5)
                        }
                        .aspectRatio(1.6, contentMode: .fit)
                        .frame(height: 30)
                        Text(shape.label)
                            .font(.caption)
                            .lineLimit(1)
                            .fixedSize()
                            .foregroundStyle(on ? Color(Tokens.Role.link) : .primary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(Tokens.Role.surface))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(on ? Color(Tokens.Role.link) : .clear, lineWidth: 2)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(shape.label)
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityHint(on ? "Tap again to clear" : "")
            }
        }
    }
#endif
