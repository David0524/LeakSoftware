import Foundation

// Undo instead of "Are you sure?" (owner, 2026-10-26: Apple principle 1;
// docs/design/2026-10-26-undo.md). Taking something off a visit that can be put back happens at
// once and says so for five seconds with Undo; Undo clears `deleted_at` on the same rows,
// through the same sync path. Port of packages/core/src/removal.ts.

/// What was removed, for the banner's line.
public enum RemovedKind: String, CaseIterable, Sendable {
    case checklistItem, chemical, readings, photo, video, voiceNote, test, finding, repair

    /// One short line: "Photo removed".
    public var text: String {
        switch self {
        case .checklistItem: "Item removed"
        case .chemical: "Chemical removed"
        case .readings: "Readings removed"
        case .photo: "Photo removed"
        case .video: "Video removed"
        case .voiceNote: "Voice note removed"
        case .test: "Test removed"
        case .finding: "Finding removed"
        case .repair: "Repair removed"
        }
    }

    /// What a removed photo, video or voice note is called (`removedKindOfMedia`).
    public init(media kind: MediaKind) {
        switch kind {
        case .photo: self = .photo
        case .video: self = .video
        case .audio: self = .voiceNote
        }
    }

    /// Keyed as `REMOVED_TEXT`.
    public static let all: [String: String] = Dictionary(uniqueKeysWithValues: allCases.map { ($0.rawValue, $0.text) })
}

/// The banner's button, and how long it stays.
public enum RemovedUndo {
    public static let label = "Undo"
    public static let seconds = 5
}
