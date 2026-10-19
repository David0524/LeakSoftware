import Foundation
import SundeckCore
import Testing

/// media and signature, plus the signature labels from report.
@Suite struct MediaTests {
    let module = "media"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "MEDIA_LIMITS", "MEDIA_KIND_LABELS", "MARKUP_COLORS", "extensionForMime", "mimeFromFileName",
            "mediaStoragePath", "fitWithin", "formatDuration", "formatBytes", "parseMarkup", "shapeFromDrag",
            "textShape", "shapeAtTap", "arrowHead", "SIGNATURE_PURPOSE_LABELS", "MIN_INK",
            "enabledSignaturePurposes", "reportSignOffPurposes", "signatureStoragePath", "inkLength", "strokePath",
            "signatureSvg", "signatureStatement",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func mediaFiles() {
        checkRule(module, "MEDIA_LIMITS") { _ in
            [
                "photoLongEdge": Double(MediaLimits.photoLongEdge), "photoQuality": MediaLimits.photoQuality,
                "videoMaxSeconds": Double(MediaLimits.videoMaxSeconds),
                "voiceMaxSeconds": Double(MediaLimits.voiceMaxSeconds),
            ]
        }
        checkRule(module, "MEDIA_KIND_LABELS") { _ in labelTable(\MediaKind.label) }
        checkRule(module, "extensionForMime") { c in try extensionForMime(try c.arg(0)) }
        checkRule(module, "mimeFromFileName") { c in mimeFromFileName(try c.arg(0), try c.arg(1)) }
        checkRule(module, "mediaStoragePath") { c in
            try mediaStoragePath(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3))
        }
        checkRule(module, "fitWithin") { c in fitWithin(try c.arg(0), try c.arg(1), try c.arg(2)) }
        checkRule(module, "formatDuration") { c in formatDuration(try c.arg(0, as: Double?.self)) }
        checkRule(module, "formatBytes") { c in formatBytes(try c.arg(0, as: Int?.self)) }
    }

    @Test func markup() {
        checkRule(module, "MARKUP_COLORS") { _ in MarkupColor.allCases }
        checkRule(module, "parseMarkup") { c in parseMarkup(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "shapeFromDrag") { c in
            shapeFromDrag(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3))
        }
        checkRule(module, "textShape") { c in textShape(try c.arg(0), try c.arg(1), try c.arg(2)) }
        checkRule(module, "shapeAtTap") { c in shapeAtTap(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3)) }
        checkRule(module, "arrowHead") { c in
            arrowHead(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3), try c.arg(4))
        }
    }

    @Test func markupRoundTrips() throws {
        let markup = parseMarkup(
            try JSONDecoder().decode(
                JSONValue.self,
                from: Data(
                    #"{"version":1,"shapes":[{"type":"text","color":"red","x":0.5,"y":0.25,"text":"Leak"}]}"#.utf8)))
        let decoded = try JSONDecoder().decode(Markup.self, from: JSONEncoder().encode(markup))
        #expect(decoded == markup)
        #expect(markup.shapes == [.text(color: .red, x: 0.5, y: 0.25, text: "Leak")])
    }

    @Test func signatures() {
        checkRule(module, "SIGNATURE_PURPOSE_LABELS") { _ in labelTable(\SignaturePurpose.label) }
        checkRule(module, "MIN_INK") { _ in minInk }
        checkRule(module, "enabledSignaturePurposes") { c in enabledSignaturePurposes(try c.arg(0, as: JSONValue?.self))
        }
        checkRule(module, "reportSignOffPurposes") { c in reportSignOffPurposes(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "signatureStoragePath") { c in signatureStoragePath(try c.arg(0), try c.arg(1), try c.arg(2))
        }
        checkRule(module, "inkLength") { c in inkLength(try c.arg(0)) }
        checkRule(module, "strokePath") { c in strokePath(try c.arg(0)) }
        checkRule(module, "signatureSvg") { c in
            try signatureSvg(try c.arg(0), try c.arg(1, as: Double?.self) ?? 3)
        }
        checkRule(module, "signatureStatement") { c in
            signatureStatement(try c.arg(0), try c.arg(1), try c.arg(2, as: String?.self))
        }
    }
}
