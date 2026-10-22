import Foundation
import SundeckCore

// What a capture becomes before it's saved: photos resized and re-encoded, a library photo's own
// capture time, the video length check, voice note limits, where the phone is, and where a
// thumbnail loads from. Port of apps/mobile/src/lib/media.ts and the display half of
// apps/mobile/src/data/media.ts. The rules here run on Linux; the camera, ImageIO and
// CoreLocation parts below are iPhone only.

/// Capture rules shared by every path.
public enum CaptureRules {
    /// Voice notes are AAC in an .m4a container (Expo's high-quality recording preset).
    public static let voiceMime = "audio/mp4"

    /// Photos picked from the library at once (owner, 2026-10-22); Android's is the same.
    public static let libraryPhotoLimit = 20

    /// The size a photo is saved at: its long edge at most `MediaLimits.photoLongEdge`, or nil
    /// when it's already small enough (then it's only re-encoded).
    public static func photoSize(width: Double, height: Double) -> MediaSize? {
        fitWithin(width, height, Double(MediaLimits.photoLongEdge))
    }

    /// Library videos over the limit are refused, as when recording (a second's grace for
    /// rounding in the file's own length).
    public static func checkVideoLength(durationMs: Double?) throws {
        if (durationMs ?? 0) > Double((MediaLimits.videoMaxSeconds + 1) * 1000) {
            throw MediaError("Videos can be up to \(MediaLimits.videoMaxSeconds) seconds.")
        }
    }

    /// A library photo's own capture time. EXIF writes "2026:10:13 09:15:22" in the phone's
    /// local time: DateTimeOriginal first, else DateTime. Returns an ISO time, or nil.
    public static func exifCaptureTime(
        original: String?, dateTime: String?, timeZone: TimeZone = .current
    ) -> String? {
        guard let raw = original ?? dateTime else { return nil }
        let parts = raw.split(separator: " ", maxSplits: 1)
        guard parts.count == 2 else { return nil }
        let day = parts[0].split(separator: ":", omittingEmptySubsequences: false)
        let time = parts[1].prefix(8).split(separator: ":", omittingEmptySubsequences: false)
        guard day.count == 3, time.count == 3, day[0].count == 4, day[1].count == 2, day[2].count == 2,
            time.allSatisfy({ $0.count == 2 }),
            let year = Int(day[0]), let month = Int(day[1]), let date = Int(day[2]),
            let hour = Int(time[0]), let minute = Int(time[1]), let second = Int(time[2]),
            (1...12).contains(month), (1...31).contains(date), (0...23).contains(hour), (0...59).contains(minute),
            (0...59).contains(second)
        else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let wanted = DateComponents(
            year: year, month: month, day: date, hour: hour, minute: minute, second: second)
        guard let instant = calendar.date(from: wanted),
            calendar.component(.day, from: instant) == date
        else { return nil }
        return isoTimestamp(milliseconds: (instant.timeIntervalSince1970 * 1000).rounded())
    }

    /// The time a capture is saved with when it has none of its own.
    public static func now(_ date: Date = Date()) -> String {
        isoTimestamp(milliseconds: (date.timeIntervalSince1970 * 1000).rounded())
    }

    /// A video from the camera or the library: its MIME type from the picker, else its name.
    public static func video(
        url: URL, mime: String?, width: Double?, height: Double?, durationMs: Double?, capturedAt: String
    ) -> CapturedFile {
        CapturedFile(
            kind: .video, url: url, mime: mime ?? mimeFromFileName(url.lastPathComponent, .video),
            width: width.flatMap { $0 > 0 ? $0 : nil }, height: height.flatMap { $0 > 0 ? $0 : nil },
            durationMs: durationMs.flatMap { $0 > 0 ? $0.rounded() : nil }, capturedAt: capturedAt)
    }

    /// A photo after resizing: always JPEG.
    public static func photo(url: URL, width: Double, height: Double, capturedAt: String) -> CapturedFile {
        CapturedFile(kind: .photo, url: url, mime: "image/jpeg", width: width, height: height, capturedAt: capturedAt)
    }

    /// A temporary file for a capture on its way to the media folder.
    public static func tempURL(_ ext: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("capture-\(UUID().uuidString).\(ext)")
    }

    /// What a screen reader says for a thumbnail: "Video, 0:42, waiting to upload".
    public static func accessibilityLabel(_ media: Media) -> String {
        var label = media.kind.label
        if let ms = media.durationMs, ms > 0 { label += ", \(formatDuration(ms))" }
        if media.uploadState == .pending { label += ", waiting to upload" }
        return label
    }

    /// What a failed camera capture's alert is titled.
    public static func failureTitle(_ kind: MediaKind) -> String {
        kind == .video ? "Couldn’t record the video" : "Couldn’t take the photo"
    }

    public static let cameraOff = MediaError(
        "Camera access is off. Turn it on in Settings, then try again.", needsSettings: true)
}

/// A voice note being recorded: its limits and what it says. Port of VoiceRecorder.tsx's rules.
public enum VoiceNoteRules {
    public static let limitMs = Double(MediaLimits.voiceMaxSeconds * 1000)
    /// Shorter recordings are discarded without asking.
    public static let askBeforeDiscardMs = 5_000.0
    public static let hint = "Up to \(MediaLimits.voiceMaxSeconds / 60) minutes. Works offline."
    public static let discardTitle = "Discard this voice note?"
    public static let permissionTitle = "Microphone access is off"
    public static let permissionMessage = "Turn it on in Settings to record voice notes."

    /// Recording stops and saves by itself at the limit.
    public static func reachedLimit(_ durationMs: Double) -> Bool { durationMs >= limitMs }

    public static func asksBeforeDiscard(_ durationMs: Double) -> Bool { durationMs >= askBeforeDiscardMs }

    public static func status(recording: Bool) -> String { recording ? "Recording" : "Starting…" }

    /// The finished recording as a capture; its time is when recording started.
    public static func captured(url: URL, durationMs: Double, startedAt: String?, now: Date = Date())
        -> CapturedFile
    {
        CapturedFile(
            kind: .audio, url: url, mime: CaptureRules.voiceMime, durationMs: durationMs.rounded(),
            capturedAt: startedAt ?? CaptureRules.now(now))
    }
}

/// Location is best effort and never blocks a capture: a recent reading (5 minutes, 200 m) is
/// used as is, else a fresh fix for up to 8 seconds, else none. Port of currentPosition.
public enum LocationRules {
    public static let maxAgeSeconds: TimeInterval = 5 * 60
    public static let requiredAccuracyMeters = 200.0
    public static let freshFixSeconds: TimeInterval = 8

    /// Whether the phone's last known reading is good enough to skip a fresh fix.
    public static func lastKnownIsUsable(age: TimeInterval, accuracy: Double) -> Bool {
        age <= maxAgeSeconds && accuracy >= 0 && accuracy <= requiredAccuracyMeters
    }
}

/// Runs `operation`, giving up with nil after `seconds`. The operation is cancelled then, and must
/// return soon after (the group waits for it).
public func firstWithin<T: Sendable>(_ seconds: TimeInterval, _ operation: @escaping @Sendable () async -> T?) async
    -> T?
{
    await withTaskGroup(of: T?.self) { group in
        group.addTask { await operation() }
        group.addTask {
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            return nil
        }
        let first = await group.next() ?? nil
        group.cancelAll()
        return first
    }
}

// MARK: - Where a capture is shown from

/// Where to show a capture from: this phone's copy, else a short-lived signed link to the
/// uploaded file. Links are kept until a minute before they expire, for every screen. Port of
/// useMediaSource. The app passes Supabase storage's `createSignedURL` as `sign`.
public actor MediaURLSigner {
    public typealias Sign = @Sendable (_ path: String, _ expiresIn: Int) async throws -> URL
    public static let seconds = 3600

    private let sign: Sign
    private let now: @Sendable () -> Date
    private var cache: [String: (url: URL, expires: Date)] = [:]

    public init(now: @escaping @Sendable () -> Date = { Date() }, sign: @escaping Sign) {
        self.sign = sign
        self.now = now
    }

    /// A link to an uploaded file; throws when it can't be had (offline, removed).
    public func url(_ storagePath: String) async throws -> URL {
        if let hit = cache[storagePath], hit.expires > now() { return hit.url }
        let url = try await sign(storagePath, Self.seconds)
        cache[storagePath] = (url, now().addingTimeInterval(TimeInterval(Self.seconds - 60)))
        return url
    }
}

/// Where a capture can be loaded from, before any network call.
public enum MediaLocation: Equatable, Sendable {
    /// This phone has the file.
    case local(URL)
    /// Uploaded: ask the signer for a link to this storage path.
    case remote(String)
    /// On another phone and not uploaded yet.
    case unavailable

    public init(_ media: Media, files: MediaFiles?) {
        if let local = files?.localURL(media.id, mime: media.mimeType) {
            self = .local(local)
        } else if media.uploadState == .uploaded, let path = media.storagePath {
            self = .remote(path)
        } else {
            self = .unavailable
        }
    }
}

#if canImport(ImageIO) && canImport(UniformTypeIdentifiers)
    import ImageIO
    import UniformTypeIdentifiers

    /// Photos: long edge 2048 px, JPEG at 0.7, upright, with every bit of metadata (EXIF, GPS)
    /// left out. Also turns HEIC into JPEG.
    public enum PhotoCompressor {
        /// Resizes an encoded photo (camera or library) into a temporary JPEG.
        public static func compress(_ data: Data, capturedAt: String) throws -> CapturedFile {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
                throw MediaError("That photo couldn’t be read.")
            }
            return try compress(source, capturedAt: capturedAt)
        }

        public static func compress(_ source: CGImageSource, capturedAt: String) throws -> CapturedFile {
            let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
            var width = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue ?? 0
            var height = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue ?? 0
            // EXIF orientations 5 to 8 are turned a quarter: the upright photo swaps its sides.
            if let orientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.intValue, orientation >= 5 {
                swap(&width, &height)
            }
            let target = CaptureRules.photoSize(width: width, height: height)
            let longEdge = target.map { max($0.width, $0.height) } ?? max(width, height)
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: max(1, Int(longEdge)),
                kCGImageSourceShouldCacheImmediately: true,
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                throw MediaError("That photo couldn’t be read.")
            }
            let url = CaptureRules.tempURL("jpg")
            guard
                let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
            else { throw MediaError("That photo couldn’t be saved.") }
            // Only the quality: no source properties are copied, so nothing else is written.
            CGImageDestinationAddImage(
                dest, image, [kCGImageDestinationLossyCompressionQuality: MediaLimits.photoQuality] as CFDictionary)
            guard CGImageDestinationFinalize(dest) else { throw MediaError("That photo couldn’t be saved.") }
            return CaptureRules.photo(
                url: url, width: Double(image.width), height: Double(image.height), capturedAt: capturedAt)
        }

        /// A library photo's own capture time (EXIF), if it has one.
        public static func exifTime(_ data: Data) -> String? {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
            else { return nil }
            let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any]
            let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
            return CaptureRules.exifCaptureTime(
                original: exif?[kCGImagePropertyExifDateTimeOriginal] as? String,
                dateTime: tiff?[kCGImagePropertyTIFFDateTime] as? String)
        }

        /// A small image for a thumbnail, read without decoding the whole photo.
        public static func thumbnail(_ source: CGImageSource, maxPixels: Int) -> CGImage? {
            CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: maxPixels,
                ] as CFDictionary)
        }
    }
#endif

#if os(iOS)
    import AVFoundation
    import CoreLocation

    /// Videos: their length and upright size, and the library's re-encode at the camera's medium
    /// quality.
    public enum VideoInfo {
        /// Length in ms and upright size, from the file.
        public static func read(_ url: URL) async -> (durationMs: Double?, width: Double?, height: Double?) {
            let asset = AVURLAsset(url: url)
            let duration = try? await asset.load(.duration)
            var width: Double?
            var height: Double?
            if let track = try? await asset.loadTracks(withMediaType: .video).first,
                let (size, transform) = try? await track.load(.naturalSize, .preferredTransform)
            {
                let upright = size.applying(transform)
                width = abs(upright.width)
                height = abs(upright.height)
            }
            return (duration.map { $0.seconds * 1000 }.flatMap { $0.isFinite ? $0 : nil }, width, height)
        }

        /// A library video re-encoded at medium quality (as the camera records), so a minute stays
        /// well under the upload limit. Falls back to the original when it can't be re-encoded.
        public static func mediumQuality(_ url: URL) async -> (url: URL, mime: String?) {
            let asset = AVURLAsset(url: url)
            guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality)
            else { return (url, nil) }
            let out = CaptureRules.tempURL("mp4")
            do {
                try await session.export(to: out, as: .mp4)
                try? FileManager.default.removeItem(at: url)
                return (out, "video/mp4")
            } catch {
                return (url, nil)
            }
        }
    }

    /// The camera permission, asked when the camera is opened.
    public enum CameraAccess {
        public static func request() async throws {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: return
            case .notDetermined:
                if await AVCaptureDevice.requestAccess(for: .video) { return }
            default: break
            }
            throw CaptureRules.cameraOff
        }
    }

    /// Where the phone is, for tagging captures. Best effort; never throws.
    @MainActor
    public final class LocationLookup: NSObject, CLLocationManagerDelegate {
        public static let shared = LocationLookup()

        private let manager = CLLocationManager()
        private var asked: CheckedContinuation<Void, Never>?
        private var fixes: [UUID: CheckedContinuation<Coordinate?, Never>] = [:]

        override private init() {
            super.init()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        }

        /// Asks for location the first time, and waits for the answer, so it never overlaps the
        /// camera's own prompt.
        public func askOnce() async {
            guard manager.authorizationStatus == .notDetermined, asked == nil else { return }
            await withCheckedContinuation { continuation in
                asked = continuation
                manager.requestWhenInUseAuthorization()
            }
        }

        /// Asks once, then looks the position up (the voice note's prepareLocation).
        public func prepare() async -> Coordinate? {
            await askOnce()
            return await currentPosition()
        }

        public func currentPosition() async -> Coordinate? {
            let status = manager.authorizationStatus
            guard status == .authorizedWhenInUse || status == .authorizedAlways else { return nil }
            if let last = manager.location,
                LocationRules.lastKnownIsUsable(
                    age: -last.timestamp.timeIntervalSinceNow, accuracy: last.horizontalAccuracy)
            {
                return Coordinate(latitude: last.coordinate.latitude, longitude: last.coordinate.longitude)
            }
            return await firstWithin(LocationRules.freshFixSeconds) { await self.freshFix() }
        }

        private func freshFix() async -> Coordinate? {
            let id = UUID()
            return await withTaskCancellationHandler {
                await withCheckedContinuation { continuation in
                    fixes[id] = continuation
                    if fixes.count == 1 { manager.requestLocation() }
                }
            } onCancel: {
                Task { @MainActor in self.fixes.removeValue(forKey: id)?.resume(returning: nil) }
            }
        }

        private func finish(_ place: Coordinate?) {
            let waiting = fixes.values
            fixes = [:]
            for continuation in waiting { continuation.resume(returning: place) }
        }

        nonisolated public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            let status = manager.authorizationStatus
            Task { @MainActor in
                guard status != .notDetermined else { return }
                self.asked?.resume()
                self.asked = nil
            }
        }

        nonisolated public func locationManager(
            _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
        ) {
            let place = locations.last.map {
                Coordinate(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude)
            }
            Task { @MainActor in self.finish(place) }
        }

        nonisolated public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
            Task { @MainActor in self.finish(nil) }
        }
    }
#endif
