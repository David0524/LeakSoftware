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

        /// The owner's dashboard (owner, 2026-10-20: "Dashboard should be in the apps").
        @Test func dashboard() async throws {
            let env = try sampleEnvironment()
            let months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].enumerated().map { i, m in
                DashboardMonth(
                    month: m, quotesSent: 3 + i % 2, quotesAccepted: 2, invoicedCents: 250_000 + i * 40_000,
                    outstandingCents: i == 5 ? 82_500 : 0, collectedCents: 180_000 + i * 35_000)
            }
            let data = DashboardData(
                statuses: ["scheduled": 6, "in_progress": 2, "report_sent": 3, "invoiced": 4, "paid": 21],
                outstandingCents: 82_500, months: months)
            try await snapshot(
                "70-dashboard", height: 2400, NavigationStack { DashboardScreen(data: data) }.app(env))
            try await snapshot(
                "70-dashboard-dark", dark: true, height: 2400, NavigationStack { DashboardScreen(data: data) }.app(env))
        }
    }
#endif
