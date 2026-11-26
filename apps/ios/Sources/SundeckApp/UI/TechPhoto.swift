#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    // The tech's photo (2026-11-26, docs/design/2026-11-26-second-business-and-tech-photos.md):
    // shown round, with the first initial on the tech's team color when there's none. Settings ›
    // Team (owners and admins, anyone's) and My Profile (everyone, their own) add, change and
    // remove it. A photo is cropped square in the center, saved at 512 px, uploaded to
    // company-assets under a new name each time, then set with `set_member_photo`; the membership
    // row comes back with the next sync.

    /// Photos already read, by path (a path never changes its picture).
    @MainActor enum TechPhotoCache {
        static var images: [String: UIImage] = [:]
    }

    /// A member's round photo, or their initial on their team color.
    struct TechPhoto: View {
        var path: String?
        var name: String
        var color: TechColor
        var size: CGFloat = 56
        /// A photo just chosen, shown until the sync brings its path.
        var picked: UIImage? = nil
        @Environment(AppEnvironment.self) private var app
        @State private var image: UIImage?
        @State private var shownPath: String?

        var body: some View {
            ZStack {
                if let shown = picked ?? (path != nil && shownPath == path ? image : nil) {
                    Image(uiImage: shown).resizable().scaledToFill()
                } else {
                    Circle().fill(color.color)
                    Text(techInitial(name))
                        .font(.system(size: size * 0.42, weight: .semibold))
                        .foregroundStyle(Color.white)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityHidden(true)
            .task(id: path) { await load() }
        }

        private func load() async {
            guard let path else { return }
            if let cached = TechPhotoCache.images[path] {
                image = cached
                shownPath = path
                return
            }
            guard
                let url = try? await app.client.storage.from("company-assets").createSignedURL(
                    path: path, expiresIn: 3600),
                let (data, _) = try? await URLSession.shared.data(from: url),
                let loaded = UIImage(data: data)
            else { return }
            TechPhotoCache.images[path] = loaded
            image = loaded
            shownPath = path
        }
    }

    /// A photo cropped square in the center and scaled to `side` px, as JPEG.
    @MainActor func squarePhotoJPEG(_ data: Data, side: Int, quality: CGFloat = 0.8) -> Data? {
        guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else { return nil }
        let w = image.size.width
        let h = image.size.height
        let crop = min(w, h)
        let scale = CGFloat(side) / crop
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        let square = renderer.image { _ in
            image.draw(
                in: CGRect(
                    x: -(w - crop) / 2 * scale, y: -(h - crop) / 2 * scale, width: w * scale, height: h * scale))
        }
        return square.jpegData(compressionQuality: quality)
    }

    /// `set_member_photo(target_member, path)`: null removes the photo.
    private struct MemberPhotoParams: Encodable {
        var targetMember: String
        var path: String?

        enum CodingKeys: String, CodingKey {
            case targetMember = "target_member"
            case path
        }

        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(targetMember, forKey: .targetMember)
            // Null, not left out, so Remove Photo reaches the function.
            if let path { try c.encode(path, forKey: .path) } else { try c.encodeNil(forKey: .path) }
        }
    }

    /// The Photo group: the photo with Add Photo / Change Photo and Remove Photo. Needs a
    /// connection; the membership row follows with the next sync.
    struct MemberPhotoGroup: View {
        var label: String
        var footer: String?
        /// The membership row.
        var membershipId: String
        var userId: String
        var name: String
        var color: TechColor
        /// The synced `membership.photo_path`.
        var photoPath: String?
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var choosing = false
        @State private var busy = false
        @State private var error: String?
        /// What was just saved, shown until the sync brings it (a nil path after Remove Photo).
        @State private var justSaved: (path: String?, image: UIImage?)?

        private var path: String? {
            if let justSaved { return justSaved.path }
            return photoPath
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                Grouped(label: label, footer: footer) {
                    HStack(spacing: 16) {
                        TechPhoto(path: path, name: name, color: color, size: 64, picked: justSaved?.image)
                        VStack(alignment: .leading, spacing: 8) {
                            Button {
                                choosing = true
                            } label: {
                                BusyButtonLabel(
                                    path == nil ? TechCardText.addPhoto : TechCardText.changePhoto, busy: busy,
                                    busyTitle: "Saving…")
                            }
                            .buttonStyle(.secondary)
                            if path != nil {
                                Button(TechCardText.removePhoto, role: .destructive) { Task { await save(nil) } }
                                    .buttonStyle(.destructiveSecondary)
                            }
                        }
                        .disabled(busy)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                }
                if let error { Notice(kind: .error, text: error) }
            }
            .onChange(of: photoPath) { _, _ in justSaved = nil }
            .sheet(isPresented: $choosing) {
                LibraryPicker(kind: .photo) { results in
                    choosing = false
                    if case .photo(let data)? = results.first { Task { await upload(data) } }
                }
                .ignoresSafeArea()
            }
        }

        /// Crops and uploads the chosen photo under a new name, then sets it.
        private func upload(_ data: Data) async {
            guard let company = session.company, !busy else { return }
            guard let jpeg = squarePhotoJPEG(data, side: TechCardText.size) else {
                error = UploadRefusal.wrongType.message(.media)
                return
            }
            busy = true
            defer { busy = false }
            error = nil
            let newPath = memberPhotoPath(company.id, userId, Int(Date().timeIntervalSince1970 * 1000))
            do {
                try await app.client.storage.from("company-assets")
                    .upload(newPath, data: jpeg, options: FileOptions(contentType: "image/jpeg"))
                try await app.client.rpc(
                    "set_member_photo", params: MemberPhotoParams(targetMember: membershipId, path: newPath)
                ).execute()
                let image = UIImage(data: jpeg)
                if let image { TechPhotoCache.images[newPath] = image }
                justSaved = (newPath, image)
                await sync.syncNow()
            } catch {
                self.error = failureText(error, upload: true)
            }
        }

        /// Sets the photo's path (nil removes it; the file stays, for reports already sent).
        private func save(_ newPath: String?) async {
            guard !busy else { return }
            busy = true
            defer { busy = false }
            error = nil
            do {
                try await app.client.rpc(
                    "set_member_photo", params: MemberPhotoParams(targetMember: membershipId, path: newPath)
                ).execute()
                justSaved = (newPath, nil)
                await sync.syncNow()
            } catch {
                self.error = failureText(error, upload: false)
            }
        }

        private func failureText(_ error: Error, upload: Bool) -> String {
            let message = String(describing: error)
            if upload, let refusal = UploadRefusal(status: nil, message: message) { return refusal.message(.media) }
            return isNetworkFailure(message) ? WebAPI.Failure.noConnection : friendlyError(message)
        }
    }
#endif
