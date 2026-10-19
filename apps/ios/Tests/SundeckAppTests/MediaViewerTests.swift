import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S5: the media viewer's text (details, attached to, transcript) and the markup editor's state,
// and what the viewer writes (markup, caption, delete).

@MainActor
private struct Viewer {
    let sync: SyncService
    let folder: URL
    var store: LocalStore { sync.store }

    init() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("viewer-\(UUID())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let db = try Database(
            path: folder.appendingPathComponent("app.db").path, key: String(repeating: "ab", count: 32))
        sync = SyncService(
            store: try LocalStore.open(db), kv: try KeyValue(db), transport: FakeTransport(), auth: FakeAuth(),
            media: MediaFiles(root: folder.appendingPathComponent("docs")))
    }

    /// "Captures" a small real file and saves it like the camera would.
    func capture(
        _ kind: MediaKind, mime: String, bytes: Int, width: Double? = nil, height: Double? = nil,
        durationMs: Double? = nil, target: MediaTarget = MediaTarget(jobId: "j1"), at place: Coordinate? = nil
    ) throws -> Media {
        let file = folder.appendingPathComponent("tmp-\(UUID())")
        try Data(repeating: 7, count: bytes).write(to: file)
        let id = try MediaWrites.saveCapture(
            sync, companyId: "c1", target: target,
            CapturedFile(
                kind: kind, url: file, mime: mime, width: width, height: height, durationMs: durationMs,
                capturedAt: "2026-10-19T22:04:05.000Z"),
            at: place)
        return try #require(MediaDetail.load(sync, id))
    }

    func reload(_ media: Media) throws -> Media { try #require(MediaDetail.load(sync, media.id)) }
}

private func sha256(_ count: Int) throws -> String {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("sha-\(UUID())")
    try Data(repeating: 7, count: count).write(to: file)
    defer { try? FileManager.default.removeItem(at: file) }
    return try MediaFiles.sha256(file)
}

@Suite @MainActor struct MediaDetailsTests {
    @Test func aPhotoShowsSizePixelsTimeLocationAndFingerprint() throws {
        let v = try Viewer()
        let photo = try v.capture(
            .photo, mime: "image/jpeg", bytes: 1_572_864, width: 4032, height: 3024,
            at: Coordinate(latitude: 33.4484, longitude: -112.074))
        let rows = MediaDetail.rows(photo, JobInspection(v.store, jobId: "j1"), timeZone: "America/Phoenix")
        #expect(
            rows == [
                MediaDetailRow(label: "Attached to", value: "The job"),
                MediaDetailRow(label: "Captured", value: "10/19/2026, 3:04:05 PM"),
                MediaDetailRow(label: "Location", value: "33.44840, -112.07400"),
                MediaDetailRow(label: "Size", value: "1.5 MB · 4032 × 3024"),
                MediaDetailRow(label: "Upload", value: "Waiting to upload (saved on this phone)"),
                MediaDetailRow(label: "Fingerprint", value: "SHA-256 \(try sha256(1_572_864).prefix(16))…"),
            ])
        #expect(MediaDetail.markupButton(photo) == "Mark Up")
        #expect(MediaDetail.photoRatio(photo) == 0.75)
        #expect(MediaDetail.deleteTitle(photo.kind) == "Remove this photo from the job?")
        #expect(MediaDetail.deleteButton(photo.kind) == "Delete Photo")
    }

    @Test func aVideoShowsItsLengthAndTheTimeInTheCompanyZone() throws {
        let v = try Viewer()
        let video = try v.capture(.video, mime: "video/mp4", bytes: 3000, width: 1920, height: 1080, durationMs: 12_400)
        #expect(MediaDetail.size(video) == "3 KB · 1920 × 1080 · 0:12")
        #expect(MediaDetail.location(video) == "Not recorded")
        #expect(MediaDetail.captured(video.capturedAt, timeZone: "America/New_York") == "10/19/2026, 6:04:05 PM")
        #expect(MediaDetail.captured(nil, timeZone: "America/Phoenix") == "Unknown")
        #expect(MediaDetail.captured("2026-10-19T08:00:00Z", timeZone: "America/Phoenix") == "10/19/2026, 1:00:00 AM")
        try v.sync.write("media", id: video.id, companyId: "c1", ["upload_state": "uploaded"])
        #expect(MediaDetail.upload(try v.reload(video)) == "Uploaded")
        #expect(MediaDetail.loadingText(.video) == "Loading the video…")
        #expect(
            MediaDetail.unavailableText(.video)
                == "This video isn’t on this phone. It downloads when you have a connection.")
    }

    @Test func aVoiceNoteHasNoPixelsAndTheFingerprintFallsBack() throws {
        let v = try Viewer()
        let note = try v.capture(.audio, mime: "audio/mp4", bytes: 500, durationMs: 65_000)
        #expect(MediaDetail.size(note) == "500 B · 1:05")
        #expect(MediaDetail.deleteTitle(.audio) == "Remove this voice note from the job?")
        #expect(MediaDetail.deleteButton(.audio) == "Delete Voice Note")
        #expect(MediaDetail.deleteMessage == "The original stays on file.")
        try v.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "media", xid: "1",
                        row: [
                            "id": "m-old", "company_id": "c1", "job_id": "j1", "kind": "photo",
                            "upload_state": "uploaded",
                        ])
                ], done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
        let old = try #require(MediaDetail.load(v.sync, "m-old"))
        #expect(MediaDetail.fingerprint(old) == "None")
        #expect(MediaDetail.size(old) == "0 B")
        #expect(MediaDetail.load(v.sync, "missing") == nil)
    }

    @Test func attachedToNamesTheFindingItemTestOrJob() throws {
        let v = try Viewer()
        try v.sync.write(
            "job_component", id: "jc1", companyId: "c1",
            ["job_id": "j1", "component_type_id": "ct1", "instance_number": 1, "label": "Skimmer", "sort_order": 1])
        try v.sync.write(
            "finding", id: "f1", companyId: "c1",
            ["job_id": "j1", "title": "Crack in skimmer throat", "severity_key": "major", "status": "open"])
        let insp = JobInspection(v.store, jobId: "j1")
        let onFinding = try v.capture(
            .photo, mime: "image/jpeg", bytes: 10, target: MediaTarget(jobId: "j1", findingId: "f1", componentId: "jc1")
        )
        let onItem = try v.capture(
            .photo, mime: "image/jpeg", bytes: 10, target: MediaTarget(jobId: "j1", componentId: "jc1"))
        let onTest = try v.capture(
            .photo, mime: "image/jpeg", bytes: 10, target: MediaTarget(jobId: "j1", testResultId: "t1"))
        let onJob = try v.capture(.photo, mime: "image/jpeg", bytes: 10)
        #expect(MediaDetail.attachedTo(onFinding, insp) == "Crack in skimmer throat")
        #expect(MediaDetail.attachedTo(onItem, insp) == "Skimmer")
        #expect(MediaDetail.attachedTo(onTest, insp) == "A test")
        #expect(MediaDetail.attachedTo(onJob, insp) == "The job")
        // A deleted finding falls back to its item.
        try v.sync.write("finding", id: "f1", companyId: "c1", ["deleted_at": "2026-10-19T00:00:00.000Z"])
        #expect(MediaDetail.attachedTo(onFinding, JobInspection(v.store, jobId: "j1")) == "Skimmer")
    }

    @Test func theTranscriptSaysWhereItStands() throws {
        let v = try Viewer()
        var note = try v.capture(.audio, mime: "audio/mp4", bytes: 10, durationMs: 3000)
        #expect(MediaDetail.transcript(note) == "Transcribed after the recording uploads.")
        #expect(!MediaDetail.transcriptIsText(note))
        note.uploadState = .uploaded
        #expect(MediaDetail.transcript(note) == "Not transcribed yet.")
        note.transcriptStatus = .pending
        #expect(MediaDetail.transcript(note) == "Transcribing…")
        note.transcriptStatus = .failed
        #expect(MediaDetail.transcript(note) == "Transcription failed. The office can retry it.")
        note.transcriptStatus = .done
        #expect(MediaDetail.transcript(note) == "(No speech heard.)")
        note.transcript = ""
        #expect(MediaDetail.transcript(note) == "(No speech heard.)")
        note.transcript = "Water loss at the main drain."
        #expect(MediaDetail.transcript(note) == "Water loss at the main drain.")
        #expect(MediaDetail.transcriptIsText(note))
    }
}

@Suite @MainActor struct MarkupEditingTests {
    private let start = MarkupPoint(x: 0.5, y: 0.5)

    @Test func eachToolAddsItsShape() {
        var draft = MarkupDraft(saved: [], width: 4000, height: 3000)
        #expect(!draft.isDirty && !draft.canUndo && !draft.canClear)
        // A drag draws to size.
        draft.release(from: MarkupPoint(x: 0.1, y: 0.2), to: MarkupPoint(x: 0.4, y: 0.6))
        #expect(draft.shapes == [.arrow(color: .red, x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.6)])
        // A tap places a default-sized shape; the circle is round on a 4:3 photo.
        draft.tool = .circle
        draft.color = .yellow
        draft.release(from: start, to: start)
        #expect(draft.shapes.last == .circle(color: .yellow, cx: 0.5, cy: 0.5, rx: 0.08, ry: 0.1067))
        draft.tool = .arrow
        draft.release(from: MarkupPoint(x: 0.05, y: 0.05), to: MarkupPoint(x: 0.05, y: 0.05))
        #expect(draft.shapes.last == shapeAtTap(.arrow, .yellow, MarkupPoint(x: 0.05, y: 0.05), 4000.0 / 3000))
        // Text needs its label first.
        draft.tool = .text
        draft.color = .white
        draft.release(from: start, to: start)
        #expect(draft.labelError == "Type the label first.")
        #expect(draft.shapes.count == 3)
        draft.label = "Crack"
        #expect(draft.labelError == nil)
        draft.release(from: start, to: MarkupPoint(x: 0.9, y: 0.9))
        #expect(draft.shapes.last == .text(color: .white, x: 0.5, y: 0.5, text: "Crack"))
        #expect(draft.isDirty)
        #expect(draft.markup == Markup(shapes: draft.shapes))
    }

    @Test func theLiveShapeFollowsTheDragButNotForText() {
        var draft = MarkupDraft(saved: [], width: nil, height: nil)
        #expect(draft.live(from: start, to: MarkupPoint(x: 0.505, y: 0.505)) == nil)
        #expect(draft.live(from: start, to: MarkupPoint(x: 0.7, y: 0.5)) != nil)
        draft.tool = .text
        #expect(draft.live(from: start, to: MarkupPoint(x: 0.7, y: 0.5)) == nil)
        // No size: Expo's 0.75 ratio.
        #expect(abs(draft.aspect - 4.0 / 3) < 1e-9)
    }

    @Test func undoAndClearAllAreSteps() {
        let saved: [MarkupShape] = [.circle(color: .red, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1)]
        var draft = MarkupDraft(saved: saved, width: 100, height: 100)
        #expect(!draft.isDirty && draft.canClear)
        draft.clearAll()
        #expect(draft.shapes.isEmpty && draft.isDirty)
        #expect(draft.markup == nil)
        draft.undo()
        #expect(draft.shapes == saved)
        #expect(!draft.isDirty)
        draft.undo()
        #expect(draft.shapes == saved)
        // Drawing then undoing back to the start isn't a change.
        draft.release(from: start, to: start)
        draft.undo()
        #expect(!draft.isDirty)
    }

    @Test func savingWritesTheMarkupColumnAndLeavesTheFileAlone() throws {
        let v = try Viewer()
        let photo = try v.capture(.photo, mime: "image/jpeg", bytes: 64, width: 400, height: 300)
        let file = try #require(v.sync.media?.localURL(photo.id, mime: photo.mimeType))
        let before = try MediaFiles.sha256(file)
        var draft = MarkupDraft(saved: parseMarkup(photo.markup).shapes, width: photo.width, height: photo.height)
        draft.release(from: MarkupPoint(x: 0.1, y: 0.1), to: MarkupPoint(x: 0.5, y: 0.5))
        try MediaWrites.setMarkup(v.sync, photo, draft.markup)
        var saved = try v.reload(photo)
        #expect(parseMarkup(saved.markup).shapes == [.arrow(color: .red, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5)])
        #expect(saved.markup?["version"]?.number == 1)
        #expect(saved.markup?["shapes"]?.array?.first?["type"]?.string == "arrow")
        #expect(MediaDetail.markupButton(saved) == "Edit Markup")
        // Clear All then Save removes it.
        draft = MarkupDraft(saved: parseMarkup(saved.markup).shapes, width: saved.width, height: saved.height)
        draft.clearAll()
        try MediaWrites.setMarkup(v.sync, saved, draft.markup)
        saved = try v.reload(photo)
        #expect(saved.markup == nil || saved.markup == .null)
        #expect(MediaDetail.markupButton(saved) == "Mark Up")
        #expect(try MediaFiles.sha256(file) == before)
        #expect(saved.sha256 == before)
    }
}

@Suite @MainActor struct MediaViewerWritesTests {
    @Test func theCaptionSavesTrimmedAndBlankBecomesNull() throws {
        let v = try Viewer()
        let photo = try v.capture(.photo, mime: "image/jpeg", bytes: 10)
        #expect(try !MediaWrites.saveCaptionIfChanged(v.sync, photo, "  "))
        #expect(try MediaWrites.saveCaptionIfChanged(v.sync, photo, "  Skimmer throat crack "))
        var saved = try v.reload(photo)
        #expect(saved.caption == "Skimmer throat crack")
        #expect(try !MediaWrites.saveCaptionIfChanged(v.sync, saved, "Skimmer throat crack"))
        #expect(try MediaWrites.saveCaptionIfChanged(v.sync, saved, "   "))
        saved = try v.reload(photo)
        #expect(saved.caption == nil)
    }

    @Test func deleteMarksTheRowDeletedAndKeepsTheFile() throws {
        let v = try Viewer()
        let video = try v.capture(.video, mime: "video/mp4", bytes: 10)
        try MediaWrites.delete(v.sync, video)
        let row = try #require(try v.store.get("media", video.id))
        #expect(row["deleted_at"]?.string?.isEmpty == false)
        #expect(jobMedia(v.store, MediaTarget(jobId: "j1")).isEmpty)
        #expect(v.sync.media?.localURL(video.id, mime: video.mimeType) != nil)
    }
}
