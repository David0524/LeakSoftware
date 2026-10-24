import Foundation
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/tus.test.ts.
@Suite struct TusUploaderTests {
    final class Resume: @unchecked Sendable {
        var url: String?
    }

    struct Setup {
        let server: FakeTusServer
        let uploader: TusUploader
        let resume: Resume

        func job() -> UploadJob {
            UploadJob(
                mediaId: "m1", companyId: "c", localPath: "/f", storagePath: "c/j/m1.mp4", mimeType: "video/mp4",
                resumeUrl: resume.url)
        }

        func save(_ url: String?) { resume.url = url }

        func upload() async throws -> UploadResult {
            try await uploader.upload(job()) { save($0) }
        }
    }

    func setup(_ file: Data, wrap: ((FakeTusServer) -> any HTTPClient)? = nil) -> Setup {
        let server = FakeTusServer()
        let uploader = TusUploader(
            supabaseUrl: "https://x.supabase.co/", apiKey: "pk", accessToken: { "tok" },
            files: MemoryFileSource(file: file), http: wrap?(server) ?? server, chunkSize: 10)
        return Setup(server: server, uploader: uploader, resume: Resume())
    }

    @Test func uploadsInChunksIntoTheMediaBucket() async throws {
        let file = testBytes(25)
        let s = setup(file)
        #expect(try await s.upload() == .uploaded)
        #expect(s.server.objects["media/c/j/m1.mp4"] == file)
        #expect(s.server.log == ["POST", "PATCH", "PATCH", "PATCH"])
        #expect(s.resume.url == nil)
    }

    @Test func resumesFromTheServersOffsetAfterTheAppDiesMidUpload() async throws {
        let file = testBytes(45)
        let s = setup(file)
        s.server.dropAfter(2)
        let error = await #expect(throws: (any Error).self) { try await s.upload() }
        #expect(error.map { String(describing: $0) }?.contains("Network request failed") == true)
        #expect(s.resume.url?.hasSuffix("resumable/u0") == true)

        s.server.clearLog()
        #expect(try await s.upload() == .uploaded)
        // HEAD finds 20 bytes; only the remaining 3 chunks are sent.
        #expect(s.server.log == ["HEAD", "PATCH", "PATCH", "PATCH"])
        #expect(s.server.objects["media/c/j/m1.mp4"] == file)
    }

    @Test func reportsAnObjectFinishedByAnEarlierAttemptAsAlreadyThere() async throws {
        let file = testBytes(15)
        let s = setup(file)
        // The last chunk lands, but the reply is lost.
        s.server.dropAfter(2)
        await #expect(throws: (any Error).self) { try await s.upload() }
        #expect(s.server.objects["media/c/j/m1.mp4"] != nil)
        // The saved upload is gone on the server (404), so it tries to create, which conflicts.
        #expect(try await s.upload() == .exists)
        #expect(s.server.objects.count == 1)
    }

    @Test func recoversWhenAChunkLandedButItsReplyWasLost() async throws {
        let file = testBytes(30)
        final class Once: @unchecked Sendable {
            var first = true
        }
        let once = Once()
        // Answer the first PATCH with a stale offset to force the 409 path.
        let s = setup(file) { server in
            InterceptingHTTPClient { request in
                let response = try await server.send(request)
                if request.method == "PATCH" && once.first {
                    once.first = false
                    var stale = request
                    stale.headers["upload-offset"] = "0"
                    return try await server.send(stale)
                }
                return response
            }
        }
        #expect(try await s.upload() == .uploaded)
        #expect(s.server.objects["media/c/j/m1.mp4"] == file)
    }

    @Test func failsWithoutASessionSoTheFileStaysQueued() async throws {
        let s = setup(testBytes(1))
        let uploader = TusUploader(
            supabaseUrl: "https://x.supabase.co", apiKey: "pk", accessToken: { nil },
            files: MemoryFileSource(file: Data(count: 1)))
        let error = await #expect(throws: UploadError.self) {
            try await uploader.upload(s.job()) { s.save($0) }
        }
        #expect(error?.description == "Not signed in")
    }

    /// Port of "says plainly when storage refuses a file, and throws so it stays queued (M2)".
    @Test func saysPlainlyWhenStorageRefusesAFile() async throws {
        func refused(_ status: Int, _ body: String) async -> String? {
            let s = setup(testBytes(1)) { _ in
                InterceptingHTTPClient { _ in HTTPResponse(status: status, body: Data(body.utf8)) }
            }
            let error = await #expect(throws: UploadHTTPError.self) { try await s.upload() }
            return error?.description
        }
        #expect(
            await refused(413, "The object exceeded the maximum allowed size")?
                .hasPrefix("That file is too large to upload (50 MB at most).") == true)
        #expect(
            await refused(415, "mime type text/html is not supported")?
                .hasPrefix("That type of file can’t be uploaded.") == true)
        #expect(
            await refused(403, "new row violates row-level security policy")?
                .hasPrefix("This shop is read-only until the subscription is paid") == true)
        #expect(await refused(500, "boom") == "Upload create failed (500) boom")
    }
}

/// Not in the TypeScript (React Native reads files there): the file system `FileSource`.
@Suite struct LocalFileSourceTests {
    @Test func readsTheSizeAndAPieceOfAFile() async throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("sundeck-\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(at: path) }
        let file = testBytes(25)
        try file.write(to: path)
        let source = LocalFileSource()
        #expect(try await source.size(path.path) == 25)
        #expect(try await source.read(path.path, offset: 20, length: 10) == file.subdata(in: 20..<25))
    }
}
