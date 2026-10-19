import Foundation
import SundeckTokens
import Testing

@Suite struct BrandFontsTests {
    /// The three title weights ship with the app (copied from brand/fonts by `pnpm tokens`).
    @Test func theTitleFontsAreBundled() {
        #expect(BrandFonts.files.count == BrandFonts.Weight.allCases.count)
    }
}
