#if os(iOS)
    import SwiftUI

    // The horizontal Sundeck Pro logo (drop pin and wordmark) at the leading edge of each tab's
    // own page: Today, Jobs, Schedule, Messages, More (owner, 2026-10-21: "Incorporate this logo
    // with the text in the top left of each main page on the app"). It is part of the large-title
    // block, directly above the title, and scrolls away with it (owner, 2026-10-21, build 1017:
    // "The logo needs to park over the title"); the bar keeps only its buttons (RootTitle.swift).
    // Drawn from the brand's vector geometry (SundeckLogoArt, generated from brand/logo), the
    // reverse lockup in dark mode. Same as the website's phone bar and the Expo app.

    /// The lockup, `height` points tall. VoiceOver reads it once as "Sundeck Pro".
    struct SundeckLogo: View {
        var height: CGFloat = 24
        @Environment(\.colorScheme) private var scheme

        var body: some View {
            let dark = scheme == .dark
            let layers = dark ? Self.darkLayers : Self.lightLayers
            Canvas { context, size in
                let scale = size.height / SundeckLogoArt.size.height
                context.scaleBy(x: scale, y: scale)
                for layer in layers {
                    context.fill(layer.path, with: .color(layer.color), style: FillStyle(eoFill: layer.evenOdd))
                }
            }
            .frame(width: height * SundeckLogoArt.size.width / SundeckLogoArt.size.height, height: height)
            .accessibilityElement()
            .accessibilityLabel("Sundeck Pro")
            .accessibilityAddTraits(.isImage)
        }

        private struct Drawn {
            let path: Path
            let color: Color
            let evenOdd: Bool
        }

        private static func drawn(_ layers: [SundeckLogoArt.Layer]) -> [Drawn] {
            layers.map { layer in
                let rgb = hexRGB(layer.hex) ?? (0, 0, 0)
                return Drawn(
                    path: Path(cgPath(svg: layer.d)), color: Color(red: rgb.red, green: rgb.green, blue: rgb.blue),
                    evenOdd: layer.evenOdd)
            }
        }

        // Parsed once.
        private static let lightLayers = drawn(SundeckLogoArt.light)
        private static let darkLayers = drawn(SundeckLogoArt.dark)
    }

    extension SundeckLogo {
        /// The logo's height over a tab's large title: 28 points (owner, 2026-10-21).
        static let titleHeight: CGFloat = 28
        /// The gap between the logo and the large title under it.
        static let titleGap: CGFloat = 7
    }

    extension EnvironmentValues {
        /// The view is a tab's own page, whose large title has the logo above it (AppTabs,
        /// RootTitle.swift). A screen pushed onto the stack doesn't have it.
        @Entry var brandInBar = false
    }
#endif
