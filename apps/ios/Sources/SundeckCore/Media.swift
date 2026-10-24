import Foundation

// Photos, videos, and voice notes (BUILD_PLAN 4.5). Originals are evidence: they are
// never edited. Markup is vector data stored on the media row and drawn on top.

/// What a media row holds. Port of media.ts.
public enum MediaKind: String, Codable, CaseIterable, Sendable {
    case photo, video, audio

    public var label: String {
        switch self {
        case .photo: "Photo"
        case .video: "Video"
        case .audio: "Voice Note"
        }
    }
}

public enum MediaUploadState: String, Codable, CaseIterable, Sendable {
    case pending, uploaded
}

public enum TranscriptStatus: String, Codable, CaseIterable, Sendable {
    case none, pending, done, failed
}

/// A synced `media` row. `markup` is kept as stored JSON; read it with `parseMarkup`. A capture
/// saved offline has no `created_at` or `transcript_status` until the server fills them in.
public struct Media: Codable, Equatable, Sendable {
    public var id: String
    public var companyId: String
    public var jobId: String
    public var findingId: String?
    public var jobComponentId: String?
    public var testResultId: String?
    public var kind: MediaKind
    public var storagePath: String?
    public var uploadState: MediaUploadState
    public var mimeType: String?
    public var sizeBytes: Int?
    public var sha256: String?
    public var width: Double?
    public var height: Double?
    public var durationMs: Double?
    public var capturedAt: String?
    public var latitude: Double?
    public var longitude: Double?
    public var markup: JSONValue?
    public var caption: String?
    public var transcript: String?
    public var transcriptStatus: TranscriptStatus
    public var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, sha256, width, height, latitude, longitude, markup, caption, transcript
        case companyId = "company_id"
        case jobId = "job_id"
        case findingId = "finding_id"
        case jobComponentId = "job_component_id"
        case testResultId = "test_result_id"
        case storagePath = "storage_path"
        case uploadState = "upload_state"
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case durationMs = "duration_ms"
        case capturedAt = "captured_at"
        case transcriptStatus = "transcript_status"
        case createdAt = "created_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        companyId = try c.decode(String.self, forKey: .companyId)
        jobId = try c.decode(String.self, forKey: .jobId)
        findingId = try c.decodeIfPresent(String.self, forKey: .findingId)
        jobComponentId = try c.decodeIfPresent(String.self, forKey: .jobComponentId)
        testResultId = try c.decodeIfPresent(String.self, forKey: .testResultId)
        kind = try c.decode(MediaKind.self, forKey: .kind)
        storagePath = try c.decodeIfPresent(String.self, forKey: .storagePath)
        // Not yet uploaded, or a state from a newer server: treat as waiting.
        uploadState = (try? c.decodeIfPresent(MediaUploadState.self, forKey: .uploadState)) ?? .pending
        mimeType = try c.decodeIfPresent(String.self, forKey: .mimeType)
        sizeBytes = try c.decodeIfPresent(Int.self, forKey: .sizeBytes)
        sha256 = try c.decodeIfPresent(String.self, forKey: .sha256)
        width = try c.decodeIfPresent(Double.self, forKey: .width)
        height = try c.decodeIfPresent(Double.self, forKey: .height)
        durationMs = try c.decodeIfPresent(Double.self, forKey: .durationMs)
        capturedAt = try c.decodeIfPresent(String.self, forKey: .capturedAt)
        latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        markup = try c.decodeIfPresent(JSONValue.self, forKey: .markup)
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        transcript = try c.decodeIfPresent(String.self, forKey: .transcript)
        transcriptStatus =
            (try? c.decodeIfPresent(TranscriptStatus.self, forKey: .transcriptStatus)) ?? TranscriptStatus.none
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

/// Capture settings. Photos are resized on the device; videos use the camera's medium preset.
public enum MediaLimits {
    public static let photoLongEdge = 2048
    public static let photoQuality = 0.7
    public static let videoMaxSeconds = 60
    public static let voiceMaxSeconds = 300
}

/// What each storage bucket takes (security review M2; the buckets' file_size_limit and
/// allowed_mime_types). Port of core's UPLOAD_LIMITS.
public enum UploadBucket: Sendable {
    case media
    case texts
    case logo

    public var maxBytes: Int {
        switch self {
        case .media: return 50 * 1024 * 1024
        case .texts: return 10 * 1024 * 1024
        case .logo: return 2 * 1024 * 1024
        }
    }
}

/// Why the storage server refused an upload, when it's one a person can fix. Port of core's
/// uploadRefusal.
public enum UploadRefusal: Equatable, Sendable {
    case tooLarge
    case wrongType
    case readOnly

    /// 413 too large, 415 a type the bucket doesn't take, or the row rule that keeps a read-only
    /// shop from adding files. Nil for anything else (offline, a server error).
    public init?(status: Int?, message: String?) {
        let text = (message ?? "").lowercased()
        if status == 413 || text.contains("maximum allowed size") || text.contains("too large")
            || text.contains("maximum size exceeded")
        {
            self = .tooLarge
        } else if status == 415 || text.contains("mime type") || text.contains("invalid_mime_type")
            || text.contains("invalidmimetype")
        {
            self = .wrongType
        } else if text.contains("row-level security") {
            self = .readOnly
        } else {
            return nil
        }
    }

    /// The message, in the same words on every platform (core's uploadRefusalMessage).
    public func message(_ bucket: UploadBucket) -> String {
        if self == .readOnly {
            return "This shop is read-only until the subscription is paid, so files can’t be added yet."
        }
        switch bucket {
        case .logo:
            return self == .tooLarge ? "Use a file under 2 MB." : "Use a PNG, JPEG, or SVG file."
        case .texts:
            return self == .tooLarge
                ? "That picture is too large to send. Each one can be up to 10 MB."
                : "Send photos (JPEG, PNG, or HEIC)."
        case .media:
            return self == .tooLarge
                ? "That file is too large to upload (50 MB at most). For a video, record a shorter clip."
                : "That type of file can’t be uploaded. Use a photo (JPEG, PNG, or HEIC), a video (MP4 or MOV), or a voice note."
        }
    }
}

/// MIME type to file extension, in the TypeScript table's order (the first match wins when
/// guessing a MIME type from an extension).
private let extensions: [(mime: String, ext: String)] = [
    ("image/jpeg", "jpg"),
    ("image/png", "png"),
    ("image/heic", "heic"),
    ("video/mp4", "mp4"),
    ("video/quicktime", "mov"),
    ("video/webm", "webm"),
    ("audio/mp4", "m4a"),
    ("audio/m4a", "m4a"),
    ("audio/x-m4a", "m4a"),
    ("audio/aac", "aac"),
    ("audio/mpeg", "mp3"),
    ("audio/wav", "wav"),
    ("audio/webm", "webm"),
    ("audio/ogg", "ogg"),
]

/// Thrown for a MIME type the app doesn't store.
public struct UnsupportedMediaType: Error, CustomStringConvertible {
    public let mime: String
    public var description: String { "Unsupported media type: \(mime)" }
}

public func extensionForMime(_ mime: String) throws -> String {
    let lower = mime.lowercased()
    guard let found = extensions.first(where: { $0.mime == lower }) else { throw UnsupportedMediaType(mime: mime) }
    return found.ext
}

/// Guess a MIME type from a file name, for pickers that do not report one.
public func mimeFromFileName(_ name: String, _ kind: MediaKind) -> String {
    let ext = name.split(separator: ".", omittingEmptySubsequences: false).last.map { $0.lowercased() }
    if let found = extensions.first(where: { $0.ext == ext }) { return found.mime }
    switch kind {
    case .photo: return "image/jpeg"
    case .video: return "video/mp4"
    case .audio: return "audio/mp4"
    }
}

/// Object path inside the `media` bucket. The first folder is the company (storage RLS).
public func mediaStoragePath(_ companyId: String, _ jobId: String, _ mediaId: String, _ mime: String) throws
    -> String
{
    "\(companyId)/\(jobId)/\(mediaId).\(try extensionForMime(mime))"
}

public struct MediaSize: Codable, Equatable, Sendable {
    public let width: Double
    public let height: Double
}

/// Size that fits within `maxEdge` on the long side, or nil when no resize is needed.
public func fitWithin(_ width: Double, _ height: Double, _ maxEdge: Double) -> MediaSize? {
    let long = max(width, height)
    if long <= maxEdge || long == 0 { return nil }
    let scale = maxEdge / long
    return MediaSize(width: ECMA.round(width * scale), height: ECMA.round(height * scale))
}

public func formatDuration(_ ms: Double?) -> String {
    let total = Int(max(0, ECMA.round((ms ?? 0) / 1000)))
    let s = total % 60
    return "\(total / 60):\(s < 10 ? "0" : "")\(s)"
}

public func formatBytes(_ bytes: Int?) -> String {
    let b = bytes ?? 0
    if b < 1024 { return "\(b) B" }
    if b < 1024 * 1024 { return "\(Int(ECMA.round(Double(b) / 1024))) KB" }
    // toFixed(1): the nearest tenth of the exact value, ties up.
    let tenths = (b * 10 + 524_288) / 1_048_576
    return "\(tenths / 10).\(tenths % 10) MB"
}

// MARK: - Markup

/// Annotation colors. Values live in brand/tokens.json (color.markup).
public enum MarkupColor: String, Codable, CaseIterable, Sendable {
    case red, yellow, white
}

/// The shapes a drag or a tap makes.
public enum MarkupGesture: String, Codable, CaseIterable, Sendable {
    case arrow, circle
}

/// A point as fractions (0..1) of the image width (x) and height (y).
public struct MarkupPoint: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// Coordinates are fractions (0..1) of the image width (x) and height (y), so markup lines
/// up at any display size, on the phone, the office view, and the PDF.
public enum MarkupShape: Codable, Equatable, Sendable {
    case arrow(color: MarkupColor, x1: Double, y1: Double, x2: Double, y2: Double)
    case circle(color: MarkupColor, cx: Double, cy: Double, rx: Double, ry: Double)
    /// Text centered on (x, y); `s` is its size (owner, 2026-10-20: "adjust text location and
    /// size"), 0.5 to 3, nil for the standard size 1.
    case text(color: MarkupColor, x: Double, y: Double, text: String, s: Double? = nil)
    /// Freehand (owner, 2026-10-19: "Mark up should have a pen"): stored as `points: [[x, y]]`.
    case pen(color: MarkupColor, points: [MarkupPoint])

    enum CodingKeys: String, CodingKey {
        case type, color, x1, y1, x2, y2, cx, cy, rx, ry, x, y, text, points, s
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let color = try c.decode(MarkupColor.self, forKey: .color)
        func d(_ key: CodingKeys) throws -> Double { try c.decode(Double.self, forKey: key) }
        switch try c.decode(String.self, forKey: .type) {
        case "arrow": self = .arrow(color: color, x1: try d(.x1), y1: try d(.y1), x2: try d(.x2), y2: try d(.y2))
        case "circle": self = .circle(color: color, cx: try d(.cx), cy: try d(.cy), rx: try d(.rx), ry: try d(.ry))
        case "text":
            self = .text(
                color: color, x: try d(.x), y: try d(.y), text: try c.decode(String.self, forKey: .text),
                s: try c.decodeIfPresent(Double.self, forKey: .s))
        case "pen":
            let pairs = try c.decode([[Double]].self, forKey: .points)
            self = .pen(color: color, points: pairs.filter { $0.count >= 2 }.map { MarkupPoint(x: $0[0], y: $0[1]) })
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c, debugDescription: "Unknown markup shape \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .arrow(let color, let x1, let y1, let x2, let y2):
            try c.encode("arrow", forKey: .type)
            try c.encode(color, forKey: .color)
            try c.encode(x1, forKey: .x1)
            try c.encode(y1, forKey: .y1)
            try c.encode(x2, forKey: .x2)
            try c.encode(y2, forKey: .y2)
        case .circle(let color, let cx, let cy, let rx, let ry):
            try c.encode("circle", forKey: .type)
            try c.encode(color, forKey: .color)
            try c.encode(cx, forKey: .cx)
            try c.encode(cy, forKey: .cy)
            try c.encode(rx, forKey: .rx)
            try c.encode(ry, forKey: .ry)
        case .text(let color, let x, let y, let text, let size):
            try c.encode("text", forKey: .type)
            try c.encode(color, forKey: .color)
            try c.encode(x, forKey: .x)
            try c.encode(y, forKey: .y)
            try c.encode(text, forKey: .text)
            try c.encodeIfPresent(size, forKey: .s)
        case .pen(let color, let points):
            try c.encode("pen", forKey: .type)
            try c.encode(color, forKey: .color)
            try c.encode(points.map { [$0.x, $0.y] }, forKey: .points)
        }
    }
}

public struct Markup: Codable, Equatable, Sendable {
    public var version = 1
    public var shapes: [MarkupShape]

    public init(shapes: [MarkupShape]) { self.shapes = shapes }

    /// Decoding goes through `parseMarkup`, so a shape this app doesn't know (from a newer app)
    /// is skipped instead of failing the whole markup.
    public init(from decoder: Decoder) throws {
        self = parseMarkup(try JSONValue(from: decoder))
    }

    enum CodingKeys: String, CodingKey { case version, shapes }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(shapes, forKey: .shapes)
    }

    /// The most points one pen stroke keeps (after thinning).
    public static let penPointsMax = 400

    public static let empty = Markup(shapes: [])
    /// The longest text label, in UTF-16 code units like the TypeScript.
    public static let textMax = 80
}

private func unit(_ value: JSONValue?) -> Double? {
    guard let v = value?.number, v >= 0, v <= 1 else { return nil }
    return v
}

private func validShape(_ s: JSONValue) -> MarkupShape? {
    guard let color = s["color"]?.string.flatMap(MarkupColor.init(rawValue:)) else { return nil }
    switch s["type"]?.string {
    case "arrow":
        guard let x1 = unit(s["x1"]), let y1 = unit(s["y1"]), let x2 = unit(s["x2"]), let y2 = unit(s["y2"])
        else { return nil }
        return .arrow(color: color, x1: x1, y1: y1, x2: x2, y2: y2)
    case "circle":
        guard let cx = unit(s["cx"]), let cy = unit(s["cy"]), let rx = unit(s["rx"]), let ry = unit(s["ry"])
        else { return nil }
        return .circle(color: color, cx: cx, cy: cy, rx: rx, ry: ry)
    case "text":
        let text = s["text"]?.string.map { String(utf16Prefix: ECMA.trim($0), Markup.textMax) } ?? ""
        guard let x = unit(s["x"]), let y = unit(s["y"]), !text.isEmpty else { return nil }
        let size = clampTextSize(s["s"])
        return .text(color: color, x: x, y: y, text: text, s: size == 1 ? nil : size)
    case "pen":
        guard let raw = s["points"]?.array else { return nil }
        let points =
            raw
            .compactMap { p -> MarkupPoint? in
                guard let pair = p.array, pair.count >= 1, let x = unit(pair[0]),
                    let y = unit(pair.count > 1 ? pair[1] : nil)
                else { return nil }
                return MarkupPoint(x: x, y: y)
            }
            .prefix(Markup.penPointsMax)
        return points.count >= 2 ? .pen(color: color, points: Array(points)) : nil
    default:
        return nil
    }
}

/// Read markup from a synced row. Anything unrecognized is dropped, never thrown.
public func parseMarkup(_ value: JSONValue?) -> Markup {
    guard let shapes = value?["shapes"]?.array else { return .empty }
    return Markup(shapes: shapes.compactMap(validShape))
}

private func clampUnit(_ v: Double) -> Double { ECMA.round(min(max(v, 0), 1) * 10000) / 10000 }

public let markupTextSizeMin = 0.5
public let markupTextSizeMax = 3.0

/// A text size kept within bounds, to two decimals; 1 for anything that isn't a number.
public func clampTextSize(_ s: JSONValue?) -> Double {
    guard case .number(let n)? = s, n.isFinite else { return 1 }
    return clampTextSize(n)
}

public func clampTextSize(_ n: Double) -> Double {
    ECMA.round(min(markupTextSizeMax, max(markupTextSizeMin, n.isFinite ? n : 1)) * 100) / 100
}

/// A text label moved to `at` (dragged), kept on the photo. Other shapes come back unchanged.
public func moveText(_ shape: MarkupShape, _ at: MarkupPoint) -> MarkupShape {
    guard case .text(let color, _, _, let text, let size) = shape else { return shape }
    return .text(color: color, x: clampUnit(at.x), y: clampUnit(at.y), text: text, s: size)
}

/// A text label at a new size (pinched, or the size control), kept within bounds.
public func resizeText(_ shape: MarkupShape, _ size: Double) -> MarkupShape {
    guard case .text(let color, let x, let y, let text, _) = shape else { return shape }
    let s = clampTextSize(size)
    return .text(color: color, x: x, y: y, text: text, s: s == 1 ? nil : s)
}

/// Build a shape from a drag gesture (start and end as fractions of the image).
public func shapeFromDrag(_ type: MarkupGesture, _ color: MarkupColor, _ start: MarkupPoint, _ end: MarkupPoint)
    -> MarkupShape?
{
    let a = MarkupPoint(x: clampUnit(start.x), y: clampUnit(start.y))
    let b = MarkupPoint(x: clampUnit(end.x), y: clampUnit(end.y))
    // Ignore taps and tiny drags: 2% of the image in both directions.
    if abs(a.x - b.x) < 0.02 && abs(a.y - b.y) < 0.02 { return nil }
    if type == .arrow { return .arrow(color: color, x1: a.x, y1: a.y, x2: b.x, y2: b.y) }
    return .circle(
        color: color,
        cx: clampUnit((a.x + b.x) / 2),
        cy: clampUnit((a.y + b.y) / 2),
        rx: clampUnit(max(abs(a.x - b.x) / 2, 0.01)),
        ry: clampUnit(max(abs(a.y - b.y) / 2, 0.01)))
}

/// A pen stroke from the points of a drag (fractions of the image). Points closer than 0.4% of
/// the image to the last kept one are dropped, so a stroke stays small. Nil for a tap.
public func penShape(_ color: MarkupColor, _ points: [MarkupPoint]) -> MarkupShape? {
    var kept: [MarkupPoint] = []
    for p in points {
        let q = MarkupPoint(x: clampUnit(p.x), y: clampUnit(p.y))
        if let last = kept.last, hypot(q.x - last.x, q.y - last.y) < 0.004 { continue }
        kept.append(q)
    }
    guard kept.count >= 2 else { return nil }
    // Too long: keep every nth point, and always the last.
    let step = Int((Double(kept.count) / Double(Markup.penPointsMax)).rounded(.up))
    let thin =
        step > 1
        ? kept.enumerated().filter { $0.offset % step == 0 || $0.offset == kept.count - 1 }.map(\.element) : kept
    return .pen(color: color, points: Array(thin.prefix(Markup.penPointsMax)))
}

/// An SVG path for a pen stroke in a width x height space ("M12 30 L14.5 31 ...").
public func penPath(_ points: [MarkupPoint], _ width: Double, _ height: Double) -> String {
    points.enumerated().map { i, p in
        "\(i == 0 ? "M" : "L")\(ECMA.numberString(ECMA.round(p.x * width * 10) / 10)) "
            + ECMA.numberString(ECMA.round(p.y * height * 10) / 10)
    }
    .joined(separator: " ")
}

public func textShape(_ color: MarkupColor, _ at: MarkupPoint, _ text: String) -> MarkupShape? {
    validShape(
        .object([
            "type": .string("text"), "color": .string(color.rawValue), "x": .number(clampUnit(at.x)),
            "y": .number(clampUnit(at.y)), "text": .string(text),
        ]))
}

/// Arrow head points (in display pixels) for an arrow from (x1,y1) to (x2,y2).
public func arrowHead(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ size: Double) -> [SIMD2<Double>] {
    let angle = atan2(y2 - y1, x2 - x1)
    let spread = Double.pi / 7
    return [
        SIMD2(x2, y2),
        SIMD2(x2 - size * cos(angle - spread), y2 - size * sin(angle - spread)),
        SIMD2(x2 - size * cos(angle + spread), y2 - size * sin(angle + spread)),
    ]
}

/// How a markup arrow is drawn (owner, 2026-10-19: "the mockup arrow looks strange"): a wider
/// head, and a shaft that stops inside the head, so the head's point stays sharp. `unit` is the
/// drawing's width / 400.
public struct ArrowShape: Codable, Equatable, Sendable {
    public var shaftEnd: [Double]
    public var head: [[Double]]
}

public func arrowShape(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ unit: Double) -> ArrowShape {
    let size = max(14, 30 * unit)
    let angle = atan2(y2 - y1, x2 - x1)
    let spread = Double.pi / 6
    let length = hypot(x2 - x1, y2 - y1)
    // The shaft ends 60% of the way into the head (never behind where it starts).
    let back = min(size * 0.6, length)
    return ArrowShape(
        shaftEnd: [x2 - back * cos(angle), y2 - back * sin(angle)],
        head: [
            [x2, y2],
            [x2 - size * cos(angle - spread), y2 - size * sin(angle - spread)],
            [x2 - size * cos(angle + spread), y2 - size * sin(angle + spread)],
        ])
}

/// A default shape for a tap (no drag): a circle around the tap, or an arrow pointing at it
/// from up and to the left (from the other side when the tap is near that edge).
/// `aspect` is the photo's width / height, so the circle is round on screen.
public func shapeAtTap(_ type: MarkupGesture, _ color: MarkupColor, _ at: MarkupPoint, _ aspect: Double)
    -> MarkupShape
{
    let x = clampUnit(at.x)
    let y = clampUnit(at.y)
    let dx = 0.15
    let dy = 0.15 * aspect
    if type == .circle { return .circle(color: color, cx: x, cy: y, rx: 0.08, ry: clampUnit(0.08 * aspect)) }
    let x1 = x - dx >= 0 ? x - dx : x + dx
    let y1 = y - dy >= 0 ? y - dy : y + dy
    return .arrow(color: color, x1: clampUnit(x1), y1: clampUnit(y1), x2: x, y2: y)
}
