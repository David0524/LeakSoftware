import Crypto
import Foundation
import SundeckCore
import SundeckSync

/// A capture or recording failed. `needsSettings` means the fix is in the phone's Settings (a
/// permission was turned off). Port of MediaError in apps/mobile/src/lib/media.ts.
public struct MediaError: Error, CustomStringConvertible, Equatable {
    public let description: String
    public let needsSettings: Bool

    public init(_ message: String, needsSettings: Bool = false) {
        description = message
        self.needsSettings = needsSettings
    }
}

/// A file just captured, before it's stored. Port of CapturedFile.
public struct CapturedFile: Sendable, Equatable {
    public var kind: MediaKind
    /// Temporary file to move into the media folder.
    public var url: URL
    public var mime: String
    public var width: Double?
    public var height: Double?
    public var durationMs: Double?
    /// ISO time.
    public var capturedAt: String

    public init(
        kind: MediaKind, url: URL, mime: String, width: Double? = nil, height: Double? = nil,
        durationMs: Double? = nil, capturedAt: String
    ) {
        self.kind = kind
        self.url = url
        self.mime = mime
        self.width = width
        self.height = height
        self.durationMs = durationMs
        self.capturedAt = capturedAt
    }
}

/// A capture moved into the media folder and fingerprinted.
public struct StoredFile: Sendable, Equatable {
    public var id: String
    public var relativePath: String
    public var sizeBytes: Int
    public var sha256: String
}

/// Captured files, kept as media/{id}.{ext} in the app's Documents folder. Paths are stored
/// relative to it: on iOS the absolute container path changes when the app is updated. A stored
/// file is never changed: markup is saved separately. Port of apps/mobile/src/lib/media.ts.
public struct MediaFiles: Sendable {
    public static let folder = "media"
    /// Supabase's per-file upload limit on the current plan.
    public static let maxUploadBytes = 50 * 1024 * 1024

    /// The Documents folder (a temporary folder in tests).
    public let root: URL

    public init(root: URL) {
        self.root = root
    }

    /// The phone's Documents folder.
    public static func documents() throws -> MediaFiles {
        MediaFiles(
            root: try FileManager.default.url(
                for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
    }

    public func relativePath(_ mediaId: String, mime: String) throws -> String {
        "\(Self.folder)/\(mediaId).\(try extensionForMime(mime))"
    }

    public func url(_ relativePath: String) -> URL {
        root.appendingPathComponent(relativePath)
    }

    /// The local copy of a capture, if this phone has it.
    public func localURL(_ mediaId: String, mime: String?) -> URL? {
        guard let mime, let path = try? relativePath(mediaId, mime: mime) else { return nil }
        let file = url(path)
        return FileManager.default.fileExists(atPath: file.path) ? file : nil
    }

    /// Moves a capture into the media folder under its media id and fingerprints it.
    public func store(_ id: String, _ captured: CapturedFile) throws -> StoredFile {
        try makeFolder()
        let path = try relativePath(id, mime: captured.mime)
        let dest = url(path)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.moveItem(at: captured.url, to: dest)
        let size = try fileSize(dest)
        if size > Self.maxUploadBytes {
            try? FileManager.default.removeItem(at: dest)
            throw MediaError(
                captured.kind == .video
                    ? "That video is too large to upload. Record a shorter clip."
                    : "That file is too large to upload.")
        }
        return StoredFile(id: id, relativePath: path, sizeBytes: size, sha256: try Self.sha256(dest))
    }

    /// Saves a signature drawing as media/signature-{id}.svg; returns its relative path.
    public func storeSignatureSVG(_ id: String, _ svg: String) throws -> String {
        try makeFolder()
        let path = "\(Self.folder)/signature-\(id).svg"
        try Data(svg.utf8).write(to: url(path), options: .atomic)
        return path
    }

    /// Removes every captured file (sign-out).
    public func deleteAll() {
        try? FileManager.default.removeItem(at: root.appendingPathComponent(Self.folder))
    }

    /// Reads queued files for the resumable uploader. Queue paths are relative to `root`.
    public var source: any FileSource { RootedFileSource(root: root) }

    /// SHA-256 of a file as lowercase hex, read in 1 MB pieces (videos can be 50 MB).
    public static func sha256(_ file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty { hash.update(data: chunk) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func makeFolder() throws {
        try FileManager.default.createDirectory(
            at: root.appendingPathComponent(Self.folder), withIntermediateDirectories: true)
    }

    private func fileSize(_ file: URL) throws -> Int {
        ((try FileManager.default.attributesOfItem(atPath: file.path))[.size] as? NSNumber)?.intValue ?? 0
    }
}

/// `FileSource` for paths relative to a folder.
struct RootedFileSource: FileSource {
    let root: URL

    func size(_ path: String) async throws -> Int {
        let file = root.appendingPathComponent(path)
        guard FileManager.default.fileExists(atPath: file.path) else {
            throw MediaError("The file for this capture is missing (\(path))")
        }
        return try await LocalFileSource().size(file.path)
    }

    func read(_ path: String, offset: Int, length: Int) async throws -> Data {
        try await LocalFileSource().read(root.appendingPathComponent(path).path, offset: offset, length: length)
    }
}
