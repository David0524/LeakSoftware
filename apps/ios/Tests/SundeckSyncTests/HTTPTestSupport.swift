import Foundation
import SundeckSync

/// The error a fake server throws when a reply is lost (like fetch's TypeError).
struct FakeNetworkError: Error, CustomStringConvertible {
    let description = "Network request failed"
}

/// A small in-memory TUS server with Supabase's rules: no overwrite, 409 on conflicts. Port of
/// the `fakeServer` in packages/sync/test/tus.test.ts.
final class FakeTusServer: HTTPClient, @unchecked Sendable {
    struct PendingUpload {
        var path: String
        var length: Int
        var data: Data
    }

    private let lock = NSRecursiveLock()
    private var _objects: [String: Data] = [:]
    private var _uploads: [String: PendingUpload] = [:]
    private var _log: [String] = []
    private var next = 0
    /// Throw after the server has processed this many more PATCHes (reply lost, app killed).
    private var dropAfterPatches = Int.max

    var objects: [String: Data] { lock.withLock { _objects } }
    var uploads: [String: PendingUpload] { lock.withLock { _uploads } }
    var log: [String] { lock.withLock { _log } }

    func clearLog() { lock.withLock { _log.removeAll() } }

    func dropAfter(_ n: Int) { lock.withLock { dropAfterPatches = n } }

    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        try lock.withLock { try handle(request) }
    }

    private func handle(_ request: HTTPRequest) throws -> HTTPResponse {
        let url = request.url.absoluteString
        let method = request.method
        _log.append(method)
        if request.header("authorization") != "Bearer tok" { return HTTPResponse(status: 401, body: Data("no".utf8)) }
        if method == "POST" {
            var meta: [String: String] = [:]
            for pair in (request.header("upload-metadata") ?? "").split(separator: ",") {
                let parts = pair.split(separator: " ", maxSplits: 1).map(String.init)
                let value = parts.count > 1 ? Data(base64Encoded: parts[1]) ?? Data() : Data()
                meta[parts[0]] = String(decoding: value, as: UTF8.self)
            }
            let path = "\(meta["bucketName"] ?? "")/\(meta["objectName"] ?? "")"
            if _objects[path] != nil || _uploads.values.contains(where: { $0.path == path }) {
                return HTTPResponse(status: 409, body: Data("The resource already exists".utf8))
            }
            let id = "https://x.supabase.co/storage/v1/upload/resumable/u\(next)"
            next += 1
            _uploads[id] = PendingUpload(
                path: path, length: Int(request.header("upload-length") ?? "") ?? 0, data: Data())
            return HTTPResponse(status: 201, headers: ["Location": id])
        }
        guard var upload = _uploads[url] else { return HTTPResponse(status: 404) }
        if method == "HEAD" {
            return HTTPResponse(status: 200, headers: ["Upload-Offset": String(upload.data.count)])
        }
        if method == "PATCH" {
            if Int(request.header("upload-offset") ?? "") != upload.data.count {
                return HTTPResponse(status: 409, body: Data("offset".utf8))
            }
            upload.data.append(request.body ?? Data())
            if upload.data.count == upload.length {
                _objects[upload.path] = upload.data
                _uploads[url] = nil
            } else {
                _uploads[url] = upload
            }
            let remaining = dropAfterPatches
            if remaining != Int.max { dropAfterPatches = remaining - 1 }
            if remaining <= 1 {
                dropAfterPatches = Int.max
                throw FakeNetworkError()
            }
            return HTTPResponse(status: 204, headers: ["Upload-Offset": String(upload.data.count)])
        }
        return HTTPResponse(status: 405)
    }
}

/// Wraps a client so a test can change what it sends or receives.
struct InterceptingHTTPClient: HTTPClient {
    let intercept: @Sendable (HTTPRequest) async throws -> HTTPResponse

    func send(_ request: HTTPRequest) async throws -> HTTPResponse { try await intercept(request) }
}

/// A file held in memory.
struct MemoryFileSource: FileSource {
    let file: Data

    func size(_ path: String) async throws -> Int { file.count }

    func read(_ path: String, offset: Int, length: Int) async throws -> Data {
        file.subdata(in: offset..<min(offset + length, file.count))
    }
}

/// Test bytes: (i * 7) % 256.
func testBytes(_ n: Int) -> Data {
    Data((0..<n).map { UInt8(($0 * 7) % 256) })
}
