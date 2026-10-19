#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // S9 accessibility: the main screens at the second-largest accessibility text size
    // (AX2), where labels must wrap rather than clip and controls stay reachable. Looked at from
    // CI's screenshots alongside the default size.
    @Suite(.serialized) @MainActor struct AccessibilityShots {
        /// Today on its own and its Getting Started card on its own (Today inside the tab view
        /// rendered blank in CI; these show which part).
        @Test func todayParts() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            try await snapshot("66-today-alone", height: 1500, NavigationStack { TodayScreen() }.app(env))
            let company = try #require(env.session.company)
            try await snapshot(
                "67-getting-started", ScrollView { GettingStartedCard(company: company).padding(16) }.app(env))
        }

        @Test func largeText() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            try await snapshot("60-today-ax", largeText: true, height: 2600, MainView().app(env))
            try await snapshot(
                "61-schedule-ax", largeText: true, height: 2600, NavigationStack { ScheduleScreen() }.app(env))
            let job = try sampleEnvironment()
            let ids = try seedInspection(job)
            try await snapshot(
                "62-job-ax", largeText: true, height: 3600, NavigationStack { JobScreen(jobId: ids.job) }.app(job))
            try await snapshot(
                "63-checklist-ax", largeText: true, height: 3600,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(job))
            try await snapshot(
                "64-more-ax", largeText: true, height: 2600,
                NavigationStack { MoreScreen(showWelcome: {}, showReauth: {}) }.app(env))
            let messages = try sampleEnvironment()
            _ = try seedMessages(messages.session.sync.store)
            try await snapshot("65-messages-ax", largeText: true, NavigationStack { MessagesScreen() }.app(messages))
        }
    }
#endif
