import Foundation
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
        #expect(AppConfig.supabaseURL.absoluteString == dev.url)
        #expect(AppConfig.supabasePublishableKey == dev.publishableKey)
        #expect(AppConfig.webURL.absoluteString == dev.webUrl)
    }
}

/// Signs in to the hosted dev project as the demo tech. Needs the network, so it runs only
/// with `SUNDECK_LIVE=1` (cloud sessions), not in CI.
@Suite(.enabled(if: ProcessInfo.processInfo.environment["SUNDECK_LIVE"] == "1"))
struct LiveServerTests {
    @Test func demoTechSignsInAndPulls() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        let email = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        #expect(email == "tech@demo.leakbook.test")
        let rows = try await check.firstPullRowCount()
        #expect(rows > 0)
        try await check.signOut()
    }
}
