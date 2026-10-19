import Foundation

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// One HTTP request, as the uploader sends it. Port of packages/sync/src/tus.ts.
public struct HTTPRequest: Sendable {
    public var method: String
    public var url: URL
    public var headers: [String: String]
    public var body: Data?

    public init(method: String, url: URL, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
    }

    /// A header by name, ignoring case.
    public func header(_ name: String) -> String? { lookup(headers, name) }
}

public struct HTTPResponse: Sendable {
    public var status: Int
    public var headers: [String: String]
    public var body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    /// A header by name, ignoring case.
    public func header(_ name: String) -> String? { lookup(headers, name) }

    public var text: String { String(decoding: body, as: UTF8.self) }
}

private func lookup(_ headers: [String: String], _ name: String) -> String? {
    headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
}

/// Sends HTTP requests (`fetch` in the TypeScript). Tests pass a fake server.
public protocol HTTPClient: Sendable {
    func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

/// `HTTPClient` over URLSession (FoundationNetworking on Linux).
public struct URLSessionHTTPClient: HTTPClient {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = request.method
        for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }
        urlRequest.httpBody = request.body
        let (data, response) = try await session.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse else { throw UploadError("Not an HTTP response") }
        var headers: [String: String] = [:]
        for (name, value) in http.allHeaderFields {
            headers[String(describing: name).lowercased()] = String(describing: value)
        }
        return HTTPResponse(status: http.statusCode, headers: headers, body: data)
    }
}

/// Reads a local file in pieces, so large videos never sit in memory twice.
public protocol FileSource: Sendable {
    func size(_ path: String) async throws -> Int
    func read(_ path: String, offset: Int, length: Int) async throws -> Data
}

/// `FileSource` over the file system.
public struct LocalFileSource: FileSource {
    public init() {}

    public func size(_ path: String) async throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        return (attributes[.size] as? NSNumber)?.intValue ?? 0
    }

    public func read(_ path: String, offset: Int, length: Int) async throws -> Data {
        let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        return try handle.read(upToCount: length) ?? Data()
    }
}

/// The upload server answered with an error status.
public struct UploadHTTPError: Error, CustomStringConvertible {
    public let status: Int
    public let description: String

    public init(status: Int, _ message: String) {
        self.status = status
        description = message
    }
}

/// An upload failed for a reason other than an HTTP status (no session, expired upload).
public struct UploadError: Error, CustomStringConvertible {
    public let description: String
    public init(_ message: String) { description = message }
}

/// Resumable uploads to Supabase Storage (TUS 1.0). The upload URL is saved after creation,
/// so a killed app resumes from the last confirmed byte instead of starting over. Uploads never
/// overwrite: if the object already exists (an earlier attempt finished but the app died before
/// recording it), the result is `exists`.
public struct TusUploader: Uploader {
    /// Supabase requires 6 MB chunks (the last one may be smaller).
    public static let defaultChunkSize = 6 * 1024 * 1024

    private let endpoint: URL
    private let apiKey: String
    private let accessToken: @Sendable () async throws -> String?
    private let files: any FileSource
    private let bucket: String
    private let http: any HTTPClient
    private let chunkSize: Int

    /// - Parameters:
    ///   - supabaseUrl: Project URL, e.g. https://xyz.supabase.co
    ///   - apiKey: Publishable key, sent as `apikey`.
    ///   - accessToken: The signed-in user's access token. Storage RLS checks the company folder.
    public init(
        supabaseUrl: String, apiKey: String, accessToken: @escaping @Sendable () async throws -> String?,
        files: any FileSource, bucket: String = "media", http: any HTTPClient = URLSessionHTTPClient(),
        chunkSize: Int = TusUploader.defaultChunkSize
    ) {
        let base = supabaseUrl.hasSuffix("/") ? String(supabaseUrl.dropLast()) : supabaseUrl
        endpoint = URL(string: "\(base)/storage/v1/upload/resumable")!
        self.apiKey = apiKey
        self.accessToken = accessToken
        self.files = files
        self.bucket = bucket
        self.http = http
        self.chunkSize = chunkSize
    }

    public func upload(_ job: UploadJob, saveResumeUrl: (String?) throws -> Void) async throws -> UploadResult {
        guard let token = try await accessToken(), !token.isEmpty else { throw UploadError("Not signed in") }
        let headers = [
            "authorization": "Bearer \(token)",
            "apikey": apiKey,
            "tus-resumable": "1.0.0",
        ]
        let size = try await files.size(job.localPath)

        var url = job.resumeUrl.flatMap { URL(string: $0) }
        var offset: Int? = nil
        if let resume = url { offset = try await offsetOf(resume, headers) }
        if offset == nil {
            let metadata = [
                "bucketName \(b64(bucket))",
                "objectName \(b64(job.storagePath))",
                "contentType \(b64(job.mimeType))",
                "cacheControl \(b64("31536000"))",
            ].joined(separator: ",")
            let created = try await http.send(
                HTTPRequest(
                    method: "POST", url: endpoint,
                    headers: headers.merging([
                        "upload-length": String(size),
                        "upload-metadata": metadata,
                        "x-upsert": "false",
                    ]) { _, new in new }))
            if created.status == 409 {
                let body = created.text
                if body.range(of: "already exists", options: .caseInsensitive) == nil {
                    throw UploadHTTPError(status: 409, "Upload create: \(body)")
                }
                try saveResumeUrl(nil)
                return .exists
            }
            if created.status != 201 { throw httpError("create", created) }
            guard let location = created.header("location") else {
                throw UploadError("Upload server did not return a location")
            }
            guard let resolved = URL(string: location, relativeTo: endpoint)?.absoluteURL else {
                throw UploadError("Upload server returned a bad location: \(location)")
            }
            url = resolved
            try saveResumeUrl(resolved.absoluteString)
            offset = 0
        }
        guard let url, var offset else { throw UploadError("Upload has no URL") }

        while offset < size {
            let length = min(chunkSize, size - offset)
            let body = try await files.read(job.localPath, offset: offset, length: length)
            let response = try await http.send(
                HTTPRequest(
                    method: "PATCH", url: url,
                    headers: headers.merging([
                        "upload-offset": String(offset),
                        "content-type": "application/offset+octet-stream",
                    ]) { _, new in new },
                    body: body))
            if response.status == 409 {
                // The server has a different offset (a chunk landed but its reply was lost).
                guard let actual = try await offsetOf(url, headers) else {
                    throw UploadError("Upload expired; it will restart")
                }
                offset = actual
                continue
            }
            if response.status != 204 && response.status != 200 { throw httpError("chunk", response) }
            offset = response.header("upload-offset").flatMap { Int($0) } ?? offset + length
        }
        try saveResumeUrl(nil)
        return .uploaded
    }

    /// Bytes the server has for this upload, or nil if it no longer knows it.
    private func offsetOf(_ url: URL, _ headers: [String: String]) async throws -> Int? {
        let response = try await http.send(HTTPRequest(method: "HEAD", url: url, headers: headers))
        if [404, 410, 403].contains(response.status) { return nil }
        if !(200..<300).contains(response.status) { throw httpError("resume", response) }
        return response.header("upload-offset").flatMap { Int($0) }
    }
}

/// Paths and MIME types are ASCII.
private func b64(_ text: String) -> String { Data(text.utf8).base64EncodedString() }

private func httpError(_ step: String, _ response: HTTPResponse) -> UploadHTTPError {
    let detail = String(response.text.prefix(200))
    return UploadHTTPError(
        status: response.status,
        "Upload \(step) failed (\(response.status)) \(detail)".trimmingCharacters(in: .whitespaces))
}
