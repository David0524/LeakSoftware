#if canImport(WidgetKit) && canImport(ActivityKit) && os(iOS)
    import ActivityKit
    import SundeckCore
    import SundeckLiveStop
    import SundeckTokens
    import SwiftUI
    import WidgetKit

    // The widget extension (docs/plans/live-activities-and-notifications.md): the Live Activity
    // for the stop a tech is on. The app starts and updates it with ActivityKit; this draws it
    // on the Lock Screen and in the Dynamic Island, from `liveStopContent` only.

    @main
    struct SundeckWidgets: WidgetBundle {
        init() { BrandFonts.register() }

        var body: some Widget { StopActivityWidget() }
    }

    struct StopActivityWidget: Widget {
        var body: some WidgetConfiguration {
            ActivityConfiguration(for: StopAttributes.self) { context in
                LiveStopLockScreen(content: liveStopContent(context.state), logo: LiveStopLogo.image())
                    .activityBackgroundTint(LiveStopStyle.background)
                    .activitySystemActionForegroundColor(.white)
                    .widgetURL(LiveStopLink.job(context.attributes.jobId))
            } dynamicIsland: { context in
                let content = liveStopContent(context.state)
                let logo = LiveStopLogo.image()
                return DynamicIsland {
                    DynamicIslandExpandedRegion(.leading) { LiveStopIsland.leading(logo: logo) }
                    DynamicIslandExpandedRegion(.trailing) { LiveStopIsland.trailing(content) }
                    DynamicIslandExpandedRegion(.center) { LiveStopIsland.center(content) }
                    DynamicIslandExpandedRegion(.bottom) {
                        LiveStopIsland.bottom(
                            content, call: LiveStopLink.call(context.attributes.phone),
                            open: LiveStopLink.job(context.attributes.jobId))
                    }
                } compactLeading: {
                    LiveStopIsland.mark(logo: logo)
                } compactTrailing: {
                    LiveStopIsland.compact(content)
                } minimal: {
                    LiveStopIsland.mark(logo: logo)
                }
                .widgetURL(LiveStopLink.job(context.attributes.jobId))
                .keylineTint(LiveStopStyle.water)
            }
        }
    }
#else
    // Linux builds and tests: nothing to draw.
    enum SundeckLiveActivityUnavailable {}
#endif
