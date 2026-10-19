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

    /// The delete confirmation, as the website asks it (spec 3.15): "Remove this photo from the
    /// job?", "The original stays on file.", Delete Photo.
    public static func deleteTitle(_ kind: MediaKind) -> String { "Remove this \(kindName(kind)) from the job?" }
    public static let deleteMessage = "The original stays on file."
    public static func deleteButton(_ kind: MediaKind) -> String { "Delete \(kind.label)" }

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

// MARK: - The job's Photos section

/// What a capture can be attached to from the Photos section's "Attach to" (spec 5.4 Photos):
/// the whole job, a finding, a checklist item or a test.
public struct CaptureTargetOption: Equatable, Sendable, Identifiable {
    public var target: MediaTarget
    /// "Whole job", "Finding: Skimmer seam leak", "Skimmer", "Test: Pressure test"
    public var label: String

    public var id: String { label + (target.findingId ?? target.componentId ?? target.testResultId ?? "") }
}

/// One capture's card in the Photos section, as the website shows it.
public struct MediaCardText: Equatable, Sendable {
    /// "Photo · Skimmer", with " · 0:42" for recordings.
    public var heading: String
    public var caption: String?
    /// A voice note's words, in quotes.
    public var transcript: String?
    /// "9:40 AM · location recorded"
    public var meta: String
    /// When the file isn't on this phone or uploaded yet: "Photo still uploading from the phone".
    public var stillUploading: String
    public var markupButton: String?
}

public enum JobPhotos {
    public static let empty = "No photos or recordings yet."

    /// "Attach to": Whole job first, then each finding, each checklist item and each test.
    public static func targets(_ inspection: JobInspection, _ config: InspectionConfig, jobId: String)
        -> [CaptureTargetOption]
    {
        var options = [CaptureTargetOption(target: MediaTarget(jobId: jobId), label: "Whole job")]
        options += inspection.findings.map {
            CaptureTargetOption(target: MediaTarget(jobId: jobId, findingId: $0.id), label: "Finding: \($0.title)")
        }
        options += inspection.components.map {
            CaptureTargetOption(target: MediaTarget(jobId: jobId, componentId: $0.id), label: $0.label)
        }
        options += inspection.tests.map {
            CaptureTargetOption(
                target: MediaTarget(jobId: jobId, testResultId: $0.id),
                label: "Test: \(config.testTypeById[$0.testTypeId]?.name ?? "Test")")
        }
        return options
    }

    /// The "Attach to" choice shows only when there's something besides the whole job.
    public static func showsTargets(_ options: [CaptureTargetOption]) -> Bool { options.count > 1 }

    /// What it's attached to, in the website's words: the finding, the item, "Test" or "Job".
    public static func attached(_ media: Media, _ inspection: JobInspection) -> String {
        if let id = media.findingId, let f = inspection.findings.first(where: { $0.id == id }), !f.title.isEmpty {
            return f.title
        }
        if let id = media.jobComponentId, let label = inspection.componentById[id]?.label, !label.isEmpty {
            return label
        }
        return media.testResultId != nil ? "Test" : "Job"
    }

    public static func card(_ media: Media, _ inspection: JobInspection, timeZone: String, now: Date = Date())
        -> MediaCardText
    {
        var heading = "\(media.kind.label) · \(attached(media, inspection))"
        if let ms = media.durationMs, ms > 0 { heading += " · \(formatDuration(ms))" }
        let caption = media.caption.flatMap { $0.isEmpty ? nil : $0 }
        let transcript =
            media.kind == .audio && media.transcriptStatus == .done && !(media.transcript ?? "").isEmpty
            ? "“\(media.transcript ?? "")”" : nil
        var meta = media.capturedAt.flatMap { try? formatSchedule($0, now, timeZone) } ?? ""
        if media.latitude != nil { meta += meta.isEmpty ? "Location recorded" : " · location recorded" }
        return MediaCardText(
            heading: heading, caption: caption, transcript: transcript, meta: meta,
            stillUploading: "\(media.kind.label) still uploading from the phone",
            markupButton: media.kind == .photo ? MediaDetail.markupButton(media) : nil)
    }

    /// The status line under the capture tiles: "Uploading voice note…", then "Voice note added."
    public static func saving(_ kind: MediaKind) -> String { "Saving \(MediaDetail.kindName(kind))…" }
    public static func added(_ kind: MediaKind) -> String {
        let name = MediaDetail.kindName(kind)
        return name.prefix(1).uppercased() + name.dropFirst() + " added."
    }
}
