import Foundation
import Supabase

/// What S0 proves about the server: sign-in works and the sync functions answer under RLS.
public struct ServerCheck: Sendable {
    public let client: SupabaseClient

    public init(client: SupabaseClient) {
        self.client = client
    }

    /// On iPhone the session is kept in the Keychain; on Linux (tests) only in memory.
    public static func makeClient() -> SupabaseClient {
        #if canImport(Security)
            let storage = AuthClient.Configuration.defaultLocalStorage
        #else
            let storage = MemoryAuthStorage()
        #endif
        return SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabasePublishableKey,
            options: SupabaseClientOptions(auth: .init(storage: storage, emitLocalSessionAsInitialSession: true))
        )
    }

    /// Signs in and returns the account's email.
    public func signIn(email: String, password: String) async throws -> String {
        let session = try await client.auth.signIn(email: email, password: password)
        return session.user.email ?? email
    }

    /// Reads the first page the phone would pull and returns its row count. Proves the session
    /// reaches `sync_pull` through RLS, as the sync engine will in S2.
    public func firstPullRowCount(pageSize: Int = 50) async throws -> Int {
        struct Args: Encodable {
            let cursor: [String: String]
            let pageSize: Int
            enum CodingKeys: String, CodingKey {
                case cursor
                case pageSize = "page_size"
            }
        }
        struct Page: Decodable {
            let rows: [AnyJSON]
        }
        let page: Page =
            try await client
            .rpc("sync_pull", params: Args(cursor: [:], pageSize: pageSize))
            .execute()
            .value
        return page.rows.count
    }

    public func signOut() async throws {
        try await client.auth.signOut()
    }
}

/// Keeps the session in memory only. Used where there is no Keychain (Linux tests).
final class MemoryAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Data] = [:]

    func store(key: String, value: Data) throws { lock.withLock { values[key] = value } }
    func retrieve(key: String) throws -> Data? { lock.withLock { values[key] } }
    func remove(key: String) throws { _ = lock.withLock { values.removeValue(forKey: key) } }
}
