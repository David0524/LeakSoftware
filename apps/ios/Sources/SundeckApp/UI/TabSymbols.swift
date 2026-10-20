#if os(iOS)
    import SwiftUI
    import SundeckLiveStop
    import UIKit

    // The website's tab icons (spec 3.2), drawn to template images so the system tab bar tints
    // them: outline when not selected, filled when selected.

    extension SVGCommand {
        fileprivate func add(to path: CGMutablePath) {
            switch self {
            case .move(let p): path.move(to: CGPoint(x: p.x, y: p.y))
            case .line(let p): path.addLine(to: CGPoint(x: p.x, y: p.y))
            case .curve(let a, let b, let p):
                path.addCurve(
                    to: CGPoint(x: p.x, y: p.y), control1: CGPoint(x: a.x, y: a.y), control2: CGPoint(x: b.x, y: b.y))
            case .close: path.closeSubpath()
            }
        }
    }

    /// A CGPath from an SVG `d` attribute.
    func cgPath(svg d: String) -> CGPath {
        let path = CGMutablePath()
        for command in svgCommands(d) { command.add(to: path) }
        return path
    }

    extension TabSymbol {
        /// The symbol as a template image, `size` points square (the website draws them at 28).
        @MainActor func image(filled: Bool, size: CGFloat = 28) -> UIImage {
            let key = "\(shape)|\(filled)|\(size)"
            if let cached = TabSymbolCache.images[key] { return cached }
            let format = UIGraphicsImageRendererFormat()
            format.opaque = false
            let image = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format).image {
                context in
                let cg = context.cgContext
                cg.scaleBy(x: size / 24, y: size / 24)
                cg.setLineCap(.round)
                cg.setLineJoin(.round)
                cg.setStrokeColor(UIColor.black.cgColor)
                cg.setFillColor(UIColor.black.cgColor)
                func stroke(_ d: String, _ width: Double) {
                    cg.setLineWidth(width)
                    cg.addPath(cgPath(svg: d))
                    cg.strokePath()
                }
                if filled {
                    cg.setLineWidth(TabSymbol.stroke)
                    cg.addPath(cgPath(svg: shape))
                    cg.drawPath(using: .fillStroke)
                    if let cut {
                        cg.setBlendMode(.destinationOut)
                        stroke(cut, cutWidth)
                        cg.setBlendMode(.normal)
                    }
                    if let extra { stroke(extra, TabSymbol.stroke) }
                } else {
                    for part in line { stroke(part.d, part.width) }
                }
            }
            .withRenderingMode(.alwaysTemplate)
            TabSymbolCache.images[key] = image
            return image
        }
    }

    @MainActor private enum TabSymbolCache {
        static var images: [String: UIImage] = [:]
    }
#endif
