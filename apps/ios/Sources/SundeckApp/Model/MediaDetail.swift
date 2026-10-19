import Foundation
import SundeckCore
import SundeckSync

// The media viewer's text and the markup editor's state, kept out of SwiftUI so they're tested on
// Linux. Port of apps/mobile/src/app/(app)/jobs/[id]/media/[mediaId].tsx.

/// One line of a capture's record.
public struct MediaDetailRow: Equatable, Sendable {
    public var label: String
    public var value: String
}

/// What the viewer says about a capture.
public enum MediaDetail {
    /// The capture's row, if this phone has it (deleted rows included, as Expo's useRow).
    @MainActor
    public static func load(_ sync: SyncService, _ mediaId: String) -> Media? {
        guard let row = (try? sync.store.get("media", mediaId)) ?? nil else { return nil }
        return try? JSONValue.object(row).decode(Media.self)
    }

    /// A photo's height / width, 0.75 when its size isn't known (as Expo).
    public static func photoRatio(_ media: Media) -> Double {
        guard let w = media.width, let h = media.height, w != 0, h != 0 else { return 0.75 }
        return h / w
    }

    /// "photo", "video" or "voice note", for sentences.
    public static func kindName(_ kind: MediaKind) -> String { kind.label.lowercased() }

    /// What the capture belongs to: the finding's title, the item's label, a test, or the job.
    public static func attachedTo(_ media: Media, _ inspection: JobInspection) -> String {
        if let id = media.findingId, let title = inspection.findings.first(where: { $0.id == id })?.title,
            !title.isEmpty
        {
            return title
        }
        if let id = media.jobComponentId, let label = inspection.componentById[id]?.label, !label.isEmpty {
            return label
        }
        if media.testResultId != nil { return "A test" }
        return "The job"
    }

    /// The capture time in the company's time zone, as `toLocaleString()` writes it in en-US
    /// ("10/19/2026, 3:04:05 PM"), or "Unknown".
    public static func captured(_ capturedAt: String?, timeZone: String) -> String {
        guard let capturedAt, let date = parseISODate(capturedAt) else { return "Unknown" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZone) ?? .current
        formatter.dateFormat = "M/d/yyyy, h:mm:ss a"
        return formatter.string(from: date)
    }

    public static func location(_ media: Media) -> String {
        guard let lat = media.latitude, let lng = media.longitude else { return "Not recorded" }
        return "\(fixed5(lat)), \(fixed5(lng))"
    }

    /// Bytes, pixel size and length, the ones known, joined by " · ".
    public static func size(_ media: Media) -> String {
        var parts = [formatBytes(media.sizeBytes)]
        if let w = media.width, let h = media.height, w != 0, h != 0 {
            parts.append("\(plainNumber(w)) × \(plainNumber(h))")
        }
        if let ms = media.durationMs, ms != 0 { parts.append(formatDuration(ms)) }
        return parts.joined(separator: " · ")
    }

    public static func upload(_ media: Media) -> String {
        media.uploadState == .uploaded ? "Uploaded" : "Waiting to upload (saved on this phone)"
    }

    public static func fingerprint(_ media: Media) -> String {
        guard let sha = media.sha256, !sha.isEmpty else { return "None" }
        return "SHA-256 \(sha.prefix(16))…"
    }

    /// The record's rows, in Expo's order.
    public static func rows(_ media: Media, _ inspection: JobInspection, timeZone: String) -> [MediaDetailRow] {
        [
            MediaDetailRow(label: "Attached to", value: attachedTo(media, inspection)),
            MediaDetailRow(label: "Captured", value: captured(media.capturedAt, timeZone: timeZone)),
            MediaDetailRow(label: "Location", value: location(media)),
            MediaDetailRow(label: "Size", value: size(media)),
            MediaDetailRow(label: "Upload", value: upload(media)),
            MediaDetailRow(label: "Fingerprint", value: fingerprint(media)),
        ]
    }

    /// A voice note's transcript, or where it stands.
    public static func transcript(_ media: Media) -> String {
        switch media.transcriptStatus {
        case .done:
            let text = media.transcript ?? ""
            return text.isEmpty ? "(No speech heard.)" : text
        case .pending: return "Transcribing…"
        case .failed: return "Transcription failed. The office can retry it."
        case .none:
            return media.uploadState == .uploaded
                ? "Not transcribed yet." : "Transcribed after the recording uploads."
        }
    }

    /// The transcript is real text (shown as body), not a status (shown muted).
    public static func transcriptIsText(_ media: Media) -> Bool { media.transcriptStatus == .done }

    /// The viewer's button under a photo.
    public static func markupButton(_ media: Media) -> String {
        parseMarkup(media.markup).shapes.isEmpty ? "Mark Up" : "Edit Markup"
    }

    /// Title of the delete confirmation (features/media/remove.ts).
    public static func deleteTitle(_ kind: MediaKind) -> String { "Delete this \(kindName(kind))?" }
    public static let deleteMessage = "It is removed from the job and its reports."

    /// Shown while a capture that isn't on this phone downloads, or when it can't be reached.
    public static func loadingText(_ kind: MediaKind) -> String { "Loading the \(kindName(kind))…" }
    public static func unavailableText(_ kind: MediaKind) -> String {
        "This \(kindName(kind)) isn’t on this phone. It downloads when you have a connection."
    }

    /// Whether the caption field's text differs from what's saved (trimmed, as Expo compares).
    public static func captionChanged(_ media: Media, _ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines) != (media.caption ?? "")
    }

    private static func fixed5(_ value: Double) -> String { String(format: "%.5f", value) }

    /// A whole number without ".0", as JavaScript prints it.
    private static func plainNumber(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : String(value)
    }
}

/// Parses an ISO time with or without fractional seconds.
func parseISODate(_ text: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: text) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: text)
}

// MARK: - Markup editing

/// The markup editor's tools.
public enum MarkupTool: String, CaseIterable, Sendable {
    case arrow, circle, text

    public var label: String {
        switch self {
        case .arrow: "Arrow"
        case .circle: "Circle"
        case .text: "Text"
        }
    }

    /// Under the tools, for arrow and circle.
    public var hint: String? {
        switch self {
        case .arrow: "Tap to place an arrow, or drag to draw one."
        case .circle: "Tap to place a circle, or drag to draw one."
        case .text: nil
        }
    }
}

extension MarkupColor {
    /// The swatch's accessibility name.
    public var label: String {
        switch self {
        case .red: "Red"
        case .yellow: "Yellow"
        case .white: "White"
        }
    }
}

/// The markup being drawn. Every change is a new history entry, so Undo also brings back a Clear
/// All. Points are fractions (0..1) of the photo's width and height, as Expo stores them.
public struct MarkupDraft: Equatable, Sendable {
    public private(set) var history: [[MarkupShape]]
    public var tool: MarkupTool = .arrow
    public var color: MarkupColor = .red
    /// The text tool's label.
    public var label = "" {
        didSet { if !ECMATrim.isBlank(label) { labelError = nil } }
    }
    public private(set) var labelError: String?
    /// The photo's width / height (Expo's 1 / ratio), so a tapped circle is round on screen.
    public var aspect: Double

    public static let labelMissing = "Type the label first."
    public static let labelHint = "Then tap the photo where it goes."
    public static let labelPlaceholder = "Crack"

    public init(saved: [MarkupShape], width: Double?, height: Double?) {
        history = [saved]
        if let width, let height, width != 0, height != 0 {
            aspect = width / height
        } else {
            aspect = 1 / 0.75
        }
    }

    /// What's on the photo now.
    public var shapes: [MarkupShape] { history[history.count - 1] }
    /// Changed since the editor opened (Cancel then asks first).
    public var isDirty: Bool { history.count > 1 }
    public var canUndo: Bool { isDirty }
    public var canClear: Bool { !shapes.isEmpty }

    /// The shape a drag in progress would make (drawn live; nil for text or a tiny drag).
    public func live(from start: MarkupPoint, to end: MarkupPoint) -> MarkupShape? {
        guard let gesture = gesture else { return nil }
        return shapeFromDrag(gesture, color, start, end)
    }

    /// A finger lifted: a text label where it started, or the drag's shape, or a tap's
    /// default-sized shape.
    public mutating func release(from start: MarkupPoint, to end: MarkupPoint) {
        guard let gesture else {
            if let shape = textShape(color, start, label) {
                push(shapes + [shape])
                labelError = nil
            } else {
                labelError = Self.labelMissing
            }
            return
        }
        let shape = shapeFromDrag(gesture, color, start, end) ?? shapeAtTap(gesture, color, start, aspect)
        push(shapes + [shape])
    }

    public mutating func undo() {
        if history.count > 1 { history.removeLast() }
    }

    public mutating func clearAll() { push([]) }

    /// What Save writes: nil when nothing's drawn, so the row's markup is cleared.
    public var markup: Markup? { shapes.isEmpty ? nil : Markup(shapes: shapes) }

    private var gesture: MarkupGesture? {
        switch tool {
        case .arrow: .arrow
        case .circle: .circle
        case .text: nil
        }
    }

    private mutating func push(_ next: [MarkupShape]) { history.append(next) }
}

/// JavaScript's `trim()` emptiness check for the label (Expo clears the error when `v.trim()`).
enum ECMATrim {
    static func isBlank(_ s: String) -> Bool { s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

extension MediaWrites {
    /// Saves the caption when it changed (blank becomes null); returns whether it wrote.
    @discardableResult
    public static func saveCaptionIfChanged(_ sync: SyncService, _ media: Media, _ text: String) throws -> Bool {
        guard MediaDetail.captionChanged(media, text) else { return false }
        try setCaption(sync, media, text)
        return true
    }
}
