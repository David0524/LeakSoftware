import Foundation

#if canImport(CoreText)
    import CoreText
#endif

/// The brand's title face, Barlow Semi Condensed (brand/BRAND.md): titles, labels, buttons and
/// status chips, as on the website. Body text uses the system font. The files are copied from
/// brand/fonts into Fonts/ by `pnpm tokens`.
public enum BrandFonts {
    public enum Weight: String, CaseIterable, Sendable {
        case semiBold = "BarlowSemiCondensed-SemiBold"
        case bold = "BarlowSemiCondensed-Bold"
        case extraBold = "BarlowSemiCondensed-ExtraBold"
    }

    /// Makes the fonts available to the app. Call once at launch; calling again does nothing.
    public static func register() {
        #if canImport(CoreText)
            for weight in Weight.allCases {
                guard
                    let url = Bundle.module.url(
                        forResource: weight.rawValue, withExtension: "ttf", subdirectory: "Fonts")
                else {
                    continue
                }
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        #endif
    }

    /// The bundled font files (for tests).
    public static var files: [URL] {
        Weight.allCases.compactMap {
            Bundle.module.url(forResource: $0.rawValue, withExtension: "ttf", subdirectory: "Fonts")
        }
    }
}
