#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    extension MarkupColor {
        /// From brand/tokens.json (color.markup), the same on light and dark.
        var color: Color { Color(uiColor: token.uiColor) }

        private var token: TokenColor {
            switch self {
            case .red: Tokens.Markup.red
            case .yellow: Tokens.Markup.yellow
            case .white: Tokens.Markup.white
            }
        }

        static var outline: Color { Color(uiColor: Tokens.Markup.outline.uiColor) }
    }

    /// A pool diagram's markup space (website DIAGRAM_MARKUP_SPACE).
    let diagramMarkupSpace = CGSize(width: 800, height: 500)

    /// Draws markup over a photo. Shapes are stored as fractions of the image, so the same markup
    /// lines up on a thumbnail, the full-screen viewer, and the office view. Each shape gets a dark
    /// outline so it reads on bright and dark photos alike. Port of apps/mobile/src/ui/MarkupLayer.tsx.
    /// Size it to the photo's frame (not the screen); it never takes touches.
    struct MarkupLayer: View {
        var shapes: [MarkupShape]
        /// 1 at 400 points wide; nil uses width / 400, as Expo's viewer and editor do.
        var scale: CGFloat?
        /// Draw in this space, scaled to fit the frame: a pool diagram's markup uses 800 x 500
        /// (`diagramMarkupSpace`), so its lines weigh the same as on a photo (website
        /// DIAGRAM_MARKUP_SPACE).
        var space: CGSize?

        init(shapes: [MarkupShape], scale: CGFloat? = nil, space: CGSize? = nil) {
            self.shapes = shapes
            self.scale = scale
            self.space = space
        }

        var body: some View {
            Canvas { context, frame in
                guard frame.width > 0, frame.height > 0 else { return }
                var size = frame
                if let space, space.width > 0, space.height > 0 {
                    context.scaleBy(x: frame.width / space.width, y: frame.height / space.height)
                    size = space
                }
                let scale = space != nil ? size.width / 400 : (scale ?? size.width / 400)
                let stroke = max(2, 4 * scale)
                let outline = stroke + max(1.5, 3 * scale)
                for shape in shapes {
                    draw(shape, in: &context, size: size, scale: scale, stroke: stroke, outline: outline)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }

        private func draw(
            _ shape: MarkupShape, in context: inout GraphicsContext, size: CGSize, scale: CGFloat, stroke: CGFloat,
            outline: CGFloat
        ) {
            let w = size.width
            let h = size.height
            switch shape {
            case .arrow(let color, let x1, let y1, let x2, let y2):
                let a = CGPoint(x: x1 * w, y: y1 * h)
                let b = CGPoint(x: x2 * w, y: y2 * h)
                var line = Path()
                line.move(to: a)
                line.addLine(to: b)
                let points = arrowHead(a.x, a.y, b.x, b.y, max(10, 22 * scale))
                var head = Path()
                head.addLines(points.map { CGPoint(x: $0.x, y: $0.y) })
                head.closeSubpath()
                context.stroke(
                    line, with: .color(MarkupColor.outline), style: StrokeStyle(lineWidth: outline, lineCap: .round))
                context.fill(head, with: .color(color.color))
                context.stroke(head, with: .color(MarkupColor.outline), lineWidth: 1.5)
                context.stroke(line, with: .color(color.color), style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            case .circle(let color, let cx, let cy, let rx, let ry):
                let rect = CGRect(x: (cx - rx) * w, y: (cy - ry) * h, width: 2 * rx * w, height: 2 * ry * h)
                let ellipse = Path(ellipseIn: rect)
                context.stroke(ellipse, with: .color(MarkupColor.outline), lineWidth: outline)
                context.stroke(ellipse, with: .color(color.color), lineWidth: stroke)
            case .pen(let color, let points):
                // The same dark outline under the stroke as the other shapes, round caps and joins.
                var path = Path()
                path.addLines(points.map { CGPoint(x: $0.x * w, y: $0.y * h) })
                context.stroke(
                    path, with: .color(MarkupColor.outline),
                    style: StrokeStyle(lineWidth: outline, lineCap: .round, lineJoin: .round))
                context.stroke(
                    path, with: .color(color.color),
                    style: StrokeStyle(lineWidth: stroke, lineCap: .round, lineJoin: .round))
            case .text(let color, let x, let y, let text):
                let size = max(10, 24 * scale)
                let font = Font.system(size: size, weight: .bold)
                // SVG's baseline at y with a centered anchor: the text sits just above the point.
                let at = CGPoint(x: x * w, y: y * h)
                let outlined = context.resolve(Text(text).font(font).foregroundStyle(MarkupColor.outline))
                let filled = context.resolve(Text(text).font(font).foregroundStyle(color.color))
                // Outline first (the fill drawn around it), then the fill on top.
                let r = max(1, size / 10)
                for dx in [-r, 0, r] {
                    for dy in [-r, 0, r] where dx != 0 || dy != 0 {
                        context.draw(outlined, at: CGPoint(x: at.x + dx, y: at.y + dy), anchor: .bottom)
                    }
                }
                context.draw(filled, at: at, anchor: .bottom)
            }
        }
    }
#endif
