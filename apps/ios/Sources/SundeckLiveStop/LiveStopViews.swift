#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI
    import UIKit

    // The Live Activity's views (owner, 2026-10-19: "Make the live notification look beautiful
    // please. Include our logo." and "Do not include a timer or stop watch"): drawn by the widget
    // extension, and by the screenshot tests straight from here. Everything they show comes from
    // `liveStopContent`: an arrival time of day, the checklist, or the next stop, never a
    // countdown, so nothing on them ticks.

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

        public static func display(_ size: CGFloat, _ weight: BrandFonts.Weight = .bold) -> Font {
            .custom(weight.rawValue, size: size)
        }
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
                if !content.figureLabel.isEmpty {
                    Text(content.figureLabel)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LiveStopStyle.muted)
                }
            }
        }
    }

    /// The Lock Screen (and banner) view: the mark and "Sundeck Pro", the headline, the large
    /// figure, the stop and the next stop, and the day's progress, on brand navy.
    public struct LiveStopLockScreen: View {
        public var content: LiveStopContent
        public var logo: Image?

        public init(content: LiveStopContent, logo: Image?) {
            self.content = content
            self.logo = logo
        }

        public var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    LiveStopMark(logo: logo, height: 22)
                    Text("Sundeck Pro")
                        .font(LiveStopStyle.display(15, .semiBold))
                        .foregroundStyle(LiveStopStyle.muted)
                    Spacer(minLength: 8)
                }
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(content.headline)
                            .font(LiveStopStyle.display(22))
                            .foregroundStyle(LiveStopStyle.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Text(content.detail)
                            .font(.system(size: 14))
                            .foregroundStyle(LiveStopStyle.muted)
                            .lineLimit(1)
                        if let next = content.next {
                            Text(next)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(LiveStopStyle.text)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 4)
                    LiveStopFigure(content: content)
                }
                LiveStopProgress(value: content.progress)
            }
            .padding(16)
            .accessibilityElement(children: .ignore)
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

        /// Bottom: the stop, the next stop and the progress, then Call and Open Job.
        public static func bottom(_ content: LiveStopContent, call: URL?, open: URL?) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(content.detail).font(.system(size: 14)).foregroundStyle(LiveStopStyle.muted).lineLimit(1)
                    if let next = content.next {
                        Text(next).font(.system(size: 14, weight: .medium)).foregroundStyle(LiveStopStyle.text)
                            .lineLimit(1)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(content.spoken)
                LiveStopProgress(value: content.progress)
                HStack(spacing: 8) {
                    if let call {
                        Link(destination: call) { LiveStopButtonLabel(title: "Call", systemImage: "phone.fill") }
                    }
                    if let open {
                        Link(destination: open) {
                            LiveStopButtonLabel(title: "Open Job", systemImage: "arrow.up.forward.app.fill")
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
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(LiveStopStyle.text)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule().fill(Color.white.opacity(0.16)))
        }
    }
#endif
