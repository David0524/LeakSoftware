import Crypto
import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S5 capturing: what a capture becomes, saving it (file, row, upload ticket), and its limits.

/// An uploader that's never reached: these tests only queue files.
struct IdleUploader: Uploader {
    func upload(_ job: UploadJob, saveResumeUrl: (String?) throws -> Void) async throws -> UploadResult {
        throw MediaError("not in these tests")
    }
}

@MainActor
struct CaptureBench {
    let root: URL
    let sync: SyncService

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("capture-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let db = try Database(
            path: root.appendingPathComponent("test.db").path, key: String(repeating: "ab", count: 32))
        sync = SyncService(
            store: try LocalStore.open(db), kv: try KeyValue(db), transport: FakeTransport(), auth: FakeAuth(),
            uploader: IdleUploader(), media: MediaFiles(root: root))
    }

    /// A "captured" file in a temporary folder, as the camera or recorder leaves one.
    func capture(_ kind: MediaKind, bytes: Int = 1000, mime: String, at: String, durationMs: Double? = nil)
        throws -> (CapturedFile, Data)
    {
        let data = Data((0..<bytes).map { UInt8(truncatingIfNeeded: $0 &* 31 &+ bytes) })
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("cap-\(UUID()).bin")
        try data.write(to: url)
        let width: Double? = kind == .audio ? nil : 2048
        let height: Double? = kind == .audio ? nil : 1536
        return (
            CapturedFile(
                kind: kind, url: url, mime: mime, width: width, height: height, durationMs: durationMs, capturedAt: at),
            data
        )
    }

    func queue() throws -> [[String: SQLValue]] {
        try sync.store.database.query("select * from upload_queue order by media_id")
    }
}

private func text(_ value: SQLValue?) -> String? {
    if case .text(let s) = value { return s }
    return nil
}

private func hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

@Suite @MainActor struct SaveCaptureTests {
    @Test func aPhotoVideoAndVoiceNoteAreSavedWithTheirFilesAndUploadTickets() throws {
        let b = try CaptureBench()
        let item = MediaTarget(jobId: "j1", componentId: "jc1")
        let test = MediaTarget(jobId: "j1", testResultId: "t1")
        let finding = MediaTarget(jobId: "j1", findingId: "f1")

        let (photo, photoBytes) = try b.capture(.photo, mime: "image/jpeg", at: "2026-10-13T16:00:00.000Z")
        let photoId = try MediaWrites.saveCapture(
            b.sync, companyId: "c1", target: item, photo, at: Coordinate(latitude: 33.45, longitude: -112.07))
        let (video, videoBytes) = try b.capture(
            .video, bytes: 4000, mime: "video/quicktime", at: "2026-10-13T16:05:00.000Z", durationMs: 42_000)
        let videoId = try MediaWrites.saveCapture(b.sync, companyId: "c1", target: test, video, at: nil)
        let voice = VoiceNoteRules.captured(
            url: try b.capture(.audio, mime: "audio/mp4", at: "").0.url, durationMs: 12_345.6,
            startedAt: "2026-10-13T16:10:00.000Z")
        let voiceBytes = try Data(contentsOf: voice.url)
        let voiceId = try MediaWrites.saveCapture(b.sync, companyId: "c1", target: finding, voice, at: nil)

        // Rows: what was captured, where, and waiting to upload.
        let all = jobMedia(b.sync.store, MediaTarget(jobId: "j1"))
        #expect(all.map(\.id) == [voiceId, videoId, photoId])  // newest first
        let p = try #require(all.first { $0.id == photoId })
        #expect(p.kind == .photo && p.mimeType == "image/jpeg" && p.jobComponentId == "jc1")
        #expect(p.findingId == nil && p.testResultId == nil && p.companyId == "c1")
        #expect(p.width == 2048 && p.height == 1536 && p.durationMs == nil)
        #expect(p.latitude == 33.45 && p.longitude == -112.07)
        #expect(p.sizeBytes == photoBytes.count && p.sha256 == hex(photoBytes))
        #expect(p.uploadState == .pending && p.capturedAt == "2026-10-13T16:00:00.000Z")
        let v = try #require(all.first { $0.id == videoId })
        #expect(v.kind == .video && v.testResultId == "t1" && v.durationMs == 42_000 && v.latitude == nil)
        #expect(v.sha256 == hex(videoBytes) && v.sizeBytes == 4000)
        let a = try #require(all.first { $0.id == voiceId })
        #expect(a.kind == .audio && a.mimeType == "audio/mp4" && a.findingId == "f1")
        #expect(a.durationMs == 12_346 && a.width == nil && a.sha256 == hex(voiceBytes))

        // Filtering by what it's attached to.
        #expect(jobMedia(b.sync.store, item).map(\.id) == [photoId])
        #expect(jobMedia(b.sync.store, test).map(\.id) == [videoId])
        #expect(jobMedia(b.sync.store, finding).map(\.id) == [voiceId])
        #expect(jobMedia(b.sync.store, MediaTarget(jobId: "j2")).isEmpty)

        // Files moved (not copied) under media/{id}.{ext}, unchanged.
        let files = try #require(b.sync.media)
        for (id, ext, bytes, original) in [
            (photoId, "jpg", photoBytes, photo.url), (videoId, "mov", videoBytes, video.url),
            (voiceId, "m4a", voiceBytes, voice.url),
        ] {
            let stored = b.root.appendingPathComponent("media/\(id).\(ext)")
            #expect(try Data(contentsOf: stored) == bytes)
            #expect(!FileManager.default.fileExists(atPath: original.path))
            #expect(try MediaFiles.sha256(stored) == hex(bytes))
        }
        #expect(files.localURL(photoId, mime: "image/jpeg") != nil)

        // One upload ticket per capture, to the company's folder in the bucket.
        let queue = try b.queue()
        #expect(queue.count == 3)
        let ticket = try #require(queue.first { text($0["media_id"]) == videoId })
        #expect(text(ticket["local_path"]) == "media/\(videoId).mov")
        #expect(text(ticket["storage_path"]) == "c1/j1/\(videoId).mov")
        #expect(text(ticket["mime_type"]) == "video/quicktime")
        #expect(text(ticket["company_id"]) == "c1")
    }

    @Test func aFileOverTheUploadLimitIsRefusedAndNothingIsSaved() throws {
        let b = try CaptureBench()
        for (kind, mime, message) in [
            (MediaKind.video, "video/mp4", "That video is too large to upload. Record a shorter clip."),
            (MediaKind.photo, "image/jpeg", "That file is too large to upload."),
        ] {
            let (file, _) = try b.capture(kind, bytes: 10, mime: mime, at: "2026-10-13T16:00:00.000Z")
            let handle = try FileHandle(forWritingTo: file.url)
            try handle.truncate(atOffset: UInt64(MediaFiles.maxUploadBytes + 1))
            try handle.close()
            #expect(throws: MediaError(message)) {
                try MediaWrites.saveCapture(b.sync, companyId: "c1", target: MediaTarget(jobId: "j1"), file, at: nil)
            }
        }
        #expect(jobMedia(b.sync.store, MediaTarget(jobId: "j1")).isEmpty)
        #expect(try b.queue().isEmpty)
        let left = try FileManager.default.contentsOfDirectory(atPath: b.root.appendingPathComponent("media").path)
        #expect(left.isEmpty)
    }

    @Test func signingOutRemovesEveryCapturedFile() throws {
        let b = try CaptureBench()
        let (file, _) = try b.capture(.photo, mime: "image/jpeg", at: "2026-10-13T16:00:00.000Z")
        try MediaWrites.saveCapture(b.sync, companyId: "c1", target: MediaTarget(jobId: "j1"), file, at: nil)
        let folder = b.root.appendingPathComponent("media")
        #expect(FileManager.default.fileExists(atPath: folder.path))
        b.sync.clearLocalData()
        #expect(!FileManager.default.fileExists(atPath: folder.path))
        #expect(try b.queue().isEmpty)
        #expect(jobMedia(b.sync.store, MediaTarget(jobId: "j1")).isEmpty)
    }
}

private func dims(_ size: MediaSize?) -> [Double]? { size.map { [$0.width, $0.height] } }

@Suite struct CaptureRuleTests {
    @Test func photosAreResizedToTheLongEdgeAndKeepTheirShape() {
        #expect(dims(CaptureRules.photoSize(width: 4032, height: 3024)) == [2048, 1536])
        #expect(dims(CaptureRules.photoSize(width: 3024, height: 4032)) == [1536, 2048])
        #expect(dims(CaptureRules.photoSize(width: 4000, height: 2250)) == [2048, 1152])
        #expect(dims(CaptureRules.photoSize(width: 3000, height: 3000)) == [2048, 2048])
        // Already small enough: only re-encoded.
        #expect(CaptureRules.photoSize(width: 2048, height: 1000) == nil)
        #expect(CaptureRules.photoSize(width: 800, height: 600) == nil)
        #expect(MediaLimits.photoQuality == 0.7)
        let photo = CaptureRules.photo(
            url: URL(fileURLWithPath: "/tmp/x.jpg"), width: 2048, height: 1536, capturedAt: "t")
        #expect(photo.mime == "image/jpeg" && photo.kind == .photo && photo.durationMs == nil)
    }

    @Test func aLibraryPhotoKeepsItsOwnCaptureTime() throws {
        let utc = try #require(TimeZone(identifier: "UTC"))
        let phoenix = try #require(TimeZone(identifier: "America/Phoenix"))
        // EXIF is the phone's local time; the row stores UTC.
        #expect(
            CaptureRules.exifCaptureTime(original: "2026:10:13 09:15:22", dateTime: nil, timeZone: phoenix)
                == "2026-10-13T16:15:22.000Z")
        // DateTimeOriginal wins; DateTime is the fallback.
        #expect(
            CaptureRules.exifCaptureTime(
                original: "2026:10:13 09:15:22", dateTime: "2026:10:14 10:00:00", timeZone: phoenix)
                == "2026-10-13T16:15:22.000Z")
        #expect(
            CaptureRules.exifCaptureTime(original: nil, dateTime: "2026:10:14 10:00:00", timeZone: utc)
                == "2026-10-14T10:00:00.000Z")
        // Trailing subseconds or zone text after the time are ignored, as the regex does.
        #expect(
            CaptureRules.exifCaptureTime(original: "2026:01:02 03:04:05.123", dateTime: nil, timeZone: utc)
                == "2026-01-02T03:04:05.000Z")
        for bad in [
            "", "2026-10-13 09:15:22", "2026:10:13", "2026:13:01 00:00:00", "2026:02:30 10:00:00",
            "    :  :     :  :  ",
        ] {
            #expect(CaptureRules.exifCaptureTime(original: bad, dateTime: nil, timeZone: utc) == nil)
        }
        #expect(CaptureRules.exifCaptureTime(original: nil, dateTime: nil) == nil)
    }

    @Test func libraryVideosOverTheLimitAreRefused() throws {
        try CaptureRules.checkVideoLength(durationMs: nil)
        try CaptureRules.checkVideoLength(durationMs: 60_000)
        try CaptureRules.checkVideoLength(durationMs: 61_000)
        #expect(throws: MediaError("Videos can be up to 60 seconds.")) {
            try CaptureRules.checkVideoLength(durationMs: 61_001)
        }
        let video = CaptureRules.video(
            url: URL(fileURLWithPath: "/tmp/clip.MOV"), mime: nil, width: 0, height: 720, durationMs: 4_321.6,
            capturedAt: "t")
        #expect(video.mime == "video/quicktime" && video.width == nil && video.height == 720)
        #expect(video.durationMs == 4_322)
        #expect(
            CaptureRules.video(
                url: URL(fileURLWithPath: "/tmp/a"), mime: "video/mp4", width: nil, height: nil,
                durationMs: 0, capturedAt: "t"
            ).durationMs == nil)
    }

    @Test func voiceNotesStopAtFiveMinutesAndAskBeforeDiscardingLongOnes() {
        #expect(MediaLimits.voiceMaxSeconds == 300)
        #expect(!VoiceNoteRules.reachedLimit(299_999))
        #expect(VoiceNoteRules.reachedLimit(300_000))
        #expect(!VoiceNoteRules.asksBeforeDiscard(4_999))
        #expect(VoiceNoteRules.asksBeforeDiscard(5_000))
        #expect(VoiceNoteRules.hint == "Up to 5 minutes. Works offline.")
        #expect(VoiceNoteRules.status(recording: true) == "Recording")
        #expect(VoiceNoteRules.status(recording: false) == "Starting…")
        let file = VoiceNoteRules.captured(
            url: URL(fileURLWithPath: "/tmp/v.m4a"), durationMs: 1_499.5, startedAt: nil,
            now: Date(timeIntervalSince1970: 1_760_000_000))
        #expect(file.kind == .audio && file.mime == "audio/mp4" && file.durationMs == 1_500)
        #expect(file.capturedAt == "2025-10-09T08:53:20.000Z")
    }

    @Test func thumbnailsSayWhatTheyAre() throws {
        func media(_ kind: String, _ extra: [String: JSONValue] = [:]) throws -> Media {
            let row: [String: JSONValue] = ["id": "m1", "company_id": "c1", "job_id": "j1", "kind": .string(kind)]
            return try JSONValue.object(row.merging(extra) { $1 }).decode(Media.self)
        }
        #expect(CaptureRules.accessibilityLabel(try media("photo", ["upload_state": "uploaded"])) == "Photo")
        #expect(
            CaptureRules.accessibilityLabel(try media("video", ["duration_ms": 42_000]))
                == "Video, 0:42, waiting to upload")
        #expect(
            CaptureRules.accessibilityLabel(try media("audio", ["upload_state": "uploaded", "duration_ms": 75_400]))
                == "Voice Note, 1:15")
        #expect(CaptureRules.failureTitle(.photo) == "Couldn’t take the photo")
        #expect(CaptureRules.failureTitle(.video) == "Couldn’t record the video")
        #expect(CaptureRules.cameraOff.needsSettings)
    }

    @Test func locationUsesARecentReadingOrGivesUp() async {
        #expect(LocationRules.lastKnownIsUsable(age: 299, accuracy: 65))
        #expect(!LocationRules.lastKnownIsUsable(age: 301, accuracy: 65))
        #expect(!LocationRules.lastKnownIsUsable(age: 10, accuracy: 201))
        #expect(!LocationRules.lastKnownIsUsable(age: 10, accuracy: -1))  // invalid reading
        #expect(LocationRules.freshFixSeconds == 8)
        let quick = await firstWithin(1) { 7 }
        #expect(quick == 7)
        let started = Date()
        let slow: Int? = await firstWithin(0.05) {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            return 7
        }
        #expect(slow == nil)
        #expect(Date().timeIntervalSince(started) < 2)
    }
}

@Suite @MainActor struct MediaSourceTests {
    @Test func signedLinksAreKeptUntilAMinuteBeforeTheyExpire() async throws {
        final class Clock: @unchecked Sendable {
            var now = Date(timeIntervalSince1970: 0)
            var calls: [String] = []
        }
        let clock = Clock()
        let signer = MediaURLSigner(
            now: { clock.now },
            sign: { path, seconds in
                clock.calls.append("\(path)@\(seconds)")
                return URL(string: "https://example.test/\(path)?n=\(clock.calls.count)")!
            })
        let first = try await signer.url("c1/j1/m1.jpg")
        #expect(try await signer.url("c1/j1/m1.jpg") == first)
        clock.now = Date(timeIntervalSince1970: 3539)
        #expect(try await signer.url("c1/j1/m1.jpg") == first)
        clock.now = Date(timeIntervalSince1970: 3540)
        #expect(try await signer.url("c1/j1/m1.jpg") != first)
        #expect(clock.calls == ["c1/j1/m1.jpg@3600", "c1/j1/m1.jpg@3600"])
    }

    @Test func aCaptureShowsFromThePhoneThenTheUploadedCopy() throws {
        let b = try CaptureBench()
        let (file, _) = try b.capture(.photo, mime: "image/jpeg", at: "2026-10-13T16:00:00.000Z")
        let id = try MediaWrites.saveCapture(b.sync, companyId: "c1", target: MediaTarget(jobId: "j1"), file, at: nil)
        let saved = try #require(jobMedia(b.sync.store, MediaTarget(jobId: "j1")).first)
        #expect(MediaLocation(saved, files: b.sync.media) == .local(b.root.appendingPathComponent("media/\(id).jpg")))
        // Another phone's capture: unavailable until uploaded, then a signed link.
        var other = saved
        other.id = "m-other"
        other.storagePath = "c1/j1/m-other.jpg"
        #expect(MediaLocation(other, files: b.sync.media) == .unavailable)
        other.uploadState = .uploaded
        #expect(MediaLocation(other, files: b.sync.media) == .remote("c1/j1/m-other.jpg"))
        #expect(MediaLocation(other, files: nil) == .remote("c1/j1/m-other.jpg"))
    }
}
