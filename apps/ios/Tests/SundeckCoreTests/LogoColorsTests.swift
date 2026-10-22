import Foundation
import SundeckCore
import Testing

/// logo-colors.ts: the shop's colors from its logo (owner, 2026-10-22).
@Suite struct LogoColorsTests {
    let module = "logo-colors"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "DEFAULT_BRAND_COLOR", "BRAND_COLOR_PRESETS", "logoPalette", "brandColorChoices",
                "suggestedBrandColor", "textOnBrand",
            ])
    }

    @Test func constants() {
        checkRule(module, "DEFAULT_BRAND_COLOR") { _ in defaultBrandColor }
        checkRule(module, "BRAND_COLOR_PRESETS") { _ in brandColorPresets }
    }

    @Test func palette() {
        checkRule(module, "logoPalette") { c in
            let pixels: [Int] = try c.arg(0)
            let max: Int? = try c.arg(1)
            return logoPalette(pixels.map { UInt8($0) }, max: max ?? 5)
        }
    }

    @Test func choices() {
        checkRule(module, "brandColorChoices") { c in
            brandColorChoices(try c.arg(0), current: try c.arg(1))
        }
        checkRule(module, "textOnBrand") { c in textOnBrand(try c.arg(0)) }
        checkRule(module, "suggestedBrandColor") { c in
            suggestedBrandColor(try c.arg(0), current: try c.arg(1), newLogo: try c.arg(2))
        }
    }
}
