#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit
    import WidgetKit

    // The Live Activity's views (owner, 2026-10-19: "Make the live notification look beautiful
    // please. Include our logo." and "Do not include a timer or stop watch"): drawn by the widget
    // extension, and by the screenshot tests straight from here. Everything they show comes from
    // `liveStopContent`: the stop's place in the day ("2 of 5"), the checklist, or the next
    // stop, never a clock time (owner, 2026-10-20: "I don't like times in the live activity") or a
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

    /// The Live Activity's colors and type: the brand's water blue behind white text (owner,
    /// 2026-10-20: "use our lighter blue for live activities"; it was navy), white for the
    /// progress and the check, Barlow (the brand display face) for the name and the figure. The
    /// Dynamic Island is always black, where the same white reads too.
    public enum LiveStopStyle {
        public static let background = Tokens.Brand.water.liveColor
        /// The Dynamic Island's keyline: the same water blue.
        public static let keyline = Tokens.Brand.water.liveColor
        /// The progress bar and the done check.
        public static let accent = Color.white
        /// Text in the Dynamic Island, which is always black: the water blue's light shade.
        public static let island = Tokens.Role.link.dark.liveColor
        public static let text = Color.white
        /// Secondary text: 0.85 white keeps 4.5:1 on the water blue.
        public static let muted = Color.white.opacity(0.85)
        public static let track = Color.white.opacity(0.28)

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
        /// The tallest the mark is drawn (the Lock Screen's), at 3x: 48 pt.
        static let pixelHeight: CGFloat = 144

        /// The mark from a bundle's root (the extension's), or nil when it isn't there. It's
        /// redrawn at the size it shows (the file is 512 by 749): a Live Activity's images are
        /// kept small, and one too big for it came out as a black shape (TestFlight, 2026-10-20).
        public static func image(in bundle: Bundle = .main) -> Image? {
            guard let url = bundle.url(forResource: fileName, withExtension: "png"),
                let picture = UIImage(contentsOfFile: url.path), picture.size.height > 0
            else { return nil }
            let scale = min(1, pixelHeight / (picture.size.height * picture.scale))
            let size = CGSize(
                width: (picture.size.width * picture.scale * scale).rounded(),
                height: (picture.size.height * picture.scale * scale).rounded())
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = false
            let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                picture.draw(in: CGRect(origin: .zero, size: size))
            }
            return Image(uiImage: small).renderingMode(.original)
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
                    // In its own colors, also where the Lock Screen tints a Live Activity (it drew
                    // the mark as a black shape there, TestFlight 2026-10-20).
                    logo.resizable().interpolation(.high).widgetAccentedRenderingMode(.fullColor)
                        .aspectRatio(contentMode: .fit)
                } else {
                    Image(systemName: "drop.fill").resizable().aspectRatio(contentMode: .fit)
                        .foregroundStyle(LiveStopStyle.accent)
                }
            }
            .frame(height: height)
            .accessibilityHidden(true)
        }
    }

    /// The day's progress: a thin white bar on a faint track.
    public struct LiveStopProgress: View {
        public var value: Double

        public init(value: Double) { self.value = value }

        public var body: some View {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LiveStopStyle.track)
                    Capsule().fill(LiveStopStyle.accent)
                        .frame(width: max(geo.size.height, geo.size.width * min(1, max(0, value))))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
    }

    /// The stop's access notes on one line with a key (owner, 2026-10-20: gate code, which gate,
    /// dogs), with a light amber key on the water blue.
    public struct LiveStopAccess: View {
        public var text: String

        public init(text: String) { self.text = text }

        public var body: some View {
            HStack(spacing: 6) {
                Image(systemName: "key.fill")
                    .font(LiveStopStyle.small(.semibold))
                    .foregroundStyle(Color(red: 1, green: 0.84, blue: 0.48))
                Text(text)
                    .font(LiveStopStyle.small(.medium))
                    .foregroundStyle(LiveStopStyle.text)
                    .lineLimit(1)
            }
            .accessibilityHidden(true)
        }
    }

    /// The visit's cleanings (owner, 2026-10-20: "The filter/salt cell cleaning alert needs to be
    /// on the new Today tile and the live activity"): each one's icon and a few words ("Overdue",
    /// "Today", "3 days"), soonest first, on one line; overdue is a white pill with water-blue
    /// text, like Today's card, so no new color. VoiceOver hears them in `content.spoken`.
    public struct LiveStopCleanings: View {
        public var cleanings: [CleaningBadge]

        public init(cleanings: [CleaningBadge]) { self.cleanings = cleanings }

        public var body: some View {
            HStack(spacing: 10) {
                ForEach(Array(cleanings.enumerated()), id: \.offset) { _, badge in
                    HStack(spacing: 4) {
                        CleaningGlyphIcon(kind: badge.kind, size: 16)
                            .foregroundStyle(LiveStopStyle.text)
                        Text(badge.label)
                            .font(LiveStopStyle.small(badge.overdue ? .semibold : .medium))
                            .foregroundStyle(badge.overdue ? LiveStopStyle.background : LiveStopStyle.text)
                            .lineLimit(1)
                            .padding(.horizontal, badge.overdue ? 7 : 0)
                            .padding(.vertical, badge.overdue ? 1 : 0)
                            .background {
                                if badge.overdue { Capsule().fill(Color.white) }
                            }
                    }
                    .fixedSize()
                }
            }
            .lineLimit(1)
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

        /// A calendar for "Today" (a day without its place); never a clock (no clock times).
        var symbol: String? { content.figure == "Today" ? "calendar" : nil }

        public var body: some View {
            VStack(alignment: alignment, spacing: 0) {
                if content.figure == "✓" {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: size * 0.8, weight: .semibold))
                        .foregroundStyle(LiveStopStyle.accent)
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
    /// headline, the large figure, the stop and the next stop, and the day's progress, on the
    /// brand's water blue.
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
                        // Round icon buttons, 44 points (owner, 2026-10-21: the pills were cramped).
                        ForEach(actions) { link in
                            Link(destination: link.url) { LiveStopRoundButton(action: link.action) }
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
                        if !content.cleanings.isEmpty { LiveStopCleanings(cleanings: content.cleanings) }
                    }
                    Spacer(minLength: 4)
                    LiveStopFigure(content: content)
                }
                LiveStopProgress(value: content.progress)
            }
            // More room above the top row's buttons (owner, 2026-10-21: "cramped at the top").
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 16)
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

        /// Bottom: the stop, the next stop, the access notes and the cleanings due, and the
        /// progress, then Call and On My Way and Mark Complete (owner, 2026-10-20); Open Job when
        /// there are no actions (the island's tap opens the job too).
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
                    if !content.cleanings.isEmpty { LiveStopCleanings(cleanings: content.cleanings) }
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
                        Link(destination: link.url) { LiveStopRoundButton(action: link.action) }
                    }
                }
            }
        }

        /// Compact trailing: the few characters ("9:42", "4/9", "✓").
        public static func compact(_ content: LiveStopContent) -> some View {
            Text(content.compact)
                .font(LiveStopStyle.display(15))
                .monospacedDigit()
                .foregroundStyle(LiveStopStyle.island)
                .accessibilityLabel(content.spoken)
        }

        /// Compact leading and minimal: the mark.
        public static func mark(logo: Image?) -> some View { LiveStopMark(logo: logo, height: 20) }
    }

    /// A Live Activity action as a round icon button, 44 points, white on a faint fill (owner,
    /// 2026-10-21): a car for On My Way, a check for Mark Complete; VoiceOver reads the title.
    public struct LiveStopRoundButton: View {
        public var action: LiveStopAction

        public init(action: LiveStopAction) { self.action = action }

        public var body: some View {
            Image(systemName: action.systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(LiveStopStyle.text)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.white.opacity(0.16)))
                .accessibilityLabel(action.title)
        }
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
