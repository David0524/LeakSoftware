#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckLiveStop
    import SundeckTokens
    import SwiftUI
    import Testing
    import UIKit

    @testable import SundeckApp

    // The Live Activity (owner, 2026-10-19: "Make the live notification look beautiful please.
    // Include our logo." and "Do not include a timer or stop watch"). WidgetKit can't be drawn
    // in a test, so these render the extension's own views (SundeckLiveStop) the way iOS frames
    // them: the Lock Screen banner on a light and a dark wallpaper, the expanded Dynamic Island,
    // and the compact and minimal islands.

    /// brand/logo/png/mark-reverse-512.png, the file xtool copies into the extension.
    @MainActor private var liveLogo: Image? {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../brand/logo/png/\(LiveStopLogo.fileName).png").standardized
        return UIImage(contentsOfFile: url.path).map { Image(uiImage: $0) }
    }

    private let next = LiveStopNext(customer: "Riley Rivera", time: "11:00 AM")
    private let phases: [(name: String, input: LiveStopInput)] = [
        (
            "ahead",
            LiveStopInput(
                phase: .ahead, customer: "Grace Holloway", address: "2 Palm Ct, Mesa", stop: 3, stops: 7, eta: nil,
                scheduled: "9:00 AM", checklistDone: 0, checklistTotal: 0, next: next)
        ),
        (
            "driving",
            LiveStopInput(
                phase: .driving, customer: "Grace Holloway", address: "2 Palm Ct, Mesa", stop: 3, stops: 7,
                eta: "9:42 AM", checklistDone: 0, checklistTotal: 0, next: next,
                access: "Side gate code 4821. Dog in yard.")
        ),
        (
            "on-site",
            LiveStopInput(
                phase: .onSite, customer: "Grace Holloway", address: "2 Palm Ct, Mesa", stop: 3, stops: 7, eta: nil,
                checklistDone: 4, checklistTotal: 9, next: next)
        ),
        (
            "done",
            LiveStopInput(
                phase: .done, customer: "Grace Holloway", address: "2 Palm Ct, Mesa", stop: 3, stops: 7, eta: nil,
                checklistDone: 9, checklistTotal: 9, next: next)
        ),
        (
            "last",
            LiveStopInput(
                phase: .done, customer: "Grace Holloway", address: nil, stop: 7, stops: 7, eta: nil,
                checklistDone: 9, checklistTotal: 9, next: nil)
        ),
    ]

    /// The Lock Screen: each phase's banner, as iOS shows it (rounded, inset) over a wallpaper.
    private struct LockScreenSample: View {
        var dark: Bool
        var logo: Image?

        var body: some View {
            VStack(spacing: 14) {
                Text("Tuesday, October 20").font(.system(size: 20, weight: .semibold))
                Text("8:17").font(.system(size: 88, weight: .bold, design: .rounded))
                ForEach(phases, id: \.name) { phase in
                    LiveStopLockScreen(content: liveStopContent(phase.input), logo: logo)
                        .background(LiveStopStyle.background)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(dark ? Color.white : Color.black.opacity(0.8))
            .padding(.horizontal, 14)
            .padding(.top, 60)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                LinearGradient(
                    colors: dark
                        ? [Color(white: 0.08), Color(red: 0.05, green: 0.1, blue: 0.2)]
                        : [Color(red: 0.86, green: 0.92, blue: 0.98), Color(red: 0.98, green: 0.93, blue: 0.86)],
                    startPoint: .top, endPoint: .bottom))
        }
    }

    /// The Dynamic Island: expanded for each phase, then compact and minimal, on black.
    private struct IslandSample: View {
        var logo: Image?

        var body: some View {
            VStack(spacing: 18) {
                ForEach(phases, id: \.name) { phase in
                    let content = liveStopContent(phase.input)
                    VStack(spacing: 8) {
                        HStack(alignment: .center) {
                            LiveStopIsland.leading(logo: logo)
                            Spacer()
                            LiveStopIsland.center(content)
                            Spacer()
                            LiveStopIsland.trailing(content)
                        }
                        LiveStopIsland.bottom(
                            content, call: LiveStopLink.call("(602) 555-0100"), open: LiveStopLink.job("j1"))
                    }
                    .padding(18)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 44, style: .continuous))
                }
                LazyVGrid(columns: [GridItem(), GridItem()], spacing: 12) {
                    ForEach(phases.prefix(4), id: \.name) { phase in
                        HStack(spacing: 40) {
                            LiveStopIsland.mark(logo: logo)
                            LiveStopIsland.compact(liveStopContent(phase.input))
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(Color.black, in: Capsule())
                    }
                }
                HStack {
                    LiveStopIsland.mark(logo: logo)
                        .frame(width: 36, height: 36)
                        .background(Color.black, in: Circle())
                    Spacer()
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.top, 40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(white: 0.92))
        }
    }

    @Suite(.serialized) @MainActor struct LiveActivityShots {
        @Test func liveActivity() async throws {
            BrandFonts.register()
            let logo = liveLogo
            #expect(logo != nil, "brand/logo/png/mark-reverse-512.png not found")
            try await snapshot("66-live-activity-lock", height: 1500, LockScreenSample(dark: false, logo: logo))
            try await snapshot(
                "66-live-activity-lock-dark", dark: true, height: 1500, LockScreenSample(dark: true, logo: logo))
            try await snapshot("66-live-activity-island", height: 1600, IslandSample(logo: logo))
        }

        @Test func notificationsSettings() async throws {
            let env = try sampleEnvironment()
            try await snapshot("67-notifications", NavigationStack { NotificationsScreen() }.app(env))
            try await snapshot(
                "67-notifications-dark", dark: true, NavigationStack { NotificationsScreen() }.app(env))
        }
    }
#endif
