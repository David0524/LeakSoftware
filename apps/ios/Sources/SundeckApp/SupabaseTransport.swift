import Foundation
import SundeckCore
import SundeckSync
import Supabase

/// One database function call: the slice of Supabase the transport uses, so tests can stand
/// in for it. Port of RpcClient in packages/sync/src/supabase-transport.ts.
public protocol RPCClient: Sendable {
    func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue
}

/// An API error as PostgREST reports it.
public struct RPCError: Error, CustomStringConvertible {
    public let message: String
    public let code: String?
    public let status: Int?

    public init(message: String, code: String? = nil, status: Int? = nil) {
        self.message = message
        self.code = code
        self.status = status
    }

    public var description: String { message }
}

/// Sync over Supabase RPC: public.sync_push, public.sync_pull and public.sync_scope. A signed-out
/// user gets `AuthError` (sign in again); anything else is retried later.
public struct SupabaseTransport: SyncTransport {
    private let client: any RPCClient

    public init(_ client: any RPCClient) {
        self.client = client
    }

    public func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
        let arguments: JSONValue = ["mutations": try json(mutations), "device_id": .string(deviceId)]
        return try await call("sync_push", arguments).decode(PushResponse.self)
    }

    public func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
        let arguments: JSONValue = ["cursor": cursor, "page_size": .number(Double(pageSize))]
        return try await call("sync_pull", arguments).decode(PullPage.self)
    }

    /// Rows per table this user would download from the start (public.sync_pull_count,
    /// migration 7700), for the first download's progress. Nil on an older server.
    public func pullCount() async throws -> [String: Int]? {
        let value = try await call("sync_pull_count", [:])
        guard case .object(let counts) = value else { return nil }
        return counts.compactMapValues { v in v.number.map { Int($0) } }
    }

    public func scope() async throws -> String? {
        let value = try await call("sync_scope", [:])
        if case .string(let text) = value { return text }
        return value == .null ? "" : String(describing: value)
    }

    private func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
        do {
            return try await client.call(function, arguments)
        } catch let error as RPCError {
            if isAuthFailure(message: error.message, code: error.code, status: error.status) {
                throw AuthError(error.message)
            }
            throw SyncFailure(error.message)
        }
    }
}

/// The real client: PostgREST through supabase-swift.
public struct SupabaseRPC: RPCClient {
    public let client: SupabaseClient

    public init(_ client: SupabaseClient) {
        self.client = client
    }

    public func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
        do {
            return try await client.rpc(function, params: arguments).execute().value
        } catch let error as PostgrestError {
            throw RPCError(message: error.message, code: error.code)
        } catch let error as HTTPError {
            throw RPCError(
                message: String(decoding: error.data, as: UTF8.self), status: error.response.statusCode)
        }
    }
}
