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

        /// Saved reports and the report's step list (owner, 2026-10-20).
        @Test func savedReportsAndProgress() async throws {
            let env = try sampleEnvironment()
            try await snapshot("69-saved-report-new", height: 1200, SavedReportSheet(saved: nil).app(env))
            try await snapshot(
                "69-report-progress",
                ScreenScroll {
                    ProgressSteps(steps: ReportProgress.steps(.draft), current: 1).card()
                }
                .app(env))
            try await snapshot(
                "69-report-progress-dark", dark: true,
                ScreenScroll {
                    ProgressSteps(steps: ReportProgress.steps(.finish), current: 2).card()
                }
                .app(env))
        }
    }
#endif
