import Foundation
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

@Suite struct ConfigTests {
    /// `config/supabase-dev.json` is the source; the app's copy must match it.
    @Test func matchesTheRepositoryConfig() throws {
        let json = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../config/supabase-dev.json")
            .standardized
        struct Dev: Decodable {
            let url: String
            let publishableKey: String
            let webUrl: String
        }
        let dev = try JSONDecoder().decode(Dev.self, from: Data(contentsOf: json))
        #expect(AppConfig.devSupabaseURL.absoluteString == dev.url)
        #expect(AppConfig.devSupabasePublishableKey == dev.publishableKey)
        #expect(AppConfig.defaultWebURL.absoluteString == dev.webUrl)
        // A test bundle sets nothing, so the dev project is used.
        #expect(AppConfig.supabaseURL.absoluteString == dev.url)
        #expect(AppConfig.supabasePublishableKey == dev.publishableKey)
        #expect(AppConfig.webURL.absoluteString == dev.webUrl)
    }

    /// A production build's Info.plist values win; empty or unexpanded ones fall back to dev.
    @Test func buildSettingsChooseTheProject() {
        let prod: [String: Any] = [
            "SundeckSupabaseURL": "https://abcdefghijklmnopqrst.supabase.co/",
            "SundeckSupabaseKey": "sb_publishable_prod",
            "SundeckWebURL": "https://sundeckpro.com",
        ]
        #expect(
            AppConfig.url(prod, "SundeckSupabaseURL")?.absoluteString
                == "https://abcdefghijklmnopqrst.supabase.co")
        #expect(AppConfig.setting(prod, "SundeckSupabaseKey") == "sb_publishable_prod")
        #expect(AppConfig.url(prod, "SundeckWebURL")?.absoluteString == "https://sundeckpro.com")
        let unset: [String: Any] = [
            "SundeckSupabaseURL": "$(SUNDECK_SUPABASE_URL)", "SundeckSupabaseKey": "",
        ]
        #expect(AppConfig.url(unset, "SundeckSupabaseURL") == nil)
        #expect(AppConfig.setting(unset, "SundeckSupabaseKey") == nil)
        #expect(AppConfig.url(nil, "SundeckWebURL") == nil)
        #expect(AppConfig.url(["SundeckWebURL": "http://insecure.example"], "SundeckWebURL") == nil)
    }
}

/// Signs in to the hosted dev project as the demo tech. Needs the network, so it runs only
/// with `SUNDECK_LIVE=1` (cloud sessions), not in CI.
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["SUNDECK_LIVE"] == "1"))
struct LiveServerTests {
    @Test func demoTechSignsInAndPulls() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        let email = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        #expect(email == "tech@demo.leakbook.test")
        let rows = try await check.firstPullRowCount()
        #expect(rows > 0)
        try await check.signOut()
    }

    /// The Swift engine pulls the demo shop into an encrypted database through Supabase.
    /// Pull only: nothing is written to the dev project.
    @Test func demoTechPullsThroughTheSyncEngine() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        _ = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("live-\(UUID()).db").path
        let store = try LocalStore.open(Database(path: path, key: String(repeating: "3c", count: 32)))
        let engine = SyncEngine(store: store, transport: SupabaseTransport(SupabaseRPC(check.client)))
        let summary = await engine.sync()
        #expect(summary.error == nil)
        #expect(summary.pulled > 0)
        #expect(summary.pending == 0)
        #expect(try !store.list("job").isEmpty)
        #expect(try !store.list("component_type").isEmpty)
        try await check.signOut()
    }
}
