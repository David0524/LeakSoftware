#if os(iOS)
    import SundeckCore
    import SwiftUI
    import UIKit
    import UniformTypeIdentifiers

    /// The system camera, for one photo or one video (up to `MediaLimits.videoMaxSeconds` at
    /// medium quality, which keeps a full minute well under the upload limit). Port of
    /// captureWithCamera's ImagePicker.launchCameraAsync. Calls `onDone` with the encoded photo or
    /// a copy of the video, or nil when the tech backs out.
    struct CameraPicker: UIViewControllerRepresentable {
        enum Result {
            case photo(Data)
            case video(URL)
        }

        var kind: MediaKind
        var onDone: (Result?) -> Void

        func makeUIViewController(context: Context) -> UIImagePickerController {
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.delegate = context.coordinator
            if kind == .video {
                picker.mediaTypes = [UTType.movie.identifier]
                picker.cameraCaptureMode = .video
                picker.videoMaximumDuration = TimeInterval(MediaLimits.videoMaxSeconds)
                picker.videoQuality = .typeMedium
            } else {
                picker.mediaTypes = [UTType.image.identifier]
                picker.cameraCaptureMode = .photo
            }
            return picker
        }

        func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

        func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

        static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

        final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
            let onDone: (Result?) -> Void

            init(onDone: @escaping (Result?) -> Void) { self.onDone = onDone }

            func imagePickerController(
                _ picker: UIImagePickerController,
                didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
            ) {
                if let movie = info[.mediaURL] as? URL {
                    // The picker removes its file when it closes: keep a copy.
                    let copy = CaptureRules.tempURL(movie.pathExtension.isEmpty ? "mov" : movie.pathExtension)
                    do {
                        try FileManager.default.copyItem(at: movie, to: copy)
                        onDone(.video(copy))
                    } catch {
                        onDone(nil)
                    }
                } else if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 1)
                {
                    // Full quality here; PhotoCompressor resizes and re-encodes it once.
                    onDone(.photo(data))
                } else {
                    onDone(nil)
                }
            }

            func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onDone(nil) }
        }
    }
#endif

#if os(iOS)
    import PhotosUI

    /// The photo library: up to `limit` photos (owner, 2026-10-22: "you need to be able to select
    /// multiple photos at once") or one video. The system picker needs no Photos permission
    /// (Expo's photosPermission is off too). Photos come as their original file, with EXIF, so
    /// the capture time can be read; videos as a copy of the file. Calls `onDone` once, with what
    /// could be read in the order picked: empty when the tech backs out.
    struct LibraryPicker: UIViewControllerRepresentable {
        var kind: MediaKind
        var limit = 1
        var onDone: @MainActor @Sendable ([CameraPicker.Result]) -> Void

        func makeUIViewController(context: Context) -> PHPickerViewController {
            var config = PHPickerConfiguration()
            config.filter = kind == .video ? .videos : .images
            config.selectionLimit = kind == .video ? 1 : limit
            config.selection = .ordered
            config.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = context.coordinator
            return picker
        }

        func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}

        func makeCoordinator() -> Coordinator { Coordinator(kind: kind, onDone: onDone) }

        /// The picked files as they arrive, handed on once all are in.
        @MainActor final class Gathered {
            private var results: [Int: CameraPicker.Result] = [:]
            private var left: Int
            private let done: @MainActor @Sendable ([CameraPicker.Result]) -> Void

            init(count: Int, done: @escaping @MainActor @Sendable ([CameraPicker.Result]) -> Void) {
                left = count
                self.done = done
            }

            func add(_ index: Int, _ result: CameraPicker.Result?) {
                if let result { results[index] = result }
                left -= 1
                if left == 0 { done(results.keys.sorted().compactMap { results[$0] }) }
            }
        }

        final class Coordinator: NSObject, PHPickerViewControllerDelegate {
            let kind: MediaKind
            let onDone: @MainActor @Sendable ([CameraPicker.Result]) -> Void

            init(kind: MediaKind, onDone: @escaping @MainActor @Sendable ([CameraPicker.Result]) -> Void) {
                self.kind = kind
                self.onDone = onDone
            }

            // Off the main thread: the provider calls back on its own queue.
            nonisolated private static func keep(_ url: URL, _ type: UTType) -> CameraPicker.Result? {
                guard type == .movie else { return (try? Data(contentsOf: url)).map { .photo($0) } }
                let copy = CaptureRules.tempURL(url.pathExtension.isEmpty ? "mov" : url.pathExtension)
                return (try? FileManager.default.copyItem(at: url, to: copy)) != nil ? .video(copy) : nil
            }

            func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
                guard !results.isEmpty else { return onDone([]) }
                let type: UTType = kind == .video ? .movie : .image
                let gathered = Gathered(count: results.count, done: onDone)
                for (index, result) in results.enumerated() {
                    // The provider's file is removed when this returns: keep a copy (or the bytes).
                    // @Sendable: the provider calls back on a background queue. Without it the
                    // closure is taken as main-actor code and Swift 6 stops the app there (picking
                    // any photo crashed, 2026-10-21).
                    result.itemProvider.loadFileRepresentation(forTypeIdentifier: type.identifier) {
                        @Sendable url, _ in
                        let kept = url.flatMap { Self.keep($0, type) }
                        Task { @MainActor in gathered.add(index, kept) }
                    }
                }
            }
        }
    }
#endif
