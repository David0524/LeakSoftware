import Foundation
import SundeckLiveStop
import Testing

@testable import SundeckApp

@Suite struct BrandLogoTests {
    /// The tab pages' logo (owner, 2026-10-21) draws from brand/logo's lockups: every layer parses
    /// into closed shapes inside the lockup, and every fill is a color.
    @Test func theLogoLayersParseInsideTheLockup() {
        for layers in [SundeckLogoArt.light, SundeckLogoArt.dark] {
            #expect(!layers.isEmpty)
            for layer in layers {
                let commands = svgCommands(layer.d)
                #expect(commands.count > 3)
                #expect(commands.last == .close)
                #expect(hexRGB(layer.hex) != nil)
                for case .move(let p) in commands {
                    #expect(p.x >= -1 && p.x <= SundeckLogoArt.size.width + 1)
                    #expect(p.y >= -1 && p.y <= SundeckLogoArt.size.height + 1)
                }
            }
        }
    }

    /// Light: navy "Sundeck", water-blue "Pro" and pin. Dark: the reverse, an all-white wordmark.
    @Test func darkModeUsesTheReverseLockup() {
        #expect(SundeckLogoArt.light.map(\.hex) == ["#1F6FAE", "#12263A", "#1F6FAE"])
        #expect(SundeckLogoArt.dark.suffix(2).allSatisfy { $0.hex == "#FFFFFF" })
    }
}
