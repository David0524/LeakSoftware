#if os(iOS)
    import SwiftUI

    // The horizontal Sundeck Pro logo (drop pin and wordmark) on the leading edge of each tab's
    // navigation bar: Today, Jobs, Schedule, Messages, More (owner, 2026-10-21: "It needs to sit
    // below the time. Then just the logo (not the text) should slide down with the page on that
    // top banner"). The full lockup at rest; scrolled, the wordmark fades and the pin mark stays
    // (RootTitle.swift). Drawn from the brand's vector geometry (SundeckLogoArt, generated from
    // brand/logo), the reverse lockup in dark mode. Same as the website's phone bar and the Expo app.

    /// The lockup, `height` points tall. `wordmark` is the "Sundeck Pro" text's opacity: at 0 only
    /// the pin mark is drawn, and the view narrows to it. VoiceOver reads it once as "Sundeck Pro".
    struct SundeckLogo: View {
        var height: CGFloat = 24
        var wordmark: CGFloat = 1
        @Environment(\.colorScheme) private var scheme

        var body: some View {
            let art = scheme == .dark ? Self.dark : Self.light
            let shown = min(1, max(0, wordmark))
            let fullWidth = SundeckLogoArt.size.width
            let width = art.markWidth + (fullWidth - art.markWidth) * shown
            Canvas { context, size in
                let scale = size.height / SundeckLogoArt.size.height
                context.scaleBy(x: scale, y: scale)
                for layer in art.mark {
                    context.fill(layer.path, with: .color(layer.color), style: FillStyle(eoFill: layer.evenOdd))
                }
                guard shown > 0 else { return }
                context.opacity = shown
                for layer in art.wordmark {
                    context.fill(layer.path, with: .color(layer.color), style: FillStyle(eoFill: layer.evenOdd))
                }
            }
            .frame(width: height * width / SundeckLogoArt.size.height, height: height)
            .clipped()
            .accessibilityElement()
            .accessibilityLabel("Sundeck Pro")
            .accessibilityAddTraits(.isImage)
        }

        private struct Drawn {
            let path: Path
            let color: Color
            let evenOdd: Bool
        }

        private struct Art {
            let mark: [Drawn]
            let wordmark: [Drawn]
            /// The pin mark's right edge, with a little room, in the art's units.
            let markWidth: CGFloat
        }

        private static func art(_ layers: [SundeckLogoArt.Layer]) -> Art {
            let drawn = layers.map { layer in
                let rgb = hexRGB(layer.hex) ?? (0, 0, 0)
                return Drawn(
                    path: Path(cgPath(svg: layer.d)), color: Color(red: rgb.red, green: rgb.green, blue: rgb.blue),
                    evenOdd: layer.evenOdd)
            }
            // The last two layers are the wordmark ("Sundeck", "Pro"); the rest draw the pin.
            let mark = Array(drawn.dropLast(SundeckLogoArt.wordmarkLayers))
            let right = mark.map { $0.path.boundingRect.maxX }.max() ?? SundeckLogoArt.size.height
            return Art(
                mark: mark, wordmark: Array(drawn.suffix(SundeckLogoArt.wordmarkLayers)),
                markWidth: min(SundeckLogoArt.size.width, right + 2))
        }

        // Parsed once.
        private static let light = art(SundeckLogoArt.light)
        private static let dark = art(SundeckLogoArt.dark)
    }

    extension SundeckLogo {
        /// The logo's height in a tab's navigation bar: 28 points (owner, 2026-10-21).
        static let barHeight: CGFloat = 28
        /// How far the page scrolls while the wordmark fades out.
        static let collapseDistance: CGFloat = 30
    }

    extension EnvironmentValues {
        /// The view is a tab's own page, whose navigation bar has the logo on its leading edge
        /// (AppTabs, RootTitle.swift). A screen pushed onto the stack doesn't have it.
        @Entry var brandInBar = false
    }
#endif

extension SundeckLogoArt {
    /// The wordmark's layers ("Sundeck", "Pro"), last in both lockups; the layers before them draw
    /// the pin mark, which stays in the bar once a tab page scrolls.
    static let wordmarkLayers = 2
}
