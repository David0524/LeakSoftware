import Foundation
import SundeckCore

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// The website's API for things only the server does (sending, deleting an account). Port of
/// `call` in apps/mobile/src/data/reports.ts, with the same messages.
public struct WebAPI: Sendable {
    public var baseURL: URL
    public var accessToken: @Sendable () async -> String?
    public var session: URLSession = .shared

    public init(baseURL: URL, accessToken: @escaping @Sendable () async -> String?) {
        self.baseURL = baseURL
        self.accessToken = accessToken
    }

    public struct Failure: Error, CustomStringConvertible, Equatable {
        public let description: String
    }

    /// POSTs `body` as JSON with the person's sign-in, and returns the JSON reply.
    public func post(_ path: String, _ body: JSONValue = [:]) async throws -> JSONValue {
        guard let token = await accessToken() else { throw Failure(description: "Sign in again to continue.") }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure(description: "No connection. Try again when you have signal.")
        }
        let reply = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? [:]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw Failure(description: reply["error"]?.string ?? "The server said \(status).")
        }
        return reply
    }
}
