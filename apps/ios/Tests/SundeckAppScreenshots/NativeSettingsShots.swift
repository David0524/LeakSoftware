#if os(iOS)
    import Foundation
    import SundeckCore
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // Settings built in the app (owner, 2026-10-20: "From the app, do not link to the website").
    @Suite(.serialized) @MainActor struct NativeSettingsShots {
        @Test func settingsPages() async throws {
            let env = try sampleEnvironment()
            try await snapshot(
                "68-settings-company", height: 2600, NavigationStack { CompanySettingsScreen() }.app(env))
            try await snapshot(
                "68-settings-scheduling", height: 2000, NavigationStack { SchedulingSettingsScreen() }.app(env))
            try await snapshot(
                "68-settings-scheduling-dark", dark: true, height: 2000,
                NavigationStack { SchedulingSettingsScreen() }.app(env))
            try await snapshot("68-settings-reports", NavigationStack { ReportTemplatesScreen() }.app(env))
            try await snapshot(
                "68-settings-phone", height: 1600, NavigationStack { PhoneSettingsScreen() }.app(env))
        }
    }
#endif
