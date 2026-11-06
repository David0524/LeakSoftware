import SwiftUI

/// A stop's place in the route on Today and the Schedule, out of its circle (owner, 2026-11-06:
/// "Take the stop numbers out of the bubble … Just the number and a thin line"): the number in
/// Barlow ExtraBold, then a hairline like a date column. A green check once the stop is done,
/// the number in blue while it's being worked. The same 32 pt as the old circle, so what follows
/// stays where it was. Same as the website's `StopNumber` and Android's `StopNumber`.
struct StopNumberMark: View {
    var number: Int
    var done: Bool
    /// In progress (Schedule) or the next stop (Today).
    var current: Bool
    /// On: the line runs the tile's height (Schedule). Off: it's as tall as the number (Today,
    /// whose second line sits under the time).
    var stretch = true
    @ScaledMetric(relativeTo: .body) private var width: CGFloat = 23
    @ScaledMetric(relativeTo: .body) private var lineHeight: CGFloat = 28

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color.pass)
                } else {
                    Text(verbatim: "\(number)")
                        .font(.custom(BrandFonts.Weight.extraBold.rawValue, size: 22, relativeTo: .body))
                        .monospacedDigit()
                        .foregroundStyle(current ? Color.link : Color.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
            .frame(width: width)
            Rectangle()
                .fill(Color.separator)
                .frame(width: 1)
                .frame(maxHeight: stretch ? .infinity : lineHeight)
        }
        .accessibilityHidden(true)
    }
}
