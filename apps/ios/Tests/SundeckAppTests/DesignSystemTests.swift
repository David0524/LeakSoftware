import Foundation
import SundeckCore
import SundeckLiveStop
import SundeckStorage
import SundeckTokens
import Testing

@testable import SundeckApp

// The design system's rules (docs/design/2026-10-19-native-apps-follow-web.md, sections 2 and 3).

@Suite struct DesignSystemTests {
    private func kv() throws -> KeyValue {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("ds-\(UUID()).db").path
        return try KeyValue(try Database(path: path, key: String(repeating: "ab", count: 32)))
    }

    @Test @MainActor func appearanceStartsLightAndIsRemembered() throws {
        let store = try kv()
        let setting = AppearanceSetting(store)
        #expect(setting.choice == .light)
        #expect(store.get(KVKey.appearance) == nil)
        setting.choice = .dark
        #expect(store.get(KVKey.appearance) == "dark")
        #expect(AppearanceSetting(store).choice == .dark)
        setting.choice = .light
        #expect(AppearanceSetting(store).choice == .light)
    }

    @Test func unknownStoredAppearanceIsLight() {
        #expect(Appearance(stored: nil) == .light)
        #expect(Appearance(stored: "system") == .light)
        #expect(Appearance(stored: "dark") == .dark)
        #expect(Appearance.allCases.map(\.label) == ["Light", "Dark"])
    }

    @Test func appearanceSurvivesSignOut() {
        #expect(!KVKey.signOutClears.contains(KVKey.appearance))
    }

    @Test func jobStatusChipColors() {
        let expected: [JobStatus: Tone] = [
            .unscheduled: .excluded, .scheduled: .text, .inProgress: .info, .reportSent: .info,
            .quoteSent: .info, .quoteAccepted: .warning, .invoiced: .warning, .paid: .pass, .done: .pass,
            .canceled: .excluded,
        ]
        for status in JobStatus.allCases { #expect(status.tone == expected[status], "\(status)") }
        #expect(Tone.text.role == Tokens.Role.text)
        #expect(Tone.excluded.role == Tokens.Role.excluded)
    }

    @Test func outcomeAndSyncTones() {
        #expect(Outcome.pass.tone == .pass)
        #expect(Outcome.fail.tone == .fail)
        #expect(Outcome.inconclusive.tone == .warning)
        #expect(SyncBarMessage.Tone.good.tone == .pass)
        #expect(SyncBarMessage.Tone.working.tone == .info)
        #expect(SyncBarMessage.Tone.attention.tone == .warning)
        #expect(SyncBarMessage.Tone.problem.tone == .fail)
    }

    @Test func badges() {
        #expect(badgeText(0) == nil)
        #expect(badgeText(-1) == nil)
        #expect(badgeText(1) == "1")
        #expect(badgeText(99) == "99")
        #expect(badgeText(100) == "99+")
        #expect(unreadAccessibilityText(3) == "3 unread")
        #expect(unreadAccessibilityText(0) == nil)
        #expect(attentionAccessibilityText(4) == "4 need attention")
        #expect(attentionAccessibilityText(1) == "1 needs attention")
    }

    @Test func tintsAreTokensAtTheirOpacity() {
        // link #1A63A0 at 12%: 0xFF * 0.12 = 30.6 → 31.
        #expect(Tint.tinted.role.light == TokenColor(0x1A, 0x63, 0xA0, 31))
        #expect(Tint.tinted.role.dark == TokenColor(0x6A, 0xAE, 0xE6, 31))
        #expect(Tint.iconTint.role.light.opacity == 26)
        #expect(Tint.dangerTint.role.light == TokenColor(0xC6, 0x2F, 0x2B, 31))
        #expect(Tint.noticeFill(.warning).role.dark == TokenColor(0xD9, 0xA0, 0x40, 26))
        #expect(Tint.scrim.role.light == TokenColor(0, 0, 0, 102))
    }

    @Test func wellsAreFlattenedOverTheirBackground() {
        // text #12263A at 4% over white: 255 - (255 - 0x12) * 0.04 = 245.5 → 246 (0xF6).
        let well = Tint.well.role.light
        #expect(well.opacity == 0xFF)
        #expect(well.red == 246)
        #expect(well.green == UInt8((0x26 * 0.04 + 255 * 0.96).rounded()))
        // Dark: text #E6ECF1 at 4% over surface #161E26.
        let dark = Tint.well.role.dark
        #expect(dark.red == UInt8((0xE6 * 0.04 + 0x16 * 0.96).rounded()))
        #expect(Tint.emptyFill.role.light.red == UInt8((0x12 * 0.04 + 0xF2 * 0.96).rounded()))
    }

    @Test func typeScaleMatchesTheSpec() {
        #expect(TypeRole.largeTitle.size == 34 && TypeRole.largeTitle.lineHeight == 42)
        #expect(TypeRole.largeTitle.brandFont == .extraBold)
        #expect(TypeRole.sectionHeading.brandFont == .bold && TypeRole.sectionHeading.size == 24)
        #expect(TypeRole.cardTitle.brandFont == .bold && TypeRole.cardTitle.size == 20)
        #expect(TypeRole.subHeading.brandFont == .bold && TypeRole.subHeading.size == 18)
        #expect(TypeRole.sectionLabel.brandFont == .semiBold && TypeRole.sectionLabel.uppercased)
        #expect(TypeRole.sectionLabel.scale == .footnote)
        // The inline navigation title is the large title's face, so a title keeps its face as it folds.
        #expect(TypeRole.navTitle.brandFont == .semiBold && TypeRole.navTitle.size == 17)
        for role in [TypeRole.body, .bodyEmphasis, .bodyMedium, .secondary, .footnote, .segment, .tabLabel] {
            #expect(role.brandFont == nil, "\(role) is the body face")
            #expect(!role.uppercased)
        }
        #expect(TypeRole.body.size == 17 && TypeRole.body.lineHeight == 25.5)
        #expect(TypeRole.secondary.size == 15 && TypeRole.footnote.size == 13 && TypeRole.segment.size == 15)
        #expect(TypeRole.bodyMedium.weight == .medium && TypeRole.bodyEmphasis.weight == .semibold)
    }

    @Test func barlowRolesHaveBundledFiles() {
        for role in TypeRole.allCases {
            if let file = role.brandFont {
                #expect(BrandFonts.files.contains { $0.lastPathComponent == "\(file.rawValue).ttf" })
            }
        }
    }

    @Test func svgPathReadsRelativeArcsAndSmoothCurves() {
        let commands = svgCommands("M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z")
        #expect(commands.first == .move(SVGPoint(12, 21)))
        guard case .curve(let c1, let c2, let end) = commands[1] else {
            Issue.record("expected a curve")
            return
        }
        // "s" with no previous curve: the first control point is the current point.
        #expect(c1 == SVGPoint(12, 21))
        #expect(c2 == SVGPoint(5, 14.9))
        #expect(end == SVGPoint(5, 9.5))
        // The 180-degree arc to (19, 9.5) is two curves ending there.
        let arcs = commands.dropFirst(2).prefix { if case .curve = $0 { return true } else { return false } }
        guard case .curve(_, _, let arcEnd)? = arcs.dropLast().last else {
            Issue.record("expected arc curves")
            return
        }
        #expect(abs(arcEnd.x - 19) < 1e-9 && abs(arcEnd.y - 9.5) < 1e-9)
        #expect(commands.last == .close)
    }

    @Test func svgPathReadsPackedNumbersAndShortLines() {
        #expect(
            svgCommands("M9 4h6M8 4H6v-1.5")
                == [
                    .move(SVGPoint(9, 4)), .line(SVGPoint(15, 4)), .move(SVGPoint(8, 4)), .line(SVGPoint(6, 4)),
                    .line(SVGPoint(6, 2.5)),
                ])
        #expect(svgCommands("M8 11h.01") == [.move(SVGPoint(8, 11)), .line(SVGPoint(8.01, 11))])
        #expect(svgCommands("M1 1 2 2") == [.move(SVGPoint(1, 1)), .line(SVGPoint(2, 2))])
    }

    @Test func everyTabSymbolParses() {
        for symbol in [TabSymbol.today, .jobs, .schedule, .messages, .more] {
            for part in [symbol.shape, symbol.cut, symbol.extra].compactMap({ $0 }) + symbol.line.map(\.d) {
                let commands = svgCommands(part)
                #expect(!commands.isEmpty)
                // Every point stays on the 24 x 24 artboard.
                for command in commands {
                    let points: [SVGPoint] =
                        switch command {
                        case .move(let p), .line(let p): [p]
                        case .curve(let a, let b, let p): [a, b, p]
                        case .close: []
                        }
                    for p in points { #expect(p.x >= 0 && p.x <= 24 && p.y >= 0 && p.y <= 24, "\(part)") }
                }
            }
        }
    }
}

/// Document numbers never get thousands separators (owner, 2026-10-20: "Job numbers should never
/// have commas"). SwiftUI formats a number interpolated into a Text literal ("#1,038"), so a
/// "#" followed by an interpolation must be Text(verbatim:) or a String.
@Suite struct DocumentNumberTests {
    @Test func noNumberAfterAHashInATextLiteral() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../Sources")
            .standardized
        let files = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)
        var offenders: [String] = []
        while let url = files?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let lines = try String(contentsOf: url, encoding: .utf8).components(separatedBy: "\n")
            for (i, line) in lines.enumerated()
            where line.range(
                of: #"(Text|Label|accessibilityLabel|navigationTitle)\("[^"]*#\\\("#, options: .regularExpression)
                != nil
            {
                offenders.append("\(url.lastPathComponent):\(i + 1)")
            }
        }
        #expect(offenders.isEmpty, "Use Text(verbatim:) for: \(offenders)")
    }

    @Test func documentNumbersReadPlainly() {
        #expect("Job #" + String(10_381) == "Job #10381")
    }
}
