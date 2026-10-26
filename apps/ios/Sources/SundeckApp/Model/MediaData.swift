import Foundation
import SundeckCore
import SundeckSync

/// What a capture is attached to. Job-level captures have no other link. Port of MediaTarget in
/// apps/mobile/src/data/media.ts.
public struct MediaTarget: Hashable, Sendable {
    public var jobId: String
    public var findingId: String?
    public var componentId: String?
    public var testResultId: String?

    public init(jobId: String, findingId: String? = nil, componentId: String? = nil, testResultId: String? = nil) {
        self.jobId = jobId
        self.findingId = findingId
        self.componentId = componentId
        self.testResultId = testResultId
    }
}

/// Captures for a job, newest first. With a finding, item or test in `target`, only those
/// attached to it. Port of useJobMedia.
public func jobMedia(_ store: LocalStore, _ target: MediaTarget) -> [Media] {
    decodeJobRows(store, "media", target.jobId, as: Media.self)
        .filter {
            (target.findingId == nil || $0.findingId == target.findingId)
                && (target.componentId == nil || $0.jobComponentId == target.componentId)
                && (target.testResultId == nil || $0.testResultId == target.testResultId)
        }
        .sorted { ($0.capturedAt ?? $0.createdAt ?? "") > ($1.capturedAt ?? $1.createdAt ?? "") }
}

/// A place on the map, from the phone's location.
public struct Coordinate: Equatable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

@MainActor
public enum MediaWrites {
    /// Saves a capture: the file into the media folder, the row and its upload ticket into the
    /// database. Returns the media id. Port of saveCapture.
    @discardableResult
    public static func saveCapture(
        _ sync: SyncService, companyId: String, target: MediaTarget, _ captured: CapturedFile, at place: Coordinate?
    ) throws -> String {
        guard let files = sync.media else { throw MediaError("Photos can’t be saved on this phone.") }
        let id = uuidv7()
        let stored = try files.store(id, captured)
        func number(_ value: Double?) -> JSONValue { value.map(JSONValue.number) ?? .null }
        try sync.addMedia(
            id, companyId: companyId,
            [
                "job_id": .string(target.jobId),
                "finding_id": target.findingId.map(JSONValue.string) ?? .null,
                "job_component_id": target.componentId.map(JSONValue.string) ?? .null,
                "test_result_id": target.testResultId.map(JSONValue.string) ?? .null,
                "kind": .string(captured.kind.rawValue),
                "mime_type": .string(captured.mime),
                "size_bytes": .number(Double(stored.sizeBytes)),
                "sha256": .string(stored.sha256),
                "width": number(captured.width),
                "height": number(captured.height),
                "duration_ms": number(captured.durationMs),
                "captured_at": .string(captured.capturedAt),
                "latitude": number(place?.latitude),
                "longitude": number(place?.longitude),
                "upload_state": "pending",
            ],
            file: UploadJob(
                mediaId: id, companyId: companyId, localPath: stored.relativePath,
                storagePath: try mediaStoragePath(companyId, target.jobId, id, captured.mime),
                mimeType: captured.mime))
        return id
    }

    /// Caption, markup and deletes are ordinary synced writes: the original file never changes.
    public static func setCaption(_ sync: SyncService, _ media: Media, _ caption: String) throws {
        try sync.write("media", id: media.id, companyId: media.companyId, ["caption": blankToNull(caption)])
    }

    /// Saves markup drawn over the photo; nil (or no shapes) removes it.
    public static func setMarkup(_ sync: SyncService, _ media: Media, _ markup: Markup?) throws {
        let value: JSONValue = try markup.flatMap { $0.shapes.isEmpty ? nil : try json($0) } ?? .null
        try sync.write("media", id: media.id, companyId: media.companyId, ["markup": value])
    }
}
