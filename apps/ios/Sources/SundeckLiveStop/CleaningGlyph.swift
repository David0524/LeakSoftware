import Foundation
import SundeckCore

#if os(iOS)
    import SwiftUI
#endif

// The cleaning icons, shared by the app (Today, the checklist, Schedule) and the widget
// extension (the Live Activity's cleanings, owner 2026-10-20), so both draw the same shapes.

/// The cleaning icons from the website (apps/web/src/components/icons.tsx), in a 24-unit box
/// with a 1.8 stroke: a pleated cartridge for filters, a tube with a spark for salt cells, two
/// arrows in a circle for anything else. Rounded rectangles as (x, y, width, height, radius).
public struct CleaningGlyph: Equatable, Sendable {
    public var rects: [[Double]]
    public var paths: [String]

    public static func of(_ kind: CleaningKind) -> CleaningGlyph {
        switch kind {
        case .filter: CleaningGlyph(rects: [[6, 3, 12, 18, 3]], paths: ["M10 7v10M14 7v10"])
        // A new cartridge with an arrow going in (NewFilterIcon).
        case .filterReplace:
            CleaningGlyph(rects: [[9, 6, 10, 15, 2.5]], paths: ["M12.5 10v7M15.5 10v7M3 4h6M6 1v6"])
        case .saltCell: CleaningGlyph(rects: [[2.5, 8, 19, 8, 4]], paths: ["m13 9.5-2.5 3h3L11 15"])
        case .other:
            CleaningGlyph(
                rects: [], paths: ["M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5", "M5 3v4h4M19 21v-4h-4"])
        }
    }
}

#if os(iOS)
    /// A cleaning's glyph as a shape in its frame (24 units to the frame's shorter side), to
    /// stroke at 1.8 units with round caps and joins.
    public struct CleaningGlyphShape: Shape {
        public var glyph: CleaningGlyph

        public init(glyph: CleaningGlyph) { self.glyph = glyph }

        public func path(in rect: CGRect) -> Path {
            let k = min(rect.width, rect.height) / 24
            var path = Path()
            for r in glyph.rects where r.count == 5 {
                path.addRoundedRect(
                    in: CGRect(x: rect.minX + r[0] * k, y: rect.minY + r[1] * k, width: r[2] * k, height: r[3] * k),
                    cornerSize: CGSize(width: r[4] * k, height: r[4] * k), style: .circular)
            }
            func point(_ p: SVGPoint) -> CGPoint { CGPoint(x: rect.minX + p.x * k, y: rect.minY + p.y * k) }
            for d in glyph.paths {
                for command in svgCommands(d) {
                    switch command {
                    case .move(let p): path.move(to: point(p))
                    case .line(let p): path.addLine(to: point(p))
                    case .curve(let a, let b, let p):
                        path.addCurve(to: point(p), control1: point(a), control2: point(b))
                    case .close: path.closeSubpath()
                    }
                }
            }
            return path
        }
    }

    /// A cleaning's icon at `size` points, stroked in the current foreground style.
    public struct CleaningGlyphIcon: View {
        public var kind: CleaningKind
        public var size: CGFloat

        public init(kind: CleaningKind, size: CGFloat = 20) {
            self.kind = kind
            self.size = size
        }

        public var body: some View {
            CleaningGlyphShape(glyph: .of(kind))
                .stroke(style: StrokeStyle(lineWidth: 1.8 * size / 24, lineCap: .round, lineJoin: .round))
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        }
    }
#endif
