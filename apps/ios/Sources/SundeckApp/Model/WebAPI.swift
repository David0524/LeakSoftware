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
        /// Form errors by field name (a 400 reply's `fields`).
        public var fields: [String: String] = [:]

        public static let noConnection = "No connection. Try again when you have signal."

        /// The phone couldn't reach the server (nothing was done there).
        public var offline: Bool { description == Self.noConnection }
    }

    /// POSTs `body` as JSON with the person's sign-in, and returns the JSON reply.
    public func post(_ path: String, _ body: JSONValue = [:]) async throws -> JSONValue {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await send(request)
    }

    /// Sends `body` as JSON with another method (PUT, DELETE), and returns the JSON reply.
    public func send(_ method: String, _ path: String, _ body: JSONValue = [:]) async throws -> JSONValue {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await send(request)
    }

    /// GETs `path` with `query` parameters and the person's sign-in, and returns the JSON reply.
    public func get(_ path: String, query: [String: String] = [:]) async throws -> JSONValue {
        var url = baseURL.appendingPathComponent(path)
        if !query.isEmpty, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
            url = parts.url ?? url
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        return try await send(request)
    }

    private func send(_ prepared: URLRequest) async throws -> JSONValue {
        guard let token = await accessToken() else { throw Failure(description: "Sign in again to continue.") }
        var request = prepared
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Failure(description: Failure.noConnection)
        }
        let reply = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? [:]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var fields: [String: String] = [:]
            if case .object(let f)? = reply["fields"] { for (k, v) in f { fields[k] = v.string } }
            throw Failure(
                description: reply["error"]?.string ?? fields.values.sorted().first ?? "The server said \(status).",
                fields: fields)
        }
        return reply
    }
}

/// The weather at the shop for Today (GET /api/weather): the website's `Weather`.
public struct Weather: Decodable, Equatable, Sendable {
    /// clear, partly, cloudy, rain, storm, snow, fog, wind, dust.
    public var kind: String
    public var tempF: Int
    /// "Mostly Clear"
    public var conditions: String
    public var isDaytime: Bool
    /// Today's high while there's daytime left.
    public var highF: Int?

    public init(kind: String, tempF: Int, conditions: String, isDaytime: Bool, highF: Int?) {
        self.kind = kind
        self.tempF = tempF
        self.conditions = conditions
        self.isDaytime = isDaytime
        self.highF = highF
    }

    /// From the reply's `weather` (nil when the service didn't answer).
    public init?(_ reply: JSONValue?) {
        guard let w = reply, let temp = w["tempF"]?.number, let conditions = w["conditions"]?.string else {
            return nil
        }
        self.init(
            kind: w["kind"]?.string ?? "cloudy", tempF: Int(temp.rounded()), conditions: conditions,
            isDaytime: w["isDaytime"]?.bool ?? true, highF: w["highF"]?.number.map { Int($0.rounded()) })
    }

    /// "Weather: 76°F, Mostly Clear, high 85°"
    public var accessibilityLabel: String {
        "Weather: \(tempF)°F, \(conditions)\(highF.map { ", high \($0)°" } ?? "")"
    }
}

extension WebAPI {
    /// The weather for a 5-digit ZIP, or nil when unknown or offline (Today then leaves it out).
    public func weather(zip: String?) async -> Weather? {
        guard let zip = zip?.trimmingCharacters(in: .whitespaces), zip.wholeMatch(of: /\d{5}/) != nil else {
            return nil
        }
        return Weather((try? await get("api/weather", query: ["zip": zip]))?["weather"])
    }
}
