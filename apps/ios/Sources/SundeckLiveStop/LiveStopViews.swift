#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit

    // The Live Activity's views (owner, 2026-10-19: "Make the live notification look beautiful
    // please. Include our logo." and "Do not include a timer or stop watch"): drawn by the widget
    // extension, and by the screenshot tests straight from here. Everything they show comes from
    // `liveStopContent`: an arrival time of day, the checklist, or the next stop, never a
    // countdown, so nothing on them ticks. Text is 15 pt or larger and scales with Dynamic Type,
    // and On My Way and Mark Complete open the app on the stop and do it there (owner, 2026-10-20).

    extension TokenColor {
        /// The token as a SwiftUI color (the app's own helper lives in its UI target).
        public var liveColor: Color {
            Color(
                .sRGB, red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255,
                opacity: Double(opacity) / 255)
        }
    }

    /// The Live Activity's colors and type: brand navy behind white text, the water blue for
    /// the progress, Barlow (the brand display face) for the name and the figure.
    public enum LiveStopStyle {
        public static let background = Tokens.Brand.navy.liveColor
        /// The water blue as it reads on navy (the light shade of `color.brand.water`).
        public static let water = Tokens.Role.link.dark.liveColor
        public static let text = Color.white
        public static let muted = Color.white.opacity(0.72)
        public static let track = Color.white.opacity(0.18)

        /// Barlow at `size`, scaling with Dynamic Type.
        public static func display(_ size: CGFloat, _ weight: BrandFonts.Weight = .bold) -> Font {
            .custom(weight.rawValue, size: size, relativeTo: .body)
        }

        /// The small text: 15 pt (subheadline), scaling with Dynamic Type.
        public static func small(_ weight: Font.Weight = .regular) -> Font { .subheadline.weight(weight) }
    }

    /// Sundeck Pro's mark (brand/logo/png/mark-reverse-512.png, the white pin for dark
    /// backgrounds), copied into the extension by xtool.yml's `resources`.
    public enum LiveStopLogo {
        public static let fileName = "mark-reverse-512"

        /// The mark from a bundle's root (the extension's), or nil when it isn't there.
        public static func image(in bundle: Bundle = .main) -> Image? {
            guard let url = bundle.url(forResource: fileName, withExtension: "png"),
                let picture = UIImage(contentsOfFile: url.path)
            else { return nil }
            return Image(uiImage: picture)
        }
    }

    /// The mark at a height, or a water-blue drop when the file is missing.
    public struct LiveStopMark: View {
        public var logo: Image?
        public var height: CGFloat

        public init(logo: Image?, height: CGFloat) {
            self.logo = logo
            self.height = height
        }

        public var body: some View {
            Group {
                if let logo {
                    logo.resizable().interpolation(.high).aspectRatio(contentMode: .fit)
                } else {
                    Image(systemName: "drop.fill").resizable().aspectRatio(contentMode: .fit)
                        .foregroundStyle(LiveStopStyle.water)
                }
            }
            .frame(height: height)
            .accessibilityHidden(true)
        }
    }

    /// The day's progress: a thin water-blue bar on a faint track.
    public struct LiveStopProgress: View {
        public var value: Double

        public init(value: Double) { self.value = value }

        public var body: some View {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LiveStopStyle.track)
                    Capsule().fill(LiveStopStyle.water)
                        .frame(width: max(geo.size.height, geo.size.width * min(1, max(0, value))))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
    }

    /// The stop's access notes on one line with a key (owner, 2026-10-20: gate code, which gate,
    /// dogs), in the brand's warning amber on navy.
    public struct LiveStopAccess: View {
        public var text: String

        public init(text: String) { self.text = text }

        public var body: some View {
            HStack(spacing: 6) {
                Image(systemName: "key.fill")
                    .font(LiveStopStyle.small(.semibold))
                    .foregroundStyle(Color(red: 1, green: 0.78, blue: 0.35))
                Text(text)
                    .font(LiveStopStyle.small(.medium))
                    .foregroundStyle(LiveStopStyle.text)
                    .lineLimit(1)
            }
            .accessibilityHidden(true)
        }
    }

    /// The large figure ("9:42 AM", "4 of 9", or the check) over its small label.
    public struct LiveStopFigure: View {
        public var content: LiveStopContent
        public var size: CGFloat
        public var alignment: HorizontalAlignment

        public init(content: LiveStopContent, size: CGFloat = 34, alignment: HorizontalAlignment = .trailing) {
            self.content = content
            self.size = size
            self.alignment = alignment
        }

        /// The ahead phase's symbol: a clock by its scheduled time, a calendar for "Today".
        var symbol: String? {
            content.figureLabel == "Scheduled" ? "clock" : content.figure == "Today" ? "calendar" : nil
        }

        public var body: some View {
            VStack(alignment: alignment, spacing: 0) {
                if content.figure == "✓" {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: size * 0.8, weight: .semibold))
                        .foregroundStyle(LiveStopStyle.water)
                        .frame(height: size)
                } else {
                    Text(content.figure)
                        .font(LiveStopStyle.display(size, .extraBold))
                        .monospacedDigit()
                        .foregroundStyle(LiveStopStyle.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                if !content.figureLabel.isEmpty || symbol != nil {
                    HStack(spacing: 3) {
                        // Before On My Way: a clock beside "Scheduled" (a time of day, not a countdown).
                        if let symbol { Image(systemName: symbol) }
                        if !content.figureLabel.isEmpty { Text(content.figureLabel) }
                    }
                    .font(LiveStopStyle.small(.semibold))
                    .foregroundStyle(LiveStopStyle.muted)
                }
            }
        }
    }

    /// One Live Activity button: its title, and the link that opens the app on the stop to do it.
    public struct LiveStopActionLink: Identifiable, Sendable {
        public var action: LiveStopAction
        public var url: URL

        public var id: String { action.rawValue }

        public init(action: LiveStopAction, url: URL) {
            self.action = action
            self.url = url
        }

        /// The phase's actions for a job (`LiveStopLink.actions`).
        public static func links(_ phase: LiveStopPhase, jobId: String) -> [LiveStopActionLink] {
            LiveStopLink.actions(phase).compactMap { action in
                LiveStopLink.action(action, jobId: jobId).map { LiveStopActionLink(action: action, url: $0) }
            }
        }
    }

    /// The Lock Screen (and banner) view: the mark and "Sundeck Pro" (or the actions), the
    /// headline, the large figure, the stop and the next stop, and the day's progress, on brand
    /// navy.
    public struct LiveStopLockScreen: View {
        public var content: LiveStopContent
        public var logo: Image?
        /// On My Way and Mark Complete, beside the mark (owner, 2026-10-20).
        public var actions: [LiveStopActionLink]

        public init(content: LiveStopContent, logo: Image?, actions: [LiveStopActionLink] = []) {
            self.content = content
            self.logo = logo
            self.actions = actions
        }

        public var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    LiveStopMark(logo: logo, height: 22)
                    if actions.isEmpty {
                        Text("Sundeck Pro")
                            .font(LiveStopStyle.display(15, .semiBold))
                            .foregroundStyle(LiveStopStyle.muted)
                        Spacer(minLength: 8)
                    } else {
                        Spacer(minLength: 8)
                        ForEach(actions) { link in
                            Link(destination: link.url) {
                                LiveStopButtonLabel(title: link.action.title, systemImage: link.action.systemImage)
                            }
                            .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                }
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(content.headline)
                            .font(LiveStopStyle.display(22))
                            .foregroundStyle(LiveStopStyle.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Text(content.detail)
                            .font(LiveStopStyle.small())
                            .foregroundStyle(LiveStopStyle.muted)
                            .lineLimit(1)
                        if let next = content.next {
                            Text(next)
                                .font(LiveStopStyle.small(.medium))
                                .foregroundStyle(LiveStopStyle.text)
                                .lineLimit(1)
                        }
                        if let access = content.access { LiveStopAccess(text: access) }
                    }
                    Spacer(minLength: 4)
                    LiveStopFigure(content: content)
                }
                LiveStopProgress(value: content.progress)
            }
            .padding(16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(content.spoken)
        }
    }

    /// The expanded Dynamic Island's parts, for the extension's `DynamicIsland` builder and the
    /// screenshots.
    @MainActor public enum LiveStopIsland {
        /// Leading: the mark.
        public static func leading(logo: Image?) -> some View {
            LiveStopMark(logo: logo, height: 30).padding(.leading, 4)
        }

        /// Trailing: the figure.
        public static func trailing(_ content: LiveStopContent) -> some View {
            LiveStopFigure(content: content, size: 26).padding(.trailing, 4)
        }

        /// Center: the headline.
        public static func center(_ content: LiveStopContent) -> some View {
            Text(content.headline)
                .font(LiveStopStyle.display(18))
                .foregroundStyle(LiveStopStyle.text)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }

        /// Bottom: the stop, the next stop and the progress, then Call and On My Way and Mark
        /// Complete (owner, 2026-10-20); Open Job when there are no actions (the island's tap opens
        /// the job too).
        public static func bottom(
            _ content: LiveStopContent, call: URL?, open: URL?, actions: [LiveStopActionLink] = []
        ) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(content.detail).font(LiveStopStyle.small()).foregroundStyle(LiveStopStyle.muted).lineLimit(1)
                    if let next = content.next {
                        Text(next).font(LiveStopStyle.small(.medium)).foregroundStyle(LiveStopStyle.text)
                            .lineLimit(1)
                    }
                    if let access = content.access { LiveStopAccess(text: access) }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(content.spoken)
                LiveStopProgress(value: content.progress)
                HStack(spacing: 8) {
                    if let call {
                        Link(destination: call) {
                            Image(systemName: "phone.fill")
                                .font(LiveStopStyle.small(.semibold))
                                .foregroundStyle(LiveStopStyle.text)
                                .frame(width: 44, height: 44)
                                .background(Circle().fill(Color.white.opacity(0.16)))
                        }
                        .accessibilityLabel("Call")
                    }
                    if actions.isEmpty, let open {
                        Link(destination: open) {
                            LiveStopButtonLabel(title: "Open Job", systemImage: "arrow.up.forward.app.fill")
                        }
                    }
                    ForEach(actions) { link in
                        Link(destination: link.url) {
                            LiveStopButtonLabel(title: link.action.title, systemImage: link.action.systemImage)
                        }
                    }
                }
            }
        }

        /// Compact trailing: the few characters ("9:42", "4/9", "✓").
        public static func compact(_ content: LiveStopContent) -> some View {
            Text(content.compact)
                .font(LiveStopStyle.display(15))
                .monospacedDigit()
                .foregroundStyle(LiveStopStyle.water)
                .accessibilityLabel(content.spoken)
        }

        /// Compact leading and minimal: the mark.
        public static func mark(logo: Image?) -> some View { LiveStopMark(logo: logo, height: 20) }
    }

    /// A pill button in the expanded island: white on a faint fill, 44 tall.
    public struct LiveStopButtonLabel: View {
        public var title: String
        public var systemImage: String

        public var body: some View {
            Label(title, systemImage: systemImage)
                .font(LiveStopStyle.small(.semibold))
                .foregroundStyle(LiveStopStyle.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule().fill(Color.white.opacity(0.16)))
        }
    }
#endif
