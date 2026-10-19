import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Port of packages/sync/test/supabase-transport.test.ts.
@Suite struct SupabaseTransportTests {
    final class Recorder: RPCClient, @unchecked Sendable {
        let lock = NSLock()
        var calls: [(String, JSONValue)] = []
        let reply: @Sendable (String) throws -> JSONValue

        init(reply: @escaping @Sendable (String) throws -> JSONValue) {
            self.reply = reply
        }

        func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
            lock.withLock { calls.append((function, arguments)) }
            return try reply(function)
        }
    }

    @Test func callsTheSyncFunctionsWithNamedArguments() async throws {
        let client = Recorder { function in
            function == "sync_push"
                ? ["server_hlc": "1760000000000-0000-srv", "results": []]
                : ["rows": [], "done": true, "cursor": ["from": "6"], "server_hlc": "1760000000000-0000-srv"]
        }
        let t = SupabaseTransport(client)
        _ = try await t.push([], deviceId: "dev1")
        _ = try await t.pull(cursor: ["from": "5"], pageSize: 100)
        #expect(client.calls.map(\.0) == ["sync_push", "sync_pull"])
        #expect(client.calls[0].1 == ["mutations": [], "device_id": "dev1"])
        #expect(client.calls[1].1 == ["cursor": ["from": "5"], "page_size": 100])
    }

    @Test func turnsAPIErrorsIntoExceptionsSoChangesStayQueued() async throws {
        let expired = SupabaseTransport(Recorder { _ in throw RPCError(message: "JWT expired") })
        await #expect(throws: AuthError.self) { try await expired.push([], deviceId: "d") }
        let down = SupabaseTransport(Recorder { _ in throw RPCError(message: "upstream timeout", status: 504) })
        await #expect(throws: SyncFailure.self) { try await down.push([], deviceId: "d") }
    }
}
