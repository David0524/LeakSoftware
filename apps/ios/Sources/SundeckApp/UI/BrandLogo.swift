#if os(iOS)
    import SwiftUI

    // The horizontal Sundeck Pro logo (drop pin and wordmark) at the leading edge of each tab's
    // own page: Today, Jobs, Schedule, Messages, More (owner, 2026-10-21: "Incorporate this logo
    // with the text in the top left of each main page on the app"). Pushed pages keep Back there.
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
        /// The bar's logo width (24 tall), and the room a tab's large title leaves for it in the
        /// bar's row (RootTitle.swift): the logo and 12 points, since the bar sets its leading
        /// item in a little further than the page's 16-point margin.
        static let barWidth: CGFloat = 24 * SundeckLogoArt.size.width / SundeckLogoArt.size.height
        static let titleLead: CGFloat = barWidth + 12
    }

    extension EnvironmentValues {
        /// The view is a tab's own page, whose bar has the logo at its leading edge (AppTabs). A
        /// screen pushed onto the stack doesn't have it.
        @Entry var brandInBar = false
    }

    /// The logo at the leading edge of a tab's root navigation bar, with the large title beside
    /// it in the bar's row (RootTitle.swift). A picture, not a button, so on iOS 26 it sits on
    /// the bar without a glass capsule.
    struct BrandToolbarItem: ToolbarContent {
        var body: some ToolbarContent {
            if #available(iOS 26, *) {
                ToolbarItem(placement: .topBarLeading) { SundeckLogo() }
                    .sharedBackgroundVisibility(.hidden)
            } else {
                ToolbarItem(placement: .topBarLeading) { SundeckLogo() }
            }
        }
    }
#endif
