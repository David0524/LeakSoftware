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
            "textShape", "shapeAtTap", "arrowHead", "arrowShape", "SIGNATURE_PURPOSE_LABELS", "MIN_INK",
            "enabledSignaturePurposes", "reportSignOffPurposes", "signatureStoragePath", "inkLength", "strokePath",
            "signatureSvg", "signatureStatement", "REPORT_BLOCKS", "testOutcomeLabel",
            "PEN_POINTS_MAX", "penShape", "penPath", "clampTextSize", "moveText", "resizeText",
            "UPLOAD_LIMITS", "uploadRefusal", "uploadRefusalMessage",
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

    /// The storage buckets' limits and refused uploads (security review M2).
    @Test func uploadRefusals() {
        checkRule(module, "UPLOAD_LIMITS") { _ in
            [
                "media": UploadBucket.media.maxBytes, "texts": UploadBucket.texts.maxBytes,
                "logo": UploadBucket.logo.maxBytes,
            ]
        }
        checkRule(module, "uploadRefusal") { c in
            UploadRefusal(status: try c.arg(0, as: Int?.self), message: try c.arg(1, as: String?.self))
                .map(Self.name)
        }
        checkRule(module, "uploadRefusalMessage") { c in
            let refusal: UploadRefusal =
                switch try c.arg(0, as: String.self) {
                case "too_large": .tooLarge
                case "wrong_type": .wrongType
                default: .readOnly
                }
            let bucket: UploadBucket =
                switch try c.arg(1, as: String.self) {
                case "texts": .texts
                case "logo": .logo
                default: .media
                }
            return refusal.message(bucket)
        }
    }

    private static func name(_ refusal: UploadRefusal) -> String {
        switch refusal {
        case .tooLarge: "too_large"
        case .wrongType: "wrong_type"
        case .readOnly: "read_only"
        }
    }

    @Test func markup() {
        checkRule(module, "MARKUP_COLORS") { _ in MarkupColor.allCases }
        checkRule(module, "parseMarkup") { c in parseMarkup(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "shapeFromDrag") { c in
            shapeFromDrag(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3))
        }
        checkRule(module, "textShape") { c in textShape(try c.arg(0), try c.arg(1), try c.arg(2)) }
        checkRule(module, "clampTextSize") { c in clampTextSize(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "moveText") { c in moveText(try c.arg(0), try c.arg(1)) }
        checkRule(module, "resizeText") { c in resizeText(try c.arg(0), try c.arg(1)) }
        checkRule(module, "shapeAtTap") { c in shapeAtTap(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3)) }
        checkRule(module, "arrowShape") { c in
            arrowShape(try c.arg(0), try c.arg(1), try c.arg(2), try c.arg(3), try c.arg(4))
        }
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

    /// Pen strokes round-trip; a shape this app doesn't know is skipped, by the parser and by
    /// Codable decoding, without failing the rest.
    @Test func penMarkupRoundTripsAndUnknownShapesAreSkipped() throws {
        let json = #"""
            {"version":1,"shapes":[{"type":"pen","color":"red","points":[[0.1,0.2],[0.3,0.4]]},
            {"type":"hologram","color":"red","z":1},{"type":"circle","color":"white","cx":0.5,"cy":0.5,"rx":0.1,"ry":0.1}]}
            """#
        let decoded = try JSONDecoder().decode(Markup.self, from: Data(json.utf8))
        let pen = MarkupShape.pen(color: .red, points: [MarkupPoint(x: 0.1, y: 0.2), MarkupPoint(x: 0.3, y: 0.4)])
        #expect(decoded.shapes == [pen, .circle(color: .white, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1)])
        #expect(parseMarkup(try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))) == decoded)
        let again = try JSONDecoder().decode(Markup.self, from: JSONEncoder().encode(decoded))
        #expect(again == decoded)
        let stored = try JSONValue(encoding: pen)
        #expect(stored == ["type": "pen", "color": "red", "points": [[0.1, 0.2], [0.3, 0.4]]])
    }

    @Test func signatures() {
        checkRule(module, "SIGNATURE_PURPOSE_LABELS") { _ in labelTable(\SignaturePurpose.label) }
        checkRule(module, "MIN_INK") { _ in minInk }
        checkRule(module, "enabledSignaturePurposes") { c in enabledSignaturePurposes(try c.arg(0, as: JSONValue?.self))
        }
        checkRule(module, "REPORT_BLOCKS") { _ in reportBlocks }
        checkRule(module, "PEN_POINTS_MAX") { _ in Markup.penPointsMax }
        checkRule(module, "penShape") { c in penShape(try c.arg(0), try c.arg(1)) }
        checkRule(module, "penPath") { c in
            penPath(
                try c.arg(0, as: [[Double]].self).map { MarkupPoint(x: $0[0], y: $0[1]) }, try c.arg(1), try c.arg(2))
        }
        checkRule(module, "testOutcomeLabel") { c in testOutcomeLabel(try c.arg(0, as: String?.self)) }
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
