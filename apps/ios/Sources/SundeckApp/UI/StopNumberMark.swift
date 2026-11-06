#if os(iOS)
    import SundeckTokens
    import SwiftUI

    /// A stop's place in the route on Today and the Schedule (owner, 2026-11-06: out of the
    /// bubble, option B of five: "Big and black, like a Calendar day"): the number alone in Barlow
    /// ExtraBold, blue while the stop is being worked, a green check once it's done. The 32 pt
    /// the old circle took, so what follows stays where it was. Same as the website's and
    /// Android's `StopNumber`.
    struct StopNumberMark: View {
        var number: Int
        var done: Bool
        /// In progress (Schedule) or the next stop (Today).
        var current: Bool
        @ScaledMetric(relativeTo: .body) private var width: CGFloat = 32

        // Written out: the private scaled width would make the memberwise one private to this file.
        init(number: Int, done: Bool, current: Bool) {
            self.number = number
            self.done = done
            self.current = current
        }

        var body: some View {
            Group {
                if done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color.pass)
                } else {
                    Text(verbatim: "\(number)")
                        .font(.custom(BrandFonts.Weight.extraBold.rawValue, size: 26, relativeTo: .body))
                        .monospacedDigit()
                        .foregroundStyle(current ? Color.link : Color.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
            .frame(width: width)
            .accessibilityHidden(true)
        }
    }
#endif
